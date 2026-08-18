# The security-actions worker — operational contract (§5.11; ADR-0015 F3/F9/F15)

`/api/worker/security-actions` drains `hc.pending_security_actions`: any
consumed wasnt-me token whose immediate kill did not complete gets its
global sign-out + forced password reset performed, then marked complete.
The DB half guarantees the kill is *owed* (ADR-0013 F3: `security_actions`,
UNIQUE(event_id)); this worker is what makes "owed" become "done" when the
POST-time kill failed. This document is the operational security control
the route's key check implements — round-10 findings 3, 9 and 15 ruled
that a comment is not an invoker and "key-gated" is not a contract.

## Invoker (finding 3)

- **Scheduler:** the Vercel cron in [`vercel.json`](../../vercel.json) —
  checked in, reviewed with the tree, pinned by
  `tests/config/vercel-cron.test.ts`. Vercel invokes the route as **GET**
  with `Authorization: Bearer ${CRON_SECRET}` when the `CRON_SECRET`
  project env var is set.
- **Cadence:** `*/10 * * * *` — every 10 minutes. **Plan requirement:**
  sub-daily crons need a paid Vercel plan; Hobby's once-a-day floor is
  RECORDED AS INSUFFICIENT for §5.11 (a pending kill must wait minutes,
  not a day). Deploying on Hobby is a deviation that needs an owner
  ruling.
- **Maximum tolerated pending age:** **30 minutes** (three missed
  sweeps). An action older than that means the cron is not running or
  GoTrue has been down across retries — page-worthy, not log-worthy.
- **Operational path:** POST with `x-worker-key: ${HC_WORKER_KEY}` — for
  manual sweeps and non-Vercel schedulers. Same drain, same bounds.

## Secrets (finding 15)

| Property | Contract |
|---|---|
| Entropy | ≥ 32 random bytes each (e.g. `openssl rand -hex 32`); never a phrase |
| Distinctness | `CRON_SECRET` and `HC_WORKER_KEY` are two secrets — rotating one never breaks the other path |
| Comparison | Timing-safe and length-blind in the route (sha256 → `timingSafeEqual`) |
| Provisioning | Vercel project env vars (production scope); local dev normally leaves both unset — each unset secret disables its path with **503, never open** |
| Rotation | Set the new value in the project env, redeploy, done — the route reads the env per request; rotate on any suspicion and at most yearly |
| Leak response | Rotate immediately. Blast radius is bounded by design: the worker can only perform kills that are already durably owed — an attacker holding the key can sweep the queue (which defends accounts) or probe 403s, not create actions, not choose targets |
| Replay | Requests are not replay-sensitive: the drain is idempotent (below); TLS is the transport control |
| Logging | Secrets never appear in logs or responses; the response carries counts and ages only |
| Source restriction | Vercel cron + the operator's runbook; the WAF per-network rows (parity doc row 7) cover brute-force on the header |

## Sweep semantics (finding 9)

- **Ordering:** oldest `created_at` first — the longest-owed kill is the
  most urgent.
- **Batch bound:** at most **20 actions per invocation**; the remainder
  defers to the next sweep (10 minutes away). A backlog can therefore
  never blow the function's execution window; drain rate is 120/hour,
  far above any plausible wasnt-me volume.
- **Per-action isolation:** each action is its own try/catch; one GoTrue
  failure leaves that row pending and never blocks the rest.
- **Concurrency:** sweeps take no lease. Two concurrent sweeps can
  double-perform a kill; that is SAFE by construction — session
  revocation is idempotent (deleting nothing is nothing), a double
  rotation is two random passwords with the same forced-reset outcome,
  and `hc.complete_security_action` is retry-safe (the second completion
  reports `{completed:false}`; 2A tests pin it). A DB claim/lease
  primitive is queued in the ADR-0015 bound-amendment batch as a
  tidiness upgrade, not a correctness need.
- **Timeout posture:** the batch bound is the timeout control; the
  route's platform `maxDuration` (300 s default) comfortably covers 20
  sequential admin calls. No per-action timer is layered on top.
- **Terminal failures:** there is no poison-pill state — an action that
  fails every sweep stays pending and is exactly what the age monitor
  exists to surface (a GoTrue-side investigation, never a silent drop).

## Observability

Every sweep answers `{ drained, of, deferred, oldest_pending_age_s }`.

- **Monitor:** alert when `oldest_pending_age_s > 1800` (the 30-minute
  maximum tolerated age) on the cron's response, or when the cron itself
  stops running (Vercel cron logs).
- Vercel logs retain the JSON body per invocation; no extra
  instrumentation is required in 2B.

## Claim wording (finding 3's ruling)

With the scheduler checked in, F3's contract reads: **durable at consume
time, performed at POST time, re-performed by a scheduled sweep within 10
minutes when the immediate kill fails — "delay, never a loss" holds once
`CRON_SECRET` is provisioned at deploy.** Until that provisioning moment
the honest description remains "durably recoverable"; the deploy
checklist row below closes the gap.

**Deploy checklist:** set `CRON_SECRET` + `HC_WORKER_KEY` (distinct, ≥ 32
random bytes) · confirm the plan supports `*/10` crons · confirm the
first cron invocation answers 200 with zeroes · wire the
`oldest_pending_age_s > 1800` alert.
