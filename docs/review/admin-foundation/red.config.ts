import base from '../../../vitest.config';

// Opt-in proposed-contract regression. Never silently add a known RED to Home.
const config = {
  ...base,
  test: {
    ...base.test,
    include: ['docs/review/admin-foundation/*.red.test.ts'],
    maxWorkers: 1,
  },
};

export default config;
