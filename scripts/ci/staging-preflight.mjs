import Stripe from "stripe";

const CRON_SCHEDULES = [
  { path: "/api/cron/recover-runs", cron: "*/5 * * * *" },
  { path: "/api/cron/health-check", cron: "*/10 * * * *" },
  { path: "/api/cron/alerts", cron: "*/30 * * * *" },
  { path: "/api/cron/system-report", cron: "0 11 * * *" },
];

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "NEXT_PUBLIC_APP_URL",
  "RUNS_PROCESS_INTERNAL_SECRET",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "SECURITY_ALERT_EMAIL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "FREE_TRIAL_DAYS",
  "FREE_FLASHCARD_RUNS_PER_MONTH",
  "FREE_SIMULADO_RUNS_PER_MONTH",
  "PRO_FLASHCARD_RUNS_PER_MONTH",
  "PRO_SIMULADO_RUNS_PER_MONTH",
  "BILLING_E2E_ENABLED",
  "BILLING_CHECKOUT_E2E_ENABLED",
  "BILLING_APP_ROUTE_E2E_ENABLED",
  "BILLING_E2E_SECRET",
  "BILLING_E2E_APP_URL",
];

const OPTIONAL_ENV = [
  "QSTASH_URL",
  "QSTASH_TOKEN",
  "WEBHOOK_ALERT_URL",
];

const results = [];

function value(name) {
  return process.env[name]?.trim() ?? "";
}

function bool(name) {
  return value(name).toLowerCase() === "true";
}

function pushResult(status, name, detail) {
  results.push({ status, name, detail });
  const icon = status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL";
  console.log(`[${icon}] ${name}${detail ? ` - ${detail}` : ""}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    pushResult("pass", name, detail);
  } catch (error) {
    pushResult("fail", name, error instanceof Error ? error.message : String(error));
  }
}

function warn(name, detail) {
  pushResult("warn", name, detail);
}

function requireEnv(name) {
  const envValue = value(name);
  if (!envValue) throw new Error(`${name} is not set`);
  return envValue;
}

function parseUrl(name, { requireHttps = true, forbidLocal = true } = {}) {
  const raw = requireEnv(name);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (requireHttps && url.protocol !== "https:") {
    throw new Error(`${name} must use https`);
  }

  if (forbidLocal && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`${name} must target deployed staging, not localhost`);
  }

  return url;
}

function normalizeOrigin(raw) {
  const url = new URL(raw);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 10000) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function expectStatus(url, init, allowedStatuses, context) {
  const response = await fetchWithTimeout(url, init);
  if (!allowedStatuses.includes(response.status)) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${context} expected ${allowedStatuses.join(" or ")}, got ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`
    );
  }
  return response;
}

async function readJson(response, context) {
  const body = await response.text();
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new Error(`${context} returned non-JSON response: ${body.slice(0, 200)}`);
  }
}

function assertPositiveInteger(name) {
  const raw = requireEnv(name);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function assertPrefix(name, prefix) {
  const raw = requireEnv(name);
  if (!raw.startsWith(prefix)) {
    throw new Error(`${name} must start with ${prefix}`);
  }
}

async function checkEnvironment() {
  await check("required staging environment variables", () => {
    const missing = REQUIRED_ENV.filter((name) => !value(name));
    if (missing.length) {
      throw new Error(`missing: ${missing.join(", ")}`);
    }
    return `${REQUIRED_ENV.length} required variables present`;
  });

  await check("billing staging route flags", () => {
    const disabled = [
      "BILLING_E2E_ENABLED",
      "BILLING_CHECKOUT_E2E_ENABLED",
      "BILLING_APP_ROUTE_E2E_ENABLED",
    ].filter((name) => !bool(name));
    if (disabled.length) {
      throw new Error(`${disabled.join(", ")} must be true for staging validation`);
    }
    return "billing integration routes enabled";
  });

  await check("staging URL configuration", () => {
    const appUrl = parseUrl("NEXT_PUBLIC_APP_URL");
    const billingUrl = parseUrl("BILLING_E2E_APP_URL");
    if (normalizeOrigin(appUrl.toString()) !== normalizeOrigin(billingUrl.toString())) {
      throw new Error("NEXT_PUBLIC_APP_URL and BILLING_E2E_APP_URL must point at the same staging origin");
    }
    return normalizeOrigin(appUrl.toString());
  });

  await check("staging deployment environment marker", () => {
    const env = (value("VERCEL_ENV") || value("APP_ENV") || value("NODE_ENV")).toLowerCase();
    if (!env) {
      throw new Error("set VERCEL_ENV=preview or APP_ENV=staging for staging validation");
    }
    if (env === "production") {
      throw new Error("staging preflight must not run against a production deployment environment");
    }
    if (!["preview", "staging", "test"].includes(env)) {
      throw new Error(`expected VERCEL_ENV=preview or APP_ENV=staging, got ${env}`);
    }
    return env;
  });

  await check("Stripe staging key format", () => {
    const stripeKey = requireEnv("STRIPE_SECRET_KEY");
    if (!stripeKey.startsWith("sk_test_") && !stripeKey.startsWith("rk_test_")) {
      throw new Error("STRIPE_SECRET_KEY must be a Stripe test-mode key");
    }
    assertPrefix("STRIPE_WEBHOOK_SECRET", "whsec_");
    assertPrefix("STRIPE_PRO_PRICE_ID", "price_");
    return "test-mode key, webhook secret, and Pro price id look valid";
  });

  await check("quota values", () => {
    const freeTrialDays = assertPositiveInteger("FREE_TRIAL_DAYS");
    const freeFlashcards = assertPositiveInteger("FREE_FLASHCARD_RUNS_PER_MONTH");
    const freeSimulados = assertPositiveInteger("FREE_SIMULADO_RUNS_PER_MONTH");
    const proFlashcards = assertPositiveInteger("PRO_FLASHCARD_RUNS_PER_MONTH");
    const proSimulados = assertPositiveInteger("PRO_SIMULADO_RUNS_PER_MONTH");

    if (freeTrialDays < 1) throw new Error("FREE_TRIAL_DAYS must be at least 1");
    if (freeSimulados !== 0) throw new Error("FREE_SIMULADO_RUNS_PER_MONTH must be 0 for public launch");
    if (freeFlashcards < 1) throw new Error("FREE_FLASHCARD_RUNS_PER_MONTH must allow at least one flashcard run");
    if (proFlashcards < freeFlashcards) throw new Error("PRO_FLASHCARD_RUNS_PER_MONTH must be >= free quota");
    if (proSimulados < 1) throw new Error("PRO_SIMULADO_RUNS_PER_MONTH must allow simulados");

    return `trial=${freeTrialDays}d free=${freeFlashcards}/${freeSimulados} pro=${proFlashcards}/${proSimulados}`;
  });

  for (const name of OPTIONAL_ENV) {
    if (!value(name)) {
      warn(`optional ${name}`, "not set");
    }
  }
}

async function checkPublicApp(appUrl) {
  await check("deployed staging app", async () => {
    const response = await fetchWithTimeout(appUrl, { method: "GET", redirect: "manual" }, 10000);
    if (response.status >= 500) {
      throw new Error(`public app returned ${response.status}`);
    }
    return `reachable (${response.status})`;
  });
}

async function checkCronAuth(appUrl) {
  for (const schedule of CRON_SCHEDULES) {
    await check(`cron auth rejects unsigned ${schedule.path}`, async () => {
      const response = await fetchWithTimeout(`${appUrl}${schedule.path}`, { method: "GET" }, 10000);
      if (response.status === 404) {
        throw new Error(`${schedule.path} is not deployed at ${appUrl}`);
      }
      if (response.status === 405) {
        throw new Error(`${schedule.path} does not accept GET; QStash schedules must use GET`);
      }
      if (![401, 403].includes(response.status)) {
        const body = await response.text().catch(() => "");
        throw new Error(`expected 401/403 for unsigned request, got ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
      }
      return `unsigned request rejected with ${response.status}`;
    });
  }
}

async function checkRunsProcessAuth(appUrl) {
  await check("/api/runs/process internal secret gate", async () => {
    const response = await fetchWithTimeout(
      `${appUrl}/api/runs/process`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "preflight-noop" }),
      },
      10000
    );

    if (response.status !== 401) {
      const body = await response.text().catch(() => "");
      throw new Error(`expected 401 without x-internal-secret, got ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
    }
    return "rejects missing x-internal-secret";
  });
}

async function checkSupabase() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  await check("Supabase auth health", async () => {
    await expectStatus(
      `${supabaseUrl}/auth/v1/health`,
      { method: "GET", headers: { apikey: anonKey } },
      [200],
      "Supabase auth health"
    );
    return "auth health returned 200";
  });

  await check("Supabase anon profiles RLS", async () => {
    await expectStatus(
      `${supabaseUrl}/rest/v1/profiles?select=id&limit=1`,
      {
        method: "GET",
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      },
      [401, 403],
      "Supabase anon profiles access"
    );
    return "anon profiles select is blocked";
  });

  await check("Supabase service role profiles access", async () => {
    await expectStatus(
      `${supabaseUrl}/rest/v1/profiles?select=id&limit=1`,
      {
        method: "GET",
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      },
      [200],
      "Supabase service role profiles access"
    );
    return "service role can query profiles";
  });
}

async function checkStripe() {
  await check("Stripe Pro price catalog", async () => {
    const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      apiVersion: "2025-12-15.clover",
      typescript: false,
    });
    const priceId = requireEnv("STRIPE_PRO_PRICE_ID");
    const price = await stripe.prices.retrieve(priceId);
    if (!price || price.id !== priceId) {
      throw new Error("Stripe price lookup returned the wrong object");
    }
    if (price.livemode) {
      throw new Error("Stripe Pro price is live-mode; staging must use test mode");
    }
    return `${price.id} (${price.active ? "active" : "inactive"})`;
  });
}

async function checkRedis() {
  await check("Upstash Redis REST ping", async () => {
    const url = requireEnv("UPSTASH_REDIS_REST_URL").replace(/\/+$/, "");
    const token = requireEnv("UPSTASH_REDIS_REST_TOKEN");
    const response = await expectStatus(
      `${url}/ping`,
      { method: "GET", headers: { Authorization: `Bearer ${token}` } },
      [200],
      "Redis ping"
    );
    const body = await response.text();
    if (!body.toUpperCase().includes("PONG")) {
      throw new Error(`Redis ping did not return PONG: ${body.slice(0, 120)}`);
    }
    return "PONG";
  });
}

async function checkTelegram() {
  await check("Telegram bot identity", async () => {
    const token = requireEnv("TELEGRAM_BOT_TOKEN");
    const response = await expectStatus(
      `https://api.telegram.org/bot${token}/getMe`,
      { method: "GET" },
      [200],
      "Telegram getMe"
    );
    const payload = await readJson(response, "Telegram getMe");
    if (!payload.ok) {
      throw new Error(`Telegram getMe returned ok=false: ${JSON.stringify(payload).slice(0, 160)}`);
    }
    return payload.result?.username ? `@${payload.result.username}` : "bot token accepted";
  });

  await check("Telegram report chat access", async () => {
    const token = requireEnv("TELEGRAM_BOT_TOKEN");
    const chatId = encodeURIComponent(requireEnv("TELEGRAM_CHAT_ID"));
    const response = await expectStatus(
      `https://api.telegram.org/bot${token}/getChat?chat_id=${chatId}`,
      { method: "GET" },
      [200],
      "Telegram getChat"
    );
    const payload = await readJson(response, "Telegram getChat");
    if (!payload.ok) {
      throw new Error(`Telegram getChat returned ok=false: ${JSON.stringify(payload).slice(0, 160)}`);
    }
    return payload.result?.type ? `chat type=${payload.result.type}` : "chat reachable";
  });
}

function schedulesFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.schedules)) return payload.schedules;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function scheduleMatches(schedule, targetUrl, expectedCron) {
  const serialized = JSON.stringify(schedule);
  const hasUrl = serialized.includes(targetUrl);
  const hasCron = serialized.includes(expectedCron);
  const method = String(schedule.method || schedule.httpMethod || schedule.upstashMethod || "").toUpperCase();
  const hasGet = method === "GET" || serialized.includes('"GET"') || serialized.includes("GET");
  return { hasUrl, hasCron, hasGet };
}

async function checkQStash(appUrl) {
  await check("QStash signing key pair", () => {
    requireEnv("QSTASH_CURRENT_SIGNING_KEY");
    requireEnv("QSTASH_NEXT_SIGNING_KEY");
    return "current and next signing keys present";
  });

  const token = value("QSTASH_TOKEN");
  if (!token) {
    warn(
      "QStash schedule verification",
      "QSTASH_TOKEN is not set; signing keys are present but schedule existence was not verified"
    );
    return;
  }

  await check("QStash schedules", async () => {
    const qstashUrl = value("QSTASH_URL") || "https://qstash.upstash.io";
    let qstashBaseUrl;
    try {
      qstashBaseUrl = new URL(qstashUrl);
    } catch {
      throw new Error("QSTASH_URL must be a valid URL when set");
    }

    const response = await expectStatus(
      `${qstashBaseUrl.toString().replace(/\/+$/, "")}/v2/schedules`,
      { method: "GET", headers: { Authorization: `Bearer ${token}` } },
      [200],
      "QStash schedules list"
    );
    const payload = await readJson(response, "QStash schedules list");
    const schedules = schedulesFromPayload(payload);
    if (!schedules.length) {
      throw new Error("QStash returned no schedules");
    }

    const missing = [];
    for (const expected of CRON_SCHEDULES) {
      const targetUrl = `${appUrl}${expected.path}`;
      const match = schedules.find((schedule) => {
        const checks = scheduleMatches(schedule, targetUrl, expected.cron);
        return checks.hasUrl && checks.hasCron && checks.hasGet;
      });
      if (!match) {
        missing.push(`${expected.path} (${expected.cron}, GET)`);
      }
    }

    if (missing.length) {
      throw new Error(`missing schedules: ${missing.join(", ")}`);
    }
    return `${CRON_SCHEDULES.length} GET schedules found`;
  });
}

function printSummary() {
  const failed = results.filter((result) => result.status === "fail");
  const warnings = results.filter((result) => result.status === "warn");

  console.log("");
  console.log("Preflight summary");
  console.log("=================");
  console.log(`Passed: ${results.filter((result) => result.status === "pass").length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length) {
    console.log("");
    console.log("Failures:");
    for (const failure of failed) {
      console.log(`- ${failure.name}: ${failure.detail}`);
    }
  }

  if (warnings.length) {
    console.log("");
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning.name}: ${warning.detail}`);
    }
  }

  return { failed, warnings };
}

async function main() {
  console.log("Public launch staging preflight");
  console.log("================================");

  await checkEnvironment();
  if (results.some((result) => result.status === "fail")) {
    printSummary();
    process.exit(1);
  }

  const appUrl = normalizeOrigin(requireEnv("BILLING_E2E_APP_URL"));
  await checkPublicApp(appUrl);
  await checkCronAuth(appUrl);
  await checkRunsProcessAuth(appUrl);
  await checkSupabase();
  await checkStripe();
  await checkRedis();
  await checkTelegram();
  await checkQStash(appUrl);

  const { failed } = printSummary();
  if (failed.length) {
    process.exit(1);
  }

  console.log("");
  console.log("Public launch staging preflight passed.");
}

main().catch((error) => {
  console.error("[staging-preflight] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
