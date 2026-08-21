import 'server-only';
import net from 'node:net';

/**
 * The zero-dep clamd INSTREAM adapter (TSD §1.6's scanner row as
 * reconciled by annex A9; §4.3; slice-4 plan B4; SCN-01). Bytes are
 * streamed over TCP to OUR ClamAV container and nowhere else — the §1.6
 * constraint that ruled out hosted scanners is structural here: this
 * module holds no path that could persist a sample provider-side.
 *
 * FOUR states, never collapsed (AC-INBOX-15):
 *   clean        — "stream: OK"
 *   infected     — "… FOUND", the signature named in detail
 *   inconclusive — the scanner ANSWERED with no verdict (an ERROR reply,
 *                  e.g. the INSTREAM size limit) — a fact about the
 *                  bytes' scannability, finalized as its own state
 *   unavailable  — the scanner could not be reached or never answered —
 *                  an OUTAGE, retryable by the stage machinery, never
 *                  finalized by the worker (exhaustion lands
 *                  scan_unavailable with its stated reason)
 *
 * Wire protocol (clamd(8) INSTREAM): "zINSTREAM\0", then chunks as a
 * 4-byte big-endian length prefix + data, terminated by a zero-length
 * chunk; the NUL-terminated reply names the verdict.
 */

export type ScanVerdict = 'clean' | 'infected' | 'unavailable' | 'inconclusive';

export type ScanOutcome = {
  verdict: ScanVerdict;
  detail: Record<string, unknown>;
};

export type ScannerOptions = {
  host?: string;
  port?: number;
  timeoutMs?: number;
};

const CHUNK = 64 * 1024;

export async function scanBytes(
  bytes: Uint8Array,
  options: ScannerOptions = {},
): Promise<ScanOutcome> {
  const host = options.host ?? process.env.CLAMD_HOST ?? '127.0.0.1';
  const port = options.port ?? Number(process.env.CLAMD_PORT ?? 3310);
  const timeoutMs = options.timeoutMs ?? 30_000;

  return new Promise<ScanOutcome>((resolve) => {
    const socket = new net.Socket();
    const reply: Buffer[] = [];
    let settled = false;

    const settle = (outcome: ScanOutcome) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(outcome);
    };

    socket.setTimeout(timeoutMs, () => {
      settle({ verdict: 'unavailable', detail: { error: `clamd timeout after ${timeoutMs}ms` } });
    });
    socket.on('error', (err) => {
      settle({ verdict: 'unavailable', detail: { error: err.message } });
    });
    socket.on('data', (d) => {
      reply.push(d);
      const text = Buffer.concat(reply).toString('utf8');
      if (!text.includes('\0') && !text.endsWith('\n')) return;
      const line = text.replace(/\0[\s\S]*$/, '').trim();
      const found = /^stream: (.+) FOUND$/.exec(line);
      if (found) {
        settle({ verdict: 'infected', detail: { signature: found[1] } });
      } else if (line === 'stream: OK') {
        settle({ verdict: 'clean', detail: {} });
      } else if (line.includes('ERROR')) {
        // The scanner answered; the answer is "no verdict" — a fact,
        // not an outage.
        settle({ verdict: 'inconclusive', detail: { error: line } });
      } else {
        settle({ verdict: 'inconclusive', detail: { error: `unrecognised reply: ${line}` } });
      }
    });

    socket.connect(port, host, () => {
      socket.write(Buffer.from('zINSTREAM\0', 'latin1'));
      for (let at = 0; at < bytes.byteLength; at += CHUNK) {
        const part = bytes.subarray(at, Math.min(at + CHUNK, bytes.byteLength));
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.byteLength, 0);
        socket.write(len);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4)); // the zero-length terminator
    });
  });
}
