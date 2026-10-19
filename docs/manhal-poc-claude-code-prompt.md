# Claude Code Prompt — Al-Manhal Integrated Support Services Platform (PoC)

> Paste everything below the line into Claude Code. Put the proposal PDF in `docs/Manhal_Support_Services_Platform_Proposal.pdf` first so Claude Code can read it for reference.

---

## 0. How to work

You are building a **front-end-only, high-fidelity, interactive proof of concept** that I will demo live to a school-group client. It must *feel like the finished product*. Everything is mocked in the browser: no backend, no real identity.

Work process:
1. **Start in plan mode.** Read `docs/Manhal_Support_Services_Platform_Proposal.pdf` fully, then produce a short plan (folder structure, data model, RBAC design, phase list) and wait for my approval.
2. After approval, build **phase by phase** (Section 15). After each phase: run `ng build`, fix all errors and warnings, run the app, and summarise what works before starting the next phase.
3. Create a `CLAUDE.md` in the repo root early (conventions in this prompt: RTL rules, RBAC rules, naming, mock-API pattern) and keep it updated.
4. Do not ask me questions that this document answers. For anything unspecified, choose the most realistic option, record it in `docs/ASSUMPTIONS.md`, and continue.
5. Write all code, comments, identifiers and docs in **English**. All **user-facing UI text is Arabic** (RTL). Never leave placeholder English strings in the UI.

---

## 1. Context

**Client:** مدارس المنهل (Al-Manhal Schools) — a private school group with **3 branches**: فرع التعاون, فرع المربع, فرع الريان. Each branch has departments: KG, الابتدائي بنات, الابتدائي بنين, المتوسط بنات, المتوسط بنين, الثانوي بنات, الثانوي بنين, الإدارة.

**Today:** three disconnected prototypes (central vehicle workshop, trip bus booking, support-services portal) with separate logins, a single shared admin token, a single form for all services, no real approvals, no cross-service links, no notifications, no audit.

**Proposed product — "منصة الخدمات المساندة المتكاملة":** one portal, one login, role-based screens, one shared **request engine** ("the shared heart") with **10 services**, each with its own form, approval path and executor screen, plus cross-service links, SLAs, notifications, dashboards, audit log.

**The PoC must demonstrate:** (a) multiple users with different roles see different menus/pages/actions, (b) an editable RBAC system, (c) the end-to-end request lifecycle across roles, (d) cross-service linking (maintenance → warehouse → purchasing), (e) dashboards. Locale hints from the client's own demos: currency is **ريال (SAR)**, traffic reports are **نجم**, Saudi mobile format `05xxxxxxxx`, weekend = Friday/Saturday, week starts Sunday.

---

## 2. Goals and non-goals

**Goals**
- Login with **employee ID + OTP** (simulated).
- A persistent **Demo Mode bar** with a dropdown of pre-filled users to switch identity instantly (no login needed) and see exactly what that user can do.
- A real, working **RBAC engine** (roles → permissions with scope) and an **RBAC admin UI** where changes apply live.
- All 10 services with dedicated forms and role-aware workflows, running on in-browser mock data.
- Role-aware home dashboards and a reports section with charts.
- 100% Arabic, 100% RTL, polished, responsive (desktop first, usable on tablet/phone).

**Non-goals:** real backend, real SMS/WhatsApp/email, real file upload storage, real auth, i18n/English UI, unit-test suites (a few tests for the RBAC engine are welcome).

---

## 3. Tech stack and architecture

- **Angular (latest stable, v20+)**, standalone components, **signals**, new control flow (`@if/@for`), lazy-loaded routes per feature, strict TypeScript.
- **Bootstrap 5.3** using its **official RTL build** (`bootstrap/dist/css/bootstrap.rtl.min.css`, registered in `angular.json` styles, or compiled from SCSS with RTL enabled). Use **Bootstrap Icons** (`bootstrap-icons`) and **ng-bootstrap** for interactive components (dropdown, modal, offcanvas, tabs, accordion, toast, tooltip, popover, pagination, typeahead, datepicker). **Do not** load Bootstrap's JS bundle, jQuery, or Popper manually, and do not mix in another CSS framework. Verify ng-bootstrap's datepicker, dropdown placement and offcanvas side render correctly in RTL; wrap or replace with a small custom component if not.
- **Logical utilities only:** use Bootstrap's logical classes (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`, `float-start`, `float-end`, `border-start`, `border-end`, `rounded-start`, `rounded-end`, `start-0`, `end-0`). Never write physical-direction CSS in custom styles; use logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`, `border-inline-start`). Never hard-code `left`/`right` anywhere.
- **Angular CDK** for overlays, dialogs, a11y. **Chart.js via ng2-charts** for charts. Self-host fonts through `@fontsource` so the demo works offline: **Cairo** (headings), **IBM Plex Sans Arabic** (body).
- `<html lang="ar" dir="rtl">`. Use `Intl` with `ar-SA` for dates/numbers but **Western digits (0-9)** and **dd/MM/yyyy**; add an optional Hijri toggle (`ar-SA-u-ca-islamic-umalqura`) in user settings.
- **Mock backend pattern:** every feature talks to a repository interface (e.g. `RequestRepository`) implemented by an in-memory/`localStorage`-backed mock with 200–500 ms simulated latency and `Observable`/`Promise` returns, so it can later be swapped for `HttpClient` with zero UI changes. Persist under a versioned key; provide a **"إعادة ضبط بيانات العرض"** button (Demo bar) that re-seeds.
- **Enforcement in layers (important — mirrors the proposal's "server-side validation" promise):** permissions are enforced (1) in route guards, (2) in menu/UI via a `*can` directive, **and (3) in the repository/data layer** (a user can never *receive* records outside their scope, even if the UI is bypassed). Business rules (booking lead time, approval limits, file limits) also live in the service layer, not in components.

Suggested structure:
```
src/app/
  core/        auth, rbac (permission.service, guards, can.directive), demo-mode, notifications, audit, mock-db
  shared/      ui kit (button, card, badge, table, dialog, stepper, timeline, file-chip, empty-state, stat-card, chart wrappers)
  domain/      models, enums, reference data, seed data
  features/
    auth/ home/ requests/ approvals/ workbench/ warehouse/ purchasing/
    fleet/ transport/ complaints/ reports/ admin/ (users, rbac, reference, sla, limits, audit)
```

---

## 4. Visual design and RTL rules

- Look: clean, official, calm, modern SaaS (not a template look). Branding approximated from the proposal: navy `#1B4F7B`, teal `#2B93B0`, accent orange `#F5A623`, soft surface `#F2F7FA`, success `#2E7D4F`, danger `#C0392B`, warning `#E0A100`. Define them as Bootstrap theme overrides (`--bs-primary`, `--bs-secondary`, `--bs-success`, `--bs-danger`, `--bs-warning`, `--bs-body-bg`, etc., plus Sass variable overrides if compiling SCSS) so every Bootstrap component picks up the brand automatically; add a small set of custom CSS variables for brand extras (teal accent, soft surface). Customise Bootstrap components (cards, buttons, badges, tables, forms, navs) via a single `theme.scss` instead of ad-hoc overrides so the result does not look like default Bootstrap. Rounded cards (12–16px), soft shadows, generous spacing, subtle motion.
- Logo: text lockup "مدارس المنهل" + a simple SVG mark; footer tagline "أكثر من 44 عامًا من الريادة التعليمية".
- App shell: right-side collapsible sidebar (RTL start), top bar with global search, notification bell (with unread count and dropdown), current user chip with role badge and logout. Breadcrumbs on inner pages.
- **RTL correctness is a hard requirement:** mirrored icons where directional (arrows, chevrons, back buttons, steppers, timeline), tables aligned `start`, numbers/IDs/phones/English tokens wrapped with `dir="ltr"` + `unicode-bidi: isolate` where needed (e.g. `REQ-2026-000123`, plate numbers, phones), charts with reversed x-axis where it helps readability and Arabic tooltips/legends, calendars start on Sunday, date pickers RTL. Verify no layout breaks with long Arabic text.
- Every list has loading skeletons, empty states (friendly Arabic copy + illustration), and error states. Forms have inline Arabic validation messages. Toasts in Arabic. Buttons use clear Arabic verbs (اعتماد، رفض، إسناد، إغلاق...).
- Accessibility basics: focus rings, aria labels in Arabic, keyboard navigation in menus/dialogs.

---

## 5. Reference data

**Branches:** فرع التعاون (7 buses/day), فرع المربع (7), فرع الريان (3).
**Departments:** KG، الابتدائي — بنات، الابتدائي — بنين، المتوسط — بنات، المتوسط — بنين، الثانوي — بنات، الثانوي — بنين، الإدارة.
**Priorities:** عادية، عاجلة، طارئة (maintenance also: عالية، وقائية).
**Unified statuses (single set for all services):**
`جديد` → `قيد المراجعة` → `بانتظار اعتماد` → `معتمد` → `قيد التنفيذ` → `معلّق` (reason required: بانتظار قطع / مشتريات / معلومات من مقدم الطلب) → `تم التنفيذ` → `بانتظار تأكيد مقدم الطلب` → `مغلق`.
**Exceptional:** `مرفوض` (mandatory reason), `ملغي`, `مُعاد للاستكمال`. Each service uses the subset that fits it. Status badges have consistent colours.
**Reference lists also needed:** vehicles (plate, type, branch, mileage, status), drivers, warehouse items (code, name, unit, stock, reorder level, location), suppliers, maintenance specialties (كهرباء، تكييف، سباكة، مدني، أجهزة، أخرى), vehicle maintenance types (ميكانيكا، سمكرة، كهرباء، تغيير زيت), bus trip purposes (رحلة طلابية، نشاط مدرسي، زيارة تعليمية، مشاركة خارجية، مهمة إدارية، أخرى).
Reference data is editable in `admin/reference` (simple CRUD tables) and used by all forms (no duplicated lists).

---

## 6. RBAC (the core of the PoC — build it properly)

### 6.1 Model
- **Permission** = `{ key: 'module.action', label (ar), module (ar), description (ar), scoped: boolean }`.
- **Role** = `{ id, nameAr, descriptionAr, isSystem, permissions: Array<{ key, scope? }> }`.
- **Scope** (for scoped permissions): `own` (own records) < `department` < `branch` < `all`. Higher scope includes lower.
- **User** = `{ id, employeeId, nameAr, mobile, email, avatarColor, branchId, departmentId, roleIds[], jobTitleAr, active }`. A user may hold multiple roles; effective permissions = union (highest scope wins per key).
- `PermissionService` (signals-based): `can(key, resource?)`, `scopeOf(key)`, `effectivePermissions()`, evaluating scope against the resource's `branchId/departmentId/createdBy/assigneeId`. Everything reactive: when RBAC is edited, the whole UI updates instantly.

### 6.2 Permission catalog (extend as needed, keep keys stable)
- **Requests:** `request.create.<service>` (one per service), `request.view` (scoped), `request.view.confidential`, `request.comment.public`, `request.comment.internal`, `request.attach`, `request.cancel.own`, `request.review`, `request.approve.department`, `request.approve.branch`, `request.approve.finance`, `request.approve.executive`, `request.assign`, `request.execute`, `request.reject`, `request.close`, `request.confirm` (requester confirms receipt/result), `request.rate`, `request.escalate`, `request.export`.
- **Warehouse:** `warehouse.view`, `warehouse.issue`, `warehouse.stockin`, `warehouse.audit`.
- **Purchasing:** `purchasing.view`, `purchasing.quote`, `purchasing.po`, `purchasing.receive`.
- **Fleet:** `fleet.vehicle.view`, `fleet.driver.view`, `fleet.workshop.work`.
- **Transport:** `transport.calendar.view`, `transport.calendar.manage`, `transport.allocate`.
- **Complaints:** `complaints.handle`, `complaints.view.confidential`.
- **Reports:** `reports.executive`, `reports.maintenance`, `reports.fleet`, `reports.transport`, `reports.procurement`, `reports.quality`, `reports.export`.
- **Admin:** `admin.users`, `admin.rbac`, `admin.reference`, `admin.sla`, `admin.limits`, `admin.audit`, `admin.demo`.

### 6.3 Seed roles (13) and what each can do
1. **مقدم الطلب (معلم/موظف):** create all services except warehouse-issue/purchase-approvals; view `own`; public comments; cancel own (before approval); confirm result and rate.
2. **مدير القسم:** everything of requester + view `department`; `approve.department` (purchase, work execution, warehouse need); confirm.
3. **مشرف الفرع:** view `branch`; `approve.branch` (emergency/maintenance non-emergency, events, bus bookings); calendar view.
4. **فريق الورشة المركزية:** review/execute vehicle maintenance, traffic violations, accidents (view `all` for those services); fleet files; internal comments; request parts.
5. **فريق الصيانة (مسؤول الصيانة):** receive building-maintenance & works requests (view `branch`/`all`), assign technicians, internal comments, close.
6. **فني الصيانة:** see only assigned jobs; record inspection, parts and cost; mark done.
7. **أمين المستودع:** warehouse stock, issue, stock-in, audit; fulfil warehouse needs.
8. **المشتريات:** purchase requests (view `all`), quotes, purchase orders, receive.
9. **الإدارة المالية:** `approve.finance` by limit; procurement/cost reports.
10. **مسؤول النقل:** bus calendar management, bookings approval/allocation (bus + driver), transport reports.
11. **مسؤول الشكاوى:** complaints inbox incl. confidential; link complaints to requests; quality reports.
12. **الإدارة العليا:** read-only: executive dashboard + all reports, `request.view` all, `approve.executive` for very large purchases.
13. **مدير النظام:** all admin permissions (users, RBAC, reference, SLA, limits, audit, demo reset). Must **not** be able to remove its own `admin.rbac` (guard against lock-out). System roles can be cloned but not deleted.

### 6.4 RBAC admin UI (`/admin/rbac`) — must be impressive
- **Roles tab:** list of roles with user count; create, clone, rename, delete (non-system); role detail drawer.
- **Permission matrix:** modules as collapsible groups, permissions as rows, roles as columns (sticky headers, RTL-aware), checkbox cells; scoped permissions show a scope selector (own/department/branch/all). Search/filter, "select module" shortcuts, unsaved-changes bar with **حفظ / تراجع**, and a diff summary before saving.
- **Users tab:** table of users with role chips; assign/remove roles, set branch/department scope, activate/deactivate.
- **"Effective permissions" panel:** pick any user → see merged permissions, the menus they get, and the scopes — and a **"عرض كـ هذا المستخدم"** button that switches the demo identity.
- Every change writes to the audit log (who, what, before → after, when). Changes apply live to the current session.
- Show a banner: "الحدود والصلاحيات الظاهرة قيم افتراضية للعرض وتُحدد نهائيًا في جلسة تحليل المتطلبات."

### 6.5 UI behaviours driven by permissions
- Sidebar items are generated from a route/menu config with `requires: PermissionKey[]`; hidden if missing.
- Route guards redirect to a friendly Arabic **403 page** (with "العودة للرئيسية").
- Buttons/actions: hide when the user could never do them; **disable with an Arabic tooltip** when they could but not now (e.g. "بانتظار اعتماد مدير القسم").
- Fields inside a form/request page are shown **only to the right party at the right stage** (e.g. the receipt & custody section appears only to the receiver after delivery; internal comments never render for requesters).

---

## 7. Authentication (simulated) and Demo Mode

**Login page** (`/login`): school branding, background in the brand gradient with soft circles (like the proposal cover). Step 1: **رقم الموظف** field → "إرسال رمز التحقق". Step 2: 6-digit OTP input (auto-advance boxes, RTL-aware, paste support), 60-second resend countdown, and a simulated "SMS" toast showing the code (`123456` for everyone — also mention it in a small "وضع العرض" hint). Wrong ID → Arabic error; wrong OTP → shake + error; 3 failures → temporary lock message. On success: simulated token in `sessionStorage`, redirect to role home. Include quick-fill chips under the form ("جرّب: E1001 — معلمة") for the demo.

**Demo Mode bar** (always visible, slim, top of the app, collapsible, with a distinct "وضع العرض التجريبي" badge):
- **User switcher dropdown** pre-filled with all seed users, grouped by role, each option showing avatar, name, role, branch/department. Selecting a user switches identity instantly (no OTP), re-evaluates permissions, rebuilds the sidebar, and navigates to that user's home with a short transition + toast "تم التبديل إلى …".
- A compact "**ماذا يستطيع هذا المستخدم؟**" popover/drawer: role(s), scopes, list of menus, top permissions.
- Buttons: **إعادة ضبط بيانات العرض**, **بدء السيناريو الموجّه** (Section 14), notifications simulator (optional).
- The bar must be easy to hide for a clean screen-share.

**Seed users** (fictional; password-less; OTP always `123456`):

| Employee ID | Name | Role | Branch / Dept |
|---|---|---|---|
| E1001 | نورة العتيبي | مقدم الطلب (معلمة) | التعاون — الابتدائي بنات |
| E1002 | هند الشمري | مدير القسم | التعاون — الابتدائي بنات |
| E1003 | فهد القحطاني | مشرف الفرع | التعاون |
| E1004 | ماجد الدوسري | مسؤول الصيانة | مركزي |
| E1005 | سلطان الزهراني | فني صيانة (تكييف) | التعاون |
| E1006 | عبدالله المطيري | أمين المستودع | مركزي |
| E1007 | تركي السبيعي | المشتريات | مركزي |
| E1008 | ريم الغامدي | الإدارة المالية | مركزي |
| E1009 | يوسف العنزي | مسؤول النقل | مركزي |
| E1010 | بدر الشهري | فريق الورشة المركزية | مركزي |
| E1011 | منى الجهني | مسؤولة الشكاوى | مركزي |
| E1012 | أحمد الراشد | الإدارة العليا | الإدارة |
| E1013 | محمد السالم | مدير النظام | الإدارة |
| E1014 | عمر الشريف | مقدم الطلب (معلم) | الريان — الثانوي بنين |
| E1015 | خالد الحربي | مدير القسم | الريان — الثانوي بنين |

E1014/E1015 exist to show **scope isolation** (they must never see Al-Taawun branch data).

---

## 8. Shared request engine ("القلب المشترك")

Every request, regardless of service, shares: `refNo` (e.g. `MNH-2026-000123`), service type, requester, branch, department, priority, status, assignee/executor, created/updated dates, **timeline**, **comments** (internal vs public), **attachments**, **audit log**, **SLA** (target hours per priority, countdown, breach flag, auto-escalation), **cost** (parts, labour, purchases), **links** (parent/child/related requests).

Engine capabilities to implement (as services + reusable components):
- **Workflow definition per service** (data-driven): ordered steps, who approves (role + scope), conditions (e.g. financial thresholds), allowed transitions per status, and which fields become visible/required at which step. Transitions are validated by the engine using both status rules and permissions.
- **Approval chain** with real actor identity (the logged-in demo user), timestamp, optional note; rejection requires a reason; "return for completion" sends it back to the requester with notification.
- **Timeline component:** vertical, RTL, icon per event, actor + role + time, system events (auto-routing, escalation, linked-request created).
- **Comments:** tabs "ظاهر لمقدم الطلب" / "داخلي للمنفذين" (internal tab only for users with `request.comment.internal`).
- **Attachments:** fake uploader (drag & drop, shows chips, validates type/size client-side: images & PDF ≤ 10 MB, video ≤ 50 MB, max 5 files); store only metadata; show preview placeholders.
- **Notifications:** in-app bell + a "simulated channels" log (واتساب / رسالة نصية / بريد) shown as small toasts/an activity feed when status changes or SLA breaches. Per-user unread state.
- **SLA & escalation:** configurable in `admin/sla`; overdue requests show a red badge and an "تم التصعيد إلى …" event in the timeline.
- **Search/filter/export:** by branch, date range, status, service, executor; export buttons produce a **real CSV download** and a printable view (Excel/PDF buttons can reuse these but must look real).
- **Approval limits (placeholders):** purchase/works ≤ 5,000 ر.س → department manager only; > 5,000 → + الإدارة المالية; > 50,000 → + الإدارة العليا. Editable at `admin/limits`; the chain recomputes live.
- **Templates for recurring requests** (e.g. "صيانة وقائية دورية للتكييف") from the new-request page.

---

## 9. The 10 services — forms and paths

Each service = dedicated form (only the requester's fields at creation; other fields appear to the right role at the right stage), its own path, executor screen, links. Required fields enforced (unlike the client's prototypes, where everything was optional). Common header fields (auto-filled from the logged-in user, editable only where sensible): اسم مقدم الطلب، رقم الجوال، الفرع، القسم، الأولوية، التاريخ المطلوب، العنوان، التفاصيل.

**Maintenance & Operations**
1. **صيانة مباني** — fields: المبنى/الموقع، الدور، الغرفة، وقت السماح بالدخول، وصف العطل، هل توجد إصابة أو حادث، صور. *Approval:* automatic for طارئة; otherwise مشرف الفرع. *Executor:* فريق الصيانة → فني. *Executor stages* (shown only to maintenance staff): تصنيف الطلب، التخصص (كهرباء/تكييف/سباكة/مدني/أجهزة/أخرى)، الفني المسؤول، موعد الاستجابة المستهدف، طريقة التنفيذ (فريق داخلي/عقد صيانة/شراء مباشر/عرض سعر/ضمان)، الفحص والتشخيص (نتيجة + سبب جذري + خطة إصلاح + هل يتطلب قطع غيار)، جدول قطع الغيار (الوصف، رقم القطعة، الكمية، المصدر، التكلفة)، الأعمال المنفذة، نتيجة الاختبار، بداية/نهاية العمل، مدة التوقف، ساعات العمل، التكلفة الإجمالية. *Closing stage:* نتيجة مقدم الطلب (مقبول ويعمل بصورة سليمة / مقبول مع ملاحظة / غير مقبول)، قرار مسؤول الصيانة (إغلاق / متابعة ضمان / صيانة إضافية / تحويل لمشروع)، حالة الأصل بعد الإغلاق (يعمل / جزئيًا / متوقف / مستبدل)، موعد المتابعة. *Links:* warehouse, purchasing.
2. **تنفيذ أعمال** — نطاق العمل، الموقع، المبرر، (جدول بنود اختياري). *Approval:* مدير القسم ثم المالية حسب القيمة. *Executor:* الصيانة أو مقاول. *Links:* purchasing (quotes).
3. **صيانة مركبات** — رقم السيارة (lookup from fleet), اسم السائق, نوع السيارة, نوع الصيانة (ميكانيكا/سمكرة/كهرباء/تغيير زيت), وصف العطل, مرفقات. *Approval/Executor:* الورشة المركزية. *Links:* warehouse, purchasing, vehicle file.
4. **مخالفة مرورية** — رقم المخالفة، التاريخ، المخالف (driver lookup)، المبلغ (ر.س)، مرفقات. *Review:* الورشة أو الإدارة. *Links:* driver & vehicle file. Restricted visibility (sensitive).
5. **حادث مروري** — التاريخ، الموقع، المتسبب، نسبة الخطأ %، رفع تقرير نجم (مطلوب). *Review:* الورشة. *Links:* vehicle maintenance, driver file. Restricted visibility (sensitive).

**Procurement & Inventory**
6. **طلب شراء** — الجهة الطالبة، مدير القسم، المسمى، رقم التواصل، موقع التسليم، **جدول الأصناف** (م، الوصف والمواصفات، الوحدة، الكمية، السعر التقديري، ملاحظات — add/remove rows, running total), مبررات الحاجة، الأثر عند التأخير، إقرار (replaced by a real approval action, not a checkbox). *Approval:* مدير القسم → المالية/الإدارة العليا حسب الحد. *Executor:* المشتريات (عروض أسعار → أمر توريد). *After delivery:* **الاستلام والعهدة** section appears only to the receiver (حالة الاستلام، اسم المستلم، تاريخ الاستلام، إقرار العهدة).
7. **احتياج المستودع** — الأصناف والكميات (item picker showing live stock). *Approval:* مدير القسم. *Executor:* أمين المستودع. *Link:* auto purchase request when stock is insufficient.

**Activities & Transport**
8. **فعالية داخلية** — التاريخ، المكان، عدد الحضور، التجهيزات المطلوبة (checklist: باص، تجهيز المكان/صيانة، مواد من المستودع…). *Approval:* مشرف الفرع أو الإدارة حسب التجهيز. *Behaviour:* spawns **child items** (bus booking, venue prep → maintenance, warehouse materials); event auto-closes when all children are complete.
9. **حجز باص** — ترميز الرحلة، الفرع (shows "N باصات يوميًا")، القسم، عدد الركاب (23–161), عدد الباصات (auto), وجهة الرحلة، رابط الموقع، الغرض، وقت الانطلاق (≥ 07:15), وقت العودة (≤ 12:15), تفاصيل, ملاحظات, **التعهد والموافقة** (long Arabic pledge text + required checkbox + the user's identity captured). **Rules (service layer):** booking ≥ 7 days ahead; cancellation blocked if < 3 days remain; branch daily capacity (7/7/3); buses needed = `ceil(passengers / 23)` (assumption derived from 23–161 range; document it); availability calculated **by time window** (not just per day); blocked days (holidays/exams/Fri–Sat); **waitlist** when full. *Approval:* automatic within rules, otherwise مسؤول النقل. *Executor:* مسؤول النقل assigns bus + driver. Show an interactive **availability calendar** (green available / grey unavailable / amber partially / hatched blocked) that updates live as bookings are made.

**Quality**
10. **تقديم شكوى** — التصنيف، التفاصيل، خيار السرية (anonymous/confidential toggle), optional link to an existing request number. *No approval* (direct routing to مسؤول الشكاوى). Confidential complaints are visible only with `complaints.view.confidential`. A complaint linked to a request appears in that request's timeline and in the executing party's quality metrics.

---

## 10. Cross-service linking (must be visible in the UI)

1. **Maintenance → Warehouse → Purchasing:** technician flags a required part → system checks stock → if available: auto-issue; else creates a **linked purchase request**; original request becomes `معلّق: بانتظار قطع` and the requester sees the reason; when goods are received the original returns to `قيد التنفيذ` automatically.
2. **Event → Buses + Setup + Materials** (child items, auto-close).
3. **Purchase → Receipt → Custody** (receiver-only section).
4. **Complaint → Complained-about request** (timeline + quality indicators).
5. **Vehicle file & Driver file:** one page per vehicle/driver aggregating maintenance, violations, accidents, cumulative cost; highlights highest-cost vehicles and most-violating drivers.
6. **Cost roll-up:** parts + labour + purchases per request → branch → department → vehicle, visible on request pages and reports.
Use a reusable "الطلبات المرتبطة" panel with status badges and quick navigation.

---

## 11. Screens by role (home + menus)

Common to all: Home dashboard (role-aware), **طلب جديد** (service catalog grid showing only services the user may create, plus templates), **طلباتي**, request details page, notifications, profile.

- **مقدم الطلب:** home shows my open requests, awaiting-my-confirmation items, quick-create cards.
- **مدير القسم:** + **صندوق الاعتمادات** (approve/reject/return with note), department requests.
- **مشرف الفرع:** + branch requests, branch approvals (events, bus bookings, non-emergency maintenance), branch bus calendar.
- **فريق الصيانة / الفني:** **شاشة المنفّذ** — kanban + list (جديد، قيد التنفيذ، معلّق، تم التنفيذ), SLA timers, assignment drawer; technician sees only assigned jobs; inspection/parts/cost form.
- **الورشة المركزية:** workbench for vehicle maintenance/violations/accidents + **ملف المركبة** and **ملف السائق**.
- **أمين المستودع:** inventory table (stock, reorder level, low-stock badges), issue requests queue, stock-in form, audit/count screen.
- **المشتريات:** purchase queue, quotes comparison (3 suppliers), PO creation, receipt.
- **الإدارة المالية:** financial approvals inbox with request value, cost summary and procurement report.
- **مسؤول النقل:** bus calendar management, bookings queue, allocate bus + driver, waitlist, blocked days, usage report.
- **مسؤول الشكاوى:** complaints inbox (incl. confidential), classification, link to request, response with SLA.
- **الإدارة العليا:** executive dashboard + all reports, read-only.
- **مدير النظام:** everything under `admin/`: users, RBAC, reference data, SLA, approval limits, audit log (filterable, searchable, exportable).

---

## 12. Dashboards and reports (Chart.js, Arabic labels)

- **Executive:** open vs overdue requests, cost per branch and per service, average completion time, requests trend (line), status distribution (doughnut).
- **Maintenance:** most frequent faults, technician performance, cost per asset/location.
- **Fleet:** cost per vehicle, violations per driver, upcoming preventive maintenance.
- **Transport:** bus utilisation per branch and department, peak days (heat calendar), waitlist count.
- **Procurement & warehouse:** spend per branch/department, most requested items, stock-out cases.
- **Quality:** complaint categories, response time, average rating per executing party.
Each dashboard filtered by date range/branch, with KPI cards, export (CSV real; PDF/Excel buttons trigger a print/CSV so they feel real). Role-limited via `reports.*`.

---

## 13. Seed data (make it feel alive)

- ~80 requests across all 10 services, all branches, spread over the last 90 days, covering **every status** including rejected/cancelled/returned, with realistic Arabic titles, descriptions, timelines, comments (public and internal), attachments metadata, costs.
- ~6 requests **overdue** (SLA breached, escalated), ~10 awaiting approval, ~8 awaiting requester confirmation.
- One confidential complaint and one sensitive traffic accident (to demonstrate restricted visibility).
- Warehouse with ~40 items (a few at/below reorder level), ~8 suppliers, ~12 vehicles, ~10 drivers, bus bookings filling the next 60 days (some days full, some blocked).
- **Hero request for the demo:** "تسرب/عطل في تكييف فصل 3/ب" by نورة العتيبي (E1001), currently at the **fresh start** of the AC scenario in Section 14, so I can run it live from step 1.
- Deterministic generation (seeded pseudo-random) so data is identical after every reset.

---

## 14. Guided scenario ("السيناريو الموجّه")

Implement the proposal's worked example as a guided walkthrough, started from the Demo bar. A floating stepper (RTL) shows the current step (title + one-line explanation), and a primary button **"انتقل إلى {role/user} وتابع"** switches identity, navigates to the exact page, and highlights the relevant button (soft pulse/spotlight). Steps:

1. نورة العتيبي تقدّم طلب صيانة (تكييف) مع صورة → رقم مرجعي + إشعار استلام.
2. النظام يوجّه الطلب تلقائيًا لفريق الصيانة حسب الفرع والتخصص ويبدأ عدّاد SLA.
3. ماجد الدوسري يسند الطلب لفني (سلطان الزهراني) → رسالة للمعلمة باسم الفني والموعد.
4. السلطان يسجّل الفحص ويحدد الحاجة لقطعة غيار.
5. النظام يفحص المستودع: غير متوفرة → ينشأ **طلب شراء مرتبط**، والأصلي يصبح `معلّق: بانتظار قطع`.
6. اعتماد طلب الشراء: مدير القسم (هند الشمري) ثم الإدارة المالية (ريم الغامدي) إن تجاوز الحد.
7. المشتريات (تركي السبيعي) تصدر أمر التوريد، وأمين المستودع (عبدالله المطيري) يستلم القطعة → يعود الطلب الأصلي تلقائيًا إلى `قيد التنفيذ`.
8. الفني يركّب القطعة، يختبر، ويسجل ساعات العمل والتكلفة.
9. المعلمة تؤكد الإصلاح وتقيّم الخدمة (عند الرفض يعود للتنفيذ مع الملاحظة) → `مغلق`.
10. الأثر: التكلفة تُسجّل على الفرع/القسم وتظهر في تقارير الأعطال المتكررة وأداء الفنيين (open the dashboard as الإدارة العليا).

Each step performs real state changes through the same engine (not a fake animation), so the user can also deviate and continue manually.

---

## 15. Build phases (stop and report after each)

1. **Foundation:** Angular + Bootstrap 5.3 (RTL build) + ng-bootstrap + Bootstrap Icons + fonts, RTL shell, design tokens, UI kit, router, mock-db, domain models, reference + seed users, `CLAUDE.md`.
2. **Auth + Demo Mode + RBAC engine:** login (ID + OTP), demo bar with user switcher, `PermissionService`, guards, `*can`, dynamic sidebar, 403 page, a few unit tests for scope evaluation.
3. **Request engine:** models, workflow definitions, repository with scope filtering, request details page (timeline, comments, attachments, linked items, action bar), my requests, notifications, audit, SLA.
4. **Services (forms + paths), part A:** building maintenance, works execution, purchase request, warehouse need, complaint; approvals inbox; executor workbench.
5. **Services, part B:** vehicle maintenance, violation, accident, internal event (child items), bus booking + availability calendar + transport screens; vehicle/driver files.
6. **Warehouse + purchasing screens, cross-service linking, cost roll-up.**
7. **RBAC admin UI, users, reference data, SLA, limits, audit log viewer.**
8. **Dashboards and reports** with seeded analytics.
9. **Guided scenario, polish** (animations, empty states, responsive checks, RTL audit across every screen, accessibility pass), `README.md` (run, build, reset, user table, demo script), `docs/ASSUMPTIONS.md`, and a **static production build** that can be deployed to any static host (Netlify/Vercel/GitHub Pages) with SPA fallback config.

---

## 16. Acceptance criteria

- [ ] Login works with any seed employee ID + `123456`; wrong inputs show Arabic errors.
- [ ] The Demo bar dropdown lists all seed users and switching changes menus, home page, data scope and available actions instantly.
- [ ] Two users with different roles/branches see **different** records for the same service; E1014 never sees Al-Taawun data (verified at the data layer, not just hidden in UI).
- [ ] Editing a role in `/admin/rbac` changes what that role's users can see/do **immediately**; changes are logged; the admin cannot lock themselves out.
- [ ] All 10 services can be created with required-field validation and complete their paths to `مغلق` (or rejected/cancelled/returned) via the correct actors.
- [ ] Maintenance → warehouse → purchase linkage works end-to-end, including the automatic return to `قيد التنفيذ`.
- [ ] Bus booking enforces: 7-day lead time, 3-day cancellation block, branch capacity, passenger range, time-window availability, blocked days, waitlist; calendar reflects bookings live.
- [ ] Approval limits recompute the approval chain when changed.
- [ ] Internal comments never visible to requesters; confidential complaints/accidents visible only to authorised roles.
- [ ] Dashboards render with seeded data, filters work, CSV export downloads.
- [ ] Guided scenario runs all 10 steps with real state changes.
- [ ] **Every screen is fully Arabic and RTL-correct** (icons mirrored, no physical `left/right` CSS anywhere, only Bootstrap RTL build and logical utilities/properties, numbers/IDs isolated LTR where needed, no English UI strings).
- [ ] `ng build` passes with no errors/warnings; works offline once served; reset restores seed data.

## 17. Final deliverables
Source repo, `README.md` (setup, scripts, demo script for the meeting, user cheat-sheet), `CLAUDE.md`, `docs/ASSUMPTIONS.md` (every assumption you made, e.g. 23 passengers/bus, default approval limits, SAR currency), and a production build ready for static hosting.
