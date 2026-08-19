/**
 * The §8.3 page pattern's top: 34px serif title (h1's element default) →
 * one line of muted 13.5px context, max-width ~620px. Controls and
 * content follow outside this component.
 */
export function PageHeader({
  title,
  context,
}: {
  title: string;
  context?: string;
}) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {context ? <p className="page-context">{context}</p> : null}
    </header>
  );
}
