/**
 * The completion screen's promises, in one testable place (PRD §4.1.3
 * "All set"; AC-AUTH-5: the screen names ONLY surfaces Phase 1 built —
 * no checklist, no local resources, no weekly brief).
 */

export const completionPromises = {
  instruction:
    'Forward the next thing that arrives — a letter, a bill, a discharge summary — to the address above. That is the whole habit.',
  inactiveReason: (name: string) =>
    `Verify your email to switch on ${name}'s forwarding address. Until then, mail sent to it bounces with a readable reason — nothing is silently swallowed.`,
  inviteDisabledReason:
    'Verify your email first — invites go out in your name, so we confirm the mailbox is yours before anything is sent from it.',
} as const;

/**
 * PRD §7.5 — custodianship with a receipt, saying the smaller true thing:
 * held on the subject's behalf, everything written down and printable;
 * never "final say", never a consent the product cannot show. The subject
 * is named, never pronominalized (no gender exists in the data).
 */
export function custodianshipLine(subjectName: string): string {
  return (
    `This is ${subjectName}'s record, held by you on their behalf. ` +
    `Everything done with it is written down — who did it, and when. ` +
    `You can print that for ${subjectName} now, and it becomes theirs to read directly ` +
    `if they ever have an account here.`
  );
}
