import { afterEach, describe, expect, it } from 'vitest';
import net from 'node:net';
import { scanBytes } from '@/lib/scan/scanner';

// ============================================================================
// B4 · lib/scan/scanner.ts — the zero-dep clamd INSTREAM adapter
// (TSD §1.6's scanner row as reconciled by annex A9: FOUR states, never
// collapsed; §4.3; SCN-01 app half). The §1.6 constraint that ruled out
// hosted scanners: bytes are streamed to OUR container, nothing is
// persisted provider-side — the adapter holds no path that could.
//
// Test class: UNIT against a real TCP socket (a fake clamd speaking the
// INSTREAM wire protocol) — the protocol framing is asserted byte-level;
// the REAL clamd answers at the B9 gate leg (EICAR live).
// ============================================================================

type FakeClamd = {
  port: number;
  received: () => Buffer;
  close: () => Promise<void>;
};

const servers: net.Server[] = [];

function fakeClamd(response: string | null): Promise<FakeClamd> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const server = net.createServer((socket) => {
      socket.on('data', (d) => {
        chunks.push(d);
        const all = Buffer.concat(chunks);
        // The zero-length frame terminates the stream: respond then.
        if (all.length >= 14 && all.subarray(all.length - 4).equals(Buffer.alloc(4))) {
          if (response !== null) {
            socket.write(response + '\0');
            socket.end();
          }
          // response === null: hang silently (the timeout case)
        }
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as net.AddressInfo).port,
        received: () => Buffer.concat(chunks),
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.close(() => r());
        }),
    ),
  );
});

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

describe('B4 · the four verdicts, never collapsed', () => {
  it('stream: OK ⇒ clean', async () => {
    const clam = await fakeClamd('stream: OK');
    const r = await scanBytes(BYTES, { host: '127.0.0.1', port: clam.port });
    expect(r.verdict).toBe('clean');
  });

  it('FOUND ⇒ infected, the signature named in detail', async () => {
    const clam = await fakeClamd('stream: Eicar-Signature FOUND');
    const r = await scanBytes(BYTES, { host: '127.0.0.1', port: clam.port });
    expect(r.verdict).toBe('infected');
    expect(r.detail.signature).toBe('Eicar-Signature');
  });

  it('an ERROR reply is a scanner ANSWER with no verdict ⇒ inconclusive, never unavailable', async () => {
    const clam = await fakeClamd('INSTREAM size limit exceeded. ERROR');
    const r = await scanBytes(BYTES, { host: '127.0.0.1', port: clam.port });
    expect(r.verdict).toBe('inconclusive');
    expect(String(r.detail.error)).toMatch(/size limit/i);
  });

  it('nothing listening ⇒ unavailable (an outage, retryable by the machinery)', async () => {
    const clam = await fakeClamd('stream: OK');
    const port = clam.port;
    await clam.close();
    const r = await scanBytes(BYTES, { host: '127.0.0.1', port });
    expect(r.verdict).toBe('unavailable');
  });

  it('a silent scanner times out ⇒ unavailable', async () => {
    const clam = await fakeClamd(null);
    const r = await scanBytes(BYTES, { host: '127.0.0.1', port: clam.port, timeoutMs: 300 });
    expect(r.verdict).toBe('unavailable');
  });
});

describe('B4 · the INSTREAM wire protocol, byte-level', () => {
  it('sends zINSTREAM\\0, length-prefixed frames, and the zero terminator — the bytes arrive intact', async () => {
    const clam = await fakeClamd('stream: OK');
    const payload = new Uint8Array(100_000).map((_, i) => i % 251);
    await scanBytes(payload, { host: '127.0.0.1', port: clam.port });

    const wire = clam.received();
    expect(wire.subarray(0, 10).toString('latin1')).toBe('zINSTREAM\0');

    // Reassemble the frames and compare to the input.
    const frames: Buffer[] = [];
    let at = 10;
    for (;;) {
      const len = wire.readUInt32BE(at);
      at += 4;
      if (len === 0) break;
      frames.push(wire.subarray(at, at + len));
      at += len;
    }
    expect(at).toBe(wire.length);
    expect(Buffer.concat(frames).equals(Buffer.from(payload))).toBe(true);
  });
});
