import { vi } from 'vitest';

// Fail visibly if a newly added test needs PostgreSQL. This is a test boundary,
// not a general network sandbox; local HTTP/TCP fixture tests still run.
vi.mock('pg', async () => import('./blocked-postgres'));
