# AGENTS.md

## Mission-critical orientation
- This is a Yarn v1 monorepo (`package.json`) with three workspaces: `excalidraw-app`, `packages/*`, `examples/*`.
- Core boundary: reusable editor library lives in `packages/excalidraw/`; product app lives in `excalidraw-app/`.
- Internal packages are consumed through aliases (`vitest.config.mts`) such as `@excalidraw/common`, `@excalidraw/element`, `@excalidraw/math`, `@excalidraw/utils`.

## Where to implement changes
- Editor/runtime behavior for embedders: start in `packages/excalidraw/`.
- App-only behavior (share flow, collab UI, PWA, app menus): start in `excalidraw-app/`.
- Geometry/math utilities and types: `packages/math/src/*` (use existing branded tuple point types from `packages/math/src/types.ts`).
- Element model and element utilities: `packages/element/src/*`.

## Big-picture architecture (with concrete anchors)
- Public component entry is `packages/excalidraw/index.tsx` (`Excalidraw` memoized wrapper + exports).
- App composes the library in `excalidraw-app/App.tsx` and wires app concerns (Jotai store, dialogs, share/collab, theme, language).
- Collaboration path:
  - Link parsing + room/key generation in `excalidraw-app/data/index.ts`.
  - Realtime orchestration in `excalidraw-app/collab/Collab.tsx` (portal + sync + presence).
  - Persistence/encryption in `excalidraw-app/data/firebase.ts` (Firestore + Storage, encrypted payloads).
- Local-first persistence and migration logic is centralized under `excalidraw-app/data/LocalData*`.

## Workflow commands agents should actually run
- Install: `yarn` (root).
- App dev server: `yarn start` (delegates to `excalidraw-app`).
- Package builds: `yarn build:packages`; full app build: `yarn build`.
- Required checks before finishing: `yarn test:typecheck` and `yarn test:update` (repo convention in `CLAUDE.md`).
- Fast validation options: `yarn test:app --watch=false`, `yarn test:code`, `yarn fix`.

## Project-specific coding conventions (derived from repo AI instructions)
- TypeScript 5.9+ (`package.json`); use modern TS features (satisfies, const type params, etc.).
- Prefer immutable values (`const`/readonly) and low-allocation/perf-conscious paths.
- Use functional React components + hooks for new React code; keep components focused.
- Naming: PascalCase for components/types, camelCase for values/functions, ALL_CAPS for constants.
- Use optional chaining / nullish coalescing when handling optional values.
- For async flows, wrap with `try/catch` and log errors with context.

## Adding new element types — critical touch points
When adding a new element type (e.g. `"table"`), these files contain exhaustive type switches or union checks that **must** be updated:
- `packages/element/src/types.ts` — define type, add to `ExcalidrawElement` union and relevant sub-unions (`ExcalidrawRectanguloidElement`, `ExcalidrawBindableElement`)
- `packages/element/src/typeChecks.ts` — `isExcalidrawElement()` uses `assertNever` pattern; add `case` or it will fail at compile time. Also update `isBindableElement()`, `isRectanguloidElement()`.
- `packages/element/src/comparisons.ts` — `hasBackground()`, `hasStrokeColor()`, `hasStrokeWidth()`, `hasStrokeStyle()`, `canChangeRoundness()`
- `packages/element/src/shape.ts` — `generateRoughOptions()` switch, `_generateElementShape()` switch
- `packages/element/src/renderElement.ts` — `drawElementOnCanvas()` switch, `renderElement()` switch
- `packages/element/src/newElement.ts` — factory function for the new type
- `packages/excalidraw/types.ts` — `ToolType` union
- `packages/excalidraw/components/shapes.tsx` — `SHAPES` array (each entry has `icon`, `value`, `key`, `numericKey`, `fillable`, `toolbar`)
- `packages/excalidraw/components/App.tsx` — tool dispatch in `handleCanvasPointerDown` (around line 7600+)
- `packages/excalidraw/data/restore.ts` — element restore/migration

## Integration and external systems to respect
- Firebase (`firebase/app`, Firestore, Storage) powers collab scene/file persistence.
- `socket.io-client` is used for realtime collaboration transport.
- End-to-end encrypted sharing/collab data uses `@excalidraw/excalidraw/data/encryption` utilities.
- Sentry and app analytics exist in app layer; avoid leaking app-only concerns into library packages.

## High-signal files to read first
- `package.json`, `vitest.config.mts`, `CLAUDE.md`, `.github/copilot-instructions.md`
- `packages/excalidraw/index.tsx`
- `packages/element/src/types.ts`, `packages/element/src/typeChecks.ts`
- `excalidraw-app/App.tsx`, `excalidraw-app/collab/Collab.tsx`, `excalidraw-app/data/index.ts`
