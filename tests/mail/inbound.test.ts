import { describe, expect, it } from 'vitest';
import {
  evaluateSenderAuth,
  parseInbound,
  senderDomain,
  type InboundAuthConfig,
  type PostmarkHeader,
  type PostmarkInboundPayload,
} from '@/lib/mail/inbound';

// ============================================================================
// B1 · lib/mail/inbound.ts — the Postmark adapter's §5.3 verdict chain,
// IN ORDER (slice-4 plan B1; TSD §5.3 as ruled at Q5; SAU-01's app half).
//
// Test class: UNIT (pure adapter logic over fixture payloads — no DB, no
// network; the live lookalike arithmetic is 045's, the live gate is B9's).
//
// The chain the §5.3 letter requires, and what each block below pins:
//   1. Provider out-of-band fields FIRST — from a signature-verified
//      payload; data that never travelled through attacker-controlled
//      MIME. When present, the chain STOPS there: a forged in-MIME
//      Authentication-Results can never rescue a provider verdict.
//   2. Where a header must be read: only an Authentication-Results
//      bearing OUR configured authserv-id EXACTLY, bound to the trusted
//      receiving hop in the Received trace. G7's adversarial set starts
//      here: forged A-R below a foreign hop, lookalike authserv-ids.
//   3. The strip/rename posture is the MTA config's (documented in the
//      module header + the deploy checklist) — no code half to pin.
//   4. ARC per Q5 (SETTLED): cryptographic chain validation is DEFERRED
//      to a pre-activation G7 item. An ARC set alone proves NOTHING —
//      alignment-broken mail stays unauthenticated ⇒ held, fail-closed
//      to a human.
//   Display name is NEVER an input to the verdict (PRD §4.2.8).
// ============================================================================

const CONFIG: InboundAuthConfig = {
  authservId: 'inbound.harperscircle.app',
  trustedHop: 'inbound.harperscircle.app',
};

const TRUSTED_RECEIVED: PostmarkHeader = {
  Name: 'Received',
  Value:
    'by inbound.harperscircle.app (Postmark) with SMTP id 9f2ab; Tue, 19 Aug 2026 09:00:00 +0000',
};

const FOREIGN_RECEIVED: PostmarkHeader = {
  Name: 'Received',
  Value: 'from mail.cardiology.org by mx.cardiology.org with ESMTP id 7c1; earlier hop',
};

function arHeader(value: string): PostmarkHeader {
  return { Name: 'Authentication-Results', Value: value };
}

function payload(overrides: Partial<PostmarkInboundPayload> = {}): PostmarkInboundPayload {
  return {
    FromFull: { Email: 'front-desk@cardiology.org', Name: 'Front Desk' },
    OriginalRecipient: 'nell.a7f3k2@harperscircle.app',
    MessageID: 'a8c1e2f4-0001-4000-8000-0000000000b1',
    Subject: 'Discharge summary',
    Headers: [],
    Attachments: [],
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Step 1 · provider out-of-band fields first
// ----------------------------------------------------------------------------
describe('B1 · §5.3 step 1 — provider fields first, chain stops there', () => {
  it('provider DMARC pass authenticates via provider_fields', () => {
    const v = evaluateSenderAuth(payload({ DmarcResult: { Result: 'pass' } }), CONFIG);
    expect(v.result).toBe('authenticated');
    expect(v.method).toBe('provider_fields');
  });

  it('provider DMARC fail stays unauthenticated even when a forged in-MIME A-R claims pass', () => {
    const v = evaluateSenderAuth(
      payload({
        DmarcResult: { Result: 'fail' },
        Headers: [
          TRUSTED_RECEIVED,
          arHeader('inbound.harperscircle.app; dmarc=pass header.from=cardiology.org'),
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('unauthenticated');
    expect(v.method).toBe('provider_fields');
  });

  it('provider aligned SPF pass authenticates when no DMARC field rides along', () => {
    const v = evaluateSenderAuth(
      payload({ SpfResult: { Result: 'pass', Domain: 'cardiology.org' } }),
      CONFIG,
    );
    expect(v.result).toBe('authenticated');
    expect(v.method).toBe('provider_fields');
  });

  it('provider SPF pass on an UNALIGNED domain does not authenticate (the §5.3 test is aligned DMARC, not green lights)', () => {
    const v = evaluateSenderAuth(
      payload({ SpfResult: { Result: 'pass', Domain: 'bulk-sender.example.net' } }),
      CONFIG,
    );
    expect(v.result).toBe('unauthenticated');
  });

  it('provider aligned DKIM pass authenticates, including relaxed subdomain alignment', () => {
    const v = evaluateSenderAuth(
      payload({ DkimResult: { Result: 'pass', Domain: 'mail.cardiology.org' } }),
      CONFIG,
    );
    expect(v.result).toBe('authenticated');
  });
});

// ----------------------------------------------------------------------------
// Step 2 · authserv-id-anchored header parsing, bound to the trusted hop
// ----------------------------------------------------------------------------
describe('B1 · §5.3 step 2 — the trusted A-R, and the forged set refused', () => {
  it('a genuine A-R (our authserv-id, above every foreign hop) with dmarc=pass authenticates', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          TRUSTED_RECEIVED,
          arHeader(
            'inbound.harperscircle.app; dmarc=pass header.from=cardiology.org; spf=pass smtp.mailfrom=cardiology.org',
          ),
          FOREIGN_RECEIVED,
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('authenticated');
    expect(v.method).toBe('authserv_id_header');
  });

  it('FORGED: an A-R carrying our exact authserv-id but sitting BELOW a foreign hop travelled with the message — refused', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          TRUSTED_RECEIVED,
          FOREIGN_RECEIVED,
          arHeader('inbound.harperscircle.app; dmarc=pass header.from=cardiology.org'),
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('unauthenticated');
  });

  it('FORGED: a lookalike authserv-id is not ours — suffix-extended', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          TRUSTED_RECEIVED,
          arHeader('inbound.harperscircle.app.evil.example; dmarc=pass header.from=cardiology.org'),
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('unauthenticated');
  });

  it('FORGED: a lookalike authserv-id is not ours — hyphen variant', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          TRUSTED_RECEIVED,
          arHeader('inbound-harperscircle.app; dmarc=pass header.from=cardiology.org'),
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('unauthenticated');
  });

  it('the authserv-id token matches case-insensitively (a domain), still exactly', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          TRUSTED_RECEIVED,
          arHeader('INBOUND.HARPERSCIRCLE.APP; dmarc=pass header.from=cardiology.org'),
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('authenticated');
  });

  it('no trusted-hop Received line ⇒ nothing to bind to ⇒ fail closed', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          FOREIGN_RECEIVED,
          arHeader('inbound.harperscircle.app; dmarc=pass header.from=cardiology.org'),
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('unauthenticated');
  });

  it('aligned spf=pass in the trusted A-R authenticates when dmarc is absent', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          TRUSTED_RECEIVED,
          arHeader('inbound.harperscircle.app; spf=pass smtp.mailfrom=cardiology.org'),
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('authenticated');
  });

  it('unaligned spf=pass alone does not authenticate (forwarded mail lands held, per Q5)', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          TRUSTED_RECEIVED,
          arHeader('inbound.harperscircle.app; spf=pass smtp.mailfrom=forwarder.example.net'),
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('unauthenticated');
  });

  it('aligned dkim=pass (header.d subdomain, relaxed) authenticates', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          TRUSTED_RECEIVED,
          arHeader('inbound.harperscircle.app; dkim=pass header.d=mail.cardiology.org'),
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('authenticated');
  });

  it('dmarc=fail in the trusted A-R refuses even with spf=pass riding along', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          TRUSTED_RECEIVED,
          arHeader(
            'inbound.harperscircle.app; dmarc=fail header.from=cardiology.org; spf=pass smtp.mailfrom=cardiology.org',
          ),
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('unauthenticated');
  });

  it('malformed A-R values and empty headers never throw — they fail closed', () => {
    for (const headers of [
      [],
      [arHeader('')],
      [TRUSTED_RECEIVED, arHeader(';;;')],
      [TRUSTED_RECEIVED, arHeader('inbound.harperscircle.app')],
      [{ Name: 'Received', Value: '' }],
    ] as PostmarkHeader[][]) {
      const v = evaluateSenderAuth(payload({ Headers: headers }), CONFIG);
      expect(v.result).toBe('unauthenticated');
    }
  });
});

// ----------------------------------------------------------------------------
// Step 4 · ARC per Q5 — presence proves nothing in slice 4
// ----------------------------------------------------------------------------
describe('B1 · §5.3 step 4 — ARC deferred (Q5): an ARC set alone rescues nothing', () => {
  it('spf broken in transit + an ARC set claiming pass stays unauthenticated ⇒ held, fail-closed to a human', () => {
    const v = evaluateSenderAuth(
      payload({
        Headers: [
          TRUSTED_RECEIVED,
          arHeader('inbound.harperscircle.app; spf=fail smtp.mailfrom=cardiology.org; dkim=fail'),
          {
            Name: 'ARC-Authentication-Results',
            Value: 'i=1; forwarder.example.net; spf=pass smtp.mailfrom=cardiology.org',
          },
          { Name: 'ARC-Seal', Value: 'i=1; a=rsa-sha256; d=forwarder.example.net; s=arc; b=...' },
        ],
      }),
      CONFIG,
    );
    expect(v.result).toBe('unauthenticated');
    expect(v.detail.arc_present).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Display name — never an input to the verdict (PRD §4.2.8)
// ----------------------------------------------------------------------------
describe('B1 · display name is never matched', () => {
  it('a known-practice display name on failing mail changes nothing', () => {
    const base = payload({
      Headers: [
        TRUSTED_RECEIVED,
        arHeader('inbound.harperscircle.app; dmarc=fail header.from=elsewhere.example'),
      ],
    });
    const spoofed = {
      ...base,
      FromFull: { Email: 'attacker@elsewhere.example', Name: 'Dr. Patel — Cardiology' },
    };
    const plain = { ...base, FromFull: { Email: 'attacker@elsewhere.example', Name: '' } };
    const a = evaluateSenderAuth(spoofed, CONFIG);
    const b = evaluateSenderAuth(plain, CONFIG);
    expect(a.result).toBe('unauthenticated');
    expect(a.result).toBe(b.result);
    expect(a.method).toBe(b.method);
  });
});

// ----------------------------------------------------------------------------
// The payload mapping (raw payload → the neutral inbound shape B2 consumes)
// ----------------------------------------------------------------------------
describe('B1 · parseInbound — the channel adapter mapping (§4.1)', () => {
  it('maps sender, recipient local part (lowercased), message id and bodies', () => {
    const m = parseInbound(
      payload({
        FromFull: { Email: 'Front-Desk@Cardiology.ORG', Name: 'Front Desk' },
        OriginalRecipient: 'Nell.A7F3K2@harperscircle.app',
        TextBody: 'Attached.',
        HtmlBody: '<p>Attached.</p>',
      }),
    );
    expect(m.senderAddress).toBe('Front-Desk@Cardiology.ORG');
    expect(m.senderDisplayName).toBe('Front Desk');
    expect(m.senderDomain).toBe('cardiology.org');
    expect(m.recipientLocalPart).toBe('nell.a7f3k2');
    expect(m.messageId).toBe('a8c1e2f4-0001-4000-8000-0000000000b1');
    expect(m.textBody).toBe('Attached.');
    expect(m.htmlBody).toBe('<p>Attached.</p>');
  });

  it('falls back to ToFull[0] when OriginalRecipient is absent; both absent ⇒ null (the 550 branch)', () => {
    const viaTo = parseInbound(
      payload({ OriginalRecipient: undefined, ToFull: [{ Email: 'sam.b2c4d6@harperscircle.app' }] }),
    );
    expect(viaTo.recipientLocalPart).toBe('sam.b2c4d6');
    const none = parseInbound(payload({ OriginalRecipient: undefined, ToFull: [] }));
    expect(none.recipientLocalPart).toBeNull();
  });

  it('maps attachments with content-length defaults and keeps base64 content verbatim', () => {
    const m = parseInbound(
      payload({
        Attachments: [
          { Name: 'summary.pdf', ContentType: 'application/pdf', ContentLength: 4, Content: 'JVBERg==' },
          { Name: undefined, ContentType: undefined, ContentLength: undefined, Content: undefined },
        ],
      }),
    );
    expect(m.attachments).toHaveLength(2);
    expect(m.attachments[0]).toEqual({
      name: 'summary.pdf',
      contentType: 'application/pdf',
      contentLength: 4,
      content: 'JVBERg==',
    });
    expect(m.attachments[1]).toEqual({ name: '', contentType: '', contentLength: 0, content: '' });
  });

  it('surfaces the wire-format sender domain for the M3 lookalike check (G7 set: near-miss domains)', () => {
    // The DB half (hc.sender_lookalike, 045) owns the similarity call;
    // the adapter's job is the verbatim lowercased domain, no cleverness.
    expect(senderDomain('nurse@Cardio1ogy.org')).toBe('cardio1ogy.org');
    expect(senderDomain('desk@cardiology-org.example')).toBe('cardiology-org.example');
    expect(senderDomain('xn--user@xn--crdiology-h6a.org')).toBe('xn--crdiology-h6a.org');
    expect(senderDomain('no-at-sign')).toBeNull();
    expect(senderDomain('')).toBeNull();
    expect(senderDomain(null)).toBeNull();
  });

  it('a missing FromFull yields null sender fields, never a throw', () => {
    const m = parseInbound(payload({ FromFull: undefined }));
    expect(m.senderAddress).toBeNull();
    expect(m.senderDisplayName).toBeNull();
    expect(m.senderDomain).toBeNull();
  });
});
