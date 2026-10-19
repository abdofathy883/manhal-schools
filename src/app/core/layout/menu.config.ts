import { Scope } from '../../domain/models/rbac';
import { SERVICES } from '../../domain/reference-data';

export interface MenuItem {
  label: string;
  icon: string;
  route: string;
  /** Visible when the user holds ANY of these permissions. Empty/omitted = every signed-in user. */
  requiresAny?: readonly string[];
  /** Visible only when the user's scope for `key` is at least `atLeast` (e.g. hide "scope requests" from `own`-only roles). */
  requiresScope?: { key: string; atLeast: Scope };
  /** Section the item belongs to; the heading shows above the first visible item of each section. */
  section?: string;
}

export const MENU: readonly MenuItem[] = [
  { label: 'الرئيسية', icon: 'bi-house-door', route: '/home' },
  { label: 'طلب جديد', icon: 'bi-plus-circle', route: '/requests/new', requiresAny: SERVICES.map((s) => s.createPermission), section: 'الطلبات' },
  { label: 'طلباتي', icon: 'bi-journal-text', route: '/requests/mine', requiresAny: ['request.view'], section: 'الطلبات' },
  { label: 'طلبات ضمن نطاقي', icon: 'bi-collection', route: '/requests/all', requiresScope: { key: 'request.view', atLeast: 'department' }, section: 'الطلبات' },
  { label: 'صندوق الاعتمادات', icon: 'bi-patch-check', route: '/approvals', requiresAny: ['request.approve.department', 'request.approve.branch', 'request.approve.finance', 'request.approve.executive'], section: 'الطلبات' },
  { label: 'شاشة المنفّذ', icon: 'bi-kanban', route: '/workbench', requiresAny: ['request.execute'], section: 'التنفيذ' },
  { label: 'الورشة المركزية', icon: 'bi-wrench-adjustable', route: '/fleet', requiresAny: ['fleet.workshop.work', 'fleet.vehicle.view', 'fleet.driver.view'], section: 'التنفيذ' },
  { label: 'المستودع', icon: 'bi-box-seam', route: '/warehouse', requiresAny: ['warehouse.view'], section: 'التنفيذ' },
  { label: 'المشتريات', icon: 'bi-cart3', route: '/purchasing', requiresAny: ['purchasing.view'], section: 'التنفيذ' },
  { label: 'النقل وتقويم الباصات', icon: 'bi-bus-front', route: '/transport', requiresAny: ['transport.calendar.view'], section: 'التنفيذ' },
  { label: 'صندوق الشكاوى', icon: 'bi-chat-left-text', route: '/complaints', requiresAny: ['complaints.handle'], section: 'التنفيذ' },
  { label: 'التقارير واللوحات', icon: 'bi-graph-up-arrow', route: '/reports', requiresAny: ['reports.executive', 'reports.maintenance', 'reports.fleet', 'reports.transport', 'reports.procurement', 'reports.quality'], section: 'التحليلات' },
  { label: 'المستخدمون', icon: 'bi-people', route: '/admin/users', requiresAny: ['admin.users'], section: 'الإدارة' },
  { label: 'الأدوار والصلاحيات', icon: 'bi-shield-lock', route: '/admin/rbac', requiresAny: ['admin.rbac'], section: 'الإدارة' },
  { label: 'البيانات المرجعية', icon: 'bi-database', route: '/admin/reference', requiresAny: ['admin.reference'], section: 'الإدارة' },
  { label: 'مدد الاستجابة', icon: 'bi-alarm', route: '/admin/sla', requiresAny: ['admin.sla'], section: 'الإدارة' },
  { label: 'الحدود المالية', icon: 'bi-cash-coin', route: '/admin/limits', requiresAny: ['admin.limits'], section: 'الإدارة' },
  { label: 'سجل التدقيق', icon: 'bi-clock-history', route: '/admin/audit', requiresAny: ['admin.audit'], section: 'الإدارة' },
];
