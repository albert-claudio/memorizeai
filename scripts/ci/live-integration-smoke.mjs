import Stripe from "stripe";

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

async function runBillingWebhookE2E(stripe) {
  if (!asBool(process.env.BILLING_E2E_ENABLED)) {
    console.log("[live-smoke] Billing webhook E2E disabled. Skipping.");
    return;
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
  } finally {
    if (stripeCustomerId) {
      try {
        await stripe.customers.del(stripeCustomerId);
      } catch (error) {
        console.warn("[live-smoke] Cleanup warning (customer):", error instanceof Error ? error.message : error);
      }
    }
    if (userId) {
      try {
        await supabase.deleteAuthUser(userId);
      } catch (error) {
        console.warn("[live-smoke] Cleanup warning (user):", error instanceof Error ? error.message : error);
      }
    }
  }
}

async function runBillingCheckoutE2E(stripe) {
  if (!asBool(process.env.BILLING_CHECKOUT_E2E_ENABLED)) {
    console.log("[live-smoke] Billing checkout E2E disabled. Skipping.");
    return;
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
  } finally {
    if (stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      } catch (error) {
        console.warn("[live-smoke] Cleanup warning (subscription):", error instanceof Error ? error.message : error);
      }
    }
    if (stripeCustomerId) {
      try {
        await stripe.customers.del(stripeCustomerId);
      } catch (error) {
        console.warn("[live-smoke] Cleanup warning (customer):", error instanceof Error ? error.message : error);
      }
    }
    if (userId) {
      try {
        await supabase.deleteAuthUser(userId);
      } catch (error) {
        console.warn("[live-smoke] Cleanup warning (user):", error instanceof Error ? error.message : error);
      }
    }
  }
}

async function main() {
  const stripe = createStripeClient();
  await runSupabaseChecks();
  await runStripeChecks(stripe);
  await runBillingWebhookE2E(stripe);
  await runBillingCheckoutE2E(stripe);
  console.log("[live-smoke] All checks passed.");
}

main().catch((error) => {
  console.error("[live-smoke] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
