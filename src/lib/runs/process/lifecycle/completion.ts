export function finalizeRunUpdate(update: Record<string, unknown>) {
  return {
    ...update,
    lease_expires_at: null,
    processing_node: null,
    updated_at: Date.now(),
  };
}

