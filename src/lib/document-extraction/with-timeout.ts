import { DOCUMENT_LIMITS } from './limits';

export class ExtractionTimeoutError extends Error {
  constructor() {
    super('Tempo limite de extração excedido');
    this.name = 'ExtractionTimeoutError';
  }
}

export function withExtractionTimeout<T>(
  work: Promise<T>,
  ms: number = DOCUMENT_LIMITS.extractionTimeoutMs,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ExtractionTimeoutError()), ms);
    work
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
