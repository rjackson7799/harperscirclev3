import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// B6 · The Care Inbox surface (slice-4 plan B6; UXA-01 flips with the Q6
// disposition; PRD §4.2.2/§4.2.8; §8.6 empty states):
//
//   - the arrivals list renders the PRODUCT states (M4's vocabulary) —
//     the state machine IS the product surface;
//   - the §5.3 verdict is SHOWN, never just stored: verified /
//     unverified · we couldn't confirm this came from them / the
//     lookalike's own copy;
//   - held mail carries the accept-sender release and the 30-day expiry
//     warning; duplicates carry the two resolutions (never
//     auto-discarded); the member window carries cancel;
//   - the 4-hour "reading is delayed" notice (§4.11/§13.1);
//   - the first-run empty state shows the forwarding address — the ONE
//     §8.6 exception, owned by this surface.
//
// Test class: MOCKED ROUTE CONTRACT (render shapes + submit routes);
// the live authority is tests/hc/inbox.test.ts and the B9 gate leg.
// ============================================================================

const session = { liveSessionClaims: vi.fn() };
vi.mock('@/lib/auth/session', () => session);

const from = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ from, auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const inbox = {
  acceptSender: vi.fn(),
  cancelArrival: vi.fn(),
  resolveDuplicate: vi.fn(),
  productStates: vi.fn(),
};
vi.mock('@/lib/hc/inbox', () => inbox);

// 6B B5: the revalidator is a CLIENT component (useRouter) and this file
// renders the page with renderToStaticMarkup, where no app router exists.
// Stubbed to nothing here — its behaviour has its own suite
// (tests/app/inbox-revalidator.test.tsx) and its presence on the page is
// pinned by source there and by the fire's precondition test.
vi.mock('@/components/inbox/InboxRevalidator', () => ({
  InboxRevalidator: () => null,
}));

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

type Row = Record<string, unknown>;
let parents: Row[] = [];
let children: Row[] = [];
let subjects: Row[] = [];
let documents: Row[] = [];

function chain(result: Row[]) {
  const p = Promise.resolve({ data: result, error: null });
  const proxy: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) {
    proxy[m] = vi.fn(() => proxy);
  }
  proxy.then = p.then.bind(p);
  proxy.catch = p.catch.bind(p);
  return proxy;
}

beforeEach(() => {
  vi.clearAllMocks();
  session.liveSessionClaims.mockResolvedValue(CLAIMS);
  inbox.productStates.mockResolvedValue(new Map());
  parents = [];
  children = [];
  subjects = [];
  documents = [];
  from.mockImplementation((table: string) => {
    if (table === 'subjects') return chain(subjects);
    if (table === 'documents') return chain(documents);
    if (table === 'arrivals') {
      // first arrivals call = parents, second = children
      const call = from.mock.calls.filter((c) => c[0] === 'arrivals').length;
      return chain(call <= 1 ? parents : children);
    }
    return chain([]);
  });
});

async function renderInbox(): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/inbox/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE }) }),
  );
}

describe('B6 · the list renders product states and the §5.3 verdict', () => {
  it('labels come from hc.product_state; verdicts render verified / unverified / lookalike copy', async () => {
    parents = [
      {
        id: 'a-ok',
        state: 'extracting',
        channel: 'email',
        sender_address: 'front-desk@cardiology.org',
        sender_display_name: 'Front Desk',
        auth_result: 'authenticated',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - HOURS).toISOString(),
      },
      {
        id: 'a-held',
        state: 'held_unknown_sender',
        channel: 'email',
        sender_address: 'nurse@stranger.example',
        sender_display_name: 'A Nurse',
        auth_result: 'unauthenticated',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - 2 * HOURS).toISOString(),
      },
      {
        id: 'a-lk',
        state: 'held_unknown_sender',
        channel: 'email',
        sender_address: 'desk@cardio1ogy.org',
        sender_display_name: null,
        auth_result: 'lookalike',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - 2 * HOURS).toISOString(),
      },
    ];
    inbox.productStates.mockResolvedValueOnce(
      new Map([
        ['a-ok', 'Reading'],
        ['a-held', 'Held · unknown sender'],
        ['a-lk', 'Held · unknown sender'],
      ]),
    );
    const html = await renderInbox();
    expect(html).toContain('Care Inbox');
    expect(html).toContain('Reading');
    expect(html).toContain('Held · unknown sender');
    expect(html).toContain('verified');
    expect(html).toContain('we couldn&#x27;t confirm this came from them');
    expect(html).toContain('closely resembles a sender this circle trusts');
    // display name is display only — shown next to the address, never a verdict
    expect(html).toContain('front-desk@cardiology.org');
  });

  it('held mail carries the accept-sender release and the 30-day expiry warning', async () => {
    parents = [
      {
        id: 'a-held',
        state: 'held_unknown_sender',
        channel: 'email',
        sender_address: 'nurse@stranger.example',
        sender_display_name: null,
        auth_result: 'unauthenticated',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - 25 * DAYS).toISOString(),
      },
    ];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-held', 'Held · unknown sender']]));
    const html = await renderInbox();
    expect(html).toContain('action="/' + CIRCLE + '/inbox/accept-sender/submit"');
    expect(html).toContain('value="nurse@stranger.example"');
    expect(html).toMatch(/expires/i);
  });

  it("a duplicate CHILD is resolvable from its parent's row (B9: the inbox lists parents; the §4.7 affordance must bind to the CHILD or a mailed duplicate can never be resolved)", async () => {
    parents = [
      {
        id: 'p-dup',
        state: 'extracting',
        channel: 'email',
        sender_address: 'front-desk@cardiology.org',
        sender_display_name: null,
        auth_result: 'authenticated',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - HOURS).toISOString(),
      },
    ];
    children = [
      { id: 'c-dup', parent_arrival_id: 'p-dup', state: 'duplicate_suspected' },
      { id: 'c-ok', parent_arrival_id: 'p-dup', state: 'extracting' },
    ];
    inbox.productStates.mockResolvedValueOnce(new Map([['p-dup', 'Looks like a duplicate']]));
    const html = await renderInbox();
    // The resolution form binds to the CHILD's arrival id.
    expect(html).toContain('value="c-dup"');
    expect(html).toContain('value="different"');
    expect(html).toContain('value="same_thing"');
  });

  it('a duplicate suspect renders BOTH resolutions and no third option', async () => {
    parents = [
      {
        id: 'a-dup',
        state: 'duplicate_suspected',
        channel: 'email',
        sender_address: 'front-desk@cardiology.org',
        sender_display_name: null,
        auth_result: 'authenticated',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - HOURS).toISOString(),
      },
    ];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-dup', 'Looks like a duplicate']]));
    const html = await renderInbox();
    expect(html).toContain('value="different"');
    expect(html).toContain('value="same_thing"');
    expect(html).not.toMatch(/discard/i);
  });

  it('the member window renders cancel; a clean original links through the artifact route', async () => {
    parents = [
      {
        id: 'a-ok',
        state: 'extracting',
        channel: 'upload',
        sender_address: null,
        sender_display_name: null,
        auth_result: null,
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - HOURS).toISOString(),
      },
    ];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-ok', 'Reading']]));
    const html = await renderInbox();
    expect(html).toContain('action="/' + CIRCLE + '/inbox/cancel/submit"');
    expect(html).toContain('href="/api/artifact/a-ok"');
  });

  it('items over the 4-hour queue-age bound surface the reading-is-delayed notice (§13.1)', async () => {
    parents = [
      {
        id: 'a-old',
        state: 'stored',
        channel: 'upload',
        sender_address: null,
        sender_display_name: null,
        auth_result: null,
        scan_verdict: null,
        received_at: new Date(Date.now() - 5 * HOURS).toISOString(),
      },
    ];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-old', 'Checking']]));
    const html = await renderInbox();
    expect(html).toMatch(/reading is delayed/i);
  });

  it('the first-run empty state shows the forwarding address — the one §8.6 exception', async () => {
    subjects = [
      {
        id: 's-1',
        first_name: 'Nell',
        forwarding_local_part: 'nell.a7f3k2',
        forwarding_active_at: new Date().toISOString(),
      },
    ];
    const html = await renderInbox();
    expect(html).toContain('nell.a7f3k2@harperscircle.app');
  });

  it('an inactive address says WHY it is not live yet, never pretends', async () => {
    subjects = [
      {
        id: 's-1',
        first_name: 'Nell',
        forwarding_local_part: 'nell.a7f3k2',
        forwarding_active_at: null,
      },
    ];
    const html = await renderInbox();
    expect(html).toMatch(/verif/i); // activates after the founder's email verification
  });
});

describe('B6 · the submit routes ride the wrappers with relative PRG redirects', () => {
  function post(path: string, fields: Record<string, string>): Request {
    const body = new URLSearchParams(fields);
    return new Request(`http://local.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }

  it('accept-sender: address mode and domain mode, then back to the inbox', async () => {
    inbox.acceptSender.mockResolvedValue({ sender_id: 'k-1', released_count: 1 });
    const { POST } = await import('@/app/(app)/[circle]/inbox/accept-sender/submit/route');
    const res = await POST(
      post(`/${CIRCLE}/inbox/accept-sender/submit`, {
        address: 'nurse@stranger.example',
        mode: 'address',
      }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/inbox?accepted=1`);
    expect(inbox.acceptSender).toHaveBeenCalledWith(CLAIMS, CIRCLE, {
      address: 'nurse@stranger.example',
    });

    await POST(
      post(`/${CIRCLE}/inbox/accept-sender/submit`, {
        address: 'nurse@stranger.example',
        mode: 'domain',
      }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(inbox.acceptSender).toHaveBeenLastCalledWith(CLAIMS, CIRCLE, {
      domain: 'stranger.example',
    });
  });

  it('a refusal (freeze, non-coordinator) lands back with an error marker, one shape', async () => {
    inbox.acceptSender.mockRejectedValueOnce(new Error('freeze_active'));
    const { POST } = await import('@/app/(app)/[circle]/inbox/accept-sender/submit/route');
    const res = await POST(
      post(`/${CIRCLE}/inbox/accept-sender/submit`, { address: 'x@y.example', mode: 'address' }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${CIRCLE}/inbox?e=accept`);
  });

  it('cancel and resolve ride their wrappers the same way', async () => {
    inbox.cancelArrival.mockResolvedValue({ arrival_id: 'a-1', state: 'cancelled' });
    const cancel = await import('@/app/(app)/[circle]/inbox/cancel/submit/route');
    const res1 = await cancel.POST(
      post(`/${CIRCLE}/inbox/cancel/submit`, { arrival_id: 'a-1' }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(res1.headers.get('location')).toBe(`/${CIRCLE}/inbox?cancelled=1`);
    expect(inbox.cancelArrival).toHaveBeenCalledWith(CLAIMS, 'a-1');

    inbox.resolveDuplicate.mockResolvedValue({ arrival_id: 'a-2', resolution: 'same_thing' });
    const resolve = await import('@/app/(app)/[circle]/inbox/resolve/submit/route');
    const res2 = await resolve.POST(
      post(`/${CIRCLE}/inbox/resolve/submit`, { arrival_id: 'a-2', resolution: 'same_thing' }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(res2.headers.get('location')).toBe(`/${CIRCLE}/inbox?resolved=1`);
    expect(inbox.resolveDuplicate).toHaveBeenCalledWith(CLAIMS, 'a-2', 'same_thing');
  });

  it('no session ⇒ straight to sign-in, nothing called', async () => {
    session.liveSessionClaims.mockResolvedValue(null);
    const { POST } = await import('@/app/(app)/[circle]/inbox/cancel/submit/route');
    const res = await POST(
      post(`/${CIRCLE}/inbox/cancel/submit`, { arrival_id: 'a-1' }),
      { params: Promise.resolve({ circle: CIRCLE }) },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/sign-in');
    expect(inbox.cancelArrival).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 5B B6 · The §4.7 point-2 (stage-2) duplicate surface, on the EXISTING inbox
// machinery (slice-5 plan B6; DUP-02's app half; UXA-02; PRD §8.9).
//
// Stage 1 asks "we have these exact bytes already" from a sha256 match. Stage
// 2 asks a different question — "this looks like the document you filed in
// July" — from M5's normalised key-field predicate over EXTRACTED values, and
// the copy has to carry that difference honestly, because the two resolutions
// do different things: `different` resumes to INTERPRET (the facts are
// already published), and `same_thing` attaches this arrival to the matched
// document as an ADDITIONAL SOURCE and files nothing new.
//
// ROUND-15 OBSERVATION 3, honoured here as a test: arrivals.
// duplicate_of_document_id is RETAINED after resolution by design (ADR-0020
// D6) — it is the trace of the question that was asked. The POINTER is not
// evidence the arrival is still unresolved; THE STATE IS. A consumer that
// keyed the affordance on the pointer would offer a resolved arrival its
// resolution again, forever.
//
// AND THE POINTER IS UNREADABLE FROM HERE, which the local gate found the
// hard way. `authenticated` holds a COLUMN-LEVEL select grant on `arrivals` —
// 25 of 28 columns — and 5A M5 added duplicate_of_document_id without
// extending it. Selecting it is refused per-column, supabase-js returns an
// error rather than rows, and the ENTIRE inbox falls back to its empty state
// for every caller. So the surface says WHY the match happened — the
// provenance a person actually needs — and cannot yet say WHICH document.
// ADR-0022 D15 carries the one-line grant as a round-16 pointed question.
// ============================================================================

function stage2Parent(overrides: Row = {}): Row {
  return {
    id: 'a-dup2',
    state: 'duplicate_suspected_stage2',
    channel: 'email',
    sender_address: 'records@riverbend.example',
    sender_display_name: 'Riverbend Records',
    auth_result: 'authenticated',
    scan_verdict: 'clean',
    received_at: new Date(Date.now() - HOURS).toISOString(),
    ...overrides,
  };
}

describe('5B B6 · the stage-2 duplicate cites the document it matched', () => {
  it('the copy says the arrival looks like something already filed', async () => {
    parents = [stage2Parent()];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-dup2', 'Looks like a duplicate']]));
    const html = await renderInbox();
    expect(html).toContain('Looks like a duplicate');
    expect(html).toMatch(/already filed for this person/i);
  });

  // AMENDED at round 16 (Q-A, R5/F-4), argued in place.
  //
  // This guard forbade the literal `duplicate_of_document_id` in a `.select()`
  // string, because the column was NOT granted and naming it emptied the whole
  // Care Inbox. M7 grants it, so the premise is gone — and R5/F-4 showed the
  // guard was the wrong SHAPE regardless: it was a denylist of one literal
  // over `.select()` arguments, while Postgres refuses on `where` and
  // `order by` references too, which it never read.
  //
  // It becomes an ALLOWLIST derived from the grant. Every column this page
  // names, in any clause, must be one `authenticated` actually holds — the
  // same exact set pgTAP 057 pins from the DB side, so the two cannot drift
  // apart without one of them going red.
  it('every column the arrivals query names is one authenticated holds', async () => {
    const GRANTED = new Set([
      'id', 'circle_id', 'subject_id', 'parent_arrival_id', 'channel', 'state',
      'received_at', 'storage_key', 'content_sha256', 'mime_declared',
      'mime_detected', 'byte_size', 'page_count', 'sender_address',
      'sender_display_name', 'message_id', 'auth_result', 'scan_verdict',
      'scan_at', 'cancelled_by', 'cancelled_at', 'ingest_idempotency_key',
      'deleted_at', 'purge_at', 'expires_at', 'duplicate_of_document_id',
    ]);
    parents = [stage2Parent()];
    await renderInbox();
    const named = new Set<string>();
    type Mocked = Record<string, { mock?: { calls: unknown[][] } } | undefined>;
    for (const r of from.mock.results) {
      const proxy = r.value as Mocked;
      for (const call of proxy?.select?.mock?.calls ?? []) {
        for (const col of String(call[0] ?? '').split(',')) named.add(col.trim());
      }
      // Postgres refuses on WHERE and ORDER BY references too — the half the
      // old denylist never read (round-16 R5/F-4, proven live against the DB).
      for (const m of ['eq', 'is', 'in', 'order']) {
        for (const call of proxy?.[m]?.mock?.calls ?? []) {
          const col = String(call[0] ?? '').trim();
          if (col) named.add(col);
        }
      }
    }
    named.delete('');
    const ungranted = [...named].filter((c) => !GRANTED.has(c));
    expect(ungranted, `these are refused per-column: ${ungranted.join(', ')}`).toEqual([]);
  });

  it('the WHY renders through ProvenanceLine (Q6: first consumer, decided red-first)', async () => {
    // The suspicion is downstream of AI-extracted values, so showing where it
    // came from is §8.6 provenance.
    //
    // AMENDED at round 16 (R5/F-5), argued in place. The old wording named
    // "type, date AND provider" — a three-way conjunction — while
    // hc.detect_stage2_duplicate requires category + document_date + **≥1 of**
    // provider / amount / policy_number. Two EOBs matched on AMOUNT alone,
    // from different providers, were told the providers matched. The property
    // this leg exists for — that the WHY renders through ProvenanceLine — is
    // unchanged; only the claim is corrected to the contract M5 implements.
    parents = [stage2Parent()];
    const html = await renderInbox();
    expect(html).toContain('class="provenance"');
    expect(html).toMatch(/type and date, and at least one detail read from this document/i);
  });

  it('both resolutions are offered, and the stage-2 copy says what each DOES', async () => {
    parents = [stage2Parent()];
    const html = await renderInbox();
    expect(html).toContain('/inbox/resolve/submit');
    expect(html).toContain('value="different"');
    expect(html).toContain('value="same_thing"');
    // `same_thing` at stage 2 attaches an additional source rather than
    // discarding — the copy must not promise the stage-1 outcome.
    expect(html).toMatch(/another source|additional source/i);
  });

  it('a CHILD arrival suspected at stage 2 gets its own resolution, bound to the child', async () => {
    parents = [
      {
        id: 'a-parent',
        state: 'extracting',
        channel: 'email',
        sender_address: 'records@riverbend.example',
        sender_display_name: null,
        auth_result: 'authenticated',
        scan_verdict: 'clean',
        received_at: new Date(Date.now() - HOURS).toISOString(),
        duplicate_of_document_id: null,
      },
    ];
    children = [
      {
        id: 'a-child-dup2',
        parent_arrival_id: 'a-parent',
        state: 'duplicate_suspected_stage2',
      },
    ];
    const html = await renderInbox();
    expect(html).toContain('value="a-child-dup2"');
  });

  it('a RESOLVED arrival offers NOTHING - the STATE decides (round-15 obs. 3)', async () => {
    parents = [stage2Parent({ state: 'nothing_filed' })];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-dup2', 'Nothing filed']]));
    const html = await renderInbox();
    expect(html).not.toContain('value="same_thing"');
    expect(html).not.toContain('value="different"');
  });

  it('the affordance never depends on naming the match', async () => {
    // The contract, not a fixture case: whatever a caller can or cannot see
    // of the matched document, the QUESTION is always answerable. The copy
    // degrades; the affordance does not.
    parents = [stage2Parent()];
    const html = await renderInbox();
    expect(html).toContain('value="same_thing"');
    expect(html).toContain('value="different"');
  });

  it('stage 1 keeps its own copy — the two questions are not the same question', async () => {
    parents = [stage2Parent({ id: 'a-dup1', state: 'duplicate_suspected' })];
    inbox.productStates.mockResolvedValueOnce(new Map([['a-dup1', 'Looks like a duplicate']]));
    const html = await renderInbox();
    expect(html).toContain('Same thing');
    expect(html).not.toMatch(/another source/i);
  });
});

describe('5B B8 · the inbox links to the senders it accepts from', () => {
  it('a link to /senders, not a sixth nav item', async () => {
    parents = [stage2Parent({ state: 'extracting' })];
    const html = await renderInbox();
    expect(html).toContain(`/${CIRCLE}/senders`);
  });
});

// ============================================================================
// Round-16 Q-A completion (ADR-0023 D8) and R5/F-5 — the stage-2 copy.
//
// M7 grants `duplicate_of_document_id`, so the §4.7 p2 copy can finally do
// what the plan's B6 row asked for: cite the matched FILED document by title
// and filed date. Until now it could only say WHY the match happened.
//
// R5/F-5 lands in the same sentence. The old provenance line read "type, date
// and provider", a three-way conjunction — but `hc.detect_stage2_duplicate`
// requires category + document_date + **≥1 of** provider / amount /
// policy_number. Two EOBs matched on AMOUNT alone, from different providers,
// would have told a family the providers matched. With the document now
// nameable that copy is load-bearing for a real decision, so it must state
// the contract it actually implements.
//
// The affordance itself stays gated on the STATE (round-15 observation 3):
// the pointer decorates the question, it must never decide whether to ask it.
// ============================================================================
describe('Q-A/R5-F5 · the stage-2 copy names the matched document', () => {
  const PARENT_ID = 'p-dup';
  const CHILD_ID = 'c-dup';
  const DOC_ID = '99999999-0000-4000-8000-00000000000d';

  function stage2Parent(): Row {
    return {
      id: PARENT_ID,
      state: 'proposals_ready',
      channel: 'email',
      sender_address: 'billing@insurer.example',
      sender_display_name: 'Billing',
      auth_result: 'authenticated',
      scan_verdict: 'clean',
      received_at: new Date(Date.now() - 2 * HOURS).toISOString(),
    };
  }

  it('reads the document the arrival was matched against', async () => {
    parents = [stage2Parent()];
    children = [
      {
        id: CHILD_ID,
        parent_arrival_id: PARENT_ID,
        state: 'duplicate_suspected_stage2',
        duplicate_of_document_id: DOC_ID,
      },
    ];
    documents = [{ id: DOC_ID, title: 'Discharge summary', filed_at: '2026-07-12T10:00:00Z' }];
    const html = await renderInbox();
    // The plan's B6 example is "This looks like the discharge summary you
    // filed on Jul 12" — the title reads lowercase mid-sentence. The date is
    // whatever the house formatter produces ("July 12"), not the plan's
    // illustrative abbreviation: formatShortDate is the authority, and the
    // rest of the app reads the same way.
    expect(html).toContain('This looks like the discharge summary you filed on July 12');
  });

  it('falls back to the honest generic line when no document can be read', async () => {
    parents = [stage2Parent()];
    children = [
      {
        id: CHILD_ID,
        parent_arrival_id: PARENT_ID,
        state: 'duplicate_suspected_stage2',
        duplicate_of_document_id: null,
      },
    ];
    documents = [];
    const html = await renderInbox();
    expect(html).toContain('already filed for this person');
    expect(html).not.toContain('undefined');
  });

  it('R5/F-5: the provenance line does not claim the provider matched', async () => {
    parents = [stage2Parent()];
    children = [
      {
        id: CHILD_ID,
        parent_arrival_id: PARENT_ID,
        state: 'duplicate_suspected_stage2',
        duplicate_of_document_id: DOC_ID,
      },
    ];
    documents = [
      { id: DOC_ID, title: 'Explanation of benefits', filed_at: '2026-07-12T10:00:00Z' },
    ];
    const html = await renderInbox();
    // hc.detect_stage2_duplicate requires category + document_date + >=1 of
    // provider / amount / policy_number. Naming `provider` as a conjunct is a
    // claim the detector does not make.
    expect(html).not.toMatch(/type, date and provider/);
  });
});
