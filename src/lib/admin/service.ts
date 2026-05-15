import { getSupabaseAdmin } from '@/lib/supabase/admin';

export function getAdminStripeCustomerUrl(customerId: string | null | undefined): string | null {
  if (!customerId) return null;
  return `https://dashboard.stripe.com/customers/${customerId}`;
}

export async function writeAdminAction(params: {
  adminUserId: string;
  action: string;
  targetUserId: string;
  details?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('admin_actions').insert({
    admin_user_id: params.adminUserId,
    action: params.action,
    target_user_id: params.targetUserId,
    details: params.details ?? {},
  } as never);

  if (error) {
    console.error('[Admin Action] audit insert failed:', error);
  }
}
