import type { AuditHook, AuditRecord } from './types.js';

export function createMemoryAuditHook(): AuditHook & { events: AuditRecord[] } {
  const events: AuditRecord[] = [];
  return {
    events,
    record(event) {
      events.push({ ...event });
    },
  };
}
