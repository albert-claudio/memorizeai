 import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { sanitizeAnalyticsEvent } from '@/lib/analytics/events';
import { getBaseUrl } from '@/lib/url';

const MAX_BATCH_SIZE = 10;

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(request: NextRequest): Set<string> {
  return new Set(
    [
      request.nextUrl.origin,
      getBaseUrl(),
      'https://vimens.app',
      'https://www.vimens.app',
      'http://localhost:3000',
    ]
      .map((origin) => normalizeOrigin(origin ?? null))
      .filter((origin): origin is string => Boolean(origin))
  );
}

function getRequestOrigin(request: NextRequest): string | null {
  return normalizeOrigin(request.headers.get('origin') || request.headers.get('referer'));
}

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const requestOrigin = getRequestOrigin(request);
    const allowedOrigins = getAllowedOrigins(request);

    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
      return NextResponse.json({ error: 'Origem nao autorizada' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const rawEvents = Array.isArray((body as { events?: unknown[] }).events)
      ? (body as { events: unknown[] }).events
      : [];

    if (rawEvents.length === 0) {
      return NextResponse.json({ accepted: 0 }, { status: 202 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const events = rawEvents
      .slice(0, MAX_BATCH_SIZE)
      .map((event) => sanitizeAnalyticsEvent(event))
      .filter((event): event is NonNullable<typeof event> => Boolean(event));

    if (events.length === 0) {
      return NextResponse.json({ accepted: 0 }, { status: 202 });
    }

    const admin = getAdmin();
    const { error } = await admin.from('app_events').insert(
      events.map((event) => ({
        event: event.event,
        user_id: user?.id ?? null,
        session_id: event.sessionId,
        properties: event.properties,
      }))
    );

    if (error) {
      console.error('[Analytics Track] Insert error:', error);
      return NextResponse.json({ error: 'Falha ao registrar evento' }, { status: 500 });
    }

    return NextResponse.json({ accepted: events.length }, { status: 202 });
  } catch (error) {
    console.error('[Analytics Track] Error:', error);
    return NextResponse.json({ error: 'Falha ao registrar evento' }, { status: 500 });
  }
}
