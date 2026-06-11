# AGENTS Guide for `forward-hime`

## Project Overview
- This repository is a Koishi plugin: `koishi-plugin-forward-hime`.
- Main purpose: forward messages across multiple platform/group nodes inside configured forward groups.
- Source code lives in `src/`. Release build: `npm run build` (tsc declarations + esbuild bundle to `lib/index.js`, matching npm layout).
- Entry point: `src/index.ts` (`apply(ctx, cfg)` registers message event handlers).

## Key Modules
- `src/index.ts`: plugin bootstrap, event listeners (`message-created`, `message-deleted`, `message-updated`).
- `src/config.ts`: Koishi `Schema` config and `ConfigSet` type.
- `src/message.ts`: forwarding/deleting/editing message helpers, decorator fallback behavior.
- `src/cache.ts`: message mapping cache used for cross-platform delete/reply related flows.
- `src/decorator.ts` + `src/decorators/*`: message decoration per platform.

## Local Commands
- Install deps: `npm install`
- Lint: `npm run eslint`
- Format: `npm run format`
- Type declaration build check: `npx tsc -p tsconfig.json`

## Coding Conventions
- Language: TypeScript (ES modules).
- Formatting is enforced by Prettier:
  - tabs enabled (`useTabs: true`)
  - `tabWidth: 4`
  - semicolons required
  - double quotes preferred
  - trailing commas enabled
- Keep import ordering clean and avoid unused imports.
- Preserve existing naming and config field style in public config objects (e.g. `ForwardGroups`, `BotID`, `Guild`, `Platform`) to avoid breaking user configuration.

## Change Guidelines
- Prefer minimal, targeted edits; do not refactor unrelated files.
- Keep plugin behavior backward-compatible unless explicitly requested.
- When touching forwarding logic:
  - keep fallback path (`MsgDecoratorFallback`) intact;
  - do not remove cache writes that are required for cross-platform delete/trace logic.
- When touching config schema:
  - keep existing field names and defaults unless migration is clearly handled.

## Release (npm via GitHub Actions)

Trusted Publishing is configured on npm; pushing a semver tag publishes from `.github/workflows/release.yml`.

1. Bump `package.json` `version` (e.g. `1.4.0-alpha.1` for production alpha tests).
2. Commit, then tag and push: `git tag v1.4.0-alpha.0 && git push origin v1.4.0-alpha.0` (tag must match `v*.*.*`).
3. CI runs lint/tsc, then `npm publish` with provenance in the `npm-publish` environment.
4. Prerelease versions (`1.4.0-alpha.0`) publish to dist-tag `alpha` (from the prerelease id); stable versions update `latest`.
5. Install in production: `npm i koishi-plugin-forward-hime@1.4.0-alpha.0` or `@alpha`.

## Validation Checklist
- Run `npm run eslint`.
- Run `npx tsc -p tsconfig.json` to ensure declarations still emit correctly.
- If behavior changes in forwarding logic, manually verify:
  - one source node message is forwarded to sibling nodes in the same group;
  - delete propagation still works when cache is available.

## Commit / PR Notes
- Keep commit scope focused and explain user-visible behavior changes.
- Include verification commands in PR description.
- Do not include secrets or environment-specific values in commits.
