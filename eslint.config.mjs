import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// ----------------------------------------------------------------------------
// The §1.7 import fences (A2). Three modules carry authority the app must
// not reach casually; each is import-restricted so a stray import reds CI
// rather than shipping (the CI grep in scripts/check-service-role-
// containment.mjs is the un-bypassable second belt for the credential name).
//
//   lib/db/service-role   → the artifact route (§1.3) + the single GoTrue
//                           admin wrapper (lib/auth/gotrue-admin.ts, A3/A8)
//   lib/db/request-role   → lib/hc/** only (the typed hc.* wrappers — the
//                           ADR-0013 F1 server channel)
//   lib/db/maintenance    → lib/hc/** only (the enumerated postgres-boundary
//                           identity writes 2A left to the app layer)
//   lib/db/role-pool      → lib/db internals only
// ----------------------------------------------------------------------------

const fenceServiceRole = {
  group: ["**/db/service-role"],
  message:
    "The service credential is fenced to the §1.7 allowlist (artifact route, lib/auth/gotrue-admin, lib/storage — ADR-0018 F2). See lib/db/service-role.ts.",
};
const fenceChannels = {
  group: ["**/db/request-role", "**/db/maintenance", "**/db/role-pool", "**/db/evidentiary"],
  message:
    "The request-role channel and the maintenance/evidentiary boundaries are reachable only through lib/hc/** (typed wrappers).",
};
// 4B (ADR-0018 F2): the storage plane — every byte in the artifacts and
// quarantine buckets moves through lib/storage/** on the service
// credential's storage surface (M7 ships ZERO storage policies; the
// absence is the §3.11 mechanism). Importable only by the pipeline
// surfaces: the inbound webhook, the workers, upload, the artifact route.
const fenceStoragePlane = {
  group: ["**/storage/artifacts", "**/lib/storage/**"],
  message:
    "The storage plane (lib/storage) is fenced to the pipeline surfaces: app/api/{inbound,worker,upload,artifact}/**.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // --------------------------------------------------------------------------
  // The §8.7 a11y floor (D2, A11Y-05) — landed before the first component so
  // "CI checks from the first component" is literal. flat/recommended as the
  // base (explicit devDep pinning the version; the rules resolve against the
  // full-parity plugin instance eslint-config-next already registers —
  // re-registering here trips flat config's redefine guard), every rule at
  // ERROR, plus the one rule §8.7 names that recommended leaves off: an
  // accessible label on every icon-only control. Driven through the ESLint
  // API by tests/lint/a11y-fence.test.ts.
  // --------------------------------------------------------------------------
  {
    name: "hc/a11y",
    files: ["**/*.tsx", "**/*.jsx"],
    rules: {
      // recommended, every enabled rule elevated to error; the entries
      // recommended deliberately turns OFF stay off (label-has-for is
      // deprecated in favour of label-has-associated-control, which is on).
      ...Object.fromEntries(
        Object.entries(jsxA11y.flatConfigs.recommended.rules).map(
          ([rule, setting]) => [
            rule,
            setting === "off" || setting === 0
              ? "off"
              : Array.isArray(setting)
                ? ["error", ...setting.slice(1)]
                : "error",
          ],
        ),
      ),
      // §8.7's named rule. Form fields are carved out: the rule reads only
      // the control's own attributes and never the wrapping <label>, so it
      // false-positives on the accessible nested-label pattern the screens
      // use — label-has-associated-control (on, at error) owns form-field
      // labeling; this rule owns every OTHER interactive control, which is
      // exactly the icon-only-button case §8.7 names. An orphan input that
      // slips both is caught at render truth by the D7 axe legs.
      "jsx-a11y/control-has-associated-label": [
        "error",
        { ignoreElements: ["input", "select", "textarea"] },
      ],
    },
  },
  {
    name: "hc/db-fences",
    files: ["**/*.ts", "**/*.tsx", "**/*.mjs"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [fenceServiceRole, fenceChannels, fenceStoragePlane] },
      ],
    },
  },
  {
    name: "hc/db-fences-lib-hc",
    files: ["lib/hc/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [fenceServiceRole, fenceStoragePlane] }],
    },
  },
  // The storage-plane consumers: bytes may move here, the channels and
  // the raw service credential still may not.
  {
    name: "hc/db-fences-storage-consumers",
    files: ["app/api/inbound/**", "app/api/worker/**", "app/api/upload/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [fenceServiceRole, fenceChannels] }],
    },
  },
  // The storage module itself: the service credential's storage plane is
  // its whole purpose; the channels stay out.
  {
    name: "hc/db-fences-storage-module",
    files: ["lib/storage/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [fenceChannels] }],
    },
  },
  // The artifact route (§1.3): service credential + storage plane; the
  // channels stay out. gotrue-admin: service credential only.
  {
    name: "hc/db-fences-artifact-route",
    files: ["app/api/artifact/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [fenceChannels] }],
    },
  },
  {
    name: "hc/db-fences-gotrue-admin",
    files: ["lib/auth/gotrue-admin.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [fenceChannels, fenceStoragePlane] }],
    },
  },
  {
    name: "hc/db-fences-lib-db",
    files: ["lib/db/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
