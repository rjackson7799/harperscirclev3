/**
 * The four database client factories, one per trust boundary (TSD §1.2).
 *
 * asServiceRole() is deliberately NOT re-exported here. It lives in
 * ./service-role, which each permitted call site must import directly —
 * see that module for the containment layers.
 */
export { asUser } from './user';
export { asAdmin } from './admin';
export { asPipeline } from './pipeline';
// Type-only: the claims shape the request-role channel carries. The
// channel itself stays fenced to lib/hc/**.
export type { RequestClaims } from './request-role';
