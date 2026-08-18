# Round 9 — third-party review findings (received 2026-08-17, verbatim)

> Reviewed: slice increment 2A at head `265952d` (evidence SHA `6cc0dc7`,
> CI run 32106060931). Verdict: **not accepted — forward-fix required.**
> Dispositions: ADR-0013.

---

I found three blocking issues in Slice 2A. I would not accept round 9 or
merge this increment yet.

## 1. Critical — anonymous callers can clear any account's throttle

`20260818120001_auth_attempts.sql` (line 115) accepts caller-supplied
outcomes including `success` and `reset_completed`, while line 142 grants
the function to anon.

Anyone can therefore call:

    select hc.record_auth_attempt('victim@example.com', 'success');

That inserts a success-class event and immediately resets the victim's
failure count. It defeats progressive throttling and the
suspicious-attempt threshold. The tests actually institutionalize this
behavior in concurrency case 28.

Only a trusted server-side boundary should be able to record successful
authentication or completed recovery. Anonymous callers must not be able
to assert either outcome. Ideally, the trusted boundary should also own
failure recording so clients cannot fabricate or suppress the ledger.

There is also a broader integration question for 2B: this database
throttle is only advisory unless every password-verification path is
forced through an application-controlled boundary. Direct calls to
Supabase Auth would otherwise bypass it.

## 2. High — sender acceptance violates the R-rule and can race a freeze

In `20260818120006_sender_surfaces.sql` (line 88), `accept_sender`:

- checks the freeze at lines 88–92;
- writes `known_senders` at lines 99–102;
- writes the audit event at lines 108–112;
- acquires the per-circle advisory lock only at line 116.

A freeze can commit after the early check but before the lock. When that
happens, the accepted sender and log entry survive and held mail can
subsequently be released despite the newly committed freeze. This
directly contradicts ADR-0006's rule that security-state writers acquire
the lock before binding predicates or writing.

Acquire the circle lock before the authorization/freeze predicates, then
re-evaluate both under the lock. Add an acceptance-vs-freeze two-session
test comparable to case 26; the current pgTAP test only covers a freeze
that already exists.

## 3. High — "this wasn't me" consumption is not atomic with its security effect

`20260818120005_wasnt_me.sql` (line 187) consumes the single-use token
and returns an `account_id`. Session destruction and forced recovery are
deferred to a later 2B application call.

That creates a permanent partial-failure state:

1. Database transaction commits and consumes the token.
2. Supabase Admin session revocation fails or the process crashes.
3. The link is now dead, but the suspicious sessions remain active.

It also means any direct anonymous RPC call can consume the token
without performing the promised destruction. The test at
`039_wasnt_me.sql` (line 206) verifies token consumption, not the
security outcome.

The POST needs a durable, retryable state transition. For example,
atomically consume the token and enqueue a uniquely keyed
account-security action; a privileged worker performs global revocation
and records completion, with safe retries. Do not equate "token
consumed" with "this wasn't me executed."

## Additional gate feedback

- Round-9's "CI green" evidence is credible as regression evidence, but
  the tests do not cover the security boundaries above.
- The packet should add the three findings explicitly and change its
  recommendation from acceptance to forward-fix.
- The 2A/2B split leaves the throttle and "this wasn't me" mechanisms
  inseparable from trusted app-layer enforcement. If 2A is merged alone,
  document that these RPCs are not deployable/publicly usable until 2B
  closes those boundaries.

No files were changed.
