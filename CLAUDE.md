# Al-Manhal Support Services Platform — PoC conventions

Front-end-only, high-fidelity demo (Angular 21, standalone + signals). Everything is mocked in the browser.
Spec: `docs/manhal-poc-claude-code-prompt.md`; client proposal: `docs/Manhal_Support_Services_Platform_Proposal.pdf`.
Decisions the spec left open: `docs/ASSUMPTIONS.md`. Generic Angular/a11y rules live in `.claude/CLAUDE.md` and still apply.

## Language
- Code, comments, identifiers, docs: **English**. All user-facing UI text: **Arabic**. No English strings in the UI.
- Dates `dd/MM/yyyy`, Western digits (0-9), week starts Sunday, weekend Fri/Sat, currency `ر.س` (SAR). Use the pipes in `shared/pipes/format.ts` (`arDate`, `arDateTime`, `money`, `num`) — never raw `date`/`number` pipes. Hijri is a user toggle (`SettingsService.hijri`).

## RTL rules (hard requirement)
- `<html lang="ar" dir="rtl">`; Bootstrap's **RTL build** only (`bootstrap.rtl.min.css`). No Bootstrap JS, jQuery, or manual Popper. Interactive widgets come from `@ng-bootstrap/ng-bootstrap/<entry>` deep imports.
- **Logical utilities only:** `ms-* me-* ps-* pe-* text-start text-end float-start float-end border-start border-end rounded-start rounded-end start-0 end-0`. In custom CSS use logical properties (`margin-inline-start`, `inset-inline-end`, `border-inline-start`, `text-align: start`). **Never** write `left`/`right`/`margin-left`/`padding-right`/`float:left`.
- Pick direction-correct icons instead of flipping: "back" = `bi-arrow-right`, "next/forward" = `bi-arrow-left`, collapsed chevrons `bi-chevron-left`.
- Wrap numbers, ref numbers (`MNH-2026-000123`), plates, phones and English tokens in `class="ltr-inline"` (isolated LTR).
- Brand/theme lives in `src/styles/_tokens.scss` (CSS variables) and `src/styles/_theme.scss` (component overrides). No ad-hoc per-component colour overrides.

## Angular conventions
- Standalone only (never write `standalone: true`), `OnPush`, `input()`/`output()`, signals/`computed`, `inject()`, native control flow, reactive forms, `class`/`style` bindings (no `ngClass`/`ngStyle`), `host` object (no `@HostBinding`/`@HostListener`).
- Lazy-load every feature route (`loadComponent`/`loadChildren`). Feature code under `features/<name>/`; cross-cutting under `core/`; reusable UI under `shared/`; models, enums, reference + seed data under `domain/`.
- Keep component styles small (budget 8 kB warn / 16 kB error); shared styling goes in `_theme.scss`.

## Mock-API pattern
- Features depend on **abstract repository classes** in `domain/repositories.ts` (used as DI tokens). Mock implementations live in `core/mock-db/mock-repositories.ts` and are bound in `provideMockBackend()` — swapping to `HttpClient` must need zero UI changes.
- `MockDb` (`core/mock-db/mock-db.service.ts`) is a signal store persisted to `localStorage` under the versioned key `manhal:v<DB_VERSION>` (bump `DB_VERSION` when the seed shape changes). Reads/writes go through `latencyFrom()` (200–500 ms; tests provide `MOCK_LATENCY = [0,0]`).
- Seed data is deterministic (`SeededRandom` in `core/mock-db/prng.ts`) so "إعادة ضبط بيانات العرض" always restores identical data. Use `Clock` for "now".

## RBAC rules
- Permission keys are stable `module.action` strings from `domain/permission-catalog.ts`. Scoped permissions use `own < department < branch < all`; a grant may be limited to specific `services`. Effective permissions = union of the user's roles, highest scope wins per key.
- Auth: `AuthService` (session + OTP, demo switch), `authGuard`/`guestGuard`/`permissionGuard` (reads `data.requiresAny`), `PermissionService` (`can`, `canAny`, `scopeOf`, `visibleMenu`), `*can` directive. Pure logic is in `core/rbac/{scope,effective,evaluate}.ts` (unit-tested).
- Enforce in **three layers**: route guards (403 page), UI (`*can` directive / menu `requiresAny`), and the **repository layer** (a user must never *receive* out-of-scope records even if the UI is bypassed). Business rules (booking lead time, approval limits, file limits) live in services, never in components.
- Hide actions the user could never do; **disable with an Arabic tooltip** when they could but not now.
- Internal comments must never render for requesters. The admin role can never remove its own `admin.rbac`; system roles can be cloned but not deleted.
- RBAC edits apply live and are written to the audit log.

## Commands
- `npm start` dev server · `npm run build` production build (must be warning-free) · `npm test` vitest.
