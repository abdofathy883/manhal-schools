import { User } from '../models/rbac';
import { ROLE_IDS } from './roles.seed';

const COLORS = ['#1B4F7B', '#2B93B0', '#2E7D4F', '#8E5BA8', '#C0392B', '#D2822A', '#3F6FB0', '#5C7A29'];

let colorIndex = 0;

function user(
  employeeId: string,
  nameAr: string,
  roleId: string,
  jobTitleAr: string,
  branchId: string | null,
  departmentId: string | null,
  mobile: string,
): User {
  return {
    id: `u-${employeeId.toLowerCase()}`,
    employeeId,
    nameAr,
    mobile,
    email: `${employeeId.toLowerCase()}@manhal.edu.sa`,
    avatarColor: COLORS[colorIndex++ % COLORS.length],
    branchId,
    departmentId,
    roleIds: [roleId],
    jobTitleAr,
    active: true,
  };
}

export const SEED_USERS: readonly User[] = [
  user('E1001', 'نورة العتيبي', ROLE_IDS.requester, 'معلمة', 'br-taawun', 'dp-prim-g', '0551230001'),
  user('E1002', 'هند الشمري', ROLE_IDS.deptManager, 'مديرة القسم', 'br-taawun', 'dp-prim-g', '0551230002'),
  user('E1003', 'فهد القحطاني', ROLE_IDS.branchSupervisor, 'مشرف الفرع', 'br-taawun', null, '0551230003'),
  user('E1004', 'ماجد الدوسري', ROLE_IDS.maintenanceLead, 'مسؤول الصيانة', null, null, '0551230004'),
  user('E1005', 'سلطان الزهراني', ROLE_IDS.technician, 'فني تكييف', 'br-taawun', null, '0551230005'),
  user('E1006', 'عبدالله المطيري', ROLE_IDS.warehouse, 'أمين المستودع', null, null, '0551230006'),
  user('E1007', 'تركي السبيعي', ROLE_IDS.purchasing, 'أخصائي مشتريات', null, null, '0551230007'),
  user('E1008', 'ريم الغامدي', ROLE_IDS.finance, 'الإدارة المالية', null, null, '0551230008'),
  user('E1009', 'يوسف العنزي', ROLE_IDS.transport, 'مسؤول النقل', null, null, '0551230009'),
  user('E1010', 'بدر الشهري', ROLE_IDS.workshop, 'مسؤول الورشة المركزية', null, null, '0551230010'),
  user('E1011', 'منى الجهني', ROLE_IDS.complaints, 'مسؤولة الشكاوى', null, null, '0551230011'),
  user('E1012', 'أحمد الراشد', ROLE_IDS.executive, 'الإدارة العليا', null, 'dp-admin', '0551230012'),
  user('E1013', 'محمد السالم', ROLE_IDS.admin, 'مدير النظام', null, 'dp-admin', '0551230013'),
  user('E1014', 'عمر الشريف', ROLE_IDS.requester, 'معلم', 'br-rayyan', 'dp-sec-b', '0551230014'),
  user('E1015', 'خالد الحربي', ROLE_IDS.deptManager, 'مدير القسم', 'br-rayyan', 'dp-sec-b', '0551230015'),
];

/** Employee ID shown in the login screen's quick-fill chips. */
export const QUICK_LOGIN_HINTS: ReadonlyArray<{ employeeId: string; labelAr: string }> = [
  { employeeId: 'E1001', labelAr: 'معلمة' },
  { employeeId: 'E1002', labelAr: 'مديرة قسم' },
  { employeeId: 'E1004', labelAr: 'مسؤول الصيانة' },
  { employeeId: 'E1013', labelAr: 'مدير النظام' },
];

export const DEMO_OTP = '123456';
