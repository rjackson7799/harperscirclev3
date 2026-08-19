import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import path from 'node:path';

// ============================================================================
// D2 · The a11y lint floor (TSD §8.7, A11Y-05) — landed BEFORE the first
// component exists, so "CI checks from the first component" is literal.
// The floor is the named `hc/a11y` block in eslint.config.mjs:
// eslint-plugin-jsx-a11y flat/recommended (explicit devDep) plus §8.7's
// named rule — an accessible label on every icon-only control — at error.
//
// Like the db-fence (A2), the fence is the ESLint rule itself; these tests
// drive it through the ESLint API against virtual file paths, so a rule
// regression reds here AND `npm run lint` reds on a real unlabeled control.
// ============================================================================

const repo = path.resolve(__dirname, '../..');
const eslint = new ESLint({ cwd: repo });

type Msg = { ruleId: string | null; severity: number; message: string };

async function messagesFor(filePath: string, code: string): Promise<Msg[]> {
  const results = await eslint.lintText(code, {
    filePath: path.join(repo, filePath),
  });
  return results.flatMap((r) =>
    r.messages.map((m) => ({
      ruleId: m.ruleId,
      severity: m.severity,
      message: m.message,
    })),
  );
}

const UNLABELED_ICON_BUTTON = `
export function Dismiss({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
`;

const LABELED_ICON_BUTTON = `
export function Dismiss({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Remove" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
`;

describe('D2 · §8.7: an accessible label on every icon-only control', () => {
  it('an unlabeled icon-only button reds, at error severity', async () => {
    const msgs = await messagesFor(
      'components/ui/RemovableChip.tsx',
      UNLABELED_ICON_BUTTON,
    );
    const hit = msgs.filter(
      (m) => m.ruleId === 'jsx-a11y/control-has-associated-label',
    );
    expect(hit.length, JSON.stringify(msgs, null, 2)).toBeGreaterThan(0);
    expect(hit.every((m) => m.severity === 2)).toBe(true);
  });

  it('the same control with aria-label passes clean', async () => {
    const msgs = await messagesFor(
      'components/ui/RemovableChip.tsx',
      LABELED_ICON_BUTTON,
    );
    expect(msgs.filter((m) => m.ruleId?.startsWith('jsx-a11y/'))).toEqual([]);
  });

  it('the nested-label form-field pattern lints clean (the carve-out)', async () => {
    // control-has-associated-label never walks up to a wrapping <label>, so
    // form fields are carved out of it (label-has-associated-control owns
    // them, at error). This fixture pins the carve-out: the accessible
    // pattern every screen uses must not red.
    const msgs = await messagesFor(
      'app/setup/step/1/page.tsx',
      `export const F = () => (
  <label className="field">
    <span className="field-label">First name</span>
    <input type="text" name="subject_name" />
  </label>
);
`,
    );
    expect(msgs.filter((m) => m.ruleId?.startsWith('jsx-a11y/'))).toEqual([]);
  });

  it('the floor covers app/ screens, not only components/', async () => {
    const msgs = await messagesFor(
      'app/(app)/[circle]/anywhere/page.tsx',
      UNLABELED_ICON_BUTTON,
    );
    expect(
      msgs.some((m) => m.ruleId === 'jsx-a11y/control-has-associated-label'),
    ).toBe(true);
  });
});

describe('D2 · the jsx-a11y recommended floor is on at error', () => {
  it('an image without alt text reds', async () => {
    const msgs = await messagesFor(
      'components/ui/Anything.tsx',
      'export const A = () => <img src="/x.png" />;\n',
    );
    const hit = msgs.filter((m) => m.ruleId === 'jsx-a11y/alt-text');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((m) => m.severity === 2)).toBe(true);
  });

  it('a positive tabindex reds (focus order stays natural)', async () => {
    const msgs = await messagesFor(
      'components/ui/Anything.tsx',
      'export const A = () => <button tabIndex={3}>Go</button>;\n',
    );
    expect(
      msgs.some((m) => m.ruleId === 'jsx-a11y/tabindex-no-positive'),
    ).toBe(true);
  });
});
