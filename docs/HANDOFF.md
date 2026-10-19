# Hand-off — Al-Manhal Support Services Platform (front-end PoC)

Read this first in a new session, then `CLAUDE.md` (conventions), `docs/ASSUMPTIONS.md` (decisions made) and the spec `docs/manhal-poc-claude-code-prompt.md`. The client proposal is `docs/Manhal_Support_Services_Platform_Proposal.pdf`.

## Status: phases 1–7 of 9 are built. Nothing is committed to git.

| Phase | Scope | State |
|---|---|---|
| 1 | Foundation: Bootstrap RTL, theme, fonts, RTL shell, UI kit, mock DB, seed users/roles/reference data | Done |
| 2 | Login (employee ID + OTP `123456`), Demo bar + user switcher, RBAC engine, guards, `*can`, 403 page | Done |
| 3 | Request engine: workflow rules, approval chain, SLA + auto-escalation, notifications, audit, repositories with scope filtering, 80 seeded requests, catalog/create/list/detail pages | Done |
| 4 | Service forms (building maintenance, works, purchase, warehouse need, complaint), approvals inbox, executor workbench, executor stages (inspection/parts/cost/closure), complaints inbox | Done |
| 5 | Vehicle maintenance, violation, accident, internal event (child items), bus booking + availability calendar + transport screens, vehicle and driver files | Done |
| 6 | Warehouse + purchasing screens, cross-service linking (maintenance → warehouse → purchase → back), cost roll-up | Done |
| 7 | Admin: RBAC matrix UI, users, reference data, SLA, approval limits, audit viewer | Done |
| 8 | Dashboards and reports (Chart.js), CSV export | **Not started** |
| 9 | Guided scenario, polish, RTL/a11y audit, README, static-host config | **Not started** |

Phase 5 verified in the browser: bus booking (calendar colours, waitlist on a full day), transport screens (queue, waitlist, allocation dialog, day detail), event approval spawning three child requests, violation form, accident without Najm report blocked, fleet overview + vehicle file. Not exercised in the browser: event auto-close (needs all children finished), the 3-day cancellation block, vehicle-maintenance form, driver file page. Phase 6 verified in the browser: the full hero chain (technician flags out-of-stock capacitor → request on hold + linked purchase → department approval → PO → receipt by the keeper → parent back to in-progress), warehouse inventory / issue queue / movement log, purchasing queue, quotes form, cost roll-up card. Not exercised in the browser: stock-in form, stock count, issue with shortage from the queue, quotes-required block above 5,000. Phase 7 verified in the browser: matrix edit → unsaved bar + diff → save → audit entry and the requester immediately loses the permission; admin lock; limits preview + recompute (3 requests), self-deactivate guard, add user, reference delete refused while in use / add works, audit paging. Not exercised in the browser: role create/clone/rename/delete, SLA page, vehicles/drivers/suppliers tabs, CSV export, "عرض كـ". Phases 1–4 verified earlier: login/OTP lock, user switching, 403, scope isolation (Rayyan users never get Taawun data), the full building-maintenance path Nora → Fahd → Majed → Sultan → Nora → Majed (closed, rated), purchase approval chain (Hind → Reem), warehouse stock warnings, complaint → request link, complaints inbox, workbench assignment drawer. Production build is warning-free (initial bundle ≈ 993 kB raw).

## Working rules the user set
- **Skip unit tests** from phase 4 on: verify with `ng build` plus the browser only. Ten spec files exist (75 tests passed at the end of phase 3); they were **not re-run after the phase-4 engine/redaction changes**, so run `npx ng test --watch=false` once before trusting them (engine, redaction, seed and repository specs are the ones most likely to be affected).
- Build phase by phase; after each phase run `ng build`, check in the browser, summarise, then continue.
- UI text is Arabic/RTL only; code, comments and docs are English. Logical CSS properties only (no left/right).

## Run / verify
```bash
npm start            # dev server (port 4200; the preview tool may pick 4201)
npm run build        # must stay warning-free
npx ng test --watch=false
```
Demo data is in `localStorage` under `manhal:v4`; clear it (or use the demo bar's reset) after any seed change. Demo users E1001–E1015 are in `src/app/domain/seed/users.seed.ts`; OTP is always `123456`; the demo bar's dropdown switches identity without OTP.

## Architecture (where things live)
```
src/app/
  domain/        models, enums, reference data, permission catalog, seeds, workflows (engine, chain, SLA)
  core/          auth, rbac (scope/effective/evaluate/permission.service/can.directive/redaction/request-visibility),
                 mock-db (store + mock repositories + latency), requests (RequestService, SlaMonitor, attachment rules),
                 notifications, demo-mode, layout (shell, sidebar, menu.config), live-resource, settings
  shared/        ui kit (status badge, timeline, stat card, SLA badge, uploader, star rating …), pipes (dates, money), csv util
  features/      auth, home, requests (catalog, form + sections/, list, detail, executor-stages, action dialog/runner),
                 approvals, workbench, notifications, dev (UI kit smoke page at /dev/kit)
```
Key patterns:
- **System queries:** `RequestRepository.inspect(fn)` runs over all requests bypassing scope; use it only to return non-personal facts (bus occupancy, child statuses). `BookingService` (`core/bookings`) owns bus rules; `RequestService` owns event child spawning/auto-close (`afterEventRules`).
- **Repositories** are abstract classes in `domain/repositories.ts`, implemented by mocks in `core/mock-db/mock-repositories.ts`. The request repository enforces scope, confidentiality and internal-data redaction **in the data layer**.
- **Workflow engine** (`domain/workflows/engine.ts`): one `RULES` table gives permission check, state precondition, effects and the action-bar descriptor. Services differ only through `workflow-defs.ts` (review required, approval chain, confirmation, escalation target). `perform()`, `createRequest()`, `addComment()`, `sweepSla()` are pure; `RequestService` builds the context and persists request + notifications + audit.
- **Service form sections** (`features/requests/sections/*`) extend `ServiceSectionBase`: they add/remove controls on the parent's `details` group. New services in phase 5 should follow this.
- **`liveResource`** refetches on `DataVersion` bumps without flashing a skeleton; use it for any list/detail page.
- **ActionRunner** opens the input dialog and performs an engine action; reuse it from any new screen.
- Executor-only data lives in `details.execution` / `details.closure` (see `domain/models/execution.ts`) and is redacted for non-executors.
- Seed requests are generated **through the engine** (`domain/seed/requests.seed.ts`), so timelines are consistent; background requesters (not selectable users) fill other branches/departments.

## What the remaining phases need (from the spec, with notes)
**Phase 5 — done, see `docs/ASSUMPTIONS.md` (phase 5). The notes below are the original brief.**
- Forms: vehicle maintenance (plate lookup from fleet, driver, type), traffic violation (violation no., date, driver lookup, amount), traffic accident (date, location, at-fault, fault %, **Najm report required**), internal event (date, place, attendees, needs checklist → spawns child items: bus booking, venue prep → maintenance, warehouse materials; auto-closes when all children complete), bus booking (trip code, branch daily capacity 7/7/3, passengers 23–161, `ceil(pax/23)` buses, departure ≥ 07:15, return ≤ 12:15, **booking ≥ 7 days ahead, cancellation blocked < 3 days**, time-window availability, blocked days (Fri/Sat, holidays/exams), **waitlist**, long pledge text + required checkbox capturing identity). Rules belong in a `BookingRulesService`, not components.
- Screens: interactive availability calendar (green/grey/amber/hatched, updates live), transport officer screens (calendar manage, bookings queue, allocate bus + driver, waitlist, blocked days), vehicle file and driver file pages (aggregate maintenance, violations, accidents, cumulative cost).
- The engine already has the workflow definitions for these services; the seed already contains sample requests with the expected `details` keys. Bus-booking cancellation currently only works while pending approval (see ASSUMPTIONS); the 3-day rule needs adding.
- The `/fleet` and `/transport` routes are still placeholder stubs in `app.routes.ts` (`stub(...)`), as are `/warehouse`, `/purchasing`, `/reports` and all `/admin/*`.

**Phase 6 — done (see `docs/ASSUMPTIONS.md`, phase 6); original brief:** warehouse screens (stock, low-stock badges, issue queue, stock-in, audit/count), purchasing screens (queue, 3-supplier quote comparison, PO, receipt + custody section visible only to the receiver). Cross-service chain: technician flags a part (`needsParts` is already recorded and emits a `part_requested` event) → stock check → auto-issue or **linked purchase request**, original → `معلّق: بانتظار قطع`, goods received → original returns to `قيد التنفيذ` automatically. `ACR-001` (AC fan capacitor) is deliberately out of stock for the demo. Also cost roll-up (parts + labour + purchases per request → branch → department → vehicle) and the reusable linked-requests panel (exists: `LinkedRequestsPanelComponent`).

**Phase 7 — done (see `docs/ASSUMPTIONS.md`, phase 7); original brief:** `/admin/rbac` permission matrix (modules × roles, scope selector, unsaved-changes bar with diff, effective-permissions panel using `EffectivePermissionsPanelComponent`, lock-out guard for `admin.rbac`, system roles cloneable not deletable), users, reference data CRUD, SLA hours, approval limits (chain must recompute — `recomputeChain` exists), audit viewer (data is already written by every action; `AuditRepository.list` requires `admin.audit`). RBAC edits already apply live; they must also write audit entries.

**Phase 8** — Chart.js dashboards (executive, maintenance, fleet, transport, procurement/warehouse, quality) with date/branch filters and CSV export (`downloadCsv` exists). Home widgets for executives.

**Phase 9** — guided scenario (10 steps through the real engine; floating RTL stepper; the demo bar's "بدء السيناريو الموجّه" button is currently disabled). The hero request is the template `tpl-ac-fault-hero` (priority طارئة so it routes without approval), not a pre-existing record. Then RTL/a11y/AXE audit, responsive checks, `README.md` (run, build, reset, user table, demo script), final `docs/ASSUMPTIONS.md`, SPA-fallback configs (`_redirects`, `vercel.json`, `404.html`), offline check.

## Known gaps / small items
- The request form page has no "expected approval path" side panel (a side session's version replaced mine in phase 3; the purchase section shows its own chain preview).
- `request.export` is only granted to some roles, so requesters see no export button.
- The workbench for the central workshop shows vehicle services but has no vehicle/driver file links yet.
- Notification "channel log" is a demo feature and shows deliveries across all users.
- Bell/notification pages and the SLA sweep (every 30 s) work on the real clock; seeded data is generated relative to the day it was seeded — reset the data on the day of the meeting.
- A stale console message about breadcrumbs in the browser tool is old buffer noise, not a current error.

## Tooling gotchas (learned the hard way)
- **Do not put large multi-file heredocs or Arabic-heavy Python in one `Bash` call** — several failed with "unexpected EOF". Use the Write tool for files; for patches write a small `.py` file to the scratchpad (with Write) and run it.
- The Browser preview pane can be tiny (≈360 px wide). Emulated viewports make screenshots unreliable; verify with `javascript_tool` (read DOM, click, fill) instead, and reset the viewport afterwards.
- Another Claude session ("btw: skip tests") once overwrote the request form files while the main session was working. Check `git status`/file contents before building on a file that "changed on disk".
- ng-bootstrap is pinned to v20, ng2-charts to v10, CDK to v21 (Angular 21); the latest majors need Angular 22.

## Suggested prompt to start the next chat
> Continue the Manhal PoC. Read `docs/HANDOFF.md`, `CLAUDE.md` and `docs/ASSUMPTIONS.md` first. Phases 1–7 are done and uncommitted. Start Phase 8 (Chart.js dashboards and reports with date/branch filters, CSV export, executive widgets on home). Verify with `ng build` and the browser only (no unit tests), and run the existing test suite once at the start to see whether the phase-4 changes broke anything.
