import { ACCENT_VAR, subjectAccent } from '@/lib/design/accents';

/**
 * The subject label every record row carries (PRD §4.0: "with two subjects,
 * every list row, card and result that belongs to one subject carries that
 * subject's name. There is no unlabelled state"; AC-TL-4). The subject's ONE
 * accent (design spec §5, Avatar — plum for the founding subject) rides as a
 * dot beside the NAME, never instead of it: meaning is never carried by
 * colour alone (§8.7), so the dot is decorative and the word is the label.
 */
export function SubjectLabel({
  subjectId,
  seq,
  name,
}: {
  subjectId: string;
  seq: number;
  name: string;
}) {
  return (
    <span className="subject-label">
      <span
        className="legend-dot"
        aria-hidden="true"
        style={{ background: ACCENT_VAR[subjectAccent(subjectId, seq)] }}
      />
      {name}
    </span>
  );
}
