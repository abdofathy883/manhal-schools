import { BlockedDay, dayKey, nextWorkingDay } from '../bookings/booking-rules';
import { Driver, Supplier, Vehicle, WarehouseItem } from '../models/reference';

export const SEED_VEHICLES: readonly Vehicle[] = [
  { id: 'v-01', plate: 'أ ب ج 1234', typeAr: 'باص 23 راكب', branchId: 'br-taawun', mileage: 148200, status: 'active', seats: 23, nextPreventiveDate: '2026-11-04' },
  { id: 'v-02', plate: 'د هـ و 2210', typeAr: 'باص 23 راكب', branchId: 'br-taawun', mileage: 132450, status: 'active', seats: 23, nextPreventiveDate: '2026-11-18' },
  { id: 'v-03', plate: 'ز ح ط 3387', typeAr: 'باص 30 راكب', branchId: 'br-taawun', mileage: 201900, status: 'in_workshop', seats: 30, nextPreventiveDate: '2026-10-28' },
  { id: 'v-04', plate: 'ك ل م 4471', typeAr: 'باص 23 راكب', branchId: 'br-murabba', mileage: 97300, status: 'active', seats: 23, nextPreventiveDate: '2026-12-02' },
  { id: 'v-05', plate: 'ن س ع 5532', typeAr: 'باص 23 راكب', branchId: 'br-murabba', mileage: 176800, status: 'active', seats: 23, nextPreventiveDate: '2026-11-11' },
  { id: 'v-06', plate: 'ف ص ق 6618', typeAr: 'باص 45 راكب', branchId: 'br-murabba', mileage: 233100, status: 'active', seats: 45, nextPreventiveDate: '2026-10-25' },
  { id: 'v-07', plate: 'ر ش ت 7704', typeAr: 'باص 23 راكب', branchId: 'br-rayyan', mileage: 88650, status: 'active', seats: 23, nextPreventiveDate: '2026-12-15' },
  { id: 'v-08', plate: 'ث خ ذ 8825', typeAr: 'باص 23 راكب', branchId: 'br-rayyan', mileage: 154020, status: 'active', seats: 23, nextPreventiveDate: '2026-11-30' },
  { id: 'v-09', plate: 'ض ظ غ 9046', typeAr: 'حافلة صغيرة 12 راكب', branchId: null, mileage: 64200, status: 'active', seats: 12, nextPreventiveDate: '2026-11-21' },
  { id: 'v-10', plate: 'أ أ ب 1357', typeAr: 'سيارة خدمات', branchId: null, mileage: 112300, status: 'active', nextPreventiveDate: '2026-11-08' },
  { id: 'v-11', plate: 'ج د هـ 2468', typeAr: 'وانيت نقل', branchId: null, mileage: 189500, status: 'in_workshop', nextPreventiveDate: '2026-10-30' },
  { id: 'v-12', plate: 'و ز ح 3579', typeAr: 'سيارة إدارة', branchId: null, mileage: 41250, status: 'active', nextPreventiveDate: '2027-01-10' },
];

export const SEED_DRIVERS: readonly Driver[] = [
  { id: 'd-01', nameAr: 'سعيد الغامدي', mobile: '0561110001', licenseNo: '1023456781', branchId: 'br-taawun', active: true },
  { id: 'd-02', nameAr: 'ناصر العمري', mobile: '0561110002', licenseNo: '1023456782', branchId: 'br-taawun', active: true },
  { id: 'd-03', nameAr: 'إبراهيم الحازمي', mobile: '0561110003', licenseNo: '1023456783', branchId: 'br-taawun', active: true },
  { id: 'd-04', nameAr: 'مشعل البقمي', mobile: '0561110004', licenseNo: '1023456784', branchId: 'br-murabba', active: true },
  { id: 'd-05', nameAr: 'حمد الرشيدي', mobile: '0561110005', licenseNo: '1023456785', branchId: 'br-murabba', active: true },
  { id: 'd-06', nameAr: 'عادل الخالدي', mobile: '0561110006', licenseNo: '1023456786', branchId: 'br-murabba', active: true },
  { id: 'd-07', nameAr: 'وليد الجبرين', mobile: '0561110007', licenseNo: '1023456787', branchId: 'br-rayyan', active: true },
  { id: 'd-08', nameAr: 'رائد السهلي', mobile: '0561110008', licenseNo: '1023456788', branchId: 'br-rayyan', active: true },
  { id: 'd-09', nameAr: 'فيصل الثبيتي', mobile: '0561110009', licenseNo: '1023456789', branchId: null, active: true },
  { id: 'd-10', nameAr: 'أنس المالكي', mobile: '0561110010', licenseNo: '1023456790', branchId: null, active: false },
];

type ItemRow = [code: string, nameAr: string, unitAr: string, stock: number, reorder: number, location: string, price: number];

const ITEM_ROWS: readonly ItemRow[] = [
  ['ELC-001', 'مصباح LED 18 واط', 'قطعة', 120, 40, 'A-01', 12],
  ['ELC-002', 'مفتاح إنارة مزدوج', 'قطعة', 45, 20, 'A-02', 18],
  ['ELC-003', 'قاطع كهربائي 32 أمبير', 'قطعة', 8, 10, 'A-03', 65],
  ['ELC-004', 'كيبل كهرباء 2.5 مم (لفة)', 'لفة', 14, 6, 'A-04', 210],
  ['ELC-005', 'مقبس كهرباء مزدوج', 'قطعة', 60, 25, 'A-05', 14],
  ['ACR-001', 'مكثف مروحة تكييف 35 ميكرو', 'قطعة', 0, 6, 'B-01', 85],
  ['ACR-002', 'غاز تبريد R410A (أسطوانة)', 'أسطوانة', 5, 4, 'B-02', 540],
  ['ACR-003', 'فلتر تكييف سبليت', 'قطعة', 70, 30, 'B-03', 22],
  ['ACR-004', 'ضاغط تكييف 24000 وحدة', 'قطعة', 2, 2, 'B-04', 1650],
  ['ACR-005', 'ثرموستات رقمي', 'قطعة', 11, 8, 'B-05', 95],
  ['PLB-001', 'حنفية مغسلة', 'قطعة', 32, 15, 'C-01', 48],
  ['PLB-002', 'خلاط مياه حائط', 'قطعة', 18, 10, 'C-02', 120],
  ['PLB-003', 'سيفون طرد مياه', 'قطعة', 9, 10, 'C-03', 135],
  ['PLB-004', 'ماسورة PVC 4 بوصة (3م)', 'قطعة', 40, 20, 'C-04', 36],
  ['PLB-005', 'عوامة خزان', 'قطعة', 16, 8, 'C-05', 30],
  ['CVL-001', 'دهان أبيض داخلي (جالون)', 'جالون', 55, 25, 'D-01', 98],
  ['CVL-002', 'أسمنت (كيس 50 كجم)', 'كيس', 30, 15, 'D-02', 19],
  ['CVL-003', 'بلاط أرضيات (م²)', 'م²', 140, 60, 'D-03', 42],
  ['CVL-004', 'باب خشبي داخلي', 'قطعة', 6, 3, 'D-04', 450],
  ['CVL-005', 'قفل باب مقبض', 'قطعة', 4, 12, 'D-05', 75],
  ['DEV-001', 'جهاز عرض (بروجكتر)', 'قطعة', 3, 2, 'E-01', 2300],
  ['DEV-002', 'سبورة ذكية 75 بوصة', 'قطعة', 1, 1, 'E-02', 9800],
  ['DEV-003', 'طابعة ليزر', 'قطعة', 5, 3, 'E-03', 1450],
  ['DEV-004', 'مروحة سقف', 'قطعة', 12, 6, 'E-04', 160],
  ['DEV-005', 'سماعات فصل', 'قطعة', 20, 8, 'E-05', 130],
  ['STN-001', 'ورق تصوير A4 (كرتون)', 'كرتون', 80, 40, 'F-01', 105],
  ['STN-002', 'أقلام سبورة (علبة)', 'علبة', 150, 60, 'F-02', 28],
  ['STN-003', 'دفاتر ملاحظات', 'قطعة', 260, 100, 'F-03', 4],
  ['STN-004', 'مجلدات حفظ', 'قطعة', 90, 50, 'F-04', 6],
  ['STN-005', 'حبر طابعة أسود', 'قطعة', 7, 10, 'F-05', 185],
  ['CLN-001', 'منظف أرضيات (جالون)', 'جالون', 65, 30, 'G-01', 24],
  ['CLN-002', 'مناديل ورقية (كرتون)', 'كرتون', 48, 25, 'G-02', 72],
  ['CLN-003', 'أكياس نفايات (لفة)', 'لفة', 110, 50, 'G-03', 9],
  ['CLN-004', 'معقم أيدي (لتر)', 'لتر', 3, 20, 'G-04', 16],
  ['CLN-005', 'مكنسة صناعية', 'قطعة', 4, 2, 'G-05', 520],
  ['SFT-001', 'طفاية حريق 6 كجم', 'قطعة', 14, 10, 'H-01', 110],
  ['SFT-002', 'حقيبة إسعافات أولية', 'قطعة', 9, 8, 'H-02', 85],
  ['SFT-003', 'لوحات إرشاد وسلامة', 'قطعة', 22, 10, 'H-03', 35],
  ['VEH-001', 'زيت محرك 5W-30 (4 لتر)', 'عبوة', 36, 20, 'I-01', 95],
  ['VEH-002', 'فلتر زيت باص', 'قطعة', 18, 15, 'I-02', 48],
];

export const SEED_ITEMS: readonly WarehouseItem[] = ITEM_ROWS.map(
  ([code, nameAr, unitAr, stock, reorderLevel, location, unitPrice], i) => ({
    id: `it-${String(i + 1).padStart(2, '0')}`,
    code,
    nameAr,
    unitAr,
    stock,
    reorderLevel,
    location,
    unitPrice,
  }),
);

export const SEED_SUPPLIERS: readonly Supplier[] = [
  { id: 's-01', nameAr: 'مؤسسة النخبة للتجهيزات', contactAr: 'أبو سلمان', mobile: '0541110001' },
  { id: 's-02', nameAr: 'شركة الأفق للتكييف والتبريد', contactAr: 'م. حسام', mobile: '0541110002' },
  { id: 's-03', nameAr: 'مؤسسة بيت الكهرباء', contactAr: 'أبو فيصل', mobile: '0541110003' },
  { id: 's-04', nameAr: 'شركة الرائد للأدوات المكتبية', contactAr: 'أ. ليلى', mobile: '0541110004' },
  { id: 's-05', nameAr: 'مؤسسة المتقدمة للسباكة', contactAr: 'أبو ياسر', mobile: '0541110005' },
  { id: 's-06', nameAr: 'شركة الإتقان للمقاولات', contactAr: 'م. وليد', mobile: '0541110006' },
  { id: 's-07', nameAr: 'مركز السلامة الأول', contactAr: 'أ. هيفاء', mobile: '0541110007' },
  { id: 's-08', nameAr: 'مؤسسة الخليج لقطع غيار المركبات', contactAr: 'أبو عبدالعزيز', mobile: '0541110008' },
];

/** Holidays and exam days of the bus calendar, relative to the (re)seed day so the demo always has upcoming ones. */
export function seedBlockedDays(now: Date): BlockedDay[] {
  const plan: Array<[offsetDays: number, reasonAr: string]> = [
    [14, 'اختبارات منتصف الفصل'],
    [21, 'إجازة رسمية'],
    [35, 'اختبارات نهاية الفصل'],
  ];
  return plan.map(([offset, reasonAr], i) => {
    const date = nextWorkingDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
    return { id: `bd-seed-${i + 1}`, date: dayKey(date), reasonAr };
  });
}
