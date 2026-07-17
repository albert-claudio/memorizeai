import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendTelegramMessage: vi.fn(),
}));

vi.mock('@/lib/telegram', () => ({
  sendTelegramMessage: mocks.sendTelegramMessage,
}));

import { dispatchOperationalAlert } from './operational-alerts';

describe('dispatchOperationalAlert', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.WEBHOOK_ALERT_URL;
    mocks.sendTelegramMessage.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('sends the incident to Telegram even without a webhook destination', async () => {
    const delivery = await dispatchOperationalAlert('incident');

    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith('incident');
    expect(delivery.telegram).toEqual({ ok: true, status: 200 });
    expect(delivery.webhook).toEqual({
      attempted: false,
      ok: false,
      error: 'WEBHOOK_ALERT_URL is not configured',
    });
  });

  it('awaits a Slack/Discord-compatible webhook delivery', async () => {
    process.env.WEBHOOK_ALERT_URL = 'https://alerts.example.test/hook';
    const fetchMock = vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const delivery = await dispatchOperationalAlert('incident');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://alerts.example.test/hook',
      expect.objectContaining({ method: 'POST' }),
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(payload).toEqual({ content: 'incident', text: 'incident' });
    expect(delivery.webhook).toEqual({ attempted: true, ok: true, status: 204 });
  });
});
