import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'smol-toml';
import path from 'node:path';

// ============================================================================
// A1 · The §5.5 auth-config pin (TSD §5.5, PRD §4.1.1–§4.1.2; ADR-0013 F1).
//
// config.toml is the local half of the auth configuration; this test pins it
// to §5.5 exactly so a drift reds CI rather than shipping. The hosted half
// (HIBP leaked-password protection, per-type mail expiries, the Vercel WAF
// per-network limits) cannot be expressed in config.toml and is recorded in
// docs/ops/auth-config-parity.md — asserted here only as "the parity doc
// exists and names each hosted-only control".
//
// The verification model behind enable_confirmations = false (soft-for-use,
// §4.1.2): GoTrue's confirm-email toggle is binary — enabled blocks sign-in
// until the link is clicked (hard-for-use, violating "setup is never blocked
// on checking mail"), disabled implicitly confirms at signup (faking
// email_confirmed_at and gutting AC-AUTH-4/G4). The settled model (ADR-0014
// D3; admin-created unconfirmed users can never password-sign-in, so the
// admin-API alternative was abandoned): PUBLIC signUp mints the one
// unverified-capable session, the boundary immediately un-confirms
// auth.users so accounts start genuinely unverified while the founder keeps
// the signup session; the postgres-owned mirror (2A M3/M5) keeps reading
// the real email_confirmed_at. That app half is tested with the
// create-account route; the probed facts are scripts/probe-gotrue.mjs.
// ============================================================================

type TomlTable = Record<string, unknown>;
const config = parse(
  readFileSync(path.resolve(__dirname, '../../supabase/config.toml'), 'utf8'),
) as TomlTable;

function section(...keys: string[]): TomlTable {
  let node: unknown = config;
  for (const key of keys) {
    node = (node as TomlTable)?.[key];
  }
  expect(node, `[${keys.join('.')}] missing from config.toml`).toBeTypeOf('object');
  return node as TomlTable;
}

describe('A1 · supabase/config.toml pins §5.5 exactly', () => {
  const auth = section('auth');

  it('auth is enabled with signup on (§5.5, §4.1.2 "signup on")', () => {
    expect(auth.enabled).toBe(true);
    expect(auth.enable_signup).toBe(true);
  });

  it("the /confirm landing is on GoTrue's redirect allow-list (B9 fix, completed): emailRedirectTo is SILENTLY dropped for un-listed URLs, which is exactly how FWD-01's activation pass went dead twice", () => {
    const urls = auth.additional_redirect_urls as string[];
    expect(Array.isArray(urls)).toBe(true);
    expect(urls).toContain('http://127.0.0.1:3000/confirm*');
  });

  it('the confirmation mail routes through /confirm with token_hash (B9, the flow-type-independent half): the default template verifies AT GoTrue and redirects with FRAGMENT tokens the server can never read, so the §5.1 activation pass still never ran', () => {
    const template = section('auth', 'email', 'template', 'confirmation');
    expect(template.content_path).toBe('./supabase/templates/confirmation.html');
    const html = readFileSync(
      path.resolve(__dirname, '../../supabase/templates/confirmation.html'),
      'utf8',
    );
    expect(html).toContain('{{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}');
    expect(html).toContain('type=signup');
    expect(html).toContain('flow=signup');
  });

  it('email+password only: anonymous, SMS and every social provider off (§4.1.1)', () => {
    expect(auth.enable_anonymous_sign_ins).toBe(false);
    expect(section('auth', 'sms').enable_signup).toBe(false);
    const external = section('auth', 'external');
    for (const [provider, cfg] of Object.entries(external)) {
      expect(
        (cfg as TomlTable).enabled,
        `[auth.external.${provider}] must stay disabled`,
      ).toBe(false);
    }
    const web3 = auth.web3 as TomlTable | undefined;
    if (web3) {
      for (const [chain, cfg] of Object.entries(web3)) {
        expect((cfg as TomlTable).enabled, `[auth.web3.${chain}]`).toBe(false);
      }
    }
  });

  it('password ≥ 10 chars with NO composition rules (§5.5 row 1)', () => {
    expect(auth.minimum_password_length).toBe(10);
    expect(auth.password_requirements).toBe('');
  });

  it('30-day session: short JWT + refresh rotation, sessions time-boxed to 720h (§5.5 row 2)', () => {
    expect(auth.jwt_expiry).toBe(3600);
    expect(auth.enable_refresh_token_rotation).toBe(true);
    expect(section('auth', 'sessions').timebox).toBe('720h');
  });

  it('recovery links single-use with a 30-minute expiry (§5.5 row 3)', () => {
    expect(section('auth', 'email').otp_expiry).toBe(1800);
  });

  it('email verification is real, not autoconfirmed-hard: enable_confirmations=false with the signUp-then-unconfirm app half (§4.1.2)', () => {
    expect(section('auth', 'email').enable_confirmations).toBe(false);
    expect(section('auth', 'email').enable_signup).toBe(true);
  });

  it('TOTP second factor enabled; passkeys not assumed (§5.5 row 5)', () => {
    const totp = section('auth', 'mfa', 'totp');
    expect(totp.enroll_enabled).toBe(true);
    expect(totp.verify_enabled).toBe(true);
    const phone = section('auth', 'mfa', 'phone');
    expect(phone.enroll_enabled).toBe(false);
    expect(phone.verify_enabled).toBe(false);
  });

  it("GoTrue's own rate limits stay ON as the backstop (ADR-0013 F1 contract)", () => {
    const limits = section('auth', 'rate_limit');
    expect(limits.sign_in_sign_ups).toBeGreaterThan(0);
    expect(limits.token_refresh).toBeGreaterThan(0);
    expect(limits.token_verifications).toBeGreaterThan(0);
    expect(limits.email_sent).toBeGreaterThan(0);
  });
});

describe('A1 · hosted parity is documented, not assumed', () => {
  it('docs/ops/auth-config-parity.md names each hosted-only control', () => {
    const parity = readFileSync(
      path.resolve(__dirname, '../../docs/ops/auth-config-parity.md'),
      'utf8',
    );
    for (const control of [
      'leaked-password',
      'HIBP',
      'Vercel WAF',
      'timebox',
      'otp_expiry',
      'enable_confirmations',
    ]) {
      expect(parity, `parity doc must cover: ${control}`).toContain(control);
    }
  });
});
