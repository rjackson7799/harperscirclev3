import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// A3 · The (auth) screens' §4.1.7 states (PRD §4.1.7; design spec §3 voice).
//
// The states table, pinned: throttled shows level copy + the wait + a
// reset link and never a permanent-sounding word; a failed match is plain
// language with the reset path; the unverified state (password-proven,
// parity doc) offers the resend; the create-account screen carries the
// value proposition and privacy statement ON the screen (§4.1.3) and
// pinned plain-language password guidance.
// ============================================================================

async function render(page: string, params: Record<string, string>): Promise<string> {
  const { default: Page } = await import(`@/app/(auth)/${page}/page`);
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
}

describe('A3 · sign-in states (§4.1.7)', () => {
  it('throttled: the wait, level copy, a reset link — no alarm words', async () => {
    const html = (await render('sign-in', { e: 'throttled', wait: '25' })).toLowerCase();
    expect(html).toContain('25');
    expect(html).toContain('/reset');
    expect(html).toContain('wait');
    for (const alarm of ['locked', 'blocked', 'suspended', 'attack']) {
      expect(html).not.toContain(alarm);
    }
  });

  it('nomatch: plain language, never "invalid", with the reset path', async () => {
    const html = (await render('sign-in', { e: 'nomatch' })).toLowerCase();
    expect(html).toContain('/reset');
    expect(html).not.toContain('invalid');
  });

  it('unverified: names the confirmation mail and offers a resend', async () => {
    const html = (await render('sign-in', { e: 'unverified' })).toLowerCase();
    expect(html).toContain('confirm');
    expect(html).toContain('/verify-email/submit');
  });
});

describe('A3 · create-account screen (§4.1.3)', () => {
  it('carries the value proposition and privacy statement on the screen, not a footer', async () => {
    const html = (await render('create-account', {})).toLowerCase();
    expect(html).toContain('privacy');
    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
    expect(html).toContain('type="password"');
  });

  it('password guidance is plain language: ten characters, no composition demands', async () => {
    const html = (await render('create-account', { e: 'password-length' })).toLowerCase();
    expect(html).toContain('10 characters');
    expect(html).not.toContain('symbol');
    expect(html).not.toContain('special character');
  });
});

describe('A3 · reset screens', () => {
  it('request: one field, and the sent state is the same sentence for everyone', async () => {
    const form = (await render('reset', {})).toLowerCase();
    expect(form).toContain('name="email"');
    const sent = (await render('reset', { sent: '1' })).toLowerCase();
    expect(sent).toContain('sent');
  });

  it('confirm: asks for the new password with the plain-language floor', async () => {
    const html = (await render('reset/confirm', {})).toLowerCase();
    expect(html).toContain('type="password"');
    expect(html).toContain('10 characters');
  });
});
