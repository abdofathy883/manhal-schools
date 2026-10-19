# Assumptions

Decisions the PoC spec left open. Every item is a demo default, to be confirmed in the requirements-analysis session.

## Platform and tooling
- **Angular 21** (the scaffold's version). `@ng-bootstrap/ng-bootstrap@20`, `ng2-charts@10` and `@angular/cdk@21` are pinned because the latest majors require Angular 22.
- Bootstrap is the precompiled **RTL build**; the brand is applied through CSS custom properties and component-variable overrides (`src/styles/_tokens.scss`, `_theme.scss`) instead of Sass variable overrides.
- Build budgets were raised from the CLI defaults: initial 1.5 MB warn / 3 MB error (Angular + ng-bootstrap + Chart.js), component styles 8 kB warn / 16 kB error.
- `@angular/localize/init` is added as a polyfill because ng-bootstrap requires it.
- "Today" for seed data is the real current date at the time of the (re)seed; offsets are deterministic, absolute dates are not. Reset the demo data on the day of the meeting.

## Business rules (placeholders)
- **Passengers per bus = 23**; buses needed = `ceil(passengers / 23)` (derived from the 23–161 passenger range).
- **Approval limits:** ≤ 5,000 ر.س department manager only; > 5,000 adds الإدارة المالية; > 50,000 adds الإدارة العليا. Editable in `admin/limits`.
- **SLA targets** (hours, editable in `admin/sla`): طارئة 4, عاجلة 24, عالية 48, عادية 72, وقائية 168.
- Currency SAR (`ر.س`); weekend Friday/Saturday; week starts Sunday; mobile `05xxxxxxxx`.
- OTP is `123456` for every user; sessions live in `sessionStorage`.

## RBAC seed
- Roles are the 13 in the spec. Grants can be limited per service (`PermissionGrant.services`), e.g. the workshop sees `all` scope only for vehicle maintenance, violations and accidents.
- **Plain requesters cannot open vehicle services** (vehicle maintenance, traffic violation, traffic accident); those belong to workshop staff. The spec's "all services except warehouse-issue/purchase-approvals" was read as "every service a school employee would raise".
- `own` scope also matches records assigned to the user (so a technician with `own` sees only their assigned jobs).
- الإدارة العليا is read-only and does **not** get `request.view.confidential`, so confidential accidents/violations stay restricted to the workshop and complaints stay with مسؤول الشكاوى.
- Central staff (E1004, E1006–E1013) have no branch/department (`مركزي` / الإدارة).

## Seed data
- 12 vehicles (8 buses across the three branches), 10 drivers, 40 warehouse items (several at/below reorder level; `ACR-001` مكثف مروحة تكييف is out of stock to drive the guided scenario), 8 suppliers.
- Blocked days (holidays, exam days) are seeded relative to the reseed day (see phase 5).

## Authentication and Demo Mode (phase 2)
- Three wrong OTP codes lock the login form for 30 seconds; "resend" is available after 60 seconds. The SMS is a toast showing the code.
- The session is a base64 token in `sessionStorage` holding only the user id. The signed-in user is always re-read from the live mock database, so deactivating a user or editing their roles takes effect immediately.
- The demo-bar user switcher skips OTP, then navigates to `/home` (every role's home is the same role-aware page; the request widgets arrive in phase 3). A signed-out visitor is redirected to `/login?returnUrl=…`.
- `requiresAny` on a menu item / route means "any of these permissions". "طلب جديد" needs any `request.create.*`; "طلباتي" needs `request.view`, so the system admin (no request permissions) sees only the admin screens.
- The "السيناريو الموجّه" button is shown disabled until phase 9.

## Request engine (phase 3)
- **Lifecycle:** services that need review (vehicle maintenance, violation, accident, complaint) start at `جديد` → `قيد المراجعة` → approvals/routing. Services without review go straight to `بانتظار اعتماد` or, when no approver is needed, `معتمد` (routed to the executor, SLA clock starts at that moment).
- **Auto-approval:** building maintenance with priority طارئة, and bus bookings flagged `withinRules`. Everything else follows the chain in `domain/workflows/workflow-defs.ts`.
- **Separation of duties:** nobody can approve or reject their own request.
- **SLA:** the clock starts at routing, pauses while on hold, stops when the work is done (and resumes if the requester rejects the result). A background sweep every 30 s flags overdue requests, escalates them (طارئة → … to مسؤول الصيانة for building/works, الإدارة العليا otherwise) and notifies.
- **Confidential records** (accidents, violations, confidential complaints) need `request.view.confidential`; the requester always sees their own submission.
- **Internal comments** never leave the data layer for users without `request.comment.internal`; saving as a requester keeps the hidden ones in storage.
- **Notifications** are in-app plus a simulated channel log (WhatsApp / SMS / email) shown as toasts and in the bell's second tab. The channel log is a demo feature and shows deliveries across all users.
- **Seed data:** 80 requests built through the same engine (so timelines are consistent), 5–8 overdue, ~11 awaiting approval, ~8 awaiting confirmation, every status represented. Requesters other than the 15 demo users are background staff that do not appear in the user switcher.
- **Hero request:** instead of a pre-existing record, "تسرب/عطل في تكييف فصل 3/ب" is a request *template* (priority طارئة so it routes automatically). The guided scenario (phase 9) starts by submitting it, which keeps "run it live from step 1" possible without a duplicate.
- **Bus-booking cancellations** use `withinRules: false` in the seed so they are still cancellable (an auto-approved booking cannot be cancelled by the generic engine; the 3-day rule arrives with the booking service in phase 5).

## Services part A, approvals inbox, workbench (phase 4)
- **Service forms:** each service adds its own section to the shared request header (building maintenance, works, purchase, warehouse need, complaint). Required fields are enforced; purchase value comes from the items table (running total), works takes a typed value (filled from the optional items table if left empty). Priority and needed-by are not asked for complaints.
- **Executor-only data** of building maintenance (`details.execution` and `details.closure`: classification, specialty, method, inspection, parts, work done, test result, times, labour, and the closing decision / asset condition) is stripped in the data layer for users without `request.comment.internal`; requesters never receive it. Saving it also regenerates cost lines (`x-…`) from the parts table and labour hours at **60 ر.س/ساعة**.
- **Complaint → request link** is created on submit: the request gets a timeline entry written by the system (no complainer identity) and a link; the complaint keeps a link back.
- **Approvals inbox** shows requests whose current step this user can approve (their permission + scope), with approve / reject / return-for-completion (a reason is mandatory for the last two); "قراراتي السابقة" lists what the user already decided.
- **Workbench** columns: جديد (new, under review, approved) · قيد التنفيذ · معلّق · تم التنفيذ (executed, awaiting confirmation). Technicians only receive their assigned jobs; the assignment drawer shows each candidate's in-progress workload. Part requests do not yet trigger the warehouse/purchase chain (phase 6).
- **Complaints inbox** is the shared request list pre-filtered to the complaint service.

## Services part B, transport and fleet (phase 5)
- **Bus-booking rules** live in `domain/bookings/booking-rules.ts` (pure) and `core/bookings/booking.service.ts`; the form only advises, the service re-checks on submit. Lead time ≥ 7 days and the weekend/blocked-day, passenger (23–161), time-window (depart ≥ 07:15, return ≤ 12:15) rules are **hard errors**; the only soft outcome is "no capacity" → the booking joins the **waitlist**.
- **Availability by time window:** a branch-day has `busesPerDay` buses; usage at any minute is the sum of buses of overlapping bookings, and a request fits if the peak over its own window leaves enough buses. Waitlisted, rejected, cancelled and returned bookings hold nothing. Calendar colours: green free, amber partly taken, grey full or inside the 7-day lead time, hatched blocked.
- **Approval:** within the rules → auto-approved; waitlisted → pending the transport officer. A waitlisted booking cannot be approved from the generic inbox; the officer's "اعتماد من الانتظار" checks capacity first. Waitlisted/blocked data comes from `RequestRepository.inspect` (system query returning only non-personal availability facts), so requesters see true availability without seeing others' bookings.
- **Cancellation:** requester may cancel until 3 days before the trip, also after approval or allocation (not after the trip was executed).
- **Allocation** (`allocate` action): one row per bus — a school fleet bus + driver, or a **contracted (external) bus**, because the fleet owns fewer buses (8) than the branches' daily allowance (7/7/3). A fleet bus or driver cannot serve two overlapping trips; the same bus/driver cannot appear twice in one booking.
- **Blocked days** are `refLists.blockedDays`; the seed adds three upcoming ones (exams, holiday). Friday/Saturday are always blocked. Edits need `transport.calendar.manage` and are audited.
- **Internal events** get an extra approval (الإدارة العليا) above 400 attendees. On approval the ticked needs become **child requests** created in the event requester's name: bus booking (passengers = attendees clamped to 23–161, 08:00–12:00, always needs the transport officer), building maintenance (venue preparation), warehouse need (items agreed later). The event **closes automatically** once every child is closed/executed (cancelled/rejected children do not block, but at least one must be done).
- **Traffic accident** requires an attached Najm report (checked in the form and in the engine). Violations and accidents stay confidential (workshop + requester).
- **Fleet files:** cumulative cost = recorded maintenance costs + violation fines; highlights are the top 3 vehicles by cost and the top 3 drivers with at least 2 violations. Files only aggregate requests the viewer may already see.
- (Seed version history: v3 = phase 5, v4 = phase 6 below.) Phase 5 seed: 33 bus bookings (full / partly taken / scattered days over ~8 weeks, 3 waitlisted, 8 allocated), 25 fleet requests with deliberately repeating vehicles/drivers, and events with their children.

## Warehouse, purchasing and the cross-service chain (phase 6)
- **Stock changes only through `WarehouseRepository.apply`**, which updates item stock and the movement log together and refuses a change that would go below zero. Seed version is `manhal:v4`; the seeded issues consume stock, so inventory, movements and requests agree.
- **Stock check rule:** a requested line is issued **whole or not at all** (no partial issue). Lines the stock cannot cover become a **linked purchase request** raised in the executor's name (same branch/department as the parent, so the parent's department manager approves it); the parent goes `معلّق` (parts for maintenance, procurement for warehouse needs). `ACR-001` is out of stock for the demo.
- **Maintenance parts:** the executor picks a warehouse item in the parts table (fills name, number, unit price, source = stock), saves, then "فحص المستودع وصرف القطع". Vehicle maintenance now uses the same executor stages as building maintenance.
- **Warehouse need:** the keeper's "صرف من المستودع" issues the available lines, costs them at the item's unit price onto the request, and the requester confirms. Warehouse needs and purchases finish through issue / receipt, not the generic "تم التنفيذ".
- **Purchase flow:** quotes (3 suppliers, one selected) → purchase order → receipt + custody. Quotes are **required only above the department limit (5,000 ر.س)**; below it the PO can be issued directly. The PO must go to the selected supplier. The PO also writes the purchase cost line.
- **Receipt and custody** is recorded by `purchasing.receive` or `warehouse.stockin` holders and shown only to them (quotes/PO/receipt are executor-only data, redacted for requesters). Conditions: complete, or complete with notes (a note is required). The warehouse keeper may open purchase requests (view only) so they can receive restock purchases.
- **Restock purchases** (`details.forLines`) close on receipt without requester confirmation; the stock goes in, the lines are issued to the parent (two movements) and the parent **resumes by itself** (maintenance → `قيد التنفيذ`, warehouse need → awaiting confirmation) with a system timeline entry.
- **Cost roll-up:** a request's cost = parts + labour + purchases; linked child costs are shown beside it. For branch/department/vehicle totals, restock purchases are excluded (the stock issue carries that cost, so nothing is counted twice) and rejected/cancelled requests count as zero. Totals only cover requests the viewer may see.
- **Stock count** applies counted-minus-system differences as `adjust` movements and is audited; manual stock-in needs `warehouse.stockin`.

## Admin (phase 7)
- Every admin change goes through `AdminService`: it checks the matching `admin.*` permission, applies live (roles/users are read from the mock DB, so menus, guards and scopes update at once) and writes an audit entry with before/after values.
- **Permission matrix:** edits a draft copy; the unsaved bar shows the number of changes and a diff (added / removed / scope changed per role) before "حفظ". A permission shown with a funnel icon is limited to specific services; toggling the checkbox on removes all of the role's grants of that key, changing the scope keeps the service limits. Module header buttons grant/clear a whole module for a role.
- **Lock-out guard** (`lockOutReason`): the system administrator role always keeps `admin.rbac` (its checkbox is disabled), at least one active user must be able to administer permissions, and nobody can remove that ability from the account they are using or deactivate their own account.
- **Roles:** system roles are cloned, not edited or deleted; custom roles can be renamed and deleted only when nobody holds them. Role management is blocked while the matrix has unsaved changes.
- **Users:** employee ID `E` + 4 digits (unique), Saudi mobile `05xxxxxxxx`, at least one role, a department needs a branch. "عرض كـ هذا المستخدم" switches the demo identity without OTP.
- **Reference data:** specialties, vehicle maintenance types, trip purposes, complaint categories, vehicles, drivers and suppliers are editable. A record used by any request cannot be deleted (it is counted through the system query `RequestRepository.inspect`); warehouse items are managed on the warehouse screens and blocked days on the transport screen.
- **Approval limits:** saving rebuilds the approval chain of every request that has not been approved yet (decided steps are kept, no-longer-needed steps become skipped, a request whose steps are all done moves on) and notifies new approvers; the page previews how many requests are affected. The department limit must be above zero and the finance limit above it.
- **SLA hours:** saving updates the target of every open request (breach flags already raised stay).
- **Audit viewer:** filters by type, actor, date range and text, paging of 25, before→after detail, CSV export of the filtered rows.
