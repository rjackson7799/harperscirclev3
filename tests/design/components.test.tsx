import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// D4 · The §8.4 component contracts (DS-04): no-shadow cards, the radii
// map, badge/chip metrics with the Q2 text variants carrying the words,
// the ×-dismiss with its padded >=44px hit area, buttons wrapping the
// seed classes, mandatory label association, avatar ring/stack, the
// person→accent primitive, legend composition, and the §8.4 icon
// conventions. Markup contracts via static render; CSS metrics pinned
// against app/globals.css.
// ============================================================================

const repo = path.resolve(__dirname, '../..');
const sheet = readFileSync(path.join(repo, 'app/globals.css'), 'utf8');

function block(selector: string): string {
  const re = new RegExp(
    `(^|\\n)[^{}]*${selector.replace(/[.[\]]/g, (c) => `\\${c}`)}[^{}]*\\{([^}]*)\\}`,
  );
  const m = re.exec(sheet);
  if (!m) throw new Error(`no CSS block for ${selector}`);
  return m[2];
}

describe('D4 · Card — borders do the work (§8.4)', () => {
  it('renders the card surface; clickable adds cursor and NOTHING else', async () => {
    const { Card } = await import('@/components/ui/Card');
    const plain = renderToStaticMarkup(<Card>body</Card>);
    expect(plain).toContain('class="card"');
    const clickable = renderToStaticMarkup(<Card clickable>body</Card>);
    expect(clickable).toContain('card-clickable');
  });

  it('.card carries the §8.4 spec; box-shadow appears NOWHERE in first-party CSS', () => {
    const css = block('.card');
    expect(css).toContain('background: var(--card)');
    expect(css).toContain('border: 1px solid var(--line)');
    expect(css).toContain('border-radius: var(--r-card)');
    expect(css).toContain('padding: 17px');
    expect(sheet).not.toContain('box-shadow');
    expect(block('.card-clickable').trim()).toBe('cursor: pointer;');
  });
});

describe('D4 · CardWithEyebrow — three lines, that order, no icon (§8.4)', () => {
  it('eyebrow → 22px serif headline → muted explanation, accent words on the Q2 variant', async () => {
    const { CardWithEyebrow } = await import('@/components/ui/CardWithEyebrow');
    const html = renderToStaticMarkup(
      <CardWithEyebrow accent="sage" eyebrow="Handled" headline="All filed" explanation="Nothing needs you here." />,
    );
    const eyebrow = html.indexOf('Handled');
    const headline = html.indexOf('<h2');
    const explanation = html.indexOf('Nothing needs you here.');
    expect(eyebrow).toBeGreaterThan(-1);
    expect(eyebrow).toBeLessThan(headline);
    expect(headline).toBeLessThan(explanation);
    expect(html).toContain('var(--sage-text)');
    expect(html).not.toMatch(/<svg|<img/);
  });
});

describe('D4 · badges and chips (§8.4, Q2)', () => {
  it('CountBadge: --terracotta-badge fill, white 700 10.5px, 1px 7px, pill radius', async () => {
    const { CountBadge } = await import('@/components/ui/CountBadge');
    const html = renderToStaticMarkup(<CountBadge count={3} />);
    expect(html).toContain('count-badge');
    expect(html).toContain('>3<');
    const css = block('.count-badge');
    expect(css).toContain('background: var(--terracotta-badge)');
    expect(css).toContain('color: var(--white)');
    expect(css).toContain('padding: 1px 7px');
    expect(css).toContain('border-radius: var(--r-pill)');
  });

  it('CategoryBadge: construction-rule tint fill, accent words on the Q2 text variant, 10px (the §8.2 floor resolves the 9.5 range)', async () => {
    const { CategoryBadge } = await import('@/components/ui/CategoryBadge');
    const html = renderToStaticMarkup(<CategoryBadge accent="amber">Medical</CategoryBadge>);
    expect(html).toContain('category-badge');
    expect(html).toContain('color-mix');
    expect(html).toContain('var(--amber)');
    expect(html).toContain('var(--amber-text)');
    const css = block('.category-badge');
    expect(css).toContain('font-size: 10px');
    expect(css).toContain('font-weight: 700');
    expect(css).toContain('padding: 2px 8px');
    expect(css).toContain('border-radius: var(--r-control)');
  });

  it('TagChip: sage chip fill, sage words on the Q2 variant, 600 10.5px, 3px 9px, radius 11px', async () => {
    const { TagChip } = await import('@/components/ui/TagChip');
    const html = renderToStaticMarkup(<TagChip>encouraging</TagChip>);
    expect(html).toContain('tag-chip');
    const css = block('.tag-chip');
    expect(css).toContain('background: var(--chip-sage-bg)');
    expect(css).toContain('color: var(--sage-text)');
    expect(css).toContain('font-weight: 600');
    expect(css).toContain('font-size: 10.5px');
    expect(css).toContain('padding: 3px 9px');
    expect(css).toContain('border-radius: 11px');
  });

  it('RemovableChip: labelled dismiss, aria-hidden × glyph at 14px in faint, >=44px padded hit area', async () => {
    const { RemovableChip } = await import('@/components/ui/RemovableChip');
    const html = renderToStaticMarkup(<RemovableChip label="Nell" />);
    expect(html).toContain('removable-chip');
    expect(html).toMatch(/<button[^>]*aria-label="Remove Nell"/);
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>×<\/span>/);
    const css = block('.chip-dismiss');
    expect(css).toContain('min-width: 44px');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('color: var(--faint)');
    expect(css).toContain('font-size: 14px');
    const chip = block('.removable-chip');
    expect(chip).toContain('background: var(--white)');
    expect(chip).toContain('border-radius: var(--r-pill)');
  });
});

describe('D4 · Button wraps the seed classes (screens keep working mid-migration)', () => {
  it('variants map onto .button-primary/-secondary/-quiet; type defaults to button', async () => {
    const { Button } = await import('@/components/ui/Button');
    expect(renderToStaticMarkup(<Button>Save</Button>)).toContain('button-primary');
    expect(renderToStaticMarkup(<Button variant="secondary">Copy</Button>)).toContain('button-secondary');
    expect(renderToStaticMarkup(<Button variant="quiet">Not now</Button>)).toContain('button-quiet');
    expect(renderToStaticMarkup(<Button>Save</Button>)).toContain('type="button"');
    expect(renderToStaticMarkup(<Button type="submit">Go</Button>)).toContain('type="submit"');
  });
});

describe('D4 · Field/Input — label association is structural (§8.7)', () => {
  it('Field nests the control inside its label with the seed classes', async () => {
    const { Field } = await import('@/components/ui/Field');
    const { Input } = await import('@/components/ui/Input');
    const html = renderToStaticMarkup(
      <Field label="First name" help="As they like to be called.">
        <Input name="first_name" />
      </Field>,
    );
    const label = html.indexOf('<label');
    const control = html.indexOf('<input');
    const close = html.indexOf('</label>');
    expect(label).toBeGreaterThan(-1);
    expect(control).toBeGreaterThan(label);
    expect(close).toBeGreaterThan(control);
    expect(html).toContain('field-label');
    expect(html).toContain('field-help');
  });

  it('the composed-control shell strips the inner border (§8.4 input note)', () => {
    const css = /\.composed-control\s+input\s*\{([^}]*)\}/.exec(sheet)?.[1] ?? '';
    expect(css).toContain('border: none');
    const shell = block('.composed-control');
    expect(shell).toContain('border: 1px solid var(--line)');
    expect(shell).toContain('background: var(--white)');
  });
});

describe('D4 · Avatar + the person→accent primitive (§8.4, PRD §4.0)', () => {
  it('renders the accessible name, the initial aria-hidden, the accent fill', async () => {
    const { Avatar } = await import('@/components/ui/Avatar');
    const html = renderToStaticMarkup(<Avatar name="Nell" accent="plum" />);
    expect(html).toMatch(/aria-label="Nell"/);
    expect(html).toMatch(/aria-hidden="true"[^>]*>N</);
    expect(html).toContain('var(--plum)');
  });

  it('.avatar: 28px circle, white 600 11px initial, 2px cream ring; stacks overlap -8px', () => {
    const css = block('.avatar');
    expect(css).toContain('width: 28px');
    expect(css).toContain('height: 28px');
    expect(css).toContain('border-radius: 50%');
    expect(css).toContain('border: 2px solid var(--cream)');
    expect(css).toContain('color: var(--white)');
    expect(css).toContain('font-weight: 600');
    expect(css).toContain('font-size: 11px');
    const stack = /\.avatar-stack\s+\.avatar\s*\+\s*\.avatar\s*\{([^}]*)\}/.exec(sheet)?.[1] ?? '';
    expect(stack).toContain('margin-left: -8px');
  });

  it('memberAccent is stable, never plum (reserved), never green (the product voice)', async () => {
    const { memberAccent } = await import('@/lib/design/accents');
    const ids = ['m-1', 'm-2', 'm-3', 'm-4', 'm-5', 'm-6', 'm-7', 'm-8'];
    for (const id of ids) {
      expect(memberAccent(id)).toBe(memberAccent(id));
      expect(['sage', 'terracotta', 'amber']).toContain(memberAccent(id));
    }
    // the cycle actually spreads
    expect(new Set(ids.map(memberAccent)).size).toBeGreaterThan(1);
  });

  it('subjectAccent: seq 1 is plum (the parent‘s own identity); later subjects stable non-plum', async () => {
    const { subjectAccent } = await import('@/lib/design/accents');
    expect(subjectAccent('s-1', 1)).toBe('plum');
    const second = subjectAccent('s-2', 2);
    expect(second).not.toBe('plum');
    expect(subjectAccent('s-2', 2)).toBe(second);
  });
});

describe('D4 · Legend — the companion of every colour-coded view (§8.4)', () => {
  it('renders a dot per item with the label, below a hairline rule', async () => {
    const { Legend } = await import('@/components/ui/Legend');
    const html = renderToStaticMarkup(
      <Legend items={[{ accent: 'amber', label: 'Due' }, { accent: 'sage', label: 'Handled' }]} />,
    );
    expect(html).toContain('legend-dot');
    expect(html).toContain('Due');
    expect(html).toContain('Handled');
    const legend = block('.legend');
    expect(legend).toContain('gap: 14px');
    expect(legend).toContain('border-top: 1px solid var(--wash)');
    const dot = block('.legend-dot');
    expect(dot).toContain('width: 7px');
    expect(dot).toContain('height: 7px');
    expect(dot).toContain('border-radius: 50%');
    const item = block('.legend-item');
    expect(item).toContain('font-size: 11px');
    expect(item).toContain('color: var(--muted-text)');
  });
});

describe('D4 · Icon — the §8.4 conventions, glyphs land with their surfaces', () => {
  it('24×24 viewBox, fill none, stroke currentColor at 1.6, round caps/joins, 13–16px render', async () => {
    const { Icon } = await import('@/components/icons/Icon');
    const html = renderToStaticMarkup(
      <Icon>
        <path d="M12 5v14M5 12h14" />
      </Icon>,
    );
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('fill="none"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="1.6"');
    expect(html).toContain('stroke-linecap="round"');
    expect(html).toContain('stroke-linejoin="round"');
    expect(html).toMatch(/width="14"/);
  });

  it('decorative by default (aria-hidden); a named icon is role="img" with its label', async () => {
    const { Icon } = await import('@/components/icons/Icon');
    expect(renderToStaticMarkup(<Icon><path d="M0 0" /></Icon>)).toContain('aria-hidden="true"');
    const named = renderToStaticMarkup(<Icon label="Timeline"><path d="M0 0" /></Icon>);
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Timeline"');
  });
});
