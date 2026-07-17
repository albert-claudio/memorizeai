export interface TelegramSendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const TELEGRAM_TIMEOUT_MS = 5000;
const TELEGRAM_ERROR_BODY_LIMIT = 200;

function getTelegramConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) {
    return null;
  }

  return { botToken, chatId };
}

export function isTelegramConfigured(): boolean {
  return Boolean(getTelegramConfig());
}

async function readTelegramError(response: Response): Promise<string> {
  const fallback = `Telegram API returned ${response.status}`;

  try {
    const body = await response.text();
    if (!body) return fallback;

    try {
      const payload = JSON.parse(body) as { description?: unknown };
      if (typeof payload.description === 'string' && payload.description.trim()) {
        return payload.description.trim();
      }
    } catch {
      return `${fallback}: ${body.slice(0, TELEGRAM_ERROR_BODY_LIMIT)}`;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export async function sendTelegramMessage(text: string): Promise<TelegramSendResult> {
  const config = getTelegramConfig();
  if (!config) {
    return {
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be configured',
    };
  }

  const message = text.length > TELEGRAM_MAX_MESSAGE_LENGTH
    ? `${text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 32)}\n\n[message truncated]`
    : text;

  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: await readTelegramError(response) };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
