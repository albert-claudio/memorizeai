import Stripe from "stripe";

const REQUIRED_ENV = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "NEXT_PUBLIC_APP_URL",
];

const BILLING_TEST_FLAGS = [
  "BILLING_E2E_ENABLED",
  "BILLING_CHECKOUT_E2E_ENABLED",
  "BILLING_APP_ROUTE_E2E_ENABLED",
];

const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

const results = [];

function value(name) {
  return process.env[name]?.trim() ?? "";
}

function bool(name) {
  return value(name).toLowerCase() === "true";
}

function requireEnv(name) {
  const envValue = value(name);
  if (!envValue) throw new Error(`${name} is not set`);
  return envValue;
}

function addResult(status, name, detail) {
  results.push({ status, name, detail });
  const label = status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL";
  console.log(`[${label}] ${name}${detail ? ` - ${detail}` : ""}`);
}

async function check(name, callback) {
  try {
    addResult("pass", name, await callback());
  } catch (error) {
    addResult("fail", name, error instanceof Error ? error.message : String(error));
  }
}

function parseProductionOrigin() {
  const raw = requireEnv("NEXT_PUBLIC_APP_URL");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use https in production");
  }
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("NEXT_PUBLIC_APP_URL cannot point to localhost in production");
  }
  if (/(^|[.-])(staging|preview|dev)([.-]|$)|\.vercel\.app$/i.test(url.hostname)) {
    throw new Error("NEXT_PUBLIC_APP_URL must point to the public production domain, not staging or preview");
  }

  return url.origin;
}

function summarize() {
  const failed = results.filter((result) => result.status === "fail");
  const warnings = results.filter((result) => result.status === "warn");

  console.log("\nProduction billing preflight summary");
  console.log("====================================");
  console.log(`Passed: ${results.filter((result) => result.status === "pass").length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Failed: ${failed.length}`);

  for (const failure of failed) {
    console.log(`- ${failure.name}: ${failure.detail}`);
  }

  return failed.length === 0;
}

async function main() {
  console.log("Production billing preflight (read-only)");
  console.log("==========================================");

  await check("required production billing variables", () => {
    const missing = REQUIRED_ENV.filter((name) => !value(name));
    if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
    return `${REQUIRED_ENV.length} variables present`;
  });

  await check("production URL", () => parseProductionOrigin());

  await check("billing test routes disabled", () => {
    const enabled = BILLING_TEST_FLAGS.filter(bool);
    if (enabled.length) {
      throw new Error(`${enabled.join(", ")} must be false in production`);
    }
    return "all BILLING_*_E2E routes are disabled";
  });

  await check("Stripe live credentials", () => {
    const key = requireEnv("STRIPE_SECRET_KEY");
    if (!key.startsWith("sk_live_") && !key.startsWith("rk_live_")) {
      throw new Error("STRIPE_SECRET_KEY must be a Stripe live-mode key");
    }
    if (!requireEnv("STRIPE_WEBHOOK_SECRET").startsWith("whsec_")) {
      throw new Error("STRIPE_WEBHOOK_SECRET must start with whsec_");
    }
    if (!requireEnv("STRIPE_PRO_PRICE_ID").startsWith("price_")) {
      throw new Error("STRIPE_PRO_PRICE_ID must start with price_");
    }
    return "live key and identifiers have valid formats";
  });

  if (results.some((result) => result.status === "fail")) {
    process.exit(summarize() ? 0 : 1);
  }

  const appOrigin = parseProductionOrigin();
  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2025-12-15.clover",
    typescript: false,
    maxNetworkRetries: 0,
    timeout: 10_000,
  });

  await check("public application reachability", async () => {
    const response = await fetch(appOrigin, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 500) throw new Error(`public app returned ${response.status}`);
    return `reachable (${response.status})`;
  });

  await check("Stripe live Pro price", async () => {
    const price = await stripe.prices.retrieve(requireEnv("STRIPE_PRO_PRICE_ID"));
    if (!price.livemode) throw new Error("configured Pro price is not live-mode");
    if (!price.active) throw new Error("configured Pro price is inactive");
    if (price.type !== "recurring" || price.recurring?.interval !== "month") {
      throw new Error("configured Pro price must be a monthly recurring price");
    }
    if (!price.unit_amount || price.unit_amount <= 0) {
      throw new Error("configured Pro price must have a positive amount");
    }
    return `${price.currency.toUpperCase()} ${(price.unit_amount / 100).toFixed(2)} / month`;
  });

  await check("Stripe live webhook endpoint", async () => {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const endpointUrl = `${appOrigin}/api/stripe/webhook`;
    const endpoint = endpoints.data.find((candidate) => candidate.url === endpointUrl && candidate.status === "enabled");
    if (!endpoint) throw new Error(`no enabled endpoint found for ${endpointUrl}`);

    const missingEvents = REQUIRED_WEBHOOK_EVENTS.filter(
      (event) => !endpoint.enabled_events.includes(event)
    );
    if (missingEvents.length) {
      throw new Error(`missing events: ${missingEvents.join(", ")}`);
    }
    return `${endpoint.id} has ${REQUIRED_WEBHOOK_EVENTS.length} required events`;
  });

  await check("Stripe customer portal", async () => {
    const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
    const active = configurations.data.find((configuration) => configuration.active);
    if (!active) throw new Error("no active customer portal configuration found");
    return `${active.id} is active`;
  });

  process.exit(summarize() ? 0 : 1);
}

main().catch((error) => {
  console.error("[production-billing-preflight] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
