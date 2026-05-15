const SAFE_ENTITY_ID = /^[A-Za-z0-9_-]+$/;

export function isSafeEntityId(value: unknown, maxLength: number = 128): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && SAFE_ENTITY_ID.test(value);
}
