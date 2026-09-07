# Round 33 — native Windows secret scan

At source head `54126448e07c92b1a5431612db337f08dbe59632`, Gitleaks **8.30.1** scanned **746 commits**, approximately 11.19 MB, in 6.26 seconds. Exit **0**, **no leaks found**. Scope was the reviewed branch's HEAD ancestry with repository `.gitleaks.toml`; the existing allowance for published Supabase demo JWTs was preserved. No new exclusion was added. This is a secret scan, not a general security audit.

The official Windows x64 release archive was downloaded from https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1 and checked against its published SHA256:

`d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`

The portable executable is MIT licensed and lives in the outer handoff workspace under `local-tools/gitleaks-8.30.1`, not in the application repository. No dependency, Docker service, subscription or CI workflow changed. This native version is recorded explicitly; it is not asserted to be the same binary as CI's pinned container digest.

From the isolated checkout, the repeatable command is:

```powershell
../local-tools/gitleaks-8.30.1/gitleaks.exe git . --log-opts=HEAD --config .gitleaks.toml --redact --no-banner --no-color --report-format json --report-path ../round33-gitleaks.json --timeout 120
```

Raw redacted report and log are `round33-gitleaks.json` and `round33-gitleaks.log` in the handoff workspace. The generated tester password file and other untracked outer-workspace files are outside this Git-history scan's scope. They are excluded from application deployment; a clean scan is not proof those files contain no credentials.

This supplies the previously missing native local secret-scan evidence. Full current aggregate tests, browser/accessibility and mixed-workload acceptance remain separate gates. The original full-suite result is still historical; nothing here promotes an application test or authorizes merge/production.
