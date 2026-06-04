---
description: Bootstrap the qa-kit contract into this app (qa.config.ts, dep, tsconfig exclude, CI caller).
---

Bootstrap qa-kit into the current repo. Idempotent — re-running only fills gaps.

1. **Detect app facts** from the repo root: app name + repo (from `package.json` `name`/`repository`, fall back to the dir + git remote); whether it's a Next App Router app; candidate surface globs (server actions = `app/**/actions.ts` or the route-group form `app/(app)/**/actions.ts` if a route group exists; API routes = `app/api/**/route.ts`); likely public routes (`app/api/auth/**`, any `app/api/embed/**`, capture/intake routes).
2. **Generate + write the artifacts** using `qa-kit/init`:
   - `qa.config.ts` (repo root) via `renderQaConfig({appName, repo, actions, apiRoutes, publicRoutes})` — only if absent (never clobber an existing one).
   - `package.json` via `mergePackageJson(pkg)` — adds the `qa-kit` optionalDependency; write back preserving formatting/key order as much as possible.
   - `tsconfig.json` via `addTsconfigExclude(tsconfig)` — adds `qa.config.ts` to `exclude`.
   - `.github/workflows/qa-deploy-gate.yml` via `renderCiCaller()` — only if absent.
3. **Print a TODO checklist** for the human-only items the scaffolder can't infer:
   - Replace every `TODO_` in `qa.config.ts` (tenant key, access-guard fn, bypass roles, personas matrix + loginAs/source, env baseUrls).
   - Run `pnpm install` so the `qa-kit` dep resolves (public github dep — no sibling clone needed).
   - For the deploy gate: add build provenance to your health route so bundle-truth works — show this snippet to add to (or create) `app/api/health/route.ts`:
     ```ts
     sha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "",
     buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? "",
     env: process.env.NEXT_PUBLIC_BUILD_ENV ?? "development",
     ```
     and ensure `next.config` injects those `NEXT_PUBLIC_BUILD_*` at build time.
   - In CI, set the `ANTHROPIC_API_KEY` secret (used by the gate's advisory tier).
4. **Verify**: run `pnpm exec tsx -e "import('./qa.config.ts').then(m=>{const c=m.default.default??m.default;console.log('qa.config valid:', c.app.name)})"` and report it loads (the TODO_ placeholders are valid, so it should). Print the list of files created/changed.

Do not modify application logic — only the contract files above.
