import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    "asServiceRole() is fenced to the §1.7 allowlist (artifact route, lib/auth/gotrue-admin). See lib/db/service-role.ts.",
};
const fenceChannels = {
  group: ["**/db/request-role", "**/db/maintenance", "**/db/role-pool"],
  message:
    "The request-role channel and maintenance boundary are reachable only through lib/hc/** (typed wrappers).",
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
  {
    name: "hc/db-fences",
    files: ["**/*.ts", "**/*.tsx", "**/*.mjs"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [fenceServiceRole, fenceChannels] }],
    },
  },
  {
    name: "hc/db-fences-lib-hc",
    files: ["lib/hc/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [fenceServiceRole] }],
    },
  },
  {
    name: "hc/db-fences-allowlist",
    files: ["lib/db/**", "app/api/artifact/**", "lib/auth/gotrue-admin.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
