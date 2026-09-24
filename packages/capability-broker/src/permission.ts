/**
 * The capability permission model.
 *
 * A caller may execute a capability only when the **host** granted that capability reference to
 * the caller's bound identity. Grants come from exactly two trusted places:
 *
 *  - plugin callers: the `consumesCapabilities` array of their parsed, host-registered manifest;
 *  - site callers: an explicit server-side registration at wiring time.
 *
 * Nothing a request body carries can widen grants. The broker is the final ALLOW/DENY authority on
 * the host side; downstream capability providers (AI Bridge) re-check the same grants as defence
 * in depth.
 */

/**
 * True when a granted reference list covers `capability`.
 *
 * A grant matches when it is the bare capability id, or a pinned `capability@major` /
 * `capability@major.x` whose major equals the requested major. Deny by default.
 */
export function isCapabilityGranted(
  granted: readonly string[],
  capability: string,
  version?: string,
): boolean {
  if (granted.includes(capability)) {
    return true;
  }
  if (version !== undefined) {
    const major = version.split('.')[0];
    if (major !== undefined && granted.includes(`${capability}@${major}`)) {
      return true;
    }
    if (granted.includes(`${capability}@${major}.x`)) {
      return true;
    }
    // A pinned request is denied by a differently pinned grant: the caller declared a different
    // major, and pinning is a promise, not a hint.
    return false;
  }
  // An unpinned request is covered by any pinned grant of the same capability.
  return granted.some((entry) => entry.startsWith(`${capability}@`));
}
