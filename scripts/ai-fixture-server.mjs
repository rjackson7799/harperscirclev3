// ============================================================================
// The Anthropic Messages-API FIXTURE SERVER (slice-5 plan B3/B9; G9/G3's
// standing constraint, Q5 ratified).
//
// CI and the local gate NEVER call the provider. The adapter reaches its
// endpoint through standard base-URL config, so pointing ANTHROPIC_BASE_URL
// at this server is the whole mechanism — the adapter code never branches on
// environment, and no Anthropic credential exists in CI at all. This is the
// clamd-container precedent, adapted: a real protocol, spoken locally.
//
//   node scripts/ai-fixture-server.mjs [--port 8787]     # the gate stack
//   import { startAnthropicFixtureServer } from ...      # vitest
//
// Zero dependencies (node:http only). It is a test utility, not a runtime
// dependency, so it costs nothing against the slice's dependency bound.
//
// WHAT IT KNOWS, AND WHAT IT DELIBERATELY DOES NOT
// -----------------------------------------------
// It answers from the TEXT it is given: the corpus labels whose values appear
// in the request become the facts it returns, with the corpus's own citation
// geometry. That makes the born-digital fixtures fully end-to-end.
//
// For an IMAGE-ONLY source it returns no facts, on purpose. This server
// proves OUR MACHINERY — the call shape, the exits, the worker sequence, the
// surfaces. It does not and cannot prove the MODEL'S VISION; that is exactly
// what the G9 eval harness measures against the BLIND partition with a real
// key. Pretending otherwise here would be the "unlabelled second fixture
// world" Q5 refused, wearing a different hat.
//
// Markers a fixture's text can carry to drive the §6.8 exits:
//   HC-FIXTURE-REFUSAL     → HTTP 200, stop_reason "refusal" (+ stop_details)
//   HC-FIXTURE-TRUNCATE    → stop_reason "max_tokens", partial content
//   HC-FIXTURE-GARBAGE     → end_turn with unparseable content
//   HC-FIXTURE-OVERLOAD    → HTTP 529 overloaded_error — the status the
//                            provider ACTUALLY sends (6B B4/R2-F14; the old
//                            HC-FIXTURE-503 answered 503, so once the arm
//                            became status-aware the fixture exercised the
//                            wrong branch)
//   HC-FIXTURE-400         → HTTP 400 invalid_request_error, the PERMANENT
//                            class (R2/F-5)
//   HC-FIXTURE-429-ONCE    → HTTP 429 + retry-after: 1 on the FIRST sight
//                            of the marker since reset(), then the normal
//                            answer — drives the one in-attempt wait
//   HC-FIXTURE-429-ALWAYS  → HTTP 429 + retry-after: 120, every time —
//                            drives the does-not-fit-the-lease branch
//   HC-FIXTURE-CONTEXT     → HTTP 200, stop_reason
//                            "model_context_window_exceeded" (R2/F-9)
//   HC-FIXTURE-HANG        → no response at all, so OUR timeout is what cuts
// ============================================================================

import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function loadCorpus(root) {
  const file = path.join(root, 'fixtures', 'g9', 'corpus.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Every text block anywhere in the request, concatenated. */
function requestText(body) {
  const parts = [];
  const walk = (node) => {
    if (node == null) return;
    if (typeof node === 'string') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node === 'object') {
      if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text);
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(body.messages);
  if (typeof body.system === 'string') parts.push(body.system);
  else walk(body.system);
  return parts.join('\n');
}

function between(text, tag) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const a = text.indexOf(open);
  if (a < 0) return null;
  const b = text.indexOf(close, a);
  if (b < 0) return null;
  return text.slice(a + open.length, b);
}

/**
 * The corpus item whose labelled VALUES best match this request's text. Ties
 * go to the item with more matches; zero matches means "nothing recognised",
 * which is an answer in its own right.
 */
export function matchItem(corpus, text) {
  let best = null;
  let bestScore = 0;
  for (const item of corpus.items) {
    // The DEVELOPMENT partition only (round-16 R7/F-2). This server answers
    // from corpus LABELS, so without this line the gate-stack fixture server
    // could hand back a scored item's facts, complete with its citation
    // geometry — and the "happy path" the gate demonstrates would be
    // self-fulfilling on the set the G9 bands are measured against. The
    // ESLint fence cannot reach here: this reads the manifest as DATA.
    if (item.partition !== 'development') continue;
    if (item.expected_outcome !== 'extracted' || item.labels.length === 0) continue;
    let score = 0;
    for (const label of item.labels) {
      if (label.value && text.includes(label.value)) score++;
    }
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

const INJECTION_SIGNALS = [
  ['ignore your previous instructions', 'mentions_product_mechanics'],
  ['grant the sender', 'mentions_permissions'],
  ['coordinator access', 'mentions_permissions'],
  ['approve all pending', 'mentions_product_mechanics'],
  ['without asking anyone', 'mentions_product_mechanics'],
  ['every circle', 'mentions_other_circles'],
];

function anomaliesFor(text) {
  const lower = text.toLowerCase();
  const flags = new Set();
  for (const [needle, flag] of INJECTION_SIGNALS) {
    if (lower.includes(needle)) flags.add(flag);
  }
  return [...flags];
}

function extractionAnswer(corpus, text) {
  const item = matchItem(corpus, text);
  if (!item) {
    return {
      facts: [],
      document: {
        category: 'other',
        title: 'Document',
        summary: 'The fixture server recognised no labelled values in this request.',
      },
    };
  }
  return {
    facts: item.labels
      .filter((l) => text.includes(l.value))
      .map((l) => ({
        field: l.field,
        value: l.value,
        confidence: 0.92,
        citation: { page: l.page, bbox: l.bbox },
      })),
    document: {
      category: item.category ?? 'other',
      title: `${item.document_class.replace(/_/g, ' ')}`,
      summary: `A ${item.document_class.replace(/_/g, ' ')} recognised from its labelled values.`,
    },
  };
}

function interpretationAnswer(text) {
  let facts = [];
  const raw = between(text, 'extracted_facts');
  if (raw) {
    try {
      facts = JSON.parse(raw);
    } catch {
      facts = [];
    }
  }
  let record = { rows: [] };
  const rawRecord = between(text, 'subject_record');
  if (rawRecord) {
    try {
      const parsed = JSON.parse(rawRecord);
      record = parsed?.facts ?? { rows: [] };
    } catch {
      /* an unreadable record context is an empty one here */
    }
  }
  const currentByField = new Map(
    (record.rows ?? []).map((r) => [r.field, { id: r.id, value: r.value }]),
  );

  const proposals = [];
  const blank = {
    domain: null,
    category: null,
    field: null,
    value: null,
    due_on: null,
    occurred_on: null,
    conflicts_with_fact_id: null,
  };

  proposals.push({
    kind: 'document',
    title: 'File this document',
    summary: 'Filed from the arrival, pending a person’s approval.',
    ...blank,
    category: 'medical',
    anomaly_flags: [],
  });

  for (const fact of facts.slice(0, 20)) {
    const existing = currentByField.get(fact.field);
    if (existing && String(existing.value) !== String(fact.value)) {
      proposals.push({
        kind: 'conflict',
        title: `${fact.field} changed`,
        summary: `The record says ${existing.value}; this document says ${fact.value}.`,
        ...blank,
        field: fact.field,
        value: String(fact.value),
        conflicts_with_fact_id: existing.id,
        anomaly_flags: [],
      });
    } else if (!existing) {
      proposals.push({
        kind: 'profile_fact',
        title: `${fact.field}`,
        summary: `Read from the document: ${fact.value}.`,
        ...blank,
        domain: 'health',
        field: fact.field,
        value: String(fact.value),
        anomaly_flags: [],
      });
    }
  }

  return { proposals: proposals.slice(0, 50), anomalies: anomaliesFor(text) };
}

function messageEnvelope(model, text, extra = {}) {
  return {
    id: 'msg_fixture',
    type: 'message',
    role: 'assistant',
    model,
    content: text === null ? [] : [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 1234,
      output_tokens: 256,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    ...extra,
  };
}

export async function startAnthropicFixtureServer(options = {}) {
  const root = options.root ?? process.cwd();
  const corpus = loadCorpus(root);
  const requests = [];

  const server = http.createServer((req, res) => {
    // A health endpoint, so the local gate can wait for this server the same
    // way Playwright waits for the app (webServer.url needs a 2xx).
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, fixture: 'anthropic-messages' }));
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error' } }));
        return;
      }
      requests.push({ url: req.url, raw, body });

      const text = requestText(body);
      const model = body.model ?? 'claude-opus-5';

      if (text.includes('HC-FIXTURE-HANG')) {
        // Deliberately no response: OUR client-side timeout is what must cut
        // this off, inside the lease deadline (§1.9).
        return;
      }
      if (text.includes('HC-FIXTURE-OVERLOAD')) {
        // 529, not 503: the provider's overloaded_error status (R2/F-14).
        res.writeHead(529, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            type: 'error',
            error: { type: 'overloaded_error', message: 'fixture: overloaded' },
          }),
        );
        return;
      }
      if (text.includes('HC-FIXTURE-400')) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            type: 'error',
            error: { type: 'invalid_request_error', message: 'fixture: permanently invalid' },
          }),
        );
        return;
      }
      if (text.includes('HC-FIXTURE-429-ALWAYS')) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '120' });
        res.end(
          JSON.stringify({
            type: 'error',
            error: { type: 'rate_limit_error', message: 'fixture: rate limited (always)' },
          }),
        );
        return;
      }
      if (text.includes('HC-FIXTURE-429-ONCE')) {
        // Stateful by design: the FIRST sight since reset() rate-limits with
        // a short retry-after; the retry gets the normal answer — the shape
        // of a transient limit the in-attempt wait is meant to survive.
        const seen = requests.filter((r) => r.raw.includes('HC-FIXTURE-429-ONCE')).length;
        if (seen <= 1) {
          res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' });
          res.end(
            JSON.stringify({
              type: 'error',
              error: { type: 'rate_limit_error', message: 'fixture: rate limited (once)' },
            }),
          );
          return;
        }
      }

      let payload;
      if (text.includes('HC-FIXTURE-REFUSAL')) {
        // §6.8: a refusal is HTTP 200. Code that reads content[0]
        // unconditionally breaks here, which is the point of the fixture.
        payload = messageEnvelope(model, null, {
          stop_reason: 'refusal',
          stop_details: {
            type: 'refusal',
            category: 'other',
            explanation: 'fixture refusal',
          },
        });
      } else if (text.includes('HC-FIXTURE-TRUNCATE')) {
        payload = messageEnvelope(model, '{"facts":[{"field":"medication_name"', {
          stop_reason: 'max_tokens',
        });
      } else if (text.includes('HC-FIXTURE-GARBAGE')) {
        payload = messageEnvelope(model, 'I am not JSON, and never was.');
      } else if (text.includes('HC-FIXTURE-CONTEXT')) {
        // The document outgrew the context window: a 200 whose stop_reason
        // says so, with no text content — exactly the shape that used to
        // fall through to "no text content" (R2/F-9).
        payload = messageEnvelope(model, null, {
          stop_reason: 'model_context_window_exceeded',
        });
      } else {
        const answer = text.includes('<subject_record>')
          ? interpretationAnswer(text)
          : extractionAnswer(corpus, text);
        payload = messageEnvelope(model, JSON.stringify(answer));
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });

  await new Promise((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    port: address.port,
    requests,
    reset() {
      requests.length = 0;
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve(undefined));
      });
    },
  };
}

// CLI: the local gate stack starts this beside clamd.
// pathToFileURL, not a hand-built `file://` string. On Windows the two never
// match — import.meta.url is `file:///C:/…` (three slashes, drive letter) — so
// the hand-built comparison silently never fired, the process exited 0 with no
// output, and Playwright reported only "Process from config.webServer exited
// early". Found by the gate, which is what the gate is for.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 8787;
  const fixture = await startAnthropicFixtureServer({ port });
  console.log(`anthropic fixture server listening on ${fixture.url}`);
  console.log('CI and the local gate speak to this; no credential is involved.');
}
