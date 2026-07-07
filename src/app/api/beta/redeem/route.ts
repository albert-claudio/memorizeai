import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'O beta privado foi encerrado. Crie uma conta para ativar automaticamente o teste gratis de 30 dias.',
    },
    { status: 410 }
  );
}
