import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminDashboard from './AdminDashboard';

/**
 * Admin page — server component.
 * Validates session and admin email server-side before rendering.
 */
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const email = user.email?.trim().toLowerCase() ?? '';
  const adminEmails = new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );

  if (!adminEmails.has(email)) {
    redirect('/dashboard');
  }

  return <AdminDashboard adminEmail={email} />;
}
