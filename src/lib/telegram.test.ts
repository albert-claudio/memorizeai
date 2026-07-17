import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTelegramConfigured, sendTelegramMessage } from './telegram';

describe('telegram', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports missing configuration without calling Telegram', async () => {
    await expect(sendTelegramMessage('hello')).resolves.toEqual({
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be configured',
    });

    expect(isTelegramConfigured()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('truncates messages to Telegram limits', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    process.env.TELEGRAM_CHAT_ID = 'chat';
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await sendTelegramMessage('x'.repeat(5000));
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const payload = JSON.parse(String(init?.body)) as { text: string };

    expect(result).toEqual({ ok: true, status: 200 });
    expect(payload.text.length).toBeLessThanOrEqual(4096);
    expect(payload.text).toContain('[message truncated]');
  });

  it('returns useful context when Telegram sends a non-JSON error body', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    process.env.TELEGRAM_CHAT_ID = 'chat';
    vi.mocked(fetch).mockResolvedValue(new Response('upstream unavailable', { status: 502 }));

    await expect(sendTelegramMessage('hello')).resolves.toEqual({
      ok: false,
      status: 502,
      error: 'Telegram API returned 502: upstream unavailable',
    });
  });
});
