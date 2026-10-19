import { Branch, Department, RefLists } from './models/reference';
import {
  HoldReason,
  Priority,
  RequestStatus,
  ServiceDefinition,
  ServiceGroup,
  ServiceKey,
} from './models/request';

export const BRANCHES: readonly Branch[] = [
  { id: 'br-taawun', nameAr: 'فرع التعاون', busesPerDay: 7 },
  { id: 'br-murabba', nameAr: 'فرع المربع', busesPerDay: 7 },
  { id: 'br-rayyan', nameAr: 'فرع الريان', busesPerDay: 3 },
];

export const DEPARTMENTS: readonly Department[] = [
  { id: 'dp-kg', nameAr: 'KG' },
  { id: 'dp-prim-g', nameAr: 'الابتدائي — بنات' },
  { id: 'dp-prim-b', nameAr: 'الابتدائي — بنين' },
  { id: 'dp-mid-g', nameAr: 'المتوسط — بنات' },
  { id: 'dp-mid-b', nameAr: 'المتوسط — بنين' },
  { id: 'dp-sec-g', nameAr: 'الثانوي — بنات' },
  { id: 'dp-sec-b', nameAr: 'الثانوي — بنين' },
  { id: 'dp-admin', nameAr: 'الإدارة' },
];

export const PRIORITY_LABELS: Record<Priority, string> = {
  normal: 'عادية',
  urgent: 'عاجلة',
  emergency: 'طارئة',
  high: 'عالية',
  preventive: 'وقائية',
};

/** Priorities offered by every service; maintenance adds `high` and `preventive`. */
export const COMMON_PRIORITIES: readonly Priority[] = ['normal', 'urgent', 'emergency'];
export const MAINTENANCE_PRIORITIES: readonly Priority[] = [
  'normal',
  'high',
  'urgent',
  'emergency',
  'preventive',
];

export interface StatusMeta {
  labelAr: string;
  /** Bootstrap colour name used for the badge (`bg-*-subtle text-*-emphasis`). */
  tone: 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'danger';
  icon: string;
}

export const STATUS_META: Record<RequestStatus, StatusMeta> = {
  new: { labelAr: 'جديد', tone: 'info', icon: 'bi-stars' },
  under_review: { labelAr: 'قيد المراجعة', tone: 'secondary', icon: 'bi-search' },
  pending_approval: { labelAr: 'بانتظار اعتماد', tone: 'warning', icon: 'bi-hourglass-split' },
  approved: { labelAr: 'معتمد', tone: 'primary', icon: 'bi-patch-check' },
  in_progress: { labelAr: 'قيد التنفيذ', tone: 'primary', icon: 'bi-gear' },
  on_hold: { labelAr: 'معلّق', tone: 'warning', icon: 'bi-pause-circle' },
  executed: { labelAr: 'تم التنفيذ', tone: 'success', icon: 'bi-check2-circle' },
  pending_confirmation: {
    labelAr: 'بانتظار تأكيد مقدم الطلب',
    tone: 'info',
    icon: 'bi-person-check',
  },
  closed: { labelAr: 'مغلق', tone: 'success', icon: 'bi-lock' },
  rejected: { labelAr: 'مرفوض', tone: 'danger', icon: 'bi-x-octagon' },
  cancelled: { labelAr: 'ملغي', tone: 'secondary', icon: 'bi-slash-circle' },
  returned: { labelAr: 'مُعاد للاستكمال', tone: 'warning', icon: 'bi-arrow-return-right' },
};

/** Main lifecycle order, used by steppers and charts. */
export const STATUS_FLOW: readonly RequestStatus[] = [
  'new',
  'under_review',
  'pending_approval',
  'approved',
  'in_progress',
  'on_hold',
  'executed',
  'pending_confirmation',
  'closed',
];

export const HOLD_REASON_LABELS: Record<HoldReason, string> = {
  parts: 'بانتظار قطع',
  procurement: 'بانتظار مشتريات',
  requester_info: 'بانتظار معلومات من مقدم الطلب',
};

export const SERVICE_GROUP_LABELS: Record<ServiceGroup, string> = {
  maintenance: 'الصيانة والتشغيل',
  procurement: 'المشتريات والمخزون',
  activities: 'الأنشطة والنقل',
  quality: 'الجودة',
};

export const SERVICES: readonly ServiceDefinition[] = [
  {
    key: 'building-maintenance',
    nameAr: 'صيانة مباني',
    descriptionAr: 'الإبلاغ عن عطل في المبنى أو التجهيزات داخل الفرع',
    group: 'maintenance',
    icon: 'bi-tools',
    createPermission: 'request.create.building-maintenance',
    defaultExecutorScope: 'branch',
  },
  {
    key: 'works-execution',
    nameAr: 'تنفيذ أعمال',
    descriptionAr: 'طلب تنفيذ أعمال وتجهيزات داخل الفرع أو القسم',
    group: 'maintenance',
    icon: 'bi-hammer',
    createPermission: 'request.create.works-execution',
    defaultExecutorScope: 'all',
  },
  {
    key: 'vehicle-maintenance',
    nameAr: 'صيانة مركبات',
    descriptionAr: 'صيانة ميكانيكية أو سمكرة أو كهرباء أو تغيير زيت',
    group: 'maintenance',
    icon: 'bi-truck',
    createPermission: 'request.create.vehicle-maintenance',
    defaultExecutorScope: 'all',
  },
  {
    key: 'traffic-violation',
    nameAr: 'مخالفة مرورية',
    descriptionAr: 'تسجيل مخالفة مرورية على مركبة أو سائق',
    group: 'maintenance',
    icon: 'bi-camera-video',
    createPermission: 'request.create.traffic-violation',
    defaultExecutorScope: 'all',
  },
  {
    key: 'traffic-accident',
    nameAr: 'حادث مروري',
    descriptionAr: 'الإبلاغ عن حادث مروري مع تقرير نجم',
    group: 'maintenance',
    icon: 'bi-exclamation-triangle',
    createPermission: 'request.create.traffic-accident',
    defaultExecutorScope: 'all',
  },
  {
    key: 'purchase-request',
    nameAr: 'طلب شراء',
    descriptionAr: 'شراء أجهزة أو أدوات أو خدمات للفرع',
    group: 'procurement',
    icon: 'bi-cart3',
    createPermission: 'request.create.purchase-request',
    defaultExecutorScope: 'all',
  },
  {
    key: 'warehouse-need',
    nameAr: 'احتياج المستودع',
    descriptionAr: 'تأمين الاحتياجات والمواد من المستودع المركزي',
    group: 'procurement',
    icon: 'bi-box-seam',
    createPermission: 'request.create.warehouse-need',
    defaultExecutorScope: 'all',
  },
  {
    key: 'internal-event',
    nameAr: 'فعالية داخلية',
    descriptionAr: 'تنسيق فعالية أو مناسبة داخل المدرسة',
    group: 'activities',
    icon: 'bi-calendar-event',
    createPermission: 'request.create.internal-event',
    defaultExecutorScope: 'branch',
  },
  {
    key: 'bus-booking',
    nameAr: 'حجز باص',
    descriptionAr: 'حجز باصات الرحلات المدرسية',
    group: 'activities',
    icon: 'bi-bus-front',
    createPermission: 'request.create.bus-booking',
    defaultExecutorScope: 'all',
  },
  {
    key: 'complaint',
    nameAr: 'تقديم شكوى',
    descriptionAr: 'رفع شكوى أو ملاحظة على الخدمات المساندة',
    group: 'quality',
    icon: 'bi-chat-left-text',
    createPermission: 'request.create.complaint',
    defaultExecutorScope: 'all',
  },
];

export const SERVICE_BY_KEY: Record<ServiceKey, ServiceDefinition> = Object.fromEntries(
  SERVICES.map((s) => [s.key, s]),
) as Record<ServiceKey, ServiceDefinition>;

export const DEFAULT_REF_LISTS: RefLists = {
  maintenanceSpecialties: [
    { id: 'sp-elec', nameAr: 'كهرباء' },
    { id: 'sp-ac', nameAr: 'تكييف' },
    { id: 'sp-plumb', nameAr: 'سباكة' },
    { id: 'sp-civil', nameAr: 'مدني' },
    { id: 'sp-devices', nameAr: 'أجهزة' },
    { id: 'sp-other', nameAr: 'أخرى' },
  ],
  vehicleMaintenanceTypes: [
    { id: 'vm-mech', nameAr: 'ميكانيكا' },
    { id: 'vm-body', nameAr: 'سمكرة' },
    { id: 'vm-elec', nameAr: 'كهرباء' },
    { id: 'vm-oil', nameAr: 'تغيير زيت' },
  ],
  tripPurposes: [
    { id: 'tp-student', nameAr: 'رحلة طلابية' },
    { id: 'tp-activity', nameAr: 'نشاط مدرسي' },
    { id: 'tp-visit', nameAr: 'زيارة تعليمية' },
    { id: 'tp-external', nameAr: 'مشاركة خارجية' },
    { id: 'tp-admin', nameAr: 'مهمة إدارية' },
    { id: 'tp-other', nameAr: 'أخرى' },
  ],
  complaintCategories: [
    { id: 'cc-service', nameAr: 'جودة الخدمة' },
    { id: 'cc-delay', nameAr: 'تأخر في التنفيذ' },
    { id: 'cc-conduct', nameAr: 'سلوك موظف' },
    { id: 'cc-safety', nameAr: 'السلامة' },
    { id: 'cc-other', nameAr: 'أخرى' },
  ],
  blockedDays: [],
};

export const WEEKEND_DAYS: readonly number[] = [5, 6]; // Friday, Saturday (Date#getDay)
export const WEEK_START_DAY = 0; // Sunday
export const PASSENGERS_PER_BUS = 23;
export const SCHOOL_TAGLINE = 'أكثر من 44 عامًا من الريادة التعليمية';

export interface RequestTemplate {
  id: string;
  service: ServiceKey;
  titleAr: string;
  descriptionAr: string;
  priority: Priority;
  details?: Record<string, unknown>;
  icon: string;
}

/** Recurring-request templates offered on the new-request page (fields are prefilled, not locked). */
export const REQUEST_TEMPLATES: readonly RequestTemplate[] = [
  {
    id: 'tpl-ac-preventive',
    service: 'building-maintenance',
    titleAr: 'صيانة وقائية دورية للتكييف',
    descriptionAr: 'فحص دوري لوحدات التكييف: تنظيف الفلاتر وفحص الغاز والضغط وسلامة التوصيلات.',
    priority: 'preventive',
    details: { building: 'المبنى الرئيسي', specialty: 'sp-ac', injury: false },
    icon: 'bi-snow',
  },
  {
    id: 'tpl-ac-fault-hero',
    service: 'building-maintenance',
    titleAr: 'تسرب/عطل في تكييف فصل 3/ب',
    descriptionAr: 'مكيف الفصل لا يبرد ويسرّب ماءً من الوحدة الداخلية، وتحتاج حصص اليوم إلى معالجة سريعة.',
    priority: 'emergency',
    details: { building: 'المبنى الرئيسي', floor: 'الأول', room: 'فصل 3/ب', specialty: 'sp-ac', injury: false },
    icon: 'bi-thermometer-snow',
  },
  {
    id: 'tpl-bus-oil',
    service: 'vehicle-maintenance',
    titleAr: 'تغيير زيت دوري للباصات',
    descriptionAr: 'تغيير الزيت والفلاتر وفحص شامل حسب جدول الصيانة الوقائية.',
    priority: 'preventive',
    details: { maintenanceTypeId: 'vm-oil' },
    icon: 'bi-droplet-half',
  },
  {
    id: 'tpl-cleaning-supplies',
    service: 'warehouse-need',
    titleAr: 'احتياج مستلزمات النظافة الشهري',
    descriptionAr: 'المستلزمات الشهرية للنظافة: منظفات ومناديل وأكياس نفايات ومعقمات.',
    priority: 'normal',
    icon: 'bi-droplet',
  },
  {
    id: 'tpl-stationery',
    service: 'purchase-request',
    titleAr: 'شراء أدوات مكتبية لبداية الفصل',
    descriptionAr: 'توفير الأدوات المكتبية اللازمة للقسم مع بداية الفصل الدراسي.',
    priority: 'normal',
    icon: 'bi-pencil',
  },
];

/** Arabic labels for service-specific `details` keys shown on the request page. */
export const DETAIL_LABELS: Readonly<Record<string, string>> = {
  building: 'المبنى/الموقع',
  floor: 'الدور',
  room: 'الغرفة',
  entryAllowedTime: 'وقت السماح بالدخول',
  specialty: 'التخصص',
  injury: 'هل توجد إصابة أو حادث',
  scope: 'نطاق العمل',
  location: 'الموقع',
  justification: 'المبرر',
  plate: 'رقم اللوحة',
  driverName: 'السائق',
  vehicleType: 'نوع المركبة',
  maintenanceTypeId: 'نوع الصيانة',
  violationNo: 'رقم المخالفة',
  violationDate: 'تاريخ المخالفة',
  amount: 'المبلغ (ر.س)',
  accidentDate: 'تاريخ الحادث',
  atFaultName: 'المتسبب',
  faultPercent: 'نسبة الخطأ %',
  najmReportAttached: 'تقرير نجم',
  requestingParty: 'الجهة الطالبة',
  deptManagerName: 'مدير القسم',
  deliveryLocation: 'موقع التسليم',
  delayImpact: 'الأثر عند التأخير',
  eventDate: 'تاريخ الفعالية',
  place: 'المكان',
  attendees: 'عدد الحضور',
  needs: 'التجهيزات المطلوبة',
  tripCode: 'ترميز الرحلة',
  tripDate: 'تاريخ الرحلة',
  destination: 'وجهة الرحلة',
  purposeId: 'الغرض',
  passengers: 'عدد الركاب',
  buses: 'عدد الباصات',
  departTime: 'وقت الانطلاق',
  returnTime: 'وقت العودة',
  categoryId: 'التصنيف',
  confidential: 'سرية',
  linkedRequestRef: 'الطلب المشتكى منه',
  mapUrl: 'رابط الموقع',
  notes: 'ملاحظات',
  pledgeBy: 'أُقرّ بالتعهد بواسطة',
  pledgeAt: 'وقت الإقرار بالتعهد',
  parentEventRef: 'الفعالية الأصلية',
  parentRef: 'الطلب الأصلي',
};

export const EVENT_NEED_LABELS: Readonly<Record<string, string>> = {
  bus: 'باص',
  venue: 'تجهيز المكان / صيانة',
  materials: 'مواد من المستودع',
};
