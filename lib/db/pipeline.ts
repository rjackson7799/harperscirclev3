import 'server-only';
import { makeRoleFactory, type RoleDb } from './role-pool';

/**
 * asPipeline() — the worker path (TSD §1.2, §1.9, §3.10).
 *
 * Direct connection pinned to `hc_pipeline`, from /api/worker/* only. It
 * reaches the pipeline tables and its enumerated hc functions (in 2B: the
 * §5.11 security-action sweep — hc.pending_security_actions and
 * hc.complete_security_action, per ADR-0013 F3); it cannot read or write
 * record tables. The deploy credential rides HC_PIPELINE_DB_URL;
 * hc_pipeline itself is NOLOGIN.
 */
const factory = makeRoleFactory('hc_pipeline', 'HC_PIPELINE_DB_URL');

export function asPipeline(): RoleDb {
  return factory();
}
