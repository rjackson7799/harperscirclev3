# Harper's Circle — New User Authentication

**Version** 0.1 · summary for the MVP build
**Scope** How a person gets an account and gets into a circle. Product-level; the security implementation follows from it.
**Companions** `Harper's Circle — Project Scope.md` (§4.8 People, roles & scoped access) · `Harper's Circle Onboarding.dc.html`

---

## 1. The two doors

There are only two ways into Harper's Circle, and they are different products.

| | **Founder** | **Invitee** |
|---|---|---|
| Who | The coordinator, starting from nothing | A sibling, a spouse, a paid caregiver |
| Arrives via | Marketing site, direct signup | An invite email from someone already inside |
| Creates | An account **and** a new circle | An account, joining an existing circle |
| Sees | The 4-step setup flow | A short accept flow — no setup questions |
| Ends at | Their circle's Home, pre-populated | The one surface their access allows |

**The invitee path must be shorter than the founder path.** The sibling is doing a favor under mild guilt; every screen between the invite email and something useful loses a percentage of them. Target: two taps from email to reading the record.

---

## 2. Method

**Email and password** for v1. One method, no social sign-in, no magic links, no phone codes.

The reasoning: the user base skews 45–70 and the account will be shared conceptually across a family; a familiar, explainable method with an obvious recovery path beats a modern one. A Google sign-in also creates confusion later when we ask to connect a Gmail inbox for ingestion — two different grants that look identical to the user.

Requirements:
- Password minimum 10 characters, checked against a breached-password list. No composition rules — no forced symbols or digits.
- Email verification required before the circle can be shared, not before the person can use it. Setup is not blocked on checking mail.
- Password reset by emailed link, single-use, 30-minute expiry.
- Sessions persist for 30 days on a remembered device. Coordinators use this daily and re-authenticating is friction with no security payoff at this tier.

**Deferred, in this order if v1 signals demand:** Apple and Google sign-in, passkeys, phone-number sign-in for the parent's own eventual access.

---

## 3. The founder path

Five states, in order. Steps 2–5 are the onboarding flow in the mock.

**1 · Create account.** Name, email, password, on the same screen as the value proposition. The account is created here — before any setup questions — so an abandoned setup still leaves a returnable account. The privacy statement appears on this screen, not in a footer: the family owns the data, can export or delete it, and it is never used for training.

**2 · About you.** Their relationship to the parent, and the parent's zip code. Establishes the person's role in the circle.

**3 · Who we're looking after.** One parent or two, names, and the current situation. **This creates the circle** and the person's own record inside it.

**4 · What brought you here.** Sets the first checklist and what Home leads with.

**5 · First document.** Optional. Demonstrates the product's core value before the person is fully committed.

**Result.** One account (the founder), one family, one or two parent records, one circle membership at Coordinator, and a pre-populated Home.

**Abandonment.** The account exists from step 1. Return sends them back to the furthest step they completed, not to the beginning. A circle that never reached step 3 has no parent record and is resumable indefinitely; it should not be counted as a signup in any metric.

---

## 4. The invitee path

Invitations are sent from the end of setup, or later from People & roles. Only a Coordinator — or the parent — can invite.

**1 · The email.** Sent by a person, not by the product. It names the sender, the parent, and what the recipient is being asked for. It must not read as a marketing email or it will not be opened. The tone is the coordinator's, not ours.

**2 · The link.** A single-use token, 7-day expiry, bound to the email address it was sent to. Opening it shows what circle they're joining, who invited them, and what they will and won't be able to see, before asking for anything.

**3 · Create account or sign in.** Same email/password form. An existing Harper's Circle user is signed in and joined without creating a second account — one person can belong to several circles, which is the common case for someone with in-laws.

**4 · Land.** Directly on the highest-value surface their access allows. Family lands on the Weekly Brief. Care circle lands on their assigned tasks. Nobody lands on an empty dashboard.

**No setup questions are asked of an invitee.** They did not choose to be here and they are not the account holder.

---

## 5. What a new member can see

The rule from Project Scope §4.8, restated because it is an auth-time decision:

**Everyone starts at the lowest tier for their type, and only a Coordinator or the parent can raise it.**

- **Family** joins at *summary only* — the Weekly Brief and the timeline. Not documents, not finances, not private family notes.
- **Care circle** joins scoped to their assigned tasks and today's plan. Never finances, never family notes. This is a ceiling, not a starting point — it does not rise.
- **Coordinator** is granted, never self-selected. The founder holds it by default; a second one can be added.
- **The parent** is root authority over their own record. If they have an account, they can see everything about themselves and can revoke anyone.

The invite acceptance screen states the recipient's access in plain language before they accept. Access is never granted or raised by the AI, and every change is logged and visible to the parent.

---

## 6. The parent's account

Deferred from MVP, but the position has to be stated now because it constrains the model.

The parent is the root authority over their own record. In v1 they typically have no account, which means the coordinator is acting on their behalf without a technical mechanism enforcing consent.

For v1, this is handled by disclosure rather than by code: setup states plainly that this is the parent's record held by the family, and the People screen shows the parent's standing even when they have no login. **Do not build the permission model in a way that assumes the parent is absent** — the parent must be representable as a person with the highest access whether or not an account is attached, so that account can be added later without a migration.

---

## 7. Security floor

Not a HIPAA-covered entity (see Project Scope §9), but families are uploading legal, medical, and financial documents. Minimum:

- TLS in transit, encryption at rest for documents and extracted content.
- Per-domain access checked server-side on every request. Never in the client, never by hiding UI.
- Document access via short-lived signed URLs, not guessable paths.
- Rate limiting and lockout on sign-in and password reset.
- An access log the parent and coordinator can read: who joined, who was raised or revoked, by whom, when.
- Session revocation from the account screen — "sign out everywhere."
- Full export and full deletion on request, both self-service.
- Invite tokens expire and are single-use. Revoking a person's access revokes their sessions immediately.

Family situations turn adversarial. Estranged siblings, contested power of attorney, and elder financial abuse are real cases in this product's population, and the access log and immediate revocation exist for them specifically.

---

## 8. Open

1. **Household sharing.** Spouses often want one login. Do we support it, or insist on separate accounts? Separate is correct for the access log; shared is what people will do anyway.
2. **Second circle.** When a user with an existing account starts a second circle (their own parents plus their spouse's), what does the circle switcher look like and where does it live?
3. **Coordinator succession.** If the coordinator becomes unavailable, how does someone else take over? This is not an edge case in this population.
4. **Email verification enforcement.** Currently soft. If ingestion runs off a forwarding address tied to the account, it may need to be hard.
5. **Caregiver accounts.** A paid aide may work for several families. One account across circles, or a per-circle account? Affects the invite flow and the ceiling in §5.
