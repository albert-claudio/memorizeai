import { NextResponse } from 'next/server';
import { getPublicProOffer } from '@/lib/billing/offer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const offer = await getPublicProOffer();
    return NextResponse.json(offer);
  } catch (error) {
    console.error('[Stripe Offer] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar oferta atual' },
      { status: 500 }
    );
  }
}
