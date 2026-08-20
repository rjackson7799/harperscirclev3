import 'server-only';

/**
 * The Postmark inbound adapter (TSD §1.6, §4.1, §5.3; slice-4 plan B1;
 * SAU-01). One of the three reversible adapters: raw provider payload →
 * the neutral inbound shape + the §5.3 sender-auth verdict. Everything
 * downstream is channel-blind; swapping the provider replaces this file
 * and the webhook's signature check, nothing else (§1.6's 3–5 day row).
 *
 * The §5.3 chain, IN ORDER — the ordering IS the security argument:
 *
 *  1. PROVIDER FIELDS FIRST. Verdict fields the provider reports out of
 *     band, in a payload whose signature the route verified before
 *     reading anything (§5.2 step 1). Data that never travelled through
 *     attacker-controlled MIME is the strongest form available; when
 *     these fields are present the chain STOPS here — a forged in-MIME
 *     header can never rescue (or manufacture) a verdict. The exact
 *     field names are this adapter's contract; the ingestion deploy
 *     checklist verifies them against the live provider's payload
 *     before any real forwarding address activates (G4).
 *  2. Where a header must be read: ONLY an Authentication-Results
 *     bearing OUR configured authserv-id exactly (a domain — compared
 *     case-insensitively, full-token), and BOUND to the trusted
 *     receiving hop in the Received trace: trace headers are prepended,
 *     so the genuine A-R sits above every foreign hop's Received line.
 *     An A-R below a foreign hop travelled WITH the message — refused.
 *  3. The inbound MTA strips or renames incoming Authentication-Results
 *     before adding its own. That posture is PROVIDER CONFIG, not code —
 *     it rides the ingestion deploy checklist; this module's defence is
 *     the hop binding above, which never trusts position alone.
 *  4. ARC per the Q5 ruling (SETTLED): cryptographic chain validation
 *     against a trusted-sealer list is DEFERRED to a pre-activation G7
 *     hardening item. An ARC set alone proves nothing — anyone can add
 *     one — so in slice 4 ARC NEVER authenticates; alignment-broken
 *     forwarded mail lands held_unknown_sender, fail-closed to a human.
 *
 * Display name is NEVER an input to the verdict (PRD §4.2.8):
 * evaluateSenderAuth does not read FromFull.Name. Matching is on the
 * address and the domain; the display name is carried for display only.
 *
 * Lookalike domains are the DB's question (hc.sender_lookalike, M3):
 * this adapter surfaces the verbatim lowercased wire-format domain and
 * nothing cleverer — IDN arrives as punycode and is compared as such.
 *
 * Alignment note: relaxed (org-domain) alignment is approximated as
 * same-domain or ancestor/descendant suffix match, without a public-
 * suffix list (the zero-dep bound). Strictly narrower than DMARC's
 * relaxed mode for multi-label public suffixes; G7 revisits with ARC.
 */

export type PostmarkHeader = { Name?: string; Value?: string };

export type PostmarkAttachment = {
  Name?: string;
  ContentType?: string;
  ContentLength?: number;
  Content?: string; // base64, verbatim
};

export type PostmarkFull = { Email?: string; Name?: string; MailboxHash?: string };

/** The §5.3 step-1 out-of-band verdict shape (adapter contract; the
 *  deploy checklist verifies the live payload carries it). */
export type ProviderAuthResult = { Result?: string; Domain?: string };

export type PostmarkInboundPayload = {
  FromFull?: PostmarkFull;
  ToFull?: PostmarkFull[];
  OriginalRecipient?: string;
  MessageID?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: PostmarkHeader[];
  Attachments?: PostmarkAttachment[];
  SpfResult?: ProviderAuthResult;
  DkimResult?: ProviderAuthResult;
  DmarcResult?: ProviderAuthResult;
};

export type InboundAuthConfig = {
  /** OUR authserv-id, matched exactly (case-insensitive full token). */
  authservId: string;
  /** Hostname of the trusted receiving hop; its Received line is the
   *  binding anchor for any header-parsed A-R. */
  trustedHop: string;
};

export type SenderAuthMethod = 'provider_fields' | 'authserv_id_header' | 'fail_closed';

export type SenderAuthVerdict = {
  result: 'authenticated' | 'unauthenticated';
  method: SenderAuthMethod;
  /** Stored verbatim into arrivals.auth_detail (≤ 16 KB — values are
   *  clamped here so the P5 bound never trips on a hostile header). */
  detail: {
    method: SenderAuthMethod;
    arc_present: boolean;
    [key: string]: unknown;
  };
};

export type InboundAttachment = {
  name: string;
  contentType: string;
  contentLength: number;
  content: string;
};

export type InboundMessage = {
  senderAddress: string | null;
  /** Display ONLY — never an input to any verdict or match. */
  senderDisplayName: string | null;
  /** Lowercased wire-format domain — the M3 lookalike input. */
  senderDomain: string | null;
  recipientLocalPart: string | null;
  messageId: string | null;
  subject: string | null;
  textBody: string;
  htmlBody: string;
  attachments: InboundAttachment[];
};

const CLAMP = 998; // longest header value we ever echo into detail

function clamp(s: string): string {
  return s.length > CLAMP ? s.slice(0, CLAMP) : s;
}

/** Lowercased domain of an address in wire format, or null. */
export function senderDomain(address: string | null | undefined): string | null {
  if (!address) return null;
  const at = address.lastIndexOf('@');
  if (at < 0 || at === address.length - 1) return null;
  return address.slice(at + 1).trim().toLowerCase() || null;
}

/** Relaxed (org-domain) alignment, approximated without a PSL: equal, or
 *  one is a dot-suffix of the other. Both sides lowercased. */
function aligned(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || x.endsWith('.' + y) || y.endsWith('.' + x);
}

type ParsedAr = {
  authservId: string;
  methods: Map<string, { result: string; props: Map<string, string> }>;
};

/** Minimal RFC 8601 shape: `authserv-id; method=result [ptype.prop=value …]*`.
 *  Malformed input parses to nothing — never throws. */
function parseAuthenticationResults(value: string): ParsedAr | null {
  const segments = value.split(';').map((s) => s.trim());
  if (segments.length === 0) return null;
  const idToken = segments[0]?.split(/\s+/)[0] ?? '';
  if (!idToken || idToken.includes('=')) return null;
  const methods = new Map<string, { result: string; props: Map<string, string> }>();
  for (const seg of segments.slice(1)) {
    if (!seg) continue;
    const tokens = seg.split(/\s+/);
    const eq = tokens[0]?.indexOf('=') ?? -1;
    if (eq <= 0) continue;
    const method = tokens[0].slice(0, eq).toLowerCase();
    const result = tokens[0].slice(eq + 1).toLowerCase();
    const props = new Map<string, string>();
    for (const t of tokens.slice(1)) {
      const pe = t.indexOf('=');
      if (pe > 0) props.set(t.slice(0, pe).toLowerCase(), t.slice(pe + 1));
    }
    if (!methods.has(method)) methods.set(method, { result, props });
  }
  return { authservId: idToken, methods };
}

function headerName(h: PostmarkHeader): string {
  return (h.Name ?? '').trim().toLowerCase();
}

/** DMARC-pass-via-alignment over one parsed A-R. */
function arAuthenticates(ar: ParsedAr, fromDomain: string | null): boolean {
  const dmarc = ar.methods.get('dmarc');
  if (dmarc) return dmarc.result === 'pass';
  const spf = ar.methods.get('spf');
  if (spf?.result === 'pass') {
    const d = spf.props.get('smtp.mailfrom') ?? null;
    const spfDomain = d && d.includes('@') ? senderDomain(d) : d?.toLowerCase() ?? null;
    if (aligned(spfDomain, fromDomain)) return true;
  }
  const dkim = ar.methods.get('dkim');
  if (dkim?.result === 'pass') {
    const d = dkim.props.get('header.d')?.toLowerCase() ?? null;
    if (aligned(d, fromDomain)) return true;
  }
  return false;
}

/**
 * The §5.3 verdict, chain in order. Reads FromFull.Email (alignment
 * target) and Headers; NEVER FromFull.Name.
 */
export function evaluateSenderAuth(
  payload: PostmarkInboundPayload,
  config: InboundAuthConfig,
): SenderAuthVerdict {
  const fromDomain = senderDomain(payload.FromFull?.Email ?? null);
  const headers = (payload.Headers ?? []).filter((h): h is PostmarkHeader => !!h);
  const arcPresent = headers.some((h) =>
    ['arc-seal', 'arc-message-signature', 'arc-authentication-results'].includes(headerName(h)),
  );

  // ── Step 1 · provider out-of-band fields — the chain stops here.
  const spf = payload.SpfResult;
  const dkim = payload.DkimResult;
  const dmarc = payload.DmarcResult;
  if (spf || dkim || dmarc) {
    let ok: boolean;
    if (dmarc?.Result !== undefined) {
      ok = dmarc.Result.toLowerCase() === 'pass';
    } else {
      ok =
        (spf?.Result?.toLowerCase() === 'pass' &&
          aligned(spf.Domain?.toLowerCase() ?? null, fromDomain)) ||
        (dkim?.Result?.toLowerCase() === 'pass' &&
          aligned(dkim.Domain?.toLowerCase() ?? null, fromDomain));
    }
    return {
      result: ok ? 'authenticated' : 'unauthenticated',
      method: 'provider_fields',
      detail: {
        method: 'provider_fields',
        arc_present: arcPresent,
        from_domain: fromDomain,
        spf: spf ? { result: spf.Result ?? null, domain: spf.Domain ?? null } : null,
        dkim: dkim ? { result: dkim.Result ?? null, domain: dkim.Domain ?? null } : null,
        dmarc: dmarc ? { result: dmarc.Result ?? null } : null,
      },
    };
  }

  // ── Step 2 · authserv-id-anchored A-R, bound to the trusted hop.
  // Trace headers are prepended: everything ABOVE the first foreign
  // Received line was added at or after our own hop; anything below it
  // travelled with the message and is attacker-controllable.
  const wantId = config.authservId.trim().toLowerCase();
  const hopNeedle = 'by ' + config.trustedHop.trim().toLowerCase();
  let firstForeignReceived = headers.length;
  let trustedHopSeen = false;
  for (let i = 0; i < headers.length; i++) {
    if (headerName(headers[i]) !== 'received') continue;
    const v = (headers[i].Value ?? '').toLowerCase();
    if (v.includes(hopNeedle)) {
      trustedHopSeen = true;
    } else {
      firstForeignReceived = i;
      break;
    }
  }

  if (trustedHopSeen) {
    for (let i = 0; i < firstForeignReceived; i++) {
      if (headerName(headers[i]) !== 'authentication-results') continue;
      const parsed = parseAuthenticationResults(headers[i].Value ?? '');
      if (!parsed) continue;
      if (parsed.authservId.toLowerCase() !== wantId) continue;
      const ok = arAuthenticates(parsed, fromDomain);
      return {
        result: ok ? 'authenticated' : 'unauthenticated',
        method: 'authserv_id_header',
        detail: {
          method: 'authserv_id_header',
          arc_present: arcPresent,
          from_domain: fromDomain,
          authserv_id: parsed.authservId,
          authentication_results: clamp(headers[i].Value ?? ''),
        },
      };
    }
  }

  // ── Steps 3–4 carry no code half here: the strip posture is MTA
  // config, and ARC never authenticates in slice 4 (Q5). No trustworthy
  // signal ⇒ fail closed ⇒ the gate holds it for a person.
  return {
    result: 'unauthenticated',
    method: 'fail_closed',
    detail: {
      method: 'fail_closed',
      arc_present: arcPresent,
      from_domain: fromDomain,
      trusted_hop_seen: trustedHopSeen,
    },
  };
}

/** Raw payload → the neutral inbound shape (§4.1's adapter handoff). */
export function parseInbound(payload: PostmarkInboundPayload): InboundMessage {
  const email = payload.FromFull?.Email?.trim() || null;
  const recipient = payload.OriginalRecipient?.trim() || payload.ToFull?.[0]?.Email?.trim() || '';
  const at = recipient.lastIndexOf('@');
  const localPart = at > 0 ? recipient.slice(0, at).toLowerCase() : null;
  return {
    senderAddress: email,
    senderDisplayName: payload.FromFull ? (payload.FromFull.Name ?? '') || null : null,
    senderDomain: senderDomain(email),
    recipientLocalPart: localPart,
    messageId: payload.MessageID?.trim() || null,
    subject: payload.Subject ?? null,
    textBody: payload.TextBody ?? '',
    htmlBody: payload.HtmlBody ?? '',
    attachments: (payload.Attachments ?? []).map((a) => ({
      name: a.Name ?? '',
      contentType: a.ContentType ?? '',
      contentLength: a.ContentLength ?? 0,
      content: a.Content ?? '',
    })),
  };
}
