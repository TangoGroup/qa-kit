# The qa-kit Starter Contract

This is the minimal, hard-won contract that makes an app **qa-kit-ready**: a small set of
files and conventions that let the deterministic gate and the advisory LLM tiers run against
the app from CI, locally, on a schedule, and post-deploy — without ever breaking a normal
build or deploy.

There is no shared "starter" repo. The contract travels as a generator (`qa-kit/init`) that
applies it **in place** on any app — greenfield or existing. Run `/qa-init` to apply it
(recommended), or assemble the artifacts by hand using this document.

---

## 1. What the contract is — the 5 artifacts (and why each exists)

| # | Artifact | Why it exists |
|---|----------|---------------|
| 1 | **`qa.config.ts`** (repo root) | The single source of truth qa-kit reads. `defineQAConfig({...})` validates on load (throws on empty required fields) and every adapter resolves it via `mod.default.default ?? mod.default`. App-derivable fields (name, repo, surface globs) are filled; **human-only** fields (`tenancy.key`, `tenancy.accessHelper`, `personas`, `envs` baseUrls) are emitted as valid-but-`TODO_`-prefixed placeholders, so the config still loads while clearly flagging what to replace. |
| 2 | **`qa-kit` as an *optional* dependency** | `optionalDependencies: { "qa-kit": "github:TangoGroup/qa-kit#main" }`. Optional so a Vercel/CI install never hard-fails when qa-kit isn't resolvable in that environment; `github:` (qa-kit is public) so it resolves anywhere with no sibling clone needed. See §3 and §5. |
| 3 | **`qa.config.ts` in tsconfig `exclude`** | `qa.config.ts` imports `qa-kit/core`, an optional dep that is **absent on a Vercel build**. If the file is type-checked during `next build`, the build fails on the missing module. Excluding it from the type-check (it's only ever loaded by qa-kit's own `tsx` runner) keeps the app build green. See §3. |
| 4 | **`.github/workflows/qa-deploy-gate.yml`** | The thin **caller** of the reusable workflow `TangoGroup/qa-kit/.github/workflows/qa-gate.yml@main`. Wired to the app's own post-deploy trigger (`deployment_status: success`) plus a `workflow_dispatch` manual escape hatch. The gate blocks the deploy on a critical finding. |
| 5 | **`/api/health` build provenance** (documented, **not** auto-edited) | The deploy gate's bundle-truth check compares the SHA baked into the *deployed* bundle against the SHA you expected to ship — catching stale/cached deploys. The health route must return `{ sha, buildTime, env }`. Because the route is app-specific (and may not exist), `/qa-init` **prints the snippet** to add rather than blindly editing an unknown route. |

The health-route snippet (`app/api/health/route.ts`):

```ts
sha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "",
buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? "",
env: process.env.NEXT_PUBLIC_BUILD_ENV ?? "development",
```

…and `next.config` must inject those `NEXT_PUBLIC_BUILD_*` at build time (e.g.
`NEXT_PUBLIC_BUILD_SHA = VERCEL_GIT_COMMIT_SHA`).

> **Note — not in the contract:** there are intentionally **no `pnpm qa:*` package scripts**.
> The real interface is the slash commands (`/qa-tenancy`, `/qa-a11y`, `/qa-persona-score`,
> `/qa-visual-eval`, `/qa-deploy-gate`), the reusable CI workflow, and the arg-taking bins in
> `bin/`. qa:init documents these rather than adding unrunnable scripts.

---

## 2. How to apply it

### Recommended: `/qa-init`

Run the `/qa-init` slash command from the app's repo root. It is **idempotent** — re-running
only fills gaps and never clobbers an existing `qa.config.ts` or workflow. It:

1. Detects app facts (name, repo, Next App Router?, candidate surface globs, likely public routes).
2. Generates + writes the artifacts via `qa-kit/init` — `renderQaConfig` → `qa.config.ts`,
   `mergePackageJson` → `package.json`, `addTsconfigExclude` → `tsconfig.json`,
   `renderCiCaller` → the deploy-gate workflow.
3. Prints a TODO checklist for the human-only items (replace every `TODO_`, `pnpm install`,
   add the health-route provenance, set the CI `ANTHROPIC_API_KEY` secret).
4. Verifies the config loads:
   `pnpm exec tsx -e "import('./qa.config.ts').then(m=>{const c=m.default.default??m.default;console.log('qa.config valid:', c.app.name)})"`.

### By hand

1. Create `qa.config.ts` at the repo root (see the README for a full filled-in example).
   Fill `app`, `tenancy`, `personas`, `envs`, `surface`, `findings`.
2. Add `"qa-kit": "github:TangoGroup/qa-kit#main"` to **`optionalDependencies`** in `package.json`
   (use `link:../qa-kit` only for the co-developed reference — see §5).
3. Add `"qa.config.ts"` to the `exclude` array in `tsconfig.json`.
4. Add `.github/workflows/qa-deploy-gate.yml` calling
   `uses: TangoGroup/qa-kit/.github/workflows/qa-gate.yml@main` (see README for the full caller).
5. Ensure your `/api/health` route returns `{ sha, buildTime, env }` from the `NEXT_PUBLIC_BUILD_*`
   envs, and that `tsx` is available (devDependency or `pnpm exec tsx`).

---

## 3. Deploy-safety rules (the hard-won gotchas)

These are not optional polish — each one is a production failure that already happened once.

- **qa-kit MUST be an *optional* dependency.** A normal app build/deploy (e.g. on Vercel) does
  not have qa-kit's checkout/sibling available. A regular `dependencies` entry would hard-fail
  the install; `optionalDependencies` lets the install succeed and simply skip qa-kit when it
  can't be resolved in that environment.

- **`qa.config.ts` MUST be in tsconfig `exclude`.** It imports `qa-kit/core`, which is an
  *optional* dep that is **absent on the Vercel build**. If it's type-checked, `next build` fails
  with "cannot find module 'qa-kit/core'". Excluding it keeps the build green — the file is only
  ever loaded by qa-kit's own `tsx` runner, never by the app bundle.

- **The deploy gate runs the bin via `tsx`, not `node`.** qa-kit's package `exports` point at
  TypeScript **source** (`qa-kit/core`, `qa-kit/evals` → `.ts`), and the bins import from them.
  Plain `node` cannot load a `.ts` module, so the gate runs under `tsx` (which transpiles on
  import). **The consumer must have `tsx` available** (a devDependency, or runnable via
  `pnpm exec tsx`).

- **The reusable CI workflow checks out qa-kit as a sibling for `link:` apps.** The reusable
  `qa-gate.yml` checks out the consumer to `app/` and qa-kit to a sibling `qa-kit/` so a
  `link:../qa-kit` dep resolves on the runner, and does the qa-kit checkout **before**
  `pnpm install` (pnpm only links an optional `link:` dep if its target already exists).
  Apps that use the `github:` dep (the default for new apps) resolve qa-kit directly and don't
  rely on the sibling checkout. qa-kit is a public repo, so no token is needed either way.

- **Supabase-on-Vercel reads go via PostgREST, not direct Postgres.** Vercel's runner cannot
  reach Supabase's direct Postgres endpoint (it's IPv6-only). The dashboard ingest and any
  Supabase read from a Vercel/CI context must use the PostgREST HTTP API (the `QA_DASHBOARD_*`
  envs below point at the PostgREST URL + service key), not a `POSTGRES_URL` connection string.

---

## 4. The four run adapters + the dashboard ingest env

The same deterministic core (bundle-truth SHA check, round-trip pass/fail, tenancy rubric —
**blocking**) plus the advisory LLM tiers (exploratory, fix re-verification) run from four
entry points:

1. **CI gate (post-deploy, blocking).** The `qa-gate.yml` reusable workflow, called on the
   consumer's `deployment_status` trigger. Runs bundle-truth + round-trips against the freshly
   deployed URL; blocks on critical findings. This is the required check.
2. **Local slash commands (interactive).** With qa-kit installed as a Claude Code plugin, run
   `/qa-deploy-gate`, `/qa-tenancy`, `/qa-a11y`, `/qa-persona-score`, `/qa-visual-eval`, or
   `/qa-init` from the repo.
3. **Scheduled (cron).** Run the gate / audits on a schedule (e.g. a nightly `on: schedule`
   workflow, or via `workflow_dispatch`) against staging/prod to catch drift outside the deploy
   window.
4. **Post-deploy (the automatic path).** The CI gate (#1) triggered automatically by the
   platform's `deployment_status: success` event after every staging deploy — no manual step.
   The `workflow_dispatch` inputs (`url`, `sha`) give a manual re-run escape hatch.

**Dashboard ingest env.** Findings are best-effort upserted to the cross-app dashboard store
(a dedicated Supabase project read via PostgREST by the separate `TangoGroup/qa-dashboard` app)
when both of these are set in the run environment:

| Env var | Purpose |
|---------|---------|
| `QA_DASHBOARD_SUPABASE_URL` | The dashboard Supabase project's **PostgREST** base URL. |
| `QA_DASHBOARD_SERVICE_KEY` | The service-role key for the upsert. |

If either is unset, the gate skips ingest silently — findings still upload as a CI artifact and
the gate still blocks on criticals. Ingest never fails the gate.

---

## 5. `link:` vs `github:` — which dep spec to use

| Consumer | Dep spec | Why |
|----------|----------|-----|
| **New / any other app** (the default) | `github:TangoGroup/qa-kit#main` | qa-kit is **public**, so this resolves anywhere — CI runners, teammates, Vercel — with **no sibling clone**. This is what `/qa-init` writes. |
| **The co-developed reference (`student-data`)** | `link:../qa-kit` | A special case: student-data and qa-kit are developed side-by-side in sibling dirs, so the local link picks up in-progress qa-kit changes without a publish/commit cycle. The reusable CI workflow's sibling-checkout (§3) exists precisely so this `link:` resolves on a runner. |

In **both** cases the dep stays under `optionalDependencies` (§3). `/qa-init`'s
`mergePackageJson` never overwrites an existing `qa-kit` entry, so re-running it on student-data
leaves the `link:` intact.

---

## 6. The RBAC dimension (oracle lattice + live tournament)

The `rbac` dimension verifies that an app's per-role field access forms a **strict-subset
lattice**: a narrower role must never see or edit a field that the adjacent broader role can't.
It runs in two complementary modes — a deterministic gate (blocking) and a live tournament
(advisory).

### 6.1 The oracle contract

For the deterministic check, the app's `rbac.fieldVisibility` module **must export** two
functions:

```ts
export function getVisibleContactFields(role: string, globalRole?: string | null): string[];  // ["*"] = all
export function getEditableContactFields(role: string, globalRole?: string | null): string[]; // ["*"] = all
```

Each returns the field names the given role may **view** / **edit**, or the universal sentinel
`["*"]` meaning "all fields" (used for broad roles that are unrestricted). The contract is just
those two function names + the `string[] | ["*"]` return shape — an app whose oracle lives
elsewhere or is named differently simply points `rbac.fieldVisibility` at a module that
re-exports under these names. (student-data's `lib/rbac.ts` already satisfies this.)

### 6.2 `qa.config.rbac` shape

```ts
rbac?: {
  fieldVisibility?: string;   // path to the oracle module (the two fns above) — required to run
  roles?: string[];           // role lattice, narrowest → broadest; falls back to personas.matrix
  screens?: string[];         // optional high-risk screens for the live tournament
};
```

`roles` is the lattice ordering (narrowest first). When absent, the runner falls back to
`personas.matrix`. `screens` only feeds the live tournament; when omitted the tournament uses a
sensible default set.

### 6.3 The strict-subset invariant

For each adjacent `(narrower, broader)` pair down the lattice, every field the narrower role can
view/edit **must** also be in the broader role's set. `["*"]` on the broader role covers
everything (no violation). The worst case is an **inversion**: a narrower role is universal
(`["*"]`) while the broader role is restricted — always flagged `critical`. Otherwise severity is
classified by field sensitivity (donor/consent/PII → critical; demographic → high; identity
contact fields → medium; cosmetic/timestamps → low; unknown → medium).

### 6.4 Deterministic gate (blocking) vs live tournament (advisory)

| Mode | Source of field sets | Blocks? | `verifiedBy` |
|------|----------------------|---------|--------------|
| **Deterministic lattice gate** (`bin/qa-rbac.mjs`) | imports the app oracle via `tsx`, calls the two fns per role, checks the lattice — no browser, CI-able | **Yes** — exits 1 on a critical lattice violation | `deterministic` |
| **Live tournament** (`workflows/qa-rbac-tournament.js`) | drives each role through high-risk screens with Playwright, snapshots *rendered* fields, a judge compares observed vs oracle + the subset invariant | **No** — advisory (consistent with the other LLM tiers) | `tournament` |

The deterministic gate is the genuinely new, CI-able core: it catches an oracle that violates
the lattice (e.g. a regression that restricts a broader role while a narrower role keeps a
field). The live tournament catches UI that **leaks** a field the oracle says is hidden, and
non-monotonic / write→read anomalies the static oracle can't express. Both emit the uniform
`Finding` with dimension `rbac`.
