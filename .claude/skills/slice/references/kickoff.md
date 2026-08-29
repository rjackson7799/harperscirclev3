# The kickoff template

**A kickoff is now mostly subtraction.** `CLAUDE.md` and
`docs/process/traps.md` are auto-loaded; `docs/process/slice.md` is one read
away. The only thing a kickoff must still carry is what is **volatile** — the
facts that rot within hours.

**Cap: 90 lines, enforced by `tests/lint/process.test.ts`.** Round-18's kickoff
was 278 lines, of which roughly 120 were permanent doctrine retyped by hand —
and retyping it produced a defect: *"the kickoff told the reviewer two different
things about the same failure, in the same numbered item."* If you are over 90
lines, you are restating something that is already loaded.

Regenerate against the **current committed docs** every time. Never reuse a
kickoff; a stale one re-litigates settled decisions.

---

```markdown
# <Leg> — slice <S>, round <N>

Traps, constraints and authority order are auto-loaded (`CLAUDE.md`,
`docs/process/traps.md`). The ritual is `docs/process/slice.md`. Invoke the
`slice` skill. Only what is below is new.

## STATE — settled, do not redo

- Branch `<branch>` @ `<sha>`; base `main` @ `<sha>` (moved? / unmoved).
- Merged so far: <one line>.
- Tier for this increment: **T<n>**, ruled by the owner at the plan gate.
- Bounds: migrations <spent> of ≤ <bound> · dependencies <spent> of ≤ <bound>
  (dev reserve <state>).
- Evidence at the last green head: reset exact <N> · pgTAP <n>/<n> across <f>
  files · concurrency <n>/<n> · vitest <n>/<n> · browser gate <n>/<n> ·
  db:verify clean · lint/typecheck/build clean.
- Coverage rows moved: <list or none>.
- `docs/owed.md`: <open> OPEN of 25.
- What is NOT activated: <gates still blocking>.

## THE TASK

<What this leg produces, and its exit condition. Three to ten lines.>

## WHERE TO PUSH HARDEST

<The two or three places this increment names against itself. Be specific
about which claim is weakest and why.>

## SLICE-SPECIFIC TRAPS

<Only what is NOT in docs/process/traps.md. Usually zero to three lines.
If you are writing more than three, most of it probably belongs in traps.md
under the eviction rule — or it is already there.>

## ⏸ AT THE GATE, STOP

<The next leg, and who owns it. Say STOP explicitly: without it an autonomous
session merges its own work. The owner is sole merge authority.>
```

---

## The STATE checklist

Volatile things forgotten most often, in rough order of how much damage the
omission does:

- [ ] Has `main` moved? A kickoff that says "unmoved" when it has is the worst
      single line in the document.
- [ ] Both heads named — evidence head and docs head — if they differ.
- [ ] The tier, and that it was **ruled**, not assumed.
- [ ] Bounds *spent*, not just bounds set.
- [ ] Every tally stated **exactly**, never as "unchanged".
- [ ] The owed count against the cap.
- [ ] Which gates still block, and that nothing is production-activated.
- [ ] Any transient observed in the last run, named as a transient.

**Do not put a CI run number in a kickoff.** It goes stale the moment it is
committed — a round-17 finding, made in the document that opens by warning
about it.
