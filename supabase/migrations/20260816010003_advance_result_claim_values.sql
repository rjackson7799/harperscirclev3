-- ============================================================================
-- 1C · M3 — the first ALTER TYPE … ADD VALUE migration (PLT-03).
--
-- hc.claim_stage (M4) speaks the SAME outcome vocabulary workers already
-- handle from hc.advance_arrival — cancelled / frozen / invalid_state /
-- already_advanced / stale_lease mean the same things at claim time — plus
-- two claim-only outcomes: 'claimed' (you own attempt N) and 'exhausted'
-- (§4.3: the budget is spent; the terminal move already happened; do NOT
-- call the provider). Extending hc.advance_result keeps one enum per
-- worker switch instead of two near-identical vocabularies (ADR-0007;
-- a recorded delta to the §4.2 six-label DDL, TSD Amendments annex).
--
-- THE RULE THIS FILE EXISTS TO EXERCISE (ADR-0002 c5/note 5, ADR-0003 f7,
-- build-plan migration boundary rule): a migration containing
-- ALTER TYPE … ADD VALUE may not USE the new value — usage in the adding
-- transaction fails with 55P04. This migration therefore contains NOTHING
-- but the two ADD VALUEs; hc.claim_stage's body lands in M4. The CI
-- upgrade rehearsal applies exactly this increment to the shipped base on
-- every run, and 021 probes the 55P04 behaviour live.
-- ============================================================================

alter type hc.advance_result add value 'claimed';
alter type hc.advance_result add value 'exhausted';
