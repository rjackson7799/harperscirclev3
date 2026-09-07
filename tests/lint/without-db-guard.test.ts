import { describe, expect, it } from 'vitest';
import pg, { Client, Pool } from '../setup/blocked-postgres';

describe('database-free test run rejects accidental database access', () => {
  it('rejects a client before it can create a connection', () => {
    expect(() => new Client()).toThrow('Database access is disabled in test:without-db');
    expect(pg.Client).toBe(Client);
  });

  it('rejects a pool before it can retain connections', () => {
    expect(() => new Pool()).toThrow('Database access is disabled in test:without-db');
    expect(pg.Pool).toBe(Pool);
  });
});
