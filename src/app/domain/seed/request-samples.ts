import { Priority, ServiceKey } from '../models/request';

/** Realistic Arabic titles/descriptions used by the request seeder (one pool per service). */
export interface Sample {
  titleAr: string;
  descriptionAr: string;
  /** Extra service-specific form values merged into `details`. */
  details?: Record<string, unknown>;
  priority?: Priority;
}

export const SAMPLES: Readonly<Record<ServiceKey, readonly Sample[]>> = {
  'building-maintenance': [
    { titleAr: 'عطل في تكييف فصل 2/أ', descriptionAr: 'المكيف يعمل ولا يبرد، ويصدر صوتًا عاليًا من الوحدة الخارجية.', details: { building: 'المبنى الرئيسي', floor: 'الأول', room: 'فصل 2/أ', specialty: 'sp-ac', injury: false }, priority: 'urgent' },
    { titleAr: 'تسرب مياه في دورة مياه الطالبات', descriptionAr: 'تسرب مياه من الخلاط ووصول المياه إلى الممر المجاور.', details: { building: 'المبنى الرئيسي', floor: 'الأرضي', room: 'دورات المياه', specialty: 'sp-plumb', injury: false }, priority: 'high' },
    { titleAr: 'إنارة معطلة في ممر الدور الثاني', descriptionAr: 'ثلاث وحدات إنارة لا تعمل في الممر الشرقي ويصعب الرؤية مساءً.', details: { building: 'المبنى الرئيسي', floor: 'الثاني', room: 'الممر الشرقي', specialty: 'sp-elec', injury: false }, priority: 'normal' },
    { titleAr: 'باب فصل لا يُغلق بإحكام', descriptionAr: 'قفل باب الفصل تالف ولا يمكن إغلاقه بالمفتاح.', details: { building: 'مبنى الصفوف الأولية', floor: 'الأرضي', room: 'فصل 1/ب', specialty: 'sp-civil', injury: false }, priority: 'normal' },
    { titleAr: 'ماس كهربائي في مقبس مكتب الإدارة', descriptionAr: 'شرارة وانقطاع في المقبس عند توصيل الشاحن، يُرجى المعالجة العاجلة.', details: { building: 'مبنى الإدارة', floor: 'الأول', room: 'مكتب المديرة', specialty: 'sp-elec', injury: false }, priority: 'emergency' },
    { titleAr: 'عطل في جهاز العرض بقاعة النشاط', descriptionAr: 'جهاز العرض لا يظهر الصورة رغم توصيله بالحاسب.', details: { building: 'قاعة النشاط', floor: 'الأرضي', room: 'القاعة', specialty: 'sp-devices', injury: false }, priority: 'normal' },
    { titleAr: 'تكييف المعمل لا يعمل', descriptionAr: 'توقف المكيف بالكامل ودرجة الحرارة داخل المعمل مرتفعة.', details: { building: 'المبنى الرئيسي', floor: 'الثاني', room: 'معمل الحاسب', specialty: 'sp-ac', injury: false }, priority: 'urgent' },
    { titleAr: 'تشقق في جدار الفناء', descriptionAr: 'ظهور شرخ طولي في جدار الفناء الخلفي ويحتاج إلى فحص.', details: { building: 'الفناء الخلفي', floor: 'الأرضي', room: '—', specialty: 'sp-civil', injury: false }, priority: 'high' },
    { titleAr: 'انسداد في مصرف مغاسل الوضوء', descriptionAr: 'تجمع المياه في مغاسل الوضوء وبطء شديد في التصريف.', details: { building: 'المصلى', floor: 'الأرضي', room: 'المغاسل', specialty: 'sp-plumb', injury: false }, priority: 'normal' },
    { titleAr: 'تلف مروحة سقف في الفصل', descriptionAr: 'المروحة تهتز بشدة وتصدر طقطقة وتحتاج إلى استبدال.', details: { building: 'مبنى الصفوف الأولية', floor: 'الأول', room: 'فصل 3/ج', specialty: 'sp-elec', injury: false }, priority: 'normal' },
  ],
  'works-execution': [
    { titleAr: 'تركيب ستائر عازلة لقاعة المكتبة', descriptionAr: 'توريد وتركيب ستائر عازلة للضوء لنوافذ المكتبة الست.', details: { scope: 'توريد وتركيب ستائر لست نوافذ', location: 'المكتبة', justification: 'تحسين بيئة القراءة وتقليل الوهج' }, priority: 'normal' },
    { titleAr: 'دهان ممرات الدور الأرضي', descriptionAr: 'إعادة دهان جدران الممرات بالكامل قبل بداية الفصل الدراسي.', details: { scope: 'دهان داخلي للممرات (٤٢٠ م²)', location: 'الدور الأرضي', justification: 'تقادم الدهان وظهور تقشر' }, priority: 'normal' },
    { titleAr: 'إنشاء مظلة لساحة الطابور', descriptionAr: 'تنفيذ مظلة معدنية تغطي جزءًا من ساحة الطابور.', details: { scope: 'مظلة معدنية ١٢×٨ م', location: 'ساحة الطابور', justification: 'حماية الطلاب من الشمس' }, priority: 'high' },
    { titleAr: 'تجهيز مصلى جديد بالفرع', descriptionAr: 'فرش المصلى وتركيب الإنارة والتهوية.', details: { scope: 'تجهيز كامل للمصلى', location: 'الدور الأرضي', justification: 'زيادة عدد الطلاب' }, priority: 'normal' },
    { titleAr: 'تبديل بلاط ملعب الأطفال', descriptionAr: 'استبدال البلاط المتضرر في منطقة ألعاب KG.', details: { scope: 'استبدال بلاط مطاطي (١٨٠ م²)', location: 'ملعب KG', justification: 'خطر السقوط على الأطفال' }, priority: 'high' },
    { titleAr: 'تقسيم قاعة متعددة الأغراض', descriptionAr: 'تركيب حاجز متحرك لتقسيم القاعة إلى جزأين.', details: { scope: 'حاجز صوتي متحرك', location: 'القاعة متعددة الأغراض', justification: 'استخدام القاعة لنشاطين متزامنين' }, priority: 'normal' },
  ],
  'vehicle-maintenance': [
    { titleAr: 'صيانة دورية للباص قبل بداية الفصل', descriptionAr: 'فحص شامل وتغيير الزيوت والفلاتر.', details: { maintenanceTypeId: 'vm-oil' }, priority: 'preventive' },
    { titleAr: 'تسريب زيت من محرك الباص', descriptionAr: 'ظهور بقع زيت تحت المحرك بعد التوقف.', details: { maintenanceTypeId: 'vm-mech' }, priority: 'high' },
    { titleAr: 'إصلاح مكيف الباص', descriptionAr: 'مكيف الباص لا يبرد خلال الرحلات الصباحية.', details: { maintenanceTypeId: 'vm-elec' }, priority: 'urgent' },
    { titleAr: 'سمكرة وطلاء الجهة اليمنى', descriptionAr: 'خدوش وانبعاج في الباب الأمامي بعد احتكاك.', details: { maintenanceTypeId: 'vm-body' }, priority: 'normal' },
    { titleAr: 'تبديل بطارية الباص', descriptionAr: 'صعوبة في التشغيل صباحًا وضعف في البطارية.', details: { maintenanceTypeId: 'vm-elec' }, priority: 'urgent' },
    { titleAr: 'تغيير زيت وفلاتر للحافلة الصغيرة', descriptionAr: 'تجاوز العداد الحد الموصى به لتغيير الزيت.', details: { maintenanceTypeId: 'vm-oil' }, priority: 'preventive' },
    { titleAr: 'اهتزاز في المقود عند السرعة', descriptionAr: 'اهتزاز واضح عند تجاوز ٨٠ كم/س ويحتاج ضبط الإطارات.', details: { maintenanceTypeId: 'vm-mech' }, priority: 'high' },
    { titleAr: 'إصلاح إنارة الباص الخلفية', descriptionAr: 'إضاءة الفرامل الخلفية لا تعمل.', details: { maintenanceTypeId: 'vm-elec' }, priority: 'urgent' },
  ],
  'traffic-violation': [
    { titleAr: 'مخالفة تجاوز السرعة المسموحة', descriptionAr: 'مخالفة رصدها ساهر على الطريق الدائري.', details: { amount: 300 } },
    { titleAr: 'مخالفة وقوف في منطقة ممنوعة', descriptionAr: 'وقوف الباص أمام بوابة الفرع في منطقة ممنوعة.', details: { amount: 150 } },
    { titleAr: 'مخالفة قطع إشارة حمراء', descriptionAr: 'مخالفة رُصدت على تقاطع شارع الملك فهد.', details: { amount: 1000 } },
    { titleAr: 'مخالفة عدم ربط حزام الأمان', descriptionAr: 'مخالفة تسجلت أثناء الرحلة الميدانية.', details: { amount: 150 } },
    { titleAr: 'مخالفة تجاوز السرعة في الطريق السريع', descriptionAr: 'مخالفة رصدتها كاميرا ثابتة بين المدينتين.', details: { amount: 500 } },
  ],
  'traffic-accident': [
    { titleAr: 'حادث اصطدام خفيف عند بوابة الفرع', descriptionAr: 'احتكاك جانبي مع سيارة خاصة أثناء الدخول لساحة الانتظار، دون إصابات.', details: { location: 'بوابة الفرع', faultPercent: 30 } },
    { titleAr: 'حادث تصادم على الطريق الدائري', descriptionAr: 'تصادم من الخلف أثناء عودة الباص من رحلة طلابية، دون إصابات.', details: { location: 'الطريق الدائري الشرقي', faultPercent: 0 } },
    { titleAr: 'ارتطام بعمود إنارة في الموقف', descriptionAr: 'ارتطام أثناء الرجوع للخلف في موقف الباصات.', details: { location: 'موقف الباصات', faultPercent: 100 } },
  ],
  'purchase-request': [
    { titleAr: 'شراء أجهزة عرض للفصول', descriptionAr: 'توفير أجهزة عرض لثلاثة فصول جديدة.', details: { items: [{ description: 'جهاز عرض 4000 لومن', unit: 'قطعة', qty: 3, price: 2300, notes: '' }], justification: 'فتح ثلاثة فصول جديدة', delayImpact: 'تعطل التدريس بالوسائل الحديثة' } },
    { titleAr: 'شراء أدوات مكتبية لبداية الفصل', descriptionAr: 'أقلام سبورة وورق ودفاتر للقسم.', details: { items: [{ description: 'أقلام سبورة', unit: 'علبة', qty: 40, price: 28, notes: '' }, { description: 'ورق تصوير A4', unit: 'كرتون', qty: 20, price: 105, notes: '' }], justification: 'احتياج بداية الفصل', delayImpact: 'نقص في المستلزمات اليومية' } },
    { titleAr: 'شراء أثاث لغرفة المعلمات', descriptionAr: 'كراسي ومكاتب لغرفة المعلمات الجديدة.', details: { items: [{ description: 'مكتب معلمة', unit: 'قطعة', qty: 8, price: 1450, notes: '' }, { description: 'كرسي مكتب', unit: 'قطعة', qty: 8, price: 620, notes: '' }], justification: 'استحداث غرفة جديدة', delayImpact: 'ازدحام المعلمات' } },
    { titleAr: 'شراء حاسبات محمولة لمعمل اللغة', descriptionAr: 'حاسبات لتجهيز معمل اللغة الإنجليزية.', details: { items: [{ description: 'حاسب محمول', unit: 'قطعة', qty: 20, price: 3100, notes: '' }], justification: 'تجهيز المعمل', delayImpact: 'تأخر تفعيل المنهج الرقمي' } },
    { titleAr: 'شراء مكيفات سبليت للفصول', descriptionAr: 'استبدال مكيفات قديمة لثمانية فصول.', details: { items: [{ description: 'مكيف سبليت 24000 وحدة', unit: 'قطعة', qty: 8, price: 3600, notes: '' }], justification: 'تعطل الوحدات القديمة بشكل متكرر', delayImpact: 'ارتفاع الحرارة في الفصول' } },
    { titleAr: 'شراء مواد معمل العلوم', descriptionAr: 'كواشف وأدوات زجاجية لمعمل الكيمياء.', details: { items: [{ description: 'طقم أدوات زجاجية', unit: 'طقم', qty: 6, price: 640, notes: '' }], justification: 'تنفيذ التجارب العملية', delayImpact: 'إلغاء الحصص العملية' } },
    { titleAr: 'شراء ألعاب تعليمية لـ KG', descriptionAr: 'ألعاب تفاعلية للمرحلة التمهيدية.', details: { items: [{ description: 'ألعاب تعليمية متنوعة', unit: 'مجموعة', qty: 12, price: 350, notes: '' }], justification: 'تحديث الركن التعليمي', delayImpact: 'ضعف التفاعل الصفي' } },
    { titleAr: 'شراء لوحات إرشاد وسلامة', descriptionAr: 'لوحات إخلاء وإرشاد لجميع الأدوار.', details: { items: [{ description: 'لوحة إرشادية', unit: 'قطعة', qty: 30, price: 35, notes: '' }], justification: 'متطلبات الدفاع المدني', delayImpact: 'مخالفة اشتراطات السلامة' } },
    { titleAr: 'شراء سبورات ذكية', descriptionAr: 'سبورات ذكية لقسم المتوسط.', details: { items: [{ description: 'سبورة ذكية 75 بوصة', unit: 'قطعة', qty: 10, price: 9800, notes: '' }], justification: 'التحول الرقمي', delayImpact: 'تأخر خطة التحول' } },
    { titleAr: 'شراء أجهزة تبريد مياه', descriptionAr: 'برادات مياه للممرات.', details: { items: [{ description: 'برادة مياه', unit: 'قطعة', qty: 6, price: 780, notes: '' }], justification: 'نقص مصادر مياه الشرب', delayImpact: 'ازدحام الطلاب' } },
    { titleAr: 'شراء كراسي طلاب', descriptionAr: 'كراسي بديلة لتالفة في الفصول.', details: { items: [{ description: 'كرسي طالب', unit: 'قطعة', qty: 60, price: 185, notes: '' }], justification: 'تلف الكراسي الحالية', delayImpact: 'جلوس الطلاب على مقاعد غير مناسبة' } },
    { titleAr: 'شراء أنظمة صوت للمسرح', descriptionAr: 'نظام صوتي كامل لمسرح المدرسة.', details: { items: [{ description: 'نظام صوت مسرحي', unit: 'نظام', qty: 1, price: 58000, notes: '' }], justification: 'الحفلات والفعاليات', delayImpact: 'تعذر إقامة الفعاليات' } },
  ],
  'warehouse-need': [
    { titleAr: 'احتياج مستلزمات نظافة للفصل الدراسي', descriptionAr: 'منظفات ومناديل وأكياس نفايات للقسم.' },
    { titleAr: 'احتياج أدوات كتابة للمعلمات', descriptionAr: 'أقلام وأوراق ومجلدات.' },
    { titleAr: 'احتياج لمبات إنارة للممرات', descriptionAr: 'استبدال المصابيح التالفة في الممرات.' },
    { titleAr: 'احتياج مواد سلامة', descriptionAr: 'طفايات وحقائب إسعاف للأقسام.' },
    { titleAr: 'احتياج فلاتر مكيفات', descriptionAr: 'فلاتر لصيانة مكيفات الفصول.' },
    { titleAr: 'احتياج حبر طابعات', descriptionAr: 'أحبار طابعات الإدارة.' },
    { titleAr: 'احتياج مناديل ومعقمات', descriptionAr: 'مستلزمات النظافة الشخصية للطلاب.' },
  ],
  'internal-event': [
    { titleAr: 'حفل اليوم الوطني', descriptionAr: 'حفل تربوي بمناسبة اليوم الوطني بمشاركة الطلاب وأولياء الأمور.', details: { place: 'الساحة الرئيسية', attendees: 450, needs: ['bus', 'venue', 'materials'] } },
    { titleAr: 'معرض العلوم السنوي', descriptionAr: 'عرض مشاريع الطلاب في العلوم.', details: { place: 'القاعة متعددة الأغراض', attendees: 220, needs: ['venue', 'materials'] } },
    { titleAr: 'يوم التأسيس', descriptionAr: 'فعالية تراثية للمرحلة الابتدائية.', details: { place: 'الفناء الأمامي', attendees: 300, needs: ['venue'] } },
    { titleAr: 'لقاء أولياء الأمور', descriptionAr: 'لقاء دوري لعرض نتائج الفصل الأول.', details: { place: 'قاعة الاجتماعات', attendees: 120, needs: ['venue', 'materials'] } },
    { titleAr: 'مسابقة القرآن الكريم', descriptionAr: 'مسابقة حفظ وتلاوة على مستوى الفرع.', details: { place: 'المصلى', attendees: 160, needs: ['materials'] } },
  ],
  'bus-booking': [
    { titleAr: 'رحلة علمية إلى مركز العلوم', descriptionAr: 'رحلة تعليمية لطلاب الصف الخامس.', details: { destination: 'مركز العلوم', purposeId: 'tp-visit', passengers: 46, departTime: '08:00', returnTime: '11:30' } },
    { titleAr: 'زيارة معرض الكتاب', descriptionAr: 'زيارة جماعية لطلاب المتوسط.', details: { destination: 'مركز المعارض', purposeId: 'tp-student', passengers: 69, departTime: '08:30', returnTime: '12:00' } },
    { titleAr: 'مشاركة في ملتقى الموهوبين', descriptionAr: 'نقل فريق الموهوبين.', details: { destination: 'جامعة الملك سعود', purposeId: 'tp-external', passengers: 23, departTime: '07:45', returnTime: '12:00' } },
    { titleAr: 'نشاط رياضي مع مدرسة شقيقة', descriptionAr: 'مباراة ودية لفريق كرة القدم.', details: { destination: 'مدارس المنهل — فرع المربع', purposeId: 'tp-activity', passengers: 30, departTime: '09:00', returnTime: '12:15' } },
    { titleAr: 'زيارة مصنع للمنتجات الغذائية', descriptionAr: 'زيارة تعليمية لطلاب الصف السادس.', details: { destination: 'المدينة الصناعية', purposeId: 'tp-visit', passengers: 92, departTime: '08:00', returnTime: '12:00' } },
    { titleAr: 'رحلة ترفيهية لطلاب KG', descriptionAr: 'رحلة إلى حديقة الحيوان.', details: { destination: 'حديقة الحيوان', purposeId: 'tp-student', passengers: 46, departTime: '08:15', returnTime: '11:45' } },
    { titleAr: 'مهمة إدارية — نقل مستندات', descriptionAr: 'نقل مستندات ومعدات بين الفروع.', details: { destination: 'مقر الإدارة', purposeId: 'tp-admin', passengers: 23, departTime: '09:00', returnTime: '11:00' } },
    { titleAr: 'زيارة متحف المنطقة', descriptionAr: 'زيارة تعليمية لطلاب الصف الرابع.', details: { destination: 'متحف المنطقة', purposeId: 'tp-visit', passengers: 115, departTime: '07:30', returnTime: '12:15' } },
    { titleAr: 'مشاركة في مسابقة الروبوت', descriptionAr: 'نقل فريق الروبوت.', details: { destination: 'مركز المسابقات', purposeId: 'tp-external', passengers: 27, departTime: '08:00', returnTime: '12:00' } },
    { titleAr: 'رحلة ختامية للصف الثالث الثانوي', descriptionAr: 'رحلة ختامية على مستوى الدفعة.', details: { destination: 'منتجع البر', purposeId: 'tp-student', passengers: 138, departTime: '07:15', returnTime: '12:15' } },
  ],
  complaint: [
    { titleAr: 'تأخر معالجة طلب صيانة التكييف', descriptionAr: 'مر أسبوع على طلب صيانة التكييف ولم يحضر الفني.', details: { categoryId: 'cc-delay', confidential: false } },
    { titleAr: 'ملاحظة على نظافة دورات المياه', descriptionAr: 'نظافة دورات المياه دون المستوى المطلوب خلال الأسبوع الماضي.', details: { categoryId: 'cc-service', confidential: false } },
    { titleAr: 'سلوك غير لائق من أحد العاملين', descriptionAr: 'أود رفع ملاحظة بسرية تامة حول تعامل أحد العاملين مع الطلاب.', details: { categoryId: 'cc-conduct', confidential: true } },
    { titleAr: 'خطورة سلم الدور الثاني', descriptionAr: 'أحد الدرجات متآكل وقد يسبب السقوط.', details: { categoryId: 'cc-safety', confidential: false } },
    { titleAr: 'ضعف تواصل قسم المشتريات', descriptionAr: 'لا يتم إخطارنا بحالة طلبات الشراء.', details: { categoryId: 'cc-service', confidential: false } },
    { titleAr: 'ازدحام عند بوابة الخروج', descriptionAr: 'تكدس الباصات عند البوابة وقت الانصراف.', details: { categoryId: 'cc-other', confidential: false } },
  ],
};

export const INTERNAL_COMMENTS: readonly string[] = [
  'تم الاتفاق مع المقاول على موعد الزيارة صباح الغد.',
  'القطعة متوفرة لدى المورد ويمكن تسليمها خلال يومين.',
  'يحتاج الموقع إلى إيقاف التيار قبل بدء العمل.',
  'تم التنسيق مع الفرع لتأمين الدخول.',
  'التكلفة المتوقعة أعلى من التقدير الأولي.',
];

export const PUBLIC_COMMENTS: readonly string[] = [
  'شكرًا لكم، نرجو سرعة المعالجة.',
  'تم استلام الطلب وسيتم التواصل معكم قريبًا.',
  'يرجى تأكيد وقت مناسب لدخول الموقع.',
  'تم تحديث الطلب بالمعلومات المطلوبة.',
];
