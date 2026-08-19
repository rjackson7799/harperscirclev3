import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shell/PageHeader';
import { STYLEGUIDE_FIXTURES } from './fixtures';

/**
 * Q4 · The dev-gated styleguide: notFound() in production (pinned by
 * tests/design/styleguide.test.tsx). Renders every component composition
 * — D7's axe fixture and the human review surface for the four §8.1
 * rules named below, which tokens cannot enforce.
 */
export default function StyleguidePage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className="shell">
      <main className="shell-main">
        <PageHeader
          title="Styleguide"
          context="Every component in composition. Review here against the four §8.1 rules: one accent per card · accents never large fields · green is the product's voice, terracotta the family's attention · sand and cream never text, ink never fill."
        />
        <div className="grid-browsing">
          {STYLEGUIDE_FIXTURES.map((fixture) => (
            <section key={fixture.name}>
              <h2 className="section-label" style={{ marginBottom: 8 }}>
                {fixture.name}
              </h2>
              {fixture.render()}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
