/**
 * The arrival-received signal's staleness bound (6B B5; Q8 SETTLED; ADR-0023
 * D24 ruling 3; PRF-08).
 *
 * The requirement, from the slice-6 plan: the Care Inbox must never present
 * a cancel control that is already dead, and the state shown must be **no
 * more than one relay tick stale** (the relay runs every 60 s). The interval
 * is HALF a tick, so the surface catches every state the relay can have
 * produced before the next one lands.
 *
 * Deliberately a plain module with no 'server-only': the client revalidator
 * reads it in the browser, and the PRF-07 bench reports it beside the p95 so
 * the staleness bound is a NUMBER in the report rather than an assertion in
 * a plan (PRF-08's letter).
 */
export const INBOX_REVALIDATE_SECONDS = 30;
