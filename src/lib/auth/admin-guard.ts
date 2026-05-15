import { NextResponse } from 'next/server';
import {
  adminFailureResponse,
  getAdminAccessState,
  type AdminAccessSuccess,
} from '@/lib/auth/admin-security';

export type AdminAuthResult = AdminAccessSuccess;

export async function requireAdmin(request?: Request | null): Promise<AdminAuthResult | NextResponse> {
  void request;
  const result = await getAdminAccessState(true);
  if (!result.ok) return adminFailureResponse(result);
  return result;
}

export function isAdminSuccess(
  result: AdminAuthResult | NextResponse
): result is AdminAuthResult {
  return !(result instanceof NextResponse);
}
