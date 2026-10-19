import { PermissionGrant, Role, Scope } from '../models/rbac';
import { PERMISSION_CATALOG } from '../permission-catalog';
import { SERVICES } from '../reference-data';

export const ROLE_IDS = {
  requester: 'role-requester',
  deptManager: 'role-dept-manager',
  branchSupervisor: 'role-branch-supervisor',
  workshop: 'role-workshop',
  maintenanceLead: 'role-maintenance-lead',
  technician: 'role-technician',
  warehouse: 'role-warehouse',
  purchasing: 'role-purchasing',
  finance: 'role-finance',
  transport: 'role-transport',
  complaints: 'role-complaints',
  executive: 'role-executive',
  admin: 'role-admin',
} as const;

const FLEET_SERVICES = ['vehicle-maintenance', 'traffic-violation', 'traffic-accident'];
const MAINTENANCE_SERVICES = ['building-maintenance', 'works-execution'];

const createFor = (...keys: string[]): PermissionGrant[] =>
  keys.map((k) => ({ key: `request.create.${k}` }));

/** Services a plain requester may open (vehicle services belong to fleet staff — see ASSUMPTIONS). */
const REQUESTER_CREATE = createFor(
  'building-maintenance',
  'works-execution',
  'purchase-request',
  'warehouse-need',
  'internal-event',
  'bus-booking',
  'complaint',
);

const g = (key: string, scope?: Scope, services?: string[]): PermissionGrant => ({
  key,
  ...(scope ? { scope } : {}),
  ...(services ? { services } : {}),
});

const requesterBase = (): PermissionGrant[] => [
  ...REQUESTER_CREATE,
  g('request.view', 'own'),
  g('request.comment.public'),
  g('request.attach'),
  g('request.cancel.own'),
  g('request.confirm'),
  g('request.rate'),
  g('transport.calendar.view', 'branch'),
];

const executorBase = (scope: Scope, services: string[]): PermissionGrant[] => [
  g('request.view', scope, services),
  g('request.review', scope, services),
  g('request.execute', scope, services),
  g('request.reject', scope, services),
  g('request.close', scope, services),
  g('request.assign', scope, services),
  g('request.export', scope, services),
  g('request.comment.public'),
  g('request.comment.internal'),
  g('request.attach'),
];

export const SEED_ROLES: readonly Role[] = [
  {
    id: ROLE_IDS.requester,
    nameAr: 'مقدم الطلب',
    descriptionAr: 'معلم أو موظف يقدّم الطلبات ويتابعها ويؤكد الاستلام ويقيّم الخدمة.',
    isSystem: true,
    permissions: requesterBase(),
  },
  {
    id: ROLE_IDS.deptManager,
    nameAr: 'مدير القسم',
    descriptionAr: 'يعتمد طلبات قسمه (الشراء، تنفيذ الأعمال، احتياج المستودع) ويتابع طلبات القسم.',
    isSystem: true,
    permissions: [
      ...requesterBase().filter((p) => p.key !== 'request.view'),
      g('request.view', 'department'),
      g('request.approve.department', 'department'),
      g('request.reject', 'department'),
      g('request.export', 'department'),
    ],
  },
  {
    id: ROLE_IDS.branchSupervisor,
    nameAr: 'مشرف الفرع',
    descriptionAr: 'يطّلع على جميع طلبات الفرع ويعتمد الحجوزات والفعاليات والصيانة غير الطارئة.',
    isSystem: true,
    permissions: [
      ...requesterBase().filter((p) => p.key !== 'request.view'),
      g('request.view', 'branch'),
      g('request.approve.branch', 'branch'),
      g('request.reject', 'branch'),
      g('request.export', 'branch'),
      g('request.escalate', 'branch'),
    ],
  },
  {
    id: ROLE_IDS.workshop,
    nameAr: 'فريق الورشة المركزية',
    descriptionAr: 'يستلم طلبات المركبات والمخالفات والحوادث وينفذها ويدير ملفات المركبات والسائقين.',
    isSystem: true,
    permissions: [
      ...executorBase('all', FLEET_SERVICES),
      ...createFor(...FLEET_SERVICES),
      g('request.view.confidential', 'all', FLEET_SERVICES),
      g('request.cancel.own'),
      g('request.confirm'),
      g('fleet.vehicle.view'),
      g('fleet.driver.view'),
      g('fleet.workshop.work'),
      g('warehouse.view'),
      g('reports.fleet'),
    ],
  },
  {
    id: ROLE_IDS.maintenanceLead,
    nameAr: 'فريق الصيانة (مسؤول الصيانة)',
    descriptionAr: 'يستلم بلاغات الصيانة وطلبات الأعمال، ويسند الفنيين، ويغلق الطلبات.',
    isSystem: true,
    permissions: [
      ...executorBase('all', MAINTENANCE_SERVICES),
      ...REQUESTER_CREATE,
      g('request.cancel.own'),
      g('request.confirm'),
      g('request.rate'),
      g('request.escalate', 'all'),
      g('warehouse.view'),
      g('reports.maintenance'),
    ],
  },
  {
    id: ROLE_IDS.technician,
    nameAr: 'فني الصيانة',
    descriptionAr: 'يرى الأعمال المسندة إليه فقط، ويسجل الفحص وقطع الغيار والتكلفة.',
    isSystem: true,
    permissions: [
      g('request.view', 'own'),
      g('request.execute', 'own'),
      g('request.comment.public'),
      g('request.comment.internal'),
      g('request.attach'),
      ...createFor('building-maintenance', 'warehouse-need'),
      g('warehouse.view'),
    ],
  },
  {
    id: ROLE_IDS.warehouse,
    nameAr: 'أمين المستودع',
    descriptionAr: 'يدير الأرصدة والصرف والإدخال والجرد وينفذ احتياجات المستودع.',
    isSystem: true,
    permissions: [
      ...executorBase('all', ['warehouse-need']),
      // The keeper receives the goods of purchases that restock the warehouse, so they can open those purchase requests.
      g('request.view', 'all', ['purchase-request']),
      ...createFor('warehouse-need', 'purchase-request'),
      g('request.cancel.own'),
      g('warehouse.view'),
      g('warehouse.issue'),
      g('warehouse.stockin'),
      g('warehouse.audit'),
      g('reports.procurement'),
    ],
  },
  {
    id: ROLE_IDS.purchasing,
    nameAr: 'المشتريات',
    descriptionAr: 'يدرس طلبات الشراء، ويقارن العروض، ويصدر أوامر التوريد، ويستلم البضاعة.',
    isSystem: true,
    permissions: [
      ...executorBase('all', ['purchase-request']),
      ...createFor('purchase-request'),
      g('request.cancel.own'),
      g('purchasing.view'),
      g('purchasing.quote'),
      g('purchasing.po'),
      g('purchasing.receive'),
      g('warehouse.view'),
      g('reports.procurement'),
    ],
  },
  {
    id: ROLE_IDS.finance,
    nameAr: 'الإدارة المالية',
    descriptionAr: 'تعتمد الطلبات التي تتجاوز الحدود المالية وتتابع الإنفاق.',
    isSystem: true,
    permissions: [
      g('request.view', 'all', ['purchase-request', 'works-execution']),
      g('request.approve.finance'),
      g('request.reject', 'all', ['purchase-request', 'works-execution']),
      g('request.export', 'all', ['purchase-request', 'works-execution']),
      g('request.comment.public'),
      g('request.comment.internal'),
      g('purchasing.view'),
      g('reports.procurement'),
      g('reports.export'),
    ],
  },
  {
    id: ROLE_IDS.transport,
    nameAr: 'مسؤول النقل',
    descriptionAr: 'يدير تقويم الباصات، ويعتمد الحجوزات، ويخصص الباص والسائق.',
    isSystem: true,
    permissions: [
      ...executorBase('all', ['bus-booking']),
      ...createFor('bus-booking', 'internal-event'),
      g('request.cancel.own'),
      g('transport.calendar.view', 'all'),
      g('transport.calendar.manage'),
      g('transport.allocate'),
      g('fleet.vehicle.view'),
      g('fleet.driver.view'),
      g('reports.transport'),
    ],
  },
  {
    id: ROLE_IDS.complaints,
    nameAr: 'مسؤول الشكاوى',
    descriptionAr: 'يستلم الشكاوى بما فيها السرية، ويربطها بالطلبات، ويرد عليها.',
    isSystem: true,
    permissions: [
      ...executorBase('all', ['complaint']),
      g('request.view.confidential', 'all', ['complaint']),
      g('complaints.handle'),
      g('complaints.view.confidential'),
      g('request.view', 'all'),
      g('reports.quality'),
    ],
  },
  {
    id: ROLE_IDS.executive,
    nameAr: 'الإدارة العليا',
    descriptionAr: 'اطلاع كامل للقراءة فقط على اللوحات والتقارير، واعتماد المبالغ الكبيرة.',
    isSystem: true,
    permissions: [
      g('request.view', 'all'),
      g('request.approve.executive'),
      g('request.comment.public'),
      g('request.export', 'all'),
      g('reports.executive'),
      g('reports.maintenance'),
      g('reports.fleet'),
      g('reports.transport'),
      g('reports.procurement'),
      g('reports.quality'),
      g('reports.export'),
      g('transport.calendar.view', 'all'),
    ],
  },
  {
    id: ROLE_IDS.admin,
    nameAr: 'مدير النظام',
    descriptionAr: 'يدير المستخدمين والأدوار والبيانات المرجعية والحدود وسجل التدقيق.',
    isSystem: true,
    permissions: PERMISSION_CATALOG.filter((p) => p.key.startsWith('admin.')).map((p) => g(p.key)),
  },
];

export const ALL_CREATE_KEYS: readonly string[] = SERVICES.map((s) => s.createPermission);
