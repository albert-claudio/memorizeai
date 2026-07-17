import { sendTelegramMessage, type TelegramSendResult } from '@/lib/telegram';

const WEBHOOK_TIMEOUT_MS = 5_000;
const WEBHOOK_ERROR_BODY_LIMIT = 200;

export interface WebhookAlertResult {
  attempted: boolean;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface OperationalAlertDelivery {
  telegram: TelegramSendResult;
  webhook: WebhookAlertResult;
}

async function sendWebhookAlert(text: string): Promise<WebhookAlertResult> {
  const alertUrl = process.env.WEBHOOK_ALERT_URL?.trim();
  if (!alertUrl) {
    return { attempted: false, ok: false, error: 'WEBHOOK_ALERT_URL is not configured' };
  }

  try {
    const response = await fetch(alertUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `content` is accepted by Discord and `text` by Slack-compatible hooks.
      body: JSON.stringify({ content: text, text }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        attempted: true,
        ok: false,
        status: response.status,
        error: body ? body.slice(0, WEBHOOK_ERROR_BODY_LIMIT) : `Webhook returned ${response.status}`,
      };
    }

    return { attempted: true, ok: true, status: response.status };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Delivers an operational incident to both configured channels. Delivery is
 * awaited so serverless invocations cannot finish before an alert is sent.
 */
export async function dispatchOperationalAlert(text: string): Promise<OperationalAlertDelivery> {
  const [telegram, webhook] = await Promise.all([
    sendTelegramMessage(text),
    sendWebhookAlert(text),
  ]);

  return { telegram, webhook };
}
