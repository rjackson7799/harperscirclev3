import { expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [{ circles_total: 7 }] })),
  release: vi.fn(),
}));

// Only transport is replaced: the real Admin factory and role pinning run.
// No PostgreSQL connection, environment credential, or hosted fixture is used.
vi.mock('pg', () => ({
  Pool: class {
    async connect() { return transport; }
  },
}));

import { asAdmin } from '../../../lib/db/admin';

it('refuses a metadata read when no verified operator was supplied', async () => {
  // Proposed stricter contract: the legacy zero-identity path must be retired.
  // This is not a claim that the existing role permits record-content reads.
  await expect(Promise.resolve().then(() =>
    asAdmin().query('select circles_total from admin_meta.platform_stats'),
  )).rejects.toThrow();
});

it('demonstrates that the current unauthenticated path reaches the transport', async () => {
  // Diagnostic control for this RED baseline, to be removed in the GREEN change.
  transport.query.mockClear();
  await asAdmin().query('select circles_total from admin_meta.platform_stats');
  expect(transport.query).toHaveBeenCalledWith('set role hc_admin');
  expect(transport.query).toHaveBeenCalledWith(
    'select circles_total from admin_meta.platform_stats', undefined,
  );
});
