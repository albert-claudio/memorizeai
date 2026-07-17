import { NextResponse } from 'next/server';

export const GENERIC_SERVER_ERROR =
  'Ocorreu um erro interno. Tente novamente em instantes.';

/**
 * Standard 500 response — never exposes internal error details to clients.
 */
export function internalServerErrorResponse(): NextResponse {
  return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
}
