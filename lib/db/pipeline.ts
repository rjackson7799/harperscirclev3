/**
 * asPipeline() — the ingestion-worker path (TSD §1.2, §1.9, §3.10).
 *
 * Connects AS `hc_pipeline` over Supavisor in transaction mode, with its own
 * credential, from /api/worker/* only. It can write pipeline tables and
 * execute `hc.record_context_for(arrival)`; it cannot read or write record
 * tables directly.
 */
export function asPipeline(): never {
  throw new Error('asPipeline(): not implemented until the workers land (TSD slice 5+)');
}
