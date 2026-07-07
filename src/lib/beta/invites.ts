import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBaseUrl } from '@/lib/url';

export const DEFAULT_BETA_INVITE_LIMIT = 30;
export const DEFAULT_BETA_TRIAL_DAYS = 30;
export const DEFAULT_BETA_CODE_TTL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BetaInviteStatus = 'pending' | 'sent' | 'redeemed' | 'expired' | 'revoked';

export interface BetaInviteRow {
  id: string;
  name: string;
  email: string;
  code_hash: string;
  status: BetaInviteStatus;
  invited_by: string | null;
  user_id: string | null;
  send_count: number;
  email_delivery_status: 'sent' | 'failed' | 'skipped' | null;
  email_delivery_error: string | null;
  expires_at: number;
  sent_at: number | null;
  redeemed_at: number | null;
  trial_started_at: number | null;
  trial_ends_at: number | null;
  created_at: number;
  updated_at: number;
}

export const ACTIVE_BETA_INVITE_STATUSES: BetaInviteStatus[] = ['pending', 'sent', 'redeemed'];
export const BETA_ACCESS_PERIOD_END = Date.UTC(2100, 0, 1);

const BETA_PRICE_IDS = new Set(['beta_trial', 'beta_access']);
const BETA_SUBSCRIPTION_PREFIXES = ['beta_trial_', 'beta_access_'];

export function normalizeInviteName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeInviteCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function getBetaInviteLimit(): number {
  const parsed = Number(process.env.BETA_INVITE_LIMIT ?? DEFAULT_BETA_INVITE_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_BETA_INVITE_LIMIT;
}

export function getBetaTrialDays(): number {
  const parsed = Number(process.env.BETA_TRIAL_DAYS ?? DEFAULT_BETA_TRIAL_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_BETA_TRIAL_DAYS;
}

export function getBetaCodeTtlDays(): number {
  const parsed = Number(process.env.BETA_CODE_TTL_DAYS ?? DEFAULT_BETA_CODE_TTL_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_BETA_CODE_TTL_DAYS;
}

export function isActiveBetaInviteStatus(status: string | null | undefined): boolean {
  return ACTIVE_BETA_INVITE_STATUSES.includes(status as BetaInviteStatus);
}

export function isBetaSubscription(row: {
  price_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  if (row.price_id && BETA_PRICE_IDS.has(row.price_id)) return true;
  if (row.stripe_subscription_id && BETA_SUBSCRIPTION_PREFIXES.some((prefix) => row.stripe_subscription_id?.startsWith(prefix))) {
    return true;
  }
  return Boolean(row.stripe_customer_id?.startsWith('beta_'));
}

function getInviteSecret(): string {
  const secret = process.env.BETA_INVITE_CODE_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error('BETA_INVITE_CODE_SECRET must be configured with at least 24 characters.');
  }
  return secret;
}

export function generateInviteCode(): string {
  const value = crypto.randomInt(0, 1_000_000);
  return value.toString().padStart(6, '0');
}

export function hashInviteCode(email: string, code: string): string {
  return crypto
    .createHmac('sha256', getInviteSecret())
    .update(`${normalizeInviteEmail(email)}:${normalizeInviteCode(code)}`)
    .digest('hex');
}

export function inviteExpiresAt(nowMs = Date.now()): number {
  return nowMs + getBetaCodeTtlDays() * DAY_MS;
}

export function trialEndsAt(nowMs = Date.now()): number {
  return nowMs + getBetaTrialDays() * DAY_MS;
}

export function buildBetaInviteEmailHtml(code: string, name?: string): string {
  const appUrl = getBaseUrl().replace(/\/$/, '');
  const dashboardUrl = `${appUrl}/dashboard`;
  const redeemUrl = `${appUrl}/beta`;
  const greeting = name ? `Ola, ${name}.` : 'Ola.';

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#0b0b0c;color:#f5f5f5;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#151518;border:1px solid #26262b;border-radius:16px;padding:24px">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#a1a1aa;margin-bottom:12px">Vimens beta</div>
        <h1 style="font-size:22px;line-height:1.2;margin:0 0 12px">Seu acesso beta chegou</h1>
        <p style="font-size:15px;line-height:1.6;color:#d4d4d8;margin:0 0 18px">${greeting} Este email foi adicionado ao beta privado da Vimens com recursos Pro liberados.</p>
        <a href="${dashboardUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;margin:0 0 20px">Entrar na Vimens</a>
        <p style="font-size:13px;line-height:1.5;color:#a1a1aa;margin:0 0 12px">Se o app pedir um codigo beta, use:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:0.18em;color:#fff;background:#09090b;border:1px solid #27272a;border-radius:12px;padding:16px;text-align:center;margin:0 0 20px">${code}</div>
        <a href="${redeemUrl}" style="display:inline-block;color:#c4b5fd;text-decoration:none;font-weight:600">Abrir ativacao manual</a>
        <p style="font-size:12px;line-height:1.5;color:#71717a;margin:20px 0 0">O acesso so funciona para este email.</p>
      </div>
    </div>
  `.trim();
}

export async function sendBetaInviteEmail(
  email: string,
  code: string,
  name?: string
): Promise<{ status: 'sent' | 'failed' | 'skipped'; externalId?: string | null; reason?: string | null }> {
  const apiKey = process.env.NEXT_RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { status: 'skipped', reason: 'NEXT_RESEND_API_KEY not configured' };
  }

  const from = process.env.NOTIFICATIONS_FROM_EMAIL?.trim() || 'Vimens <noreply@vimens.com.br>';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [normalizeInviteEmail(email)],
        subject: 'Seu acesso ao beta da Vimens',
        html: buildBetaInviteEmailHtml(code, name),
      }),
      signal: AbortSignal.timeout(8000),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { status: 'failed', reason: body?.message || `HTTP ${response.status}` };
    }

    return { status: 'sent', externalId: body?.id ?? null };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Email delivery failed',
    };
  }
}

export async function countActiveBetaInvites(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from('beta_invites')
    .select('id', { count: 'exact', head: true })
    .in('status', ACTIVE_BETA_INVITE_STATUSES);

  if (error) {
    throw new Error(`Unable to count beta invites: ${error.message}`);
  }

  return count ?? 0;
}

export async function grantBetaTrial(params: {
  admin: SupabaseClient;
  userId: string;
  email: string;
  inviteId: string;
  nowMs?: number;
}) {
  return grantBetaProAccess(params);
}

export async function grantBetaProAccess(params: {
  admin: SupabaseClient;
  userId: string;
  email: string;
  inviteId: string;
  nowMs?: number;
}) {
  const now = params.nowMs ?? Date.now();
  const periodEnd = BETA_ACCESS_PERIOD_END;
  const subscriptionId = `beta_access_${params.inviteId}`;

  const { error: profileError } = await params.admin
    .from('profiles')
    .upsert({
      id: params.userId,
      is_pro: true,
      subscription_status: 'active',
      subscription_tier: 'pro',
      subscription_period_end: periodEnd,
      updated_at: now,
    }, { onConflict: 'id' });

  if (profileError) {
    throw new Error(`Unable to grant beta profile access: ${profileError.message}`);
  }

  const { error: subscriptionError } = await params.admin
    .from('subscriptions')
    .upsert({
      user_id: params.userId,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: `beta_${params.userId}`,
      price_id: 'beta_access',
      status: 'active',
      current_period_start: now,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      updated_at: now,
    }, { onConflict: 'stripe_subscription_id' });

  if (subscriptionError) {
    throw new Error(`Unable to grant beta subscription access: ${subscriptionError.message}`);
  }

  const { error: inviteError } = await params.admin
    .from('beta_invites')
    .update({
      status: 'redeemed',
      user_id: params.userId,
      redeemed_at: now,
      trial_started_at: now,
      trial_ends_at: periodEnd,
      updated_at: now,
    })
    .eq('id', params.inviteId);

  if (inviteError) {
    throw new Error(`Unable to mark invite as redeemed: ${inviteError.message}`);
  }

  return { periodEnd };
}

export async function activateBetaInviteForUser(params: {
  admin: SupabaseClient;
  userId: string;
  email: string;
  nowMs?: number;
}): Promise<{ invite: BetaInviteRow; periodEnd: number } | null> {
  const email = normalizeInviteEmail(params.email);
  if (!email) return null;

  const { data, error } = await params.admin
    .from('beta_invites')
    .select('*')
    .eq('email', email)
    .in('status', ACTIVE_BETA_INVITE_STATUSES)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to read beta invite: ${error.message}`);
  }

  const invite = data as BetaInviteRow | null;
  if (!invite) return null;
  if (invite.user_id && invite.user_id !== params.userId) {
    throw new Error('Beta invite is already linked to another user.');
  }

  const result = await grantBetaProAccess({
    admin: params.admin,
    userId: params.userId,
    email,
    inviteId: invite.id,
    nowMs: params.nowMs,
  });

  return {
    invite: { ...invite, status: 'redeemed', user_id: params.userId },
    periodEnd: result.periodEnd,
  };
}

export async function hasActiveBetaAccess(params: {
  admin: SupabaseClient;
  userId: string;
  email?: string | null;
}): Promise<boolean> {
  let query = params.admin
    .from('beta_invites')
    .select('id', { count: 'exact', head: true })
    .in('status', ACTIVE_BETA_INVITE_STATUSES);

  const email = params.email ? normalizeInviteEmail(params.email) : '';
  if (email) {
    query = query.or(`user_id.eq.${params.userId},email.eq.${email}`);
  } else {
    query = query.eq('user_id', params.userId);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`Unable to check beta access: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function revokeBetaProAccess(params: {
  admin: SupabaseClient;
  userId: string | null;
  nowMs?: number;
}) {
  if (!params.userId) return;

  const now = params.nowMs ?? Date.now();

  const { data: subscriptions } = await params.admin
    .from('subscriptions')
    .select('status, cancel_at_period_end, current_period_end, price_id, stripe_subscription_id, stripe_customer_id')
    .eq('user_id', params.userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  const paidSubscription = ((subscriptions ?? []) as Array<{
    status?: string | null;
    cancel_at_period_end?: boolean | null;
    current_period_end?: number | null;
    price_id?: string | null;
    stripe_subscription_id?: string | null;
    stripe_customer_id?: string | null;
  }>).find((subscription) => (
    !isBetaSubscription(subscription)
    && ['active', 'past_due'].includes(subscription.status ?? '')
    && !subscription.cancel_at_period_end
    && typeof subscription.current_period_end === 'number'
    && subscription.current_period_end > now
  ));

  await params.admin
    .from('subscriptions')
    .update({
      status: 'canceled',
      cancel_at_period_end: false,
      current_period_end: now,
      updated_at: now,
    })
    .eq('user_id', params.userId)
    .in('price_id', ['beta_trial', 'beta_access']);

  const profileUpdate = paidSubscription
    ? {
        is_pro: true,
        subscription_status: paidSubscription.status ?? 'active',
        subscription_tier: 'pro',
        subscription_period_end: paidSubscription.current_period_end ?? null,
        updated_at: now,
      }
    : {
        is_pro: false,
        subscription_status: 'free',
        subscription_tier: 'free',
        subscription_period_end: null,
        updated_at: now,
      };

  const { error } = await params.admin
    .from('profiles')
    .update(profileUpdate)
    .eq('id', params.userId);

  if (error) {
    throw new Error(`Unable to revoke beta profile access: ${error.message}`);
  }
}
