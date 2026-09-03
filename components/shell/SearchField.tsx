import { SEARCH_QUERY_MAX } from '@/lib/hc/search';

/** PRD §4.7.3's first-open hint, verbatim — the input's description. */
export const SEARCH_HINT = 'Find documents, dates and tasks.';

/**
 * The ask-the-record search field (design_spec §4's second top-bar item;
 * PRD §4.7.3; 8B U2). A PLAIN GET FORM to /[circle]/search — no client
 * fetch, no suggestion list, no autocomplete attribute: §7.4 calls the
 * absence "a decision, not an omission", and tests/design/search-field
 * and tests/lint/search-surface-fence assert it as an absence.
 *
 * The placeholder is the circle's (§4.7.3: `Search Nell's record` for one
 * subject, `Search the record` for two) and comes from the layout's ONE
 * membership read (slice-8 plan, settled item 2) — never a second call per
 * screen; `Search the record` when that read fails, which is true for
 * every circle. The field is in the TOP BAR, not the nav (item 6): the
 * nav's tier courtesy hides Documents from a caregiver; nothing hides
 * this, because her assigned tasks are findable (AC-TASK-5).
 *
 * Labelled by a bound <label> (visually hidden — the top bar has no room
 * for a visible one, and the placeholder is not a name); the hint is the
 * input's aria-describedby. The client-side maxlength mirrors the server's
 * ingress cap and is not the cap (Q4(4)).
 */
export function SearchField({ circle, placeholder }: { circle: string; placeholder: string }) {
  return (
    <form className="search-field" role="search" method="get" action={`/${circle}/search`}>
      <label htmlFor="search-q" className="visually-hidden">
        Search
      </label>
      <input
        id="search-q"
        type="search"
        name="q"
        placeholder={placeholder}
        maxLength={SEARCH_QUERY_MAX}
        aria-describedby="search-hint"
      />
      <span id="search-hint" className="micro-meta search-hint">
        {SEARCH_HINT}
      </span>
    </form>
  );
}
