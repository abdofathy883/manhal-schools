import { PermissionDef } from './models/rbac';
import { SERVICES } from './reference-data';

const M = {
  requests: 'الطلبات',
  warehouse: 'المستودع',
  purchasing: 'المشتريات',
  fleet: 'المركبات والسائقون',
  transport: 'النقل',
  complaints: 'الشكاوى',
  reports: 'التقارير',
  admin: 'الإدارة والنظام',
} as const;

function def(
  key: string,
  label: string,
  module: string,
  description: string,
  scoped = false,
): PermissionDef {
  return { key, label, module, description, scoped };
}

const createPermissions: PermissionDef[] = SERVICES.map((s) =>
  def(
    s.createPermission,
    `إنشاء طلب: ${s.nameAr}`,
    M.requests,
    `السماح بتقديم طلب من نوع «${s.nameAr}»`,
  ),
);

export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  ...createPermissions,
  def('request.view', 'عرض الطلبات', M.requests, 'الاطلاع على الطلبات ضمن النطاق المحدد', true),
  def('request.view.confidential', 'عرض الطلبات السرية', M.requests, 'الاطلاع على الحوادث والمخالفات والطلبات الحساسة', true),
  def('request.comment.public', 'تعليق ظاهر لمقدم الطلب', M.requests, 'إضافة تعليق يراه مقدم الطلب'),
  def('request.comment.internal', 'تعليق داخلي للمنفذين', M.requests, 'إضافة وعرض التعليقات الداخلية'),
  def('request.attach', 'إرفاق ملفات', M.requests, 'رفع مرفقات على الطلب'),
  def('request.cancel.own', 'إلغاء طلباتي', M.requests, 'إلغاء الطلب قبل الاعتماد'),
  def('request.review', 'مراجعة الطلبات', M.requests, 'التحقق من اكتمال بيانات الطلب', true),
  def('request.approve.department', 'اعتماد مدير القسم', M.requests, 'اعتماد طلبات القسم', true),
  def('request.approve.branch', 'اعتماد مشرف الفرع', M.requests, 'اعتماد طلبات الفرع', true),
  def('request.approve.finance', 'اعتماد مالي', M.requests, 'الاعتماد حسب الحدود المالية'),
  def('request.approve.executive', 'اعتماد الإدارة العليا', M.requests, 'اعتماد المبالغ الكبيرة'),
  def('request.assign', 'إسناد الطلبات', M.requests, 'إسناد الطلب لمنفذ أو فني', true),
  def('request.execute', 'تنفيذ الطلبات', M.requests, 'تسجيل الفحص والتنفيذ والتكلفة', true),
  def('request.reject', 'رفض الطلبات', M.requests, 'رفض الطلب مع ذكر السبب', true),
  def('request.close', 'إغلاق الطلبات', M.requests, 'إغلاق الطلب بعد التنفيذ', true),
  def('request.confirm', 'تأكيد الاستلام والنتيجة', M.requests, 'تأكيد مقدم الطلب لنتيجة التنفيذ'),
  def('request.rate', 'تقييم الخدمة', M.requests, 'تقييم الخدمة بعد الإغلاق'),
  def('request.escalate', 'تصعيد الطلبات', M.requests, 'تصعيد الطلب المتأخر يدويًا', true),
  def('request.export', 'تصدير الطلبات', M.requests, 'تصدير قوائم الطلبات إلى CSV', true),

  def('warehouse.view', 'عرض المستودع', M.warehouse, 'الاطلاع على الأصناف والأرصدة'),
  def('warehouse.issue', 'صرف من المستودع', M.warehouse, 'صرف الأصناف للطلبات'),
  def('warehouse.stockin', 'إدخال مخزون', M.warehouse, 'تسجيل استلام الأصناف'),
  def('warehouse.audit', 'جرد المستودع', M.warehouse, 'تنفيذ الجرد وتسوية الفروقات'),

  def('purchasing.view', 'عرض المشتريات', M.purchasing, 'الاطلاع على طلبات الشراء ضمن المشتريات'),
  def('purchasing.quote', 'عروض الأسعار', M.purchasing, 'إضافة ومقارنة عروض الأسعار'),
  def('purchasing.po', 'أوامر التوريد', M.purchasing, 'إصدار أوامر التوريد'),
  def('purchasing.receive', 'استلام التوريد', M.purchasing, 'تسجيل استلام البضاعة'),

  def('fleet.vehicle.view', 'عرض ملف المركبة', M.fleet, 'الاطلاع على ملفات المركبات'),
  def('fleet.driver.view', 'عرض ملف السائق', M.fleet, 'الاطلاع على ملفات السائقين'),
  def('fleet.workshop.work', 'العمل في الورشة المركزية', M.fleet, 'شاشة عمل الورشة المركزية'),

  def('transport.calendar.view', 'عرض تقويم الباصات', M.transport, 'الاطلاع على توفر الباصات', true),
  def('transport.calendar.manage', 'إدارة تقويم الباصات', M.transport, 'حجب الأيام وإدارة قائمة الانتظار'),
  def('transport.allocate', 'تخصيص باص وسائق', M.transport, 'تخصيص الباصات والسائقين للحجوزات'),

  def('complaints.handle', 'معالجة الشكاوى', M.complaints, 'صندوق الشكاوى والرد عليها'),
  def('complaints.view.confidential', 'عرض الشكاوى السرية', M.complaints, 'الاطلاع على الشكاوى السرية'),

  def('reports.executive', 'لوحة الإدارة العليا', M.reports, 'نظرة شاملة على الأداء'),
  def('reports.maintenance', 'تقارير الصيانة', M.reports, 'الأعطال والأصول وأداء الفنيين'),
  def('reports.fleet', 'تقارير المركبات', M.reports, 'تكلفة المركبات والمخالفات'),
  def('reports.transport', 'تقارير النقل', M.reports, 'استخدام الباصات'),
  def('reports.procurement', 'تقارير المشتريات', M.reports, 'الإنفاق والمخزون'),
  def('reports.quality', 'تقارير الجودة', M.reports, 'الشكاوى والتقييم'),
  def('reports.export', 'تصدير التقارير', M.reports, 'تصدير التقارير إلى CSV'),

  def('admin.users', 'إدارة المستخدمين', M.admin, 'إضافة المستخدمين وتعديل بياناتهم'),
  def('admin.rbac', 'إدارة الأدوار والصلاحيات', M.admin, 'تعديل مصفوفة الصلاحيات'),
  def('admin.reference', 'البيانات المرجعية', M.admin, 'تعديل القوائم المرجعية'),
  def('admin.sla', 'مدد الاستجابة', M.admin, 'ضبط مدد الاستجابة والتصعيد'),
  def('admin.limits', 'الحدود المالية', M.admin, 'ضبط حدود الاعتماد'),
  def('admin.audit', 'سجل التدقيق', M.admin, 'الاطلاع على سجل التدقيق'),
  def('admin.demo', 'أدوات العرض', M.admin, 'إعادة ضبط بيانات العرض'),
];

export const PERMISSION_BY_KEY: ReadonlyMap<string, PermissionDef> = new Map(
  PERMISSION_CATALOG.map((p) => [p.key, p]),
);

export const PERMISSION_MODULES: readonly string[] = [...new Set(PERMISSION_CATALOG.map((p) => p.module))];
