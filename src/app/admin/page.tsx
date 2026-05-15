import { redirect } from 'next/navigation';
import { getAdminAccessState } from '@/lib/auth/admin-security';
import AdminDashboard from './AdminDashboard';

/**
 * Admin page - server component.
 * Validates session and admin RBAC role server-side before rendering.
 */
export default async function AdminPage() {
  const admin = await getAdminAccessState(true);
  if (!admin.ok) {
    redirect(admin.redirectTo ?? '/dashboard');
  }

  return <AdminDashboard adminEmail={admin.email} />;
}
