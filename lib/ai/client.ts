import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {
  MAX_TOKENS,
  PROMPT_VERSION,
  assertAllowedModel,
  type AllowedModel,
} from '@/lib/ai/config';

/**
 * The one provider client (slice-5 plan B3; TSD §1.9's one-adapter G3
 * posture; §6.8's exits).
 *
 * **The adapter never branches on environment.** It reaches its endpoint
 * through the SDK's own standard configuration — `ANTHROPIC_BASE_URL` and
 * `ANTHROPIC_API_KEY` — so CI and the local gate point it at a fixture server
 * speaking the Messages API shape and nothing in this file knows the
 * difference. That is what makes "CI never calls the provider" a deployment
 * fact rather than a code path someone could take by mistake.
 *
 * **Retries are the pipeline's, not the SDK's.** `maxRetries: 0` is
 * deliberate: §4.3 gives every stage ONE durable attempt counter — the lease
 * table — and the whole mechanism depends on a crash after the claim having
 * burned the attempt. An SDK retry loop is a second, invisible counter that
 * spends the stage's wall clock without the lease learning anything. An
 * outage returns `unavailable`, the worker acks without finalizing, the lease
 * expires, and the sweeper re-queues against a budget it can actually see.
 *
 * **What is never sent, and why it is absent rather than configured:**
 *   · `fallbacks` — §6.8's recorded decline. Server-side fallback would
 *     silently re-run a declined request on a second model whose terms may
 *     not be the ones G3 cleared. This is a deliberate deviation from the
 *     SDK's own default-on advice for Opus 5, argued in the plan so review
 *     sees it argued.
 *   · The Files API — §6.2: files persist until deleted and add a second
 *     retention surface. Artifacts go inline, so retention has one question.
 *   · The provider's citations feature — §6.4: incompatible with structured
 *     outputs (400), and our geometry is better for us anyway.
 *   · `budget_tokens` — removed on Opus 5; adaptive thinking replaces it.
 */

export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  /** §6.6: whether the record prefix actually cached is MEASURED, not
   *  assumed. These two fields are the measurement. */
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

export type AdapterOk<T> = {
  outcome: 'ok';
  data: T;
  usage: ProviderUsage;
  modelId: string;
  promptVersion: string;
  /** Items the model returned that our own validation refused. Counted, not
   *  hidden: a rising number is a pipeline signal (PRD §10.4). */
  dropped: number;
};

export type AdapterFailure =
  /** §6.8: HTTP 200 with `stop_reason: "refusal"`. The honest terminal path —
   *  never "unsafe" copy, and never presented to a family as a judgement. */
  | { outcome: 'refusal'; category: string | null; modelId: string; promptVersion: string }
  /** §6.1's truncation trap fired (`max_tokens`), or the document outgrew the
   *  context window (`detail: 'model_context_window_exceeded'`, 6B B4/R2-F9)
   *  — reported as what it is, never parsed from a fragment and never
   *  mislabelled "no text content". */
  | { outcome: 'truncated'; detail?: string; modelId: string; promptVersion: string }
  | { outcome: 'invalid_output'; detail: string; modelId: string; promptVersion: string }
  /** An outage or a timeout. Retried by the machinery, never finalized early. */
  | { outcome: 'unavailable'; detail: string; modelId: string; promptVersion: string }
  /** 6B B4 (R2/F-5): a PERMANENT request refusal — HTTP 400. Retrying the
   *  identical bytes cannot succeed, so the worker terminalizes honestly
   *  instead of burning three durable attempts over ~15 minutes and then
   *  labelling the result "budget exhausted" to a family. */
  | { outcome: 'permanent'; detail: string; modelId: string; promptVersion: string };

export type AdapterResult<T> = AdapterOk<T> | AdapterFailure;

type ClientKey = string;
const clients = new Map<ClientKey, Anthropic>();

/**
 * What a real Anthropic credential looks like. The check is deliberately on
 * the CREDENTIAL rather than on a list of known fixture strings: the tree
 * already carries two different fixture literals (vitest's and the gate's),
 * an allowlist of them would break the next one someone adds, and — far worse
 * — it would silently pass anything not on the list. Asking "is this a real
 * key?" fails in the safe direction.
 */
function looksLikeRealCredential(apiKey: string): boolean {
  return apiKey.startsWith('sk-ant-');
}

/**
 * G3's egress assertion, checked before every dispatch (round-16 R2/F-11).
 *
 * `ANTHROPIC_BASE_URL` is what lets the gate stack speak to a local fixture
 * server without the adapter branching on environment — the property that
 * makes "CI never calls the provider" a deployment fact rather than a code
 * path someone could take by mistake. The cost is that the same lever points
 * PRODUCTION anywhere, and G3's premise is that a family's document reaches
 * exactly one cleared endpoint.
 *
 * So an override is permitted only when the credential is the gate's own
 * fixture literal, or when there is no credential at all. A real key plus an
 * override is refused here, loudly, rather than silently shipping a discharge
 * summary and a valid `x-api-key` to whatever host was configured.
 */
export function assertProviderEgress(): void {
  const baseURL = process.env.ANTHROPIC_BASE_URL ?? '';
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!baseURL) return; // the provider's own host — the only production shape
  if (!looksLikeRealCredential(apiKey)) return; // a fixture server, holding no credential
  throw new Error(
    'provider egress refused: ANTHROPIC_BASE_URL is set while a real credential is ' +
      'configured. G3 clears ONE endpoint; unset the override or use the gate fixture key.',
  );
}

function client(): Anthropic {
  assertProviderEgress();
  const baseURL = process.env.ANTHROPIC_BASE_URL ?? '';
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const key = `${baseURL}\u0000${apiKey}`;
  let existing = clients.get(key);
  if (!existing) {
    existing = new Anthropic({
      ...(baseURL ? { baseURL } : {}),
      ...(apiKey ? { apiKey } : {}),
      maxRetries: 0,
      // §6.2 has ONE retention question, and it is about the provider. The
      // SDK redacts credentials from its own logs but NOT the request body,
      // so an operator setting ANTHROPIC_LOG=debug would write every
      // document's text and every rendered page as base64 into the platform
      // log store (round-16 R2/F-10). Pinned so the environment cannot raise
      // it.
      logLevel: 'warn',
    });
    clients.set(key, existing);
  }
  return existing;
}

export type ProviderCall = {
  model: AllowedModel;
  system: string;
  messages: Anthropic.MessageParam[];
  schema: Record<string, unknown>;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  timeoutMs: number;
};

/** A call minus its timeout: WHAT goes on the wire, as opposed to how long
 *  we wait for it. */
export type ProviderRequest = Omit<ProviderCall, 'timeoutMs'>;

/**
 * THE ONE Messages envelope (round-16 R2/F-4, 5B queue step 4).
 * `callProvider` sends exactly this, and the G9 harness submits exactly this
 * inside the Batch API's `{custom_id, params}` wrapper — the only shape that
 * genuinely differs between the two, and it is the provider's, not ours.
 * Building the envelope here, once, is what makes "the eval measures what
 * production sends" (§6.10) a property of the tree rather than of a
 * reviewer's eye.
 */
export function messageParams(call: ProviderRequest): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: assertAllowedModel(call.model),
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: call.effort,
      format: { type: 'json_schema', schema: call.schema },
    },
    system: call.system,
    messages: call.messages,
  };
}

/** How much dispatch room must remain AFTER honouring a retry-after for the
 *  in-attempt wait to be worth taking; below it, the lease machinery is the
 *  honest counter (6B B4/R2-F5). */
const RATE_LIMIT_DISPATCH_FLOOR_MS = 10_000;

/** The retry-after a 429 carries, in milliseconds — null when absent or
 *  unreadable (SDK versions differ on the headers container's shape). */
function rateLimitWaitMs(err: unknown): number | null {
  if (!(err instanceof Anthropic.RateLimitError)) return null;
  const headers = err.headers as unknown;
  let value: string | null = null;
  if (headers && typeof (headers as Headers).get === 'function') {
    value = (headers as Headers).get('retry-after');
  } else if (headers && typeof headers === 'object') {
    const record = headers as Record<string, string | undefined>;
    value = record['retry-after'] ?? record['Retry-After'] ?? null;
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds * 1000);
}

/**
 * One Messages request, with `stop_reason` checked FIRST.
 *
 * The ordering is the point (§6.8): a declined request returns HTTP 200 with
 * an empty content array, so code that reads `content[0]` unconditionally
 * breaks on exactly the case that most needs handling well.
 *
 * 6B B4 — the STATUS-AWARE arm (R2/F-5, F-14), because slice 6 is the first
 * slice in which a person READS the resulting label:
 *   · HTTP 400 is PERMANENT: identical bytes cannot succeed on a retry, so
 *     the outcome says so and the worker terminalizes honestly.
 *   · HTTP 429 with a `retry-after` that FITS the remaining lease budget is
 *     waited out ONCE, inside the same attempt — the lease stays the ONLY
 *     durable counter; this is status-awareness, not a retry loop. A
 *     retry-after that does not fit stays `unavailable` for the machinery.
 *   · An overload is HTTP 529 (F-14 corrected the fixture) and every 5xx
 *     stays `unavailable` — the machinery's to retry, never finalized early.
 */
export async function callProvider(call: ProviderCall): Promise<AdapterResult<unknown>> {
  const modelId = assertAllowedModel(call.model);
  const stamp = { modelId, promptVersion: PROMPT_VERSION };

  if (call.timeoutMs <= 0) {
    // §1.9: no budget left inside the lease. Not dispatching is the correct
    // answer — the attempt is already burned and finalize needs its room.
    return { outcome: 'unavailable', detail: 'no provider budget inside the lease', ...stamp };
  }

  const params = messageParams(call);
  const startedAt = Date.now();
  let waitedForRateLimit = false;
  let message: Anthropic.Message;
  for (;;) {
    const remainingMs = call.timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      return { outcome: 'unavailable', detail: 'lease budget exhausted before dispatch', ...stamp };
    }
    try {
      message = await client().messages.create(params, { timeout: remainingMs });
      break;
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError) {
        return { outcome: 'permanent', detail: err.message, ...stamp };
      }
      const waitMs = rateLimitWaitMs(err);
      if (
        waitMs !== null &&
        !waitedForRateLimit &&
        waitMs + RATE_LIMIT_DISPATCH_FLOOR_MS <= call.timeoutMs - (Date.now() - startedAt)
      ) {
        waitedForRateLimit = true;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      return { outcome: 'unavailable', detail: (err as Error).message, ...stamp };
    }
  }

  if (message.stop_reason === 'refusal') {
    const details = message.stop_details;
    return {
      outcome: 'refusal',
      category: details && details.type === 'refusal' ? (details.category ?? null) : null,
      ...stamp,
    };
  }
  if (message.stop_reason === 'max_tokens') {
    return { outcome: 'truncated', ...stamp };
  }
  // 6B B4 (R2/F-9): in the SDK's own StopReason union and previously
  // unhandled — it fell through to "no text content" → provider_error. At
  // 200 pages × ~4784 tokens the state is reachable by a document PRD §13.3
  // permits, and the mapping should say what happened.
  if (message.stop_reason === 'model_context_window_exceeded') {
    return { outcome: 'truncated', detail: 'model_context_window_exceeded', ...stamp };
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (text.trim() === '') {
    return { outcome: 'invalid_output', detail: 'no text content', ...stamp };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { outcome: 'invalid_output', detail: (err as Error).message, ...stamp };
  }

  return {
    outcome: 'ok',
    data: parsed,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    },
    dropped: 0,
    ...stamp,
  };
}

/** §6.7's operator channel: a `{role:"system"}` message, appended after the
 *  arrival's user turn so it can never be forged by document content. */
export function operatorMessages(notes: string[]): Anthropic.MessageParam[] {
  if (notes.length === 0) return [];
  return [{ role: 'system', content: notes.join('\n') }];
}

/** Images as inline base64 vision blocks — never the Files API (§6.2). */
export function imageBlocks(
  pages: Array<{ mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array }>,
): Anthropic.ContentBlockParam[] {
  return pages.map((page) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: page.mime,
      data: Buffer.from(page.bytes).toString('base64'),
    },
  }));
}
