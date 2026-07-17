export const RUN_LEASE_MS = parseInt(process.env.RUN_LEASE_MS || '180000', 10);
export const RUN_LEASE_HEARTBEAT_MS = parseInt(
  process.env.RUN_LEASE_HEARTBEAT_MS || String(Math.max(Math.floor(RUN_LEASE_MS / 3), 15000)),
  10,
);
export const STUCK_PROCESSING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

