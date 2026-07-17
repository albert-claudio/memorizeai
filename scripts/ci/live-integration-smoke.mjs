import Stripe from "stripe";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const isStripeStagingValidate = args.includes("--billing-staging-validate");
const startedAt = new Date();
const defaultArtifactDir = path.join(process.cwd(), "artifacts", "billing");
const artifactDir = getArgValue("--artifact-dir") || process.env.BILLING_E2E_ARTIFACT_DIR || defaultArtifactDir;
const artifactFileName = `stripe-staging-validate-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`;
const artifactPath = path.join(artifactDir, artifactFileName);

const summary = {
  schemaVersion: 1,
  runType: isStripeStagingValidate ? "stripe-staging-validate" : "live-integration-smoke",
  command: isStripeStagingValidate
    ? "npm run stripe:staging:validate"
    : "npm run test:live-integration",
  startedAt: startedAt.toISOString(),
  finishedAt: null,
  status: "running",
  appUrl: process.env.BILLING_E2E_APP_URL || null,
  nodeVersion: process.version,
  stages: [],
  cleanupWarnings: [],
};

function getArgValue(name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  return args[index + 1] || null;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function asBool(value) {
  return String(value || "").toLowerCase() === "true";
}

function isEnabledForBillingStage(envName) {
  return isStripeStagingValidate || asBool(process.env[envName]);
}

function recordCleanupWarning(resource, error) {
  const message = error instanceof Error ? error.message : String(error);
  summary.cleanupWarnings.push({
    resource,
    message,
    at: new Date().toISOString(),
  });
  console.warn(`[live-smoke] Cleanup warning (${resource}):`, message);
}

async function runStage(name, fn) {
  const stage = {
    name,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    evidence: null,
  };
  summary.stages.push(stage);

  try {
    const evidence = await fn();
    stage.status = evidence?.skipped ? "skipped" : "passed";
    stage.evidence = evidence ?? {};
    return evidence;
  } catch (error) {
    stage.status = "failed";
    stage.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    stage.finishedAt = new Date().toISOString();
  }
}

function validateStagingTarget() {
  if (!isStripeStagingValidate) {
    return;
  }

  const rawAppUrl = requireEnv("BILLING_E2E_APP_URL");
  let appUrl;
  try {
    appUrl = new URL(rawAppUrl);
  } catch {
    throw new Error(`BILLING_E2E_APP_URL must be a valid URL, got: ${rawAppUrl}`);
  }

  if (appUrl.protocol !== "https:") {
    throw new Error("stripe:staging:validate requires BILLING_E2E_APP_URL to use https.");
  }

  if (["localhost", "127.0.0.1", "::1"].includes(appUrl.hostname)) {
    throw new Error("stripe:staging:validate must target deployed staging, not localhost.");
  }

  const stripeKey = requireEnv("STRIPE_SECRET_KEY");
  if (!stripeKey.startsWith("sk_test_") && !stripeKey.startsWith("rk_test_")) {
    throw new Error("stripe:staging:validate must use a Stripe test-mode secret key.");
  }
}

async function writeSummaryArtifact(status, error = null) {
  if (!isStripeStagingValidate) {
    return;
  }

  summary.status = status;
  summary.finishedAt = new Date().toISOString();
  if (error) {
    summary.error = error instanceof Error ? error.message : String(error);
  }

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`[live-smoke] Evidence artifact written: ${artifactPath}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function expectStatus(url, init, allowedStatuses, context) {
  const response = await fetch(url, init);
  if (!allowedStatuses.includes(response.status)) {
    const body = await response.text();
    throw new Error(
      `${context} failed: expected status ${allowedStatuses.join(" or ")}, got ${response.status}. Body: ${body.slice(0, 400)}`
    );
  }
  return response;
}

async function readJson(response, context) {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${context} returned invalid JSON: ${String(error)}. Body: ${raw.slice(0, 400)}`);
  }
}

function splitSetCookieHeader(header) {
  if (!header) {
    return [];
  }
  return header.split(/,(?=\s*[^;,]+=)/g).map((value) => value.trim()).filter(Boolean);
}

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  return splitSetCookieHeader(response.headers.get("set-cookie"));
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  store(response) {
    for (const setCookie of getSetCookies(response)) {
      const [pair, ...attributes] = setCookie.split(";");
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      const shouldDelete = attributes.some((attribute) => {
        const normalized = attribute.trim().toLowerCase();
        return normalized === "max-age=0" || normalized.startsWith("expires=thu, 01 jan 1970");
      });

      if (shouldDelete) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function fetchWithCookies(jar, url, init = {}) {
  const headers = new Headers(init.headers || {});
  const cookieHeader = jar.header();
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });
  jar.store(response);
  return response;
}

async function authenticateIntegrationUser(appUrl, email, password) {
  const jar = new CookieJar();
  const csrfResponse = await fetchWithCookies(
    jar,
    `${appUrl}/api/auth/csrf`,
    { method: "GET" }
  );
  if (csrfResponse.status !== 200) {
    const body = await csrfResponse.text();
    throw new Error(`Login CSRF failed: ${csrfResponse.status} ${body.slice(0, 300)}`);
  }
  const csrf = await readJson(csrfResponse, "Login CSRF");
  if (!csrf.token) {
    throw new Error("Login CSRF route did not return a token.");
  }

  const loginResponse = await fetchWithCookies(
    jar,
    `${appUrl}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf.token,
        origin: appUrl,
      },
      body: JSON.stringify({ email, password }),
    }
  );
  if (loginResponse.status !== 200) {
    const body = await loginResponse.text();
    throw new Error(`Integration user login failed: ${loginResponse.status} ${body.slice(0, 300)}`);
  }

  return jar;
}

async function expectAuthenticatedJson(jar, url, init, allowedStatuses, context) {
  const response = await fetchWithCookies(jar, url, init);
  if (!allowedStatuses.includes(response.status)) {
    const body = await response.text();
    throw new Error(
      `${context} failed: expected status ${allowedStatuses.join(" or ")}, got ${response.status}. Body: ${body.slice(0, 400)}`
    );
  }
  return readJson(response, context);
}

function createSupabaseRestClient() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const baseHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  async function select(table, query) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
      method: "GET",
      headers: baseHeaders,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase select failed on ${table}: ${response.status} ${body.slice(0, 300)}`);
    }
    return readJson(response, `Supabase select ${table}`);
  }

  async function deleteAuthUser(userId) {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: baseHeaders,
    });
    if (![200, 204, 404].includes(response.status)) {
      const body = await response.text();
      throw new Error(`Failed to delete auth user ${userId}: ${response.status} ${body.slice(0, 300)}`);
    }
  }

  return { select, deleteAuthUser };
}

function createStripeClient() {
  const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
  return new Stripe(stripeSecretKey, {
    apiVersion: "2025-12-15.clover",
    typescript: false,
  });
}

async function waitFor(conditionName, fn, timeoutMs = 120000, intervalMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  if (lastError instanceof Error) {
    throw new Error(`Timed out waiting for ${conditionName}: ${lastError.message}`);
  }
  throw new Error(`Timed out waiting for ${conditionName}`);
}

async function runSupabaseChecks() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.log("[live-smoke] Checking Supabase auth health...");
  await expectStatus(
    `${supabaseUrl}/auth/v1/health`,
    {
      method: "GET",
      headers: {
        apikey: anonKey,
      },
    },
    [200],
    "Supabase health endpoint"
  );

  console.log("[live-smoke] Checking unauthenticated access to profiles is blocked...");
  await expectStatus(
    `${supabaseUrl}/rest/v1/profiles?select=id&limit=1`,
    {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    },
    [401, 403],
    "Supabase profiles RLS with anon key"
  );

  console.log("[live-smoke] Checking service role can access profiles...");
  await expectStatus(
    `${supabaseUrl}/rest/v1/profiles?select=id&limit=1`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
    [200],
    "Supabase profiles access with service role key"
  );

  return {
    supabaseUrl,
    checks: [
      "auth_health",
      "anon_profiles_blocked",
      "service_role_profiles_access",
    ],
  };
}

async function runStripeChecks(stripe) {
  const proPriceId = requireEnv("STRIPE_PRO_PRICE_ID");
  const enterprisePriceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;

  console.log("[live-smoke] Checking Stripe Pro price exists...");
  const proPrice = await stripe.prices.retrieve(proPriceId);
  if (!proPrice || proPrice.id !== proPriceId) {
    throw new Error("Stripe Pro price lookup failed.");
  }

  if (enterprisePriceId) {
    console.log("[live-smoke] Checking Stripe Enterprise price exists...");
    const enterprisePrice = await stripe.prices.retrieve(enterprisePriceId);
    if (!enterprisePrice || enterprisePrice.id !== enterprisePriceId) {
      throw new Error("Stripe Enterprise price lookup failed.");
    }
  }

  return {
    proPriceId,
    enterprisePriceId: enterprisePriceId || null,
  };
}

async function tryFillOnPage(page, selector, value) {
  const locator = page.locator(selector).first();
  const count = await locator.count().catch(() => 0);
  if (!count) {
    return false;
  }
  const visible = await locator.isVisible().catch(() => false);
  if (!visible) {
    return false;
  }
  await locator.fill(value);
  return true;
}

async function tryFillInFrames(page, selector, value) {
  for (const frame of page.frames()) {
    const locator = frame.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) {
      continue;
    }
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    await locator.fill(value);
    return true;
  }
  return false;
}

async function fillCheckoutField(page, selectors, value, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      if (await tryFillOnPage(page, selector, value)) {
        return;
      }
      if (await tryFillInFrames(page, selector, value)) {
        return;
      }
    }
    await sleep(250);
  }
  throw new Error(`Timed out filling checkout field. Selectors: ${selectors.join(", ")}`);
}

async function completeStripeCheckoutUI(checkoutUrl) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1000);

    await fillCheckoutField(page, ["input[name='cardNumber']", "input[autocomplete='cc-number']"], "4242424242424242");
    await fillCheckoutField(page, ["input[name='cardExpiry']", "input[autocomplete='cc-exp']"], "1234");
    await fillCheckoutField(page, ["input[name='cardCvc']", "input[autocomplete='cc-csc']"], "123");

    await fillCheckoutField(
      page,
      [
        "input[name='billingName']",
        "input[autocomplete='cc-name']",
        "input[name='name']",
      ],
      "Billing E2E User",
      15000
    ).catch(() => undefined);

    await fillCheckoutField(
      page,
      [
        "input[name='postalCode']",
        "input[autocomplete='postal-code']",
        "input[name='billingPostalCode']",
      ],
      "12345",
      15000
    ).catch(() => undefined);

    const submit = page.locator("button[type='submit']").first();
    await submit.waitFor({ state: "visible", timeout: 45000 });
    await submit.click();
    await page.waitForTimeout(2000);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function findEventForObject(stripe, type, objectId, createdGteSec) {
  const events = await stripe.events.list({
    type,
    limit: 25,
    created: { gte: createdGteSec },
  });
  return (
    events.data.find((event) => {
      const eventObjectId = event?.data?.object?.id;
      return eventObjectId === objectId;
    }) ?? null
  );
}

async function findEventForSubscription(stripe, type, subscriptionId, createdGteSec) {
  return findEventForObject(stripe, type, subscriptionId, createdGteSec);
}

async function postSignedWebhook(appUrl, stripe, webhookSecret, event, allowedStatuses, context) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
    timestamp: Math.floor(Date.now() / 1000),
  });

  const response = await expectStatus(
    `${appUrl}/api/stripe/webhook`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
        "x-forwarded-for": "3.18.12.63",
      },
      body: payload,
    },
    allowedStatuses,
    context
  );

  return readJson(response, context);
}

async function runBillingWebhookE2E(stripe) {
  if (!isEnabledForBillingStage("BILLING_E2E_ENABLED")) {
    console.log("[live-smoke] Billing webhook E2E disabled. Skipping.");
    return { skipped: true, reason: "BILLING_E2E_ENABLED is not true" };
  }

  const appUrl = requireEnv("BILLING_E2E_APP_URL").replace(/\/+$/, "");
  const e2eSecret = requireEnv("BILLING_E2E_SECRET");
  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  const pollTimeoutMs = Number(process.env.BILLING_E2E_POLL_TIMEOUT_MS || 120000);
  const pollIntervalMs = Number(process.env.BILLING_E2E_POLL_INTERVAL_MS || 3000);

  const supabase = createSupabaseRestClient();
  const runId = `ci_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  let userId = null;
  let stripeCustomerId = null;
  let stripeSubscriptionId = null;
  let updatedEventId = null;
  let transientEventId = null;
  let permanentEventId = null;

  try {
    console.log("[live-smoke] Billing E2E: creating integration entities in staging...");
    const bootstrapResponse = await expectStatus(
      `${appUrl}/api/stripe/integration/bootstrap`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-billing-e2e-key": e2eSecret,
        },
        body: JSON.stringify({ runId }),
      },
      [200],
      "Billing E2E bootstrap route"
    );
    const bootstrap = await readJson(bootstrapResponse, "Billing E2E bootstrap route");
    userId = bootstrap.userId;
    stripeCustomerId = bootstrap.stripeCustomerId;
    stripeSubscriptionId = bootstrap.stripeSubscriptionId;

    if (!userId || !stripeCustomerId || !stripeSubscriptionId) {
      throw new Error("Bootstrap route did not return user/customer/subscription IDs.");
    }

    console.log("[live-smoke] Billing E2E: verifying Stripe objects exist...");
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if (!customer || customer.deleted) {
      throw new Error("Stripe customer created by bootstrap was not found.");
    }
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (!subscription || subscription.id !== stripeSubscriptionId) {
      throw new Error("Stripe subscription created by bootstrap was not found.");
    }

    console.log("[live-smoke] Billing E2E: triggering customer.subscription.updated...");
    const updateCreatedGte = Math.floor(Date.now() / 1000) - 5;
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const updatedEvent = await waitFor(
      "Stripe customer.subscription.updated event",
      async () => findEventForSubscription(
        stripe,
        "customer.subscription.updated",
        stripeSubscriptionId,
        updateCreatedGte
      ),
      pollTimeoutMs,
      pollIntervalMs
    );

    await waitFor(
      "subscription row updated by webhook (cancel_at_period_end=true)",
      async () => {
        const rows = await supabase.select(
          "subscriptions",
          `select=stripe_subscription_id,status,cancel_at_period_end&stripe_subscription_id=eq.${stripeSubscriptionId}`
        );
        const row = rows?.[0];
        if (!row) {
          return null;
        }
        if (row.cancel_at_period_end === true) {
          return row;
        }
        return null;
      },
      pollTimeoutMs,
      pollIntervalMs
    );

    console.log("[live-smoke] Billing E2E: validating idempotency with duplicate delivery...");
    const logsBefore = await waitFor(
      "webhook log for updated event",
      async () => {
        const rows = await supabase.select(
          "webhook_logs",
          `select=id,event_id,success&event_id=eq.${updatedEvent.id}`
        );
        if (!rows?.length) {
          return null;
        }
        return rows;
      },
      pollTimeoutMs,
      pollIntervalMs
    );
    const beforeCount = logsBefore.length;

    const realEventPayload = await stripe.events.retrieve(updatedEvent.id);
    const payload = JSON.stringify(realEventPayload);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: Math.floor(Date.now() / 1000),
    });

    const duplicateResponse = await expectStatus(
      `${appUrl}/api/stripe/webhook`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": signature,
          "x-forwarded-for": "3.18.12.63",
        },
        body: payload,
      },
      [200],
      "Duplicate webhook replay"
    );
    const duplicateJson = await readJson(duplicateResponse, "Duplicate webhook replay");
    if (!duplicateJson?.duplicate) {
      throw new Error("Expected duplicate webhook replay to return duplicate=true.");
    }

    const logsAfter = await supabase.select(
      "webhook_logs",
      `select=id,event_id,success&event_id=eq.${updatedEvent.id}`
    );
    if (logsAfter.length !== beforeCount) {
      throw new Error(
        `Idempotency check failed: webhook_logs count changed from ${beforeCount} to ${logsAfter.length} for event ${updatedEvent.id}.`
      );
    }

    console.log("[live-smoke] Billing E2E: validating transient_failure retry semantics...");
    transientEventId = `evt_e2e_transient_${runId}`;
    const transientEvent = {
      id: transientEventId,
      object: "event",
      api_version: "2025-12-15.clover",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: stripeSubscriptionId,
          object: "subscription",
          customer: stripeCustomerId,
          status: "active",
          cancel_at_period_end: false,
          metadata: { user_id: userId },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 2592000,
          items: {
            data: [{ price: { id: `price_unmapped_${runId}` } }],
          },
        },
      },
    };

    const transientJson = await postSignedWebhook(
      appUrl,
      stripe,
      webhookSecret,
      transientEvent,
      [500],
      "Synthetic transient_failure webhook replay"
    );
    if (transientJson.outcome !== "transient_failure") {
      throw new Error(`Expected transient_failure outcome, got ${JSON.stringify(transientJson)}`);
    }

    await waitFor(
      "webhook log for transient_failure event",
      async () => {
        const rows = await supabase.select(
          "webhook_logs",
          `select=event_id,success,outcome&event_id=eq.${transientEventId}`
        );
        const row = rows?.[0];
        return row?.outcome === "transient_failure" && row?.success === false ? row : null;
      },
      pollTimeoutMs,
      pollIntervalMs
    );

    const transientRetryJson = await postSignedWebhook(
      appUrl,
      stripe,
      webhookSecret,
      transientEvent,
      [500],
      "Synthetic transient_failure webhook retry"
    );
    if (transientRetryJson.outcome !== "transient_failure") {
      throw new Error(`Expected transient_failure retry outcome, got ${JSON.stringify(transientRetryJson)}`);
    }

    console.log("[live-smoke] Billing E2E: validating permanent_failure terminal semantics...");
    permanentEventId = `evt_e2e_permanent_${runId}`;
    const permanentEvent = {
      id: permanentEventId,
      object: "event",
      api_version: "2025-12-15.clover",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: `sub_missing_${runId}`,
          object: "subscription",
          customer: `cus_missing_${runId}`,
          status: "active",
          cancel_at_period_end: false,
          metadata: {},
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 2592000,
          items: {
            data: [{ price: { id: requireEnv("STRIPE_PRO_PRICE_ID") } }],
          },
        },
      },
    };

    const permanentJson = await postSignedWebhook(
      appUrl,
      stripe,
      webhookSecret,
      permanentEvent,
      [200],
      "Synthetic permanent_failure webhook replay"
    );
    if (permanentJson.outcome !== "permanent_failure") {
      throw new Error(`Expected permanent_failure outcome, got ${JSON.stringify(permanentJson)}`);
    }

    await waitFor(
      "webhook log for permanent_failure event",
      async () => {
        const rows = await supabase.select(
          "webhook_logs",
          `select=event_id,success,outcome&event_id=eq.${permanentEventId}`
        );
        const row = rows?.[0];
        return row?.outcome === "permanent_failure" && row?.success === true ? row : null;
      },
      pollTimeoutMs,
      pollIntervalMs
    );

    const permanentDuplicateJson = await postSignedWebhook(
      appUrl,
      stripe,
      webhookSecret,
      permanentEvent,
      [200],
      "Synthetic permanent_failure duplicate replay"
    );
    if (!permanentDuplicateJson?.duplicate) {
      throw new Error(`Expected permanent_failure duplicate replay to return duplicate=true, got ${JSON.stringify(permanentDuplicateJson)}`);
    }

    console.log("[live-smoke] Billing E2E: triggering customer.subscription.deleted...");
    const deleteCreatedGte = Math.floor(Date.now() / 1000) - 5;
    await stripe.subscriptions.cancel(stripeSubscriptionId);

    await waitFor(
      "Stripe customer.subscription.deleted event",
      async () => findEventForSubscription(
        stripe,
        "customer.subscription.deleted",
        stripeSubscriptionId,
        deleteCreatedGte
      ),
      pollTimeoutMs,
      pollIntervalMs
    );

    await waitFor(
      "profile downgraded by webhook",
      async () => {
        const rows = await supabase.select(
          "profiles",
          `select=id,is_pro,subscription_status,subscription_tier&id=eq.${userId}`
        );
        const row = rows?.[0];
        if (!row) {
          return null;
        }
        if (row.is_pro === false && row.subscription_status === "canceled" && row.subscription_tier === "free") {
          return row;
        }
        return null;
      },
      pollTimeoutMs,
      pollIntervalMs
    );

    await waitFor(
      "subscription row canceled by webhook",
      async () => {
        const rows = await supabase.select(
          "subscriptions",
          `select=stripe_subscription_id,status&stripe_subscription_id=eq.${stripeSubscriptionId}`
        );
        const row = rows?.[0];
        if (!row) {
          return null;
        }
        if (row.status === "canceled") {
          return row;
        }
        return null;
      },
      pollTimeoutMs,
      pollIntervalMs
    );

    console.log("[live-smoke] Billing webhook E2E passed.");
    return {
      runId,
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      updatedEventId,
      transientEventId,
      permanentEventId,
      checks: [
        "bootstrap_created_user_customer_subscription",
        "customer_subscription_updated_webhook_applied",
        "duplicate_signed_replay_acknowledged",
        "transient_failure_allows_retry",
        "permanent_failure_blocks_retry",
        "customer_subscription_deleted_webhook_applied",
      ],
    };
  } finally {
    if (stripeCustomerId) {
      try {
        await stripe.customers.del(stripeCustomerId);
      } catch (error) {
        recordCleanupWarning("customer", error);
      }
    }
    if (userId) {
      try {
        await supabase.deleteAuthUser(userId);
      } catch (error) {
        recordCleanupWarning("user", error);
      }
    }
  }
}

async function runBillingCheckoutE2E(stripe) {
  if (!isEnabledForBillingStage("BILLING_CHECKOUT_E2E_ENABLED")) {
    console.log("[live-smoke] Billing checkout E2E disabled. Skipping.");
    return { skipped: true, reason: "BILLING_CHECKOUT_E2E_ENABLED is not true" };
  }

  const appUrl = requireEnv("BILLING_E2E_APP_URL").replace(/\/+$/, "");
  const e2eSecret = requireEnv("BILLING_E2E_SECRET");
  const pollTimeoutMs = Number(process.env.BILLING_E2E_POLL_TIMEOUT_MS || 180000);
  const pollIntervalMs = Number(process.env.BILLING_E2E_POLL_INTERVAL_MS || 3000);

  const supabase = createSupabaseRestClient();
  const runId = `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  let userId = null;
  let stripeCustomerId = null;
  let checkoutSessionId = null;
  let stripeSubscriptionId = null;
  let completedEventId = null;

  try {
    console.log("[live-smoke] Billing Checkout E2E: creating checkout session in staging...");
    const setupResponse = await expectStatus(
      `${appUrl}/api/stripe/integration/create-checkout-session`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-billing-e2e-key": e2eSecret,
        },
        body: JSON.stringify({ runId }),
      },
      [200],
      "Billing checkout setup route"
    );
    const setup = await readJson(setupResponse, "Billing checkout setup route");

    userId = setup.userId;
    stripeCustomerId = setup.stripeCustomerId;
    checkoutSessionId = setup.checkoutSessionId;
    const checkoutUrl = setup.checkoutUrl;

    if (!userId || !stripeCustomerId || !checkoutSessionId || !checkoutUrl) {
      throw new Error("Checkout setup route did not return required fields.");
    }

    const sessionBefore = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    if (sessionBefore.id !== checkoutSessionId) {
      throw new Error("Checkout session was not created correctly.");
    }

    console.log("[live-smoke] Billing Checkout E2E: completing checkout on hosted UI...");
    const checkoutEventCreatedGte = Math.floor(Date.now() / 1000) - 5;
    await completeStripeCheckoutUI(checkoutUrl);

    const completedSession = await waitFor(
      "Stripe checkout session completion",
      async () => {
        const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
        if (session.status === "complete" && session.payment_status === "paid") {
          return session;
        }
        return null;
      },
      pollTimeoutMs,
      pollIntervalMs
    );

    const completedEvent = await waitFor(
      "Stripe checkout.session.completed event",
      async () => findEventForObject(
        stripe,
        "checkout.session.completed",
        checkoutSessionId,
        checkoutEventCreatedGte
      ),
      pollTimeoutMs,
      pollIntervalMs
    );
    completedEventId = completedEvent.id;

    const subFromSession = completedSession.subscription;
    stripeSubscriptionId = typeof subFromSession === "string" ? subFromSession : subFromSession?.id || null;

    await waitFor(
      "profile upgraded by checkout webhook",
      async () => {
        const rows = await supabase.select(
          "profiles",
          `select=id,is_pro,subscription_status,subscription_tier,stripe_customer_id&id=eq.${userId}`
        );
        const row = rows?.[0];
        if (!row) {
          return null;
        }
        if (
          row.is_pro === true &&
          row.subscription_status === "active" &&
          row.subscription_tier === "pro" &&
          row.stripe_customer_id === stripeCustomerId
        ) {
          return row;
        }
        return null;
      },
      pollTimeoutMs,
      pollIntervalMs
    );

    await waitFor(
      "subscription row created/updated by checkout webhook",
      async () => {
        const rows = await supabase.select(
          "subscriptions",
          `select=stripe_subscription_id,stripe_customer_id,status&stripe_customer_id=eq.${stripeCustomerId}&status=eq.active&limit=1`
        );
        const row = rows?.[0];
        if (!row) {
          return null;
        }
        if (stripeSubscriptionId && row.stripe_subscription_id !== stripeSubscriptionId) {
          return null;
        }
        return row;
      },
      pollTimeoutMs,
      pollIntervalMs
    );

    const logs = await waitFor(
      "webhook log for checkout.session.completed",
      async () => {
        const rows = await supabase.select(
          "webhook_logs",
          `select=id,event_id,event_type,success&event_id=eq.${completedEvent.id}`
        );
        if (!rows?.length) {
          return null;
        }
        return rows;
      },
      pollTimeoutMs,
      pollIntervalMs
    );
    if (!logs[0]?.success) {
      throw new Error("checkout.session.completed was logged as failed.");
    }

    console.log("[live-smoke] Billing Checkout E2E passed.");
    return {
      runId,
      userId,
      stripeCustomerId,
      checkoutSessionId,
      stripeSubscriptionId,
      completedEventId,
      checks: [
        "checkout_session_created",
        "hosted_checkout_completed",
        "checkout_webhook_upgraded_profile",
        "checkout_webhook_log_successful",
      ],
    };
  } finally {
    if (stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      } catch (error) {
        recordCleanupWarning("subscription", error);
      }
    }
    if (stripeCustomerId) {
      try {
        await stripe.customers.del(stripeCustomerId);
      } catch (error) {
        recordCleanupWarning("customer", error);
      }
    }
    if (userId) {
      try {
        await supabase.deleteAuthUser(userId);
      } catch (error) {
        recordCleanupWarning("user", error);
      }
    }
  }
}

async function runBillingAppRouteE2E(stripe) {
  if (!isEnabledForBillingStage("BILLING_APP_ROUTE_E2E_ENABLED")) {
    console.log("[live-smoke] Billing app-route E2E disabled. Skipping.");
    return { skipped: true, reason: "BILLING_APP_ROUTE_E2E_ENABLED is not true" };
  }

  const appUrl = requireEnv("BILLING_E2E_APP_URL").replace(/\/+$/, "");
  const e2eSecret = requireEnv("BILLING_E2E_SECRET");
  const pollTimeoutMs = Number(process.env.BILLING_E2E_POLL_TIMEOUT_MS || 180000);
  const pollIntervalMs = Number(process.env.BILLING_E2E_POLL_INTERVAL_MS || 3000);
  const originHeaders = { origin: appUrl };
  const supabase = createSupabaseRestClient();

  async function createCheckoutRun() {
    const runId = `app_checkout_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const response = await expectStatus(
      `${appUrl}/api/stripe/integration/create-checkout-session`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-billing-e2e-key": e2eSecret,
        },
        body: JSON.stringify({ runId }),
      },
      [200],
      "Billing app-route checkout setup"
    );
    const setup = await readJson(response, "Billing app-route checkout setup");
    if (!setup.userId || !setup.email || !setup.tempPassword || !setup.stripeCustomerId || !setup.checkoutSessionId || !setup.checkoutUrl) {
      throw new Error("Checkout app-route setup did not return required fields.");
    }
    return setup;
  }

  async function createSubscriptionRun(prefix) {
    const runId = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const response = await expectStatus(
      `${appUrl}/api/stripe/integration/bootstrap`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-billing-e2e-key": e2eSecret,
        },
        body: JSON.stringify({ runId }),
      },
      [200],
      `Billing app-route ${prefix} bootstrap`
    );
    const setup = await readJson(response, `Billing app-route ${prefix} bootstrap`);
    if (!setup.userId || !setup.email || !setup.tempPassword || !setup.stripeCustomerId || !setup.stripeSubscriptionId) {
      throw new Error(`${prefix} bootstrap did not return required fields.`);
    }
    return setup;
  }

  async function cleanup(setup, subscriptionId) {
    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (subscription && subscription.status !== "canceled") {
          await stripe.subscriptions.cancel(subscriptionId);
        }
      } catch (error) {
        recordCleanupWarning("subscription", error);
      }
    }
    if (setup?.stripeCustomerId) {
      try {
        await stripe.customers.del(setup.stripeCustomerId);
      } catch (error) {
        recordCleanupWarning("customer", error);
      }
    }
    if (setup?.userId) {
      try {
        await supabase.deleteAuthUser(setup.userId);
      } catch (error) {
        recordCleanupWarning("user", error);
      }
    }
  }

  let checkoutSetup = null;
  let checkoutSubscriptionId = null;
  let confirmSessionId = null;
  try {
    console.log("[live-smoke] Billing app-route E2E: checkout, confirm, status, portal...");
    checkoutSetup = await createCheckoutRun();
    const checkoutJar = await authenticateIntegrationUser(
      appUrl,
      checkoutSetup.email,
      checkoutSetup.tempPassword
    );

    await completeStripeCheckoutUI(checkoutSetup.checkoutUrl);
    const completedSession = await waitFor(
      "Stripe checkout session completion for app-route validation",
      async () => {
        const session = await stripe.checkout.sessions.retrieve(checkoutSetup.checkoutSessionId);
        if (session.status === "complete" && session.payment_status === "paid") {
          return session;
        }
        return null;
      },
      pollTimeoutMs,
      pollIntervalMs
    );
    const sessionSubscription = completedSession.subscription;
    checkoutSubscriptionId = typeof sessionSubscription === "string"
      ? sessionSubscription
      : sessionSubscription?.id || null;

    const confirm = await expectAuthenticatedJson(
      checkoutJar,
      `${appUrl}/api/stripe/confirm-checkout`,
      {
        method: "POST",
        headers: {
          ...originHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({ sessionId: checkoutSetup.checkoutSessionId }),
      },
      [200],
      "Confirm checkout route"
    );
    if (!confirm.ok || confirm.tier !== "pro" || confirm.status !== "active") {
      throw new Error(`Confirm checkout returned unexpected payload: ${JSON.stringify(confirm)}`);
    }
    confirmSessionId = checkoutSetup.checkoutSessionId;

    const status = await expectAuthenticatedJson(
      checkoutJar,
      `${appUrl}/api/stripe/subscription-status`,
      { method: "GET" },
      [200],
      "Subscription status after checkout"
    );
    if (status.isPro !== true || status.status !== "active" || status.tier !== "pro" || status.isTrial !== false) {
      throw new Error(`Subscription status after checkout is incorrect: ${JSON.stringify(status)}`);
    }

    const portal = await expectAuthenticatedJson(
      checkoutJar,
      `${appUrl}/api/stripe/create-portal`,
      {
        method: "POST",
        headers: originHeaders,
      },
      [200],
      "Create billing portal route"
    );
    if (typeof portal.url !== "string" || !portal.url.startsWith("https://billing.stripe.com/")) {
      throw new Error(`Billing portal route returned unexpected URL: ${JSON.stringify(portal)}`);
    }
  } finally {
    await cleanup(checkoutSetup, checkoutSubscriptionId);
  }

  let cancelSetup = null;
  try {
    console.log("[live-smoke] Billing app-route E2E: cancel subscription route...");
    cancelSetup = await createSubscriptionRun("app_cancel");
    const cancelJar = await authenticateIntegrationUser(
      appUrl,
      cancelSetup.email,
      cancelSetup.tempPassword
    );

    const cancel = await expectAuthenticatedJson(
      cancelJar,
      `${appUrl}/api/stripe/cancel-subscription`,
      {
        method: "POST",
        headers: originHeaders,
      },
      [200],
      "Cancel subscription route"
    );
    if (cancel.ok !== true || cancel.alreadyScheduled !== false) {
      throw new Error(`Cancel route returned unexpected payload: ${JSON.stringify(cancel)}`);
    }

    const canceledSubscription = await stripe.subscriptions.retrieve(cancelSetup.stripeSubscriptionId);
    if (canceledSubscription.cancel_at_period_end !== true) {
      throw new Error("Stripe subscription was not scheduled for cancellation.");
    }

    await waitFor(
      "subscription row scheduled for cancellation by app route",
      async () => {
        const rows = await supabase.select(
          "subscriptions",
          `select=stripe_subscription_id,cancel_at_period_end&stripe_subscription_id=eq.${cancelSetup.stripeSubscriptionId}`
        );
        return rows?.[0]?.cancel_at_period_end === true ? rows[0] : null;
      },
      pollTimeoutMs,
      pollIntervalMs
    );

    const status = await expectAuthenticatedJson(
      cancelJar,
      `${appUrl}/api/stripe/subscription-status`,
      { method: "GET" },
      [200],
      "Subscription status after cancel"
    );
    if (status.cancelAtPeriodEnd !== true || status.isPro !== false) {
      throw new Error(`Subscription status after cancel is incorrect: ${JSON.stringify(status)}`);
    }
  } finally {
    await cleanup(cancelSetup, cancelSetup?.stripeSubscriptionId);
  }

  let refundSetup = null;
  let refundId = null;
  try {
    console.log("[live-smoke] Billing app-route E2E: refund subscription route...");
    refundSetup = await createSubscriptionRun("app_refund");
    const refundJar = await authenticateIntegrationUser(
      appUrl,
      refundSetup.email,
      refundSetup.tempPassword
    );

    const refund = await expectAuthenticatedJson(
      refundJar,
      `${appUrl}/api/stripe/refund-subscription`,
      {
        method: "POST",
        headers: originHeaders,
      },
      [200],
      "Refund subscription route"
    );
    if (refund.ok !== true || typeof refund.refundId !== "string" || refund.amountRefunded <= 0) {
      throw new Error(`Refund route returned unexpected payload: ${JSON.stringify(refund)}`);
    }
    refundId = refund.refundId;

    const stripeRefund = await stripe.refunds.retrieve(refund.refundId);
    if (!stripeRefund || stripeRefund.id !== refund.refundId) {
      throw new Error("Stripe refund created by app route was not found.");
    }

    await waitFor(
      "profile canceled by refund route",
      async () => {
        const rows = await supabase.select(
          "profiles",
          `select=id,is_pro,subscription_status,subscription_tier&id=eq.${refundSetup.userId}`
        );
        const row = rows?.[0];
        return row?.is_pro === false && row?.subscription_status === "canceled" && row?.subscription_tier === "free"
          ? row
          : null;
      },
      pollTimeoutMs,
      pollIntervalMs
    );

  } finally {
    await cleanup(refundSetup, refundSetup?.stripeSubscriptionId);
  }

  console.log("[live-smoke] Billing app-route E2E passed.");
  return {
    checkoutRunId: checkoutSetup?.runId ?? null,
    confirmSessionId,
    checkoutSubscriptionId,
    cancelRunId: cancelSetup?.runId ?? null,
    cancelSubscriptionId: cancelSetup?.stripeSubscriptionId ?? null,
    refundRunId: refundSetup?.runId ?? null,
    refundSubscriptionId: refundSetup?.stripeSubscriptionId ?? null,
    refundId,
    checks: [
      "confirm_checkout_returns_paid_pro",
      "subscription_status_returns_paid_pro_without_trial_masking",
      "billing_portal_url_created",
      "cancel_subscription_schedules_cancel_at_period_end",
      "refund_subscription_creates_stripe_refund_and_downgrades_profile",
    ],
  };
}

async function main() {
  validateStagingTarget();
  const stripe = createStripeClient();
  await runStage("supabase", () => runSupabaseChecks());
  await runStage("stripe_catalog", () => runStripeChecks(stripe));
  await runStage("billing_webhook_e2e", () => runBillingWebhookE2E(stripe));
  await runStage("billing_checkout_e2e", () => runBillingCheckoutE2E(stripe));
  await runStage("billing_app_routes_e2e", () => runBillingAppRouteE2E(stripe));
  console.log("[live-smoke] All checks passed.");
}

main()
  .then(async () => {
    await writeSummaryArtifact("passed");
  })
  .catch(async (error) => {
    console.error("[live-smoke] FAILED:", error instanceof Error ? error.message : error);
    try {
      await writeSummaryArtifact("failed", error);
    } catch (artifactError) {
      console.error("[live-smoke] Failed to write evidence artifact:", artifactError instanceof Error ? artifactError.message : artifactError);
    }
    process.exit(1);
  });
