# qa-kit

Portable agentic-QA for the shared-starter app fleet: tenant-isolation (IDOR), exploratory,
regression/visual/a11y/perf — driven from one config per app, run from four adapters.

The deterministic core (bundle-truth SHA check, round-trip pass/fail, tenancy rubric) is unit-tested
and **blocks**. The LLM tiers (exploratory, fix re-verification) are **advisory**.

---

## Install

qa-kit is consumed two ways, usually both:

**1. As a dependency** (so `node_modules/qa-kit/bin/*` and the `qa-kit/core` + `qa-kit/evals`
exports are importable from CI and scripts):

```jsonc
// package.json
{
  "dependencies": {
    "qa-kit": "github:TangoGroup/qa-kit#main"
  }
}
```

```bash
pnpm install
```

**2. As a Claude Code plugin** (so the `/qa-*` slash commands and agents are available locally):

```
/plugin install TangoGroup/qa-kit
```

The plugin exposes the commands `/qa-deploy-gate`, `/qa-tenancy`, `/qa-a11y`,
`/qa-persona-score`, `/qa-visual-eval`.

---

## Add `qa.config.ts`

Drop a `qa.config.ts` at the repo root. It is the single source of truth qa-kit reads
(every adapter resolves it via `mod.default.default ?? mod.default`):

```ts
import { defineQAConfig } from "qa-kit/core";

export default defineQAConfig({
  app: { name: "student-data", repo: "gloo/student-data" },
  qaKitVersion: "0.1.0",
  tenancy: {
    key: "campusId",
    scopeHierarchy: ["campus", "area", "region", "national"],
    accessHelper: "assertCampusAccess",
    bypassRoles: ["super_admin", "national_staff"],
  },
  personas: {
    source: "./e2e/_lib/personas.ts",
    loginAs: "loginAs",
    matrix: ["student_leader", "campus_staff", "area_director", "regional_director"],
  },
  envs: {
    staging: { baseUrl: "https://staging.example.com", healthPath: "/api/health" },
    prod: { baseUrl: "https://app.example.com", readOnly: true, healthPath: "/api/health" },
  },
  commands: {
    e2eRoundtrip: "pnpm e2e:roundtrip",
    healthPath: "/api/health",
  },
  findings: { dir: "qa-testing/findings", githubLabels: ["qa", "auto-found"] },
});
```

The deploy gate needs two things from the app:

- `commands.e2eRoundtrip` — the Playwright round-trip command (run with `PLAYWRIGHT_BASE_URL`
  pointed at the deployed URL).
- A health endpoint at `healthPath` (default `/api/health`) that returns `{ sha, buildTime, env }`,
  where `sha` is the commit baked into the **deployed** bundle (e.g. `NEXT_PUBLIC_BUILD_SHA` =
  `VERCEL_GIT_COMMIT_SHA`). The gate compares this against the SHA you expected to ship to catch
  stale/cached deploys.

---

## CI: the reusable deploy-gate workflow (`uses:`)

qa-kit ships a reusable (`workflow_call`) workflow at
`.github/workflows/qa-gate.yml`. It checks out the consumer (to `app/`) at `expected_sha` **and**
qa-kit itself (to a sibling `qa-kit/`), installs (pnpm + Node 22 + Playwright chromium), resolves
`qa.config.ts`, runs the gate via `pnpm exec tsx node_modules/qa-kit/bin/qa-deploy-gate.mjs`, and
uploads the findings as an artifact.

Two things make this work on a CI runner:

- **Sibling checkout (resolves the optional `link:` dep).** Consumers depend on qa-kit as an
  OPTIONAL `link:../qa-kit` dependency, kept optional so a normal app build (e.g. on Vercel) never
  breaks when qa-kit isn't present. On a CI runner there's no sibling qa-kit dir, so the link is
  dead and the gate can't run. The reusable workflow therefore checks out the consumer to `app/`
  and qa-kit to a sibling `qa-kit/` under the workspace — from `app/`, `../qa-kit` resolves — and
  the qa-kit checkout runs **before** `pnpm install` (pnpm only links the optional dep if its
  target already exists). qa-kit is a public repo, so no token is needed.
- **Run the bin via `tsx`, not `node`.** qa-kit's package `exports` point at TypeScript **source**
  (`qa-kit/core`, `qa-kit/evals` → `.ts`), and the bin imports from them. Plain `node` cannot load
  a `.ts` module, so the gate runs under `tsx` (which transpiles on import, exactly like the
  `pnpm exec tsx -e` config-resolution step). **The consumer must have `tsx` available** (a
  devDependency, or runnable via `pnpm exec tsx`).

A consuming repo references it from a thin caller wired to its own post-deploy trigger:

```yaml
# .github/workflows/qa-deploy-gate.yml (in the CONSUMER repo)
name: QA Deploy Gate
on:
  deployment_status:
  workflow_dispatch:
    inputs:
      url: { description: "Deployed URL", required: true }
      sha: { description: "Expected git SHA", required: true }

jobs:
  gate:
    if: >-
      github.event_name == 'workflow_dispatch' ||
      (github.event.deployment_status.state == 'success' &&
       contains(github.event.deployment_status.target_url, 'preview.gloo.us'))
    uses: TangoGroup/qa-kit/.github/workflows/qa-gate.yml@main
    with:
      deployed_url: ${{ github.event_name == 'workflow_dispatch' && inputs.url || github.event.deployment_status.target_url }}
      expected_sha: ${{ github.event_name == 'workflow_dispatch' && inputs.sha || github.sha }}
    secrets:
      anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

The gate **fails the deploy (exit 1)** on a critical finding — a bundle-SHA mismatch (the alias
points at a stale/cached build) or any round-trip failure. On failure, roll back the alias:
`vercel alias <previous-deployment-url> <alias> --scope team-gloo`.

qa-kit is a **public** repo, so the `uses: TangoGroup/qa-kit/...` reference resolves with no org
Actions-access setting and no token.

---

## The four run adapters

The same deterministic core + advisory LLM tiers run from four entry points:

1. **CI gate (post-deploy, blocking).** The `qa-gate.yml` reusable workflow above, called on the
   consumer's `deployment_status` trigger. Runs bundle-truth + round-trips against the freshly
   deployed URL; blocks on critical findings. This is the required check.

2. **Local slash commands (interactive).** With qa-kit installed as a Claude Code plugin, run
   `/qa-deploy-gate`, `/qa-tenancy`, `/qa-a11y`, `/qa-persona-score`, or `/qa-visual-eval` from
   the repo. `/qa-deploy-gate` also runs the **agentic fix re-verification** advisory tier
   (re-runs the original repro for each "fixed in this deploy" finding and reports any that still
   reproduce).

3. **Scheduled (cron).** Run the gate / audits on a schedule (e.g. a nightly
   `on: schedule` workflow, or via `workflow_dispatch`) against staging/prod to catch drift and
   regressions outside the deploy window.

4. **Post-deploy (the automatic path).** This is the CI gate (#1) triggered automatically by the
   platform's `deployment_status: success` event after every staging deploy — no manual step. The
   `workflow_dispatch` inputs (`url`, `sha`) give a manual re-run escape hatch.

---

## Direct runner usage

The deploy gate's deterministic core can be invoked directly (this is what `qa-gate.yml` runs).
Run it under `tsx` — the bin imports qa-kit's `.ts` source exports, which `node` cannot load:

```bash
pnpm exec tsx node_modules/qa-kit/bin/qa-deploy-gate.mjs \
  "$CFG" "$DEPLOYED_URL" "$EXPECTED_SHA" qa-testing/findings "$RUN_ID" "$DATE"
```

where `$CFG` is the JSON-serialized `qa.config.ts`:

```bash
CFG=$(pnpm exec tsx -e "import('./qa.config.ts').then(m=>process.stdout.write(JSON.stringify(m.default.default??m.default)))")
```
