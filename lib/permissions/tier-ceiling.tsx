import { ceilingCopy, type CeilingContext, type InvitableTier } from './tiers';

/**
 * The ONE ceiling renderer (AC-AUTH-8). The invite screen and the accept
 * screen both render tier ceilings through this component and nothing
 * else, so the copy and the grants it describes come from one module and
 * cannot drift apart. Kept deliberately markup-thin: the screens own
 * layout; this owns the words.
 */
export function TierCeiling(props: { tier: InvitableTier } & CeilingContext) {
  const { tier, person, subjectNames } = props;
  return (
    <p className="tier-ceiling" data-tier={tier}>
      {ceilingCopy(tier, { person, subjectNames })}
    </p>
  );
}
