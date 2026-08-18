# Auth configuration — hosted parity (A1, TSD §5.5)

`supabase/config.toml` is the local half of the §5.5 auth configuration and
is pinned by `tests/config/auth-config.test.ts`. This document is the hosted
half: every §5.5 requirement config.toml cannot express, with where it is
set on the hosted project. **Each row here is a deploy-time checklist item**;
none of them changes app behaviour locally.

| # | Requirement (§5.5) | Local (config.toml) | Hosted |
|---|---|---|---|
| 1 | Password ≥ 10 chars, **no composition rules** | `minimum_password_length = 10`, `password_requirements = ""` | Auth → Providers → Email: min length 10, requirements "No required characters" |
| 2 | Breached-password check (**HIBP**) | Not expressible — local GoTrue does not expose **leaked-password** protection | Auth → Providers → Email: enable "Prevent use of leaked passwords" (Pro plan). Until the project is on a plan that carries it, the ≥ 10 floor and throttle stand alone — recorded, not hidden |
| 3 | 30-day session on a remembered device | `jwt_expiry = 3600`, refresh rotation on, `[auth.sessions] timebox = "720h"` | Auth → Sessions: **timebox** 720h. Refresh-token rotation on (default) |
| 4 | Recovery single-use, 30-minute expiry | `[auth.email] otp_expiry = 1800` — locally this one knob covers every email OTP type | Auth → Email: set **Email OTP expiry** 1800 s. Hosted splits per-type where available; recovery is the row §5.5 binds — 30 min |
| 5 | TOTP on, passkeys costed separately | `[auth.mfa.totp]` enroll+verify true | Auth → MFA: TOTP enabled. Passkeys stay OFF (costed separately, TSD §5.5) |
| 6 | Verification soft-for-use, hard-for-forwarding+invites (§4.1.2) | `enable_confirmations = false` — see below | Same setting ("Confirm email" OFF), same app half |
| 7 | Per-network rate limiting | Not a GoTrue concern — **Vercel WAF** rules at deploy time (ADR-0013 F1: per-account = `hc.auth_throttle`, per-network = WAF) | Vercel project → Firewall: rate-limit rules on `/sign-in`, `/create-account`, `/reset` POST paths. Deploy-time, before any real family |
| 8 | GoTrue rate limits stay ON (F1 backstop) | `[auth.rate_limit]` defaults pinned > 0 | Auth → Rate limits: defaults kept; never zeroed |

## The verification model (row 6), stated once

GoTrue's confirm-email toggle is binary and neither pole is §4.1.2:

- **Enabled** blocks sign-in until the link is clicked — "hard for use",
  violating "setup is never blocked on checking mail" (PRD §4.1.2).
- **Disabled** implicitly confirms every signup — `email_confirmed_at` is
  set at creation, which would satisfy AC-AUTH-4's gate for accounts whose
  mailbox we never proved. That guts G4.

The settled model (ADR-0014 D3, probed live — the admin-API alternative
was abandoned when probing showed admin-created unconfirmed users can
NEVER password-sign-in on this GoTrue): keep
`enable_confirmations = false` and create accounts through **public
signUp** — the one unverified-capable session mint — then the boundary
IMMEDIATELY un-confirms `auth.users.email_confirmed_at` (correcting
autoconfirm's stamp in the one place 2A put verification truth), runs the
accounts bootstrap after the un-confirm so the insert mirror reads NULL,
and requests the verification mail through GoTrue's resend. The founder
keeps a 30-day session on the signup device; `email_confirmed_at` is
thereafter set only by a real confirmation-link click, and the
postgres-owned 2A mirror (M3/M5) carries that truth to
`accounts.email_verified_at`, which `hc.create_invite` (AC-AUTH-4) and
forwarding activation (AC-AUTH-3, slice 4) read live.

The six GoTrue facts this model rests on are pinned by the executable
probe **`scripts/probe-gotrue.mjs`** (run against the live stack; 6/6 at
the 2B gate). **Re-run the probe on any GoTrue/Supabase upgrade** — a
FAIL re-opens ADR-0014 D3.

## Explicitly not configured, deliberately

- **No composition rules** (`password_requirements = ""`) — §5.5 row 1
  says so in bold; do not "harden" this at the dashboard.
- **No captcha** — risk-based challenge is a §4.1.1 note for anomalous
  attempts; nothing in slice 2 introduces one.
- **`secure_password_change` stays false** — §5.7 requires *step-up* for
  email/password change, which is stronger than GoTrue's recent-login
  check and lands with the account-surface slice that ships the change
  form. Turning both on would double-prompt.
- **Anonymous sign-ins, SMS, social providers, Web3: off** (§4.1.1
  "email and password. No social sign-in, no magic links, no phone codes").
