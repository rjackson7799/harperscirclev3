# Exploring staging

The owner may explore the existing staging site while development continues. This is synthetic data, separate from production. Do not reset, reseed or remove this circle or the reusable tester while the owner is using it.

## Reusable tester

- Site: https://harperscirclev3-staging-preview.vercel.app
- Account: `harpers-circle-tester@example.invalid`, display name Family Circle Tester.
- Circle: `349ac6a1-d96c-4c21-b6e2-5cd33f7cee8b`, Synthetic Load Nell and Synthetic Load Marcus.
- Access: coordinator with ten subject/domain grants copied from the synthetic founder. No tasks were initially assigned to this tester.
- Generated password is in the local handoff folder's **Staging tester login.txt**, outside this repository. Do not copy it into source, reports or deployment uploads.
- The synthetic account was administratively confirmed specifically to support reusable password sign-in. This is not evidence of real email verification; its `.invalid` address cannot receive recovery messages.

Provisioning verified a fresh password sign-in (303 to this circle) followed by Home (200 with both subjects and upcoming content). Unlike earlier temporary HTTP probes, this tester and its grants remain available for the owner. Existing founder verification and credentials were not changed.

## Suggested exploration

1. On Home, open each subject and an upcoming event, then return using Home.
2. Browse Timeline and open event details. Check that names and dates make sense.
3. Open Tasks and inspect a task. The tester initially owns none; this is why its Home has no My tasks block.
4. Open People & roles and Care Inbox, then use search to find a synthetic record.
5. Try a narrower browser window and keyboard navigation if convenient. Report a confusing screen with its URL, the action taken and what you expected; a screenshot is useful.

Creating or editing synthetic records is fine. Later performance measurements must check actual fixture counts rather than assume the original counts survived exploration. Use only test documents: uploaded-document processing and email delivery are not fully enabled, so this is not yet an end-to-end ingestion or invitation trial.

## Owner observation

On September 7, 2026 the owner confirmed login worked and supplied a Chrome screenshot of this circle's Home. The screenshot shows the tester identity, both subject summaries, upcoming events and navigation. This is manual confirmation of that screen at desktop width. It does not establish all links, responsive/accessibility behavior, isolation, error states or the full browser suite. No coverage row is promoted from this observation alone.
