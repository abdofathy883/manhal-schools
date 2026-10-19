import { SeededRandom } from '../../core/mock-db/prng';
import { AppNotification, AuditEntry, DEFAULT_SETTINGS } from '../models/platform';
import { ScopedResource } from '../models/rbac';
import { AttachmentMeta, HoldReason, Priority, RequestStatus, ServiceKey, ServiceRequest } from '../models/request';
import { BRANCHES, DEPARTMENTS } from '../reference-data';
import {
  ActionKey,
  ActionPayload,
  Actor,
  EngineContext,
  EngineResult,
  RequestDraft,
  addComment,
  attachChildren,
  createRequest,
  perform,
  spawnChild,
  sweepSla,
} from '../workflows/engine';
import { currentStep } from '../workflows/approval-chain';
import { planChildren, tripCodeFor } from '../workflows/event-children';
import { WORKFLOWS } from '../workflows/workflow-defs';
import { BusSlot, busesFor, dayKey, nextWorkingDay } from '../bookings/booking-rules';
import { ROLE_IDS } from './roles.seed';
import { INTERNAL_COMMENTS, PUBLIC_COMMENTS, SAMPLES, Sample } from './request-samples';
import { SEED_DRIVERS, SEED_ITEMS, SEED_SUPPLIERS, SEED_VEHICLES, seedBlockedDays } from './reference.seed';
import { IssueLine, Quote, StockMovement } from '../models/procurement';
import { WarehouseItem } from '../models/reference';
import { buildReplenishmentDraft, planFulfilment } from '../warehouse/fulfilment';

export interface SeedRequestsResult {
  requests: ServiceRequest[];
  /** Warehouse items after the stock issues of the seeded requests. */
  items: WarehouseItem[];
  stockMovements: StockMovement[];
  notifications: AppNotification[];
  audit: AuditEntry[];
  /** Next free reference-number sequence. */
  refSeq: number;
}

interface Person extends Actor {
  roleAr: string;
  branchId: string | null;
  departmentId: string | null;
}

const person = (id: string, nameAr: string, roleAr: string, branchId: string | null = null, departmentId: string | null = null): Person => ({
  id,
  nameAr,
  roleAr,
  branchId,
  departmentId,
  mobile: '05' + String(10000000 + (id.length * 7919) % 89999999),
});

// Real demo users (ids match users.seed.ts) ----------------------------------------------------
const NORA = person('u-e1001', 'نورة العتيبي', 'مقدم الطلب', 'br-taawun', 'dp-prim-g');
const HIND = person('u-e1002', 'هند الشمري', 'مدير القسم', 'br-taawun', 'dp-prim-g');
const FAHD = person('u-e1003', 'فهد القحطاني', 'مشرف الفرع', 'br-taawun');
const MAJED = person('u-e1004', 'ماجد الدوسري', 'مسؤول الصيانة');
const SULTAN = person('u-e1005', 'سلطان الزهراني', 'فني الصيانة', 'br-taawun');
const ABDULLAH = person('u-e1006', 'عبدالله المطيري', 'أمين المستودع');
const TURKI = person('u-e1007', 'تركي السبيعي', 'المشتريات');
const REEM = person('u-e1008', 'ريم الغامدي', 'الإدارة المالية');
const YUSUF = person('u-e1009', 'يوسف العنزي', 'مسؤول النقل');
const BADR = person('u-e1010', 'بدر الشهري', 'فريق الورشة المركزية');
const MONA = person('u-e1011', 'منى الجهني', 'مسؤولة الشكاوى');
const AHMED = person('u-e1012', 'أحمد الراشد', 'الإدارة العليا', null, 'dp-admin');
const OMAR = person('u-e1014', 'عمر الشريف', 'مقدم الطلب', 'br-rayyan', 'dp-sec-b');
const KHALID = person('u-e1015', 'خالد الحربي', 'مدير القسم', 'br-rayyan', 'dp-sec-b');

/** Background staff that appear in history but are not selectable demo users. */
const REQUESTERS: readonly Person[] = [
  NORA,
  NORA,
  OMAR,
  OMAR,
  person('u-bg-01', 'أسماء الحربي', 'مقدم الطلب', 'br-taawun', 'dp-prim-g'),
  person('u-bg-02', 'هالة القرني', 'مقدم الطلب', 'br-taawun', 'dp-prim-g'),
  person('u-bg-03', 'ليلى السبيعي', 'مقدم الطلب', 'br-taawun', 'dp-mid-g'),
  person('u-bg-04', 'عبدالله الدوسري', 'مقدم الطلب', 'br-taawun', 'dp-sec-b'),
  person('u-bg-05', 'سارة العمري', 'مقدم الطلب', 'br-murabba', 'dp-kg'),
  person('u-bg-06', 'خالد الرويلي', 'مقدم الطلب', 'br-murabba', 'dp-prim-b'),
  person('u-bg-07', 'ماجد الحازمي', 'مقدم الطلب', 'br-murabba', 'dp-mid-b'),
  person('u-bg-08', 'نوف الشهراني', 'مقدم الطلب', 'br-murabba', 'dp-sec-g'),
  person('u-bg-09', 'فيصل الجهني', 'مقدم الطلب', 'br-rayyan', 'dp-sec-b'),
  person('u-bg-10', 'بندر العسيري', 'مقدم الطلب', 'br-rayyan', 'dp-mid-b'),
  person('u-bg-11', 'ريم الدوسري', 'مقدم الطلب', 'br-rayyan', 'dp-prim-g'),
];

const TECHS: readonly Person[] = [
  person('u-bg-t1', 'عبدالرحمن الفني', 'فني الصيانة', 'br-murabba'),
  person('u-bg-t2', 'محمود الكهربائي', 'فني الصيانة', 'br-rayyan'),
  person('u-bg-t3', 'ياسر السباك', 'فني الصيانة', 'br-taawun'),
  person('u-bg-t4', 'علي النجار', 'فني الصيانة', 'br-murabba'),
];

const staff = (id: string): Person => REQUESTERS.find((p) => p.id === id)!;
const TAAWUN_STAFF = staff('u-bg-01');
const MURABBA_STAFF = staff('u-bg-06');
const MURABBA_STAFF_2 = staff('u-bg-07');
const RAYYAN_STAFF = staff('u-bg-09');
const RAYYAN_STAFF_2 = staff('u-bg-10');

const deptName = (id: string | null) => DEPARTMENTS.find((d) => d.id === id)?.nameAr ?? 'القسم';
const branchName = (id: string | null) => BRANCHES.find((b) => b.id === id)?.nameAr ?? 'الفرع';

function approverFor(permissionKey: string, r: ServiceRequest): Person {
  switch (permissionKey) {
    case 'request.approve.department':
      if (r.branchId === 'br-taawun' && r.departmentId === 'dp-prim-g') return HIND;
      if (r.branchId === 'br-rayyan' && r.departmentId === 'dp-sec-b') return KHALID;
      return person(`u-bg-dm-${r.branchId}-${r.departmentId}`, `مدير ${deptName(r.departmentId)}`, 'مدير القسم', r.branchId, r.departmentId);
    case 'request.approve.branch':
      return r.branchId === 'br-taawun' ? FAHD : person(`u-bg-bs-${r.branchId}`, `مشرف ${branchName(r.branchId)}`, 'مشرف الفرع', r.branchId);
    case 'request.approve.finance':
      return REEM;
    case 'request.approve.executive':
      return AHMED;
    default:
      return YUSUF;
  }
}

/** Real demo users who would receive approval/assignment notices (keeps seeded inboxes meaningful). */
function seedUsersWith(permissionKey: string, res: ScopedResource): string[] {
  switch (permissionKey) {
    case 'request.approve.department':
      if (res.branchId === 'br-taawun' && res.departmentId === 'dp-prim-g') return [HIND.id];
      if (res.branchId === 'br-rayyan' && res.departmentId === 'dp-sec-b') return [KHALID.id];
      return [];
    case 'request.approve.branch':
      return res.branchId === 'br-taawun' ? [FAHD.id] : [];
    case 'request.approve.finance':
      return [REEM.id];
    case 'request.approve.executive':
      return [AHMED.id];
    case 'transport.allocate':
      return [YUSUF.id];
    case 'request.assign':
      return res.service === 'bus-booking' ? [YUSUF.id] : res.service === 'building-maintenance' || res.service === 'works-execution' ? [MAJED.id] : [];
    case 'request.review':
      return res.service === 'complaint' ? [MONA.id] : [BADR.id];
    default:
      return [];
  }
}

const seedRoleUsers = (roleId: string): string[] =>
  roleId === ROLE_IDS.maintenanceLead ? [MAJED.id] : roleId === ROLE_IDS.executive ? [AHMED.id] : [];

// Plan of requests ----------------------------------------------------------------------------

interface Spec {
  service: ServiceKey;
  target: RequestStatus;
  overdue?: boolean;
  /** Override the estimated value (SAR). */
  value?: number;
  /** Bus bookings that break the booking rules need the transport officer's approval. */
  withinRules?: boolean;
  /** For `pending_approval`: index of the approval step the request waits at (default: last). */
  stopAtStep?: number;
  holdReason?: HoldReason;
  /** Force a requester (otherwise picked from the pool). */
  by?: Person;
  /** Bus bookings: days from now to the trip (default: random between 22 and 58); the next free working day is used. */
  tripOffset?: number;
  passengers?: number;
  depart?: string;
  ret?: string;
  /** Bus bookings that wait for a free bus (they do not hold capacity). */
  waitlisted?: boolean;
}

const s = (service: ServiceKey, list: Array<[RequestStatus, Partial<Spec>?]>): Spec[] =>
  list.map(([target, rest]) => ({ service, target, ...rest }));

const SPECS: readonly Spec[] = [
  ...s('building-maintenance', [
    ['closed'], ['closed'], ['closed'], ['closed'],
    ['pending_confirmation'], ['pending_confirmation'], ['pending_confirmation', { by: NORA }],
    ['in_progress', { overdue: true }], ['in_progress', { overdue: true, by: NORA }], ['in_progress'],
    ['on_hold', { holdReason: 'parts' }], ['on_hold', { holdReason: 'parts', by: NORA }],
    ['approved'], ['pending_approval', { by: NORA }], ['pending_approval'], ['rejected'],
  ]),
  ...s('works-execution', [
    ['in_progress', { overdue: true }], ['approved'],
    ['pending_approval', { stopAtStep: 0, by: NORA }], ['pending_approval'],
    ['pending_confirmation'], ['returned'],
  ]),
  ...s('vehicle-maintenance', [
    ['closed'], ['closed'], ['closed'], ['pending_confirmation'],
    ['in_progress', { overdue: true }], ['in_progress'], ['on_hold', { holdReason: 'parts' }], ['under_review'],
    ['closed'], ['closed'], ['closed'], ['closed'],
  ]),
  ...s('traffic-violation', [['closed'], ['closed'], ['in_progress'], ['under_review'], ['new'], ['closed'], ['closed'], ['closed'], ['in_progress']]),
  ...s('traffic-accident', [['closed'], ['in_progress', { overdue: true }], ['under_review'], ['closed']]),
  ...s('purchase-request', [
    ['closed'], ['closed'], ['closed'], ['pending_confirmation'], ['pending_confirmation'],
    ['in_progress', { overdue: true }], ['on_hold', { holdReason: 'requester_info' }], ['approved'],
    ['pending_approval', { stopAtStep: 0, by: NORA, value: 4800 }], ['pending_approval', { value: 12000 }], ['pending_approval', { value: 120000 }],
    ['rejected'],
  ]),
  ...s('warehouse-need', [
    ['closed'], ['closed'], ['closed'], ['pending_confirmation'], ['in_progress'],
    ['pending_approval', { by: NORA }], ['cancelled'],
  ]),
  ...s('internal-event', [
    ['closed'], ['pending_confirmation'], ['approved'], ['pending_approval'], ['returned'],
  ]),
  ...s('bus-booking', [
    ['closed'], ['closed'], ['closed'], ['closed'], ['closed'],
    ['approved'], ['approved'], ['approved', { by: OMAR }],
    ['pending_approval', { withinRules: false }], ['pending_approval', { withinRules: false, by: NORA }],
    ['cancelled', { withinRules: false }], ['rejected', { withinRules: false }],
    // Calendar fillers: a full day per branch, a day that is only partly taken (by time window), and scattered bookings.
    ['approved', { tripOffset: 9, passengers: 92, depart: '08:00', ret: '12:00', by: TAAWUN_STAFF }],
    ['in_progress', { tripOffset: 9, passengers: 69, depart: '08:00', ret: '12:00', by: NORA }],
    ['approved', { tripOffset: 10, passengers: 69, depart: '07:30', ret: '12:00', by: OMAR }],
    ['approved', { tripOffset: 11, passengers: 161, depart: '07:15', ret: '12:15', by: MURABBA_STAFF }],
    ['approved', { tripOffset: 12, passengers: 46, depart: '08:00', ret: '11:00', by: RAYYAN_STAFF }],
    ['approved', { tripOffset: 16, passengers: 115, depart: '07:30', ret: '09:30', by: NORA }],
    ['in_progress', { tripOffset: 16, passengers: 46, depart: '10:30', ret: '12:15', by: TAAWUN_STAFF }],
    ['approved', { tripOffset: 18, passengers: 92, depart: '08:00', ret: '12:00', by: MURABBA_STAFF_2 }],
    ['approved', { tripOffset: 23, passengers: 46, depart: '08:30', ret: '11:30', by: RAYYAN_STAFF_2 }],
    ['approved', { tripOffset: 26, passengers: 69, depart: '08:00', ret: '12:00', by: NORA }],
    ['approved', { tripOffset: 29, passengers: 23, depart: '09:00', ret: '11:30', by: MURABBA_STAFF }],
    ['approved', { tripOffset: 33, passengers: 138, depart: '07:15', ret: '12:15', by: TAAWUN_STAFF }],
    ['approved', { tripOffset: 38, passengers: 46, depart: '08:00', ret: '12:00', by: OMAR }],
    ['approved', { tripOffset: 42, passengers: 92, depart: '07:45', ret: '11:45', by: MURABBA_STAFF_2 }],
    ['approved', { tripOffset: 47, passengers: 69, depart: '08:15', ret: '12:00', by: NORA }],
    ['approved', { tripOffset: 52, passengers: 46, depart: '08:00', ret: '11:30', by: RAYYAN_STAFF }],
    ['approved', { tripOffset: 57, passengers: 115, depart: '07:30', ret: '12:00', by: TAAWUN_STAFF }],
    // Waitlist: requests for the days above that are already full.
    ['pending_approval', { tripOffset: 10, passengers: 46, depart: '08:00', ret: '11:30', by: RAYYAN_STAFF_2, withinRules: false, waitlisted: true }],
    ['pending_approval', { tripOffset: 9, passengers: 23, depart: '09:00', ret: '11:00', by: NORA, withinRules: false, waitlisted: true }],
    ['pending_approval', { tripOffset: 11, passengers: 46, depart: '08:00', ret: '12:00', by: MURABBA_STAFF_2, withinRules: false, waitlisted: true }],
  ]),
  ...s('complaint', [
    ['closed'], ['closed'], ['closed'], ['in_progress'], ['under_review'], ['new'],
  ]),
];

const FLEET_SERVICES: readonly ServiceKey[] = ['vehicle-maintenance', 'traffic-violation', 'traffic-accident'];
const COSTLY_VEHICLES = ['v-03', 'v-03', 'v-06', 'v-11', 'v-11', 'v-01', 'v-05', 'v-02'];
const REPEAT_DRIVERS = ['d-01', 'd-01', 'd-01', 'd-04', 'd-04', 'd-07', 'd-02', 'd-09'];

/** Who raises requests of this service in the seed. */
function requesterFor(service: ServiceKey, forced: Person | undefined, rng: SeededRandom): Person {
  if (forced) return forced;
  if (FLEET_SERVICES.includes(service)) return rng.pick([BADR, BADR, YUSUF]);
  if (service === 'warehouse-need') return rng.pick([...REQUESTERS, ABDULLAH]);
  return rng.pick(REQUESTERS);
}

function executorFor(service: ServiceKey, r: ServiceRequest, rng: SeededRandom): Person {
  switch (service) {
    case 'building-maintenance':
    case 'works-execution': {
      if (r.branchId === 'br-taawun' && r.details['specialty'] === 'sp-ac') return SULTAN;
      return rng.pick(TECHS);
    }
    case 'vehicle-maintenance':
    case 'traffic-violation':
    case 'traffic-accident':
      return BADR;
    case 'purchase-request':
      return TURKI;
    case 'warehouse-need':
      return ABDULLAH;
    case 'bus-booking':
      return YUSUF;
    case 'complaint':
      return MONA;
    default:
      return approverFor('request.approve.branch', r);
  }
}

const reviewerFor = (service: ServiceKey): Person => (service === 'complaint' ? MONA : BADR);

const HOURS = 3_600_000;
const DAY = 24 * HOURS;

function attachmentsFor(service: ServiceKey, rng: SeededRandom, who: Person, at: Date): AttachmentMeta[] {
  const files: AttachmentMeta[] = [];
  const add = (name: string, mime: string, sizeBytes: number) =>
    files.push({ id: `f-${files.length + 1}-${at.getTime()}`, name, mime, sizeBytes, uploadedBy: who.id, at: at.toISOString() });
  if (service === 'traffic-accident') add('najm-report.pdf', 'application/pdf', 1_800_000 + rng.int(0, 900_000));
  else if (service === 'building-maintenance' && rng.chance(0.6)) add(`photo-${rng.int(100, 999)}.jpg`, 'image/jpeg', 600_000 + rng.int(0, 2_000_000));
  else if (service === 'traffic-violation') add('violation-notice.pdf', 'application/pdf', 400_000 + rng.int(0, 300_000));
  else if (service === 'purchase-request' && rng.chance(0.5)) add('quotation.pdf', 'application/pdf', 900_000 + rng.int(0, 1_500_000));
  else if (rng.chance(0.2)) add(`attachment-${rng.int(100, 999)}.jpg`, 'image/jpeg', 500_000 + rng.int(0, 1_000_000));
  return files;
}

function detailsFor(
  service: ServiceKey,
  sample: Sample,
  spec: Spec,
  rng: SeededRandom,
  createdAt: Date,
  trip: { day?: string; requesterName: string },
): { details: Record<string, unknown>; value: number; branchId?: string | null; priority?: Priority } {
  const details: Record<string, unknown> = { ...(sample.details ?? {}) };
  let value = spec.value ?? 0;
  let branchId: string | null | undefined;

  switch (service) {
    case 'works-execution': {
      const values = [18000, 22000, 65000, 40000, 14000, 9000];
      value = spec.value ?? values[rng.int(0, values.length - 1)];
      break;
    }
    case 'purchase-request': {
      const items = (details['items'] ?? []) as Array<{ qty: number; price: number }>;
      value = spec.value ?? items.reduce((sum, i) => sum + i.qty * i.price, 0);
      details['deliveryLocation'] = 'المستودع المركزي';
      break;
    }
    case 'warehouse-need': {
      const picked = SEED_ITEMS.filter((it) => it.stock >= 4).sort(() => rng.next() - 0.5).slice(0, rng.int(2, 3));
      details['items'] = picked.map((it) => ({ itemId: it.id, qty: rng.int(1, Math.min(8, it.stock)) }));
      break;
    }
    case 'vehicle-maintenance':
    case 'traffic-violation':
    case 'traffic-accident': {
      // Weighted picks: the oldest buses cost the most, and a few drivers repeat their violations.
      const vehicleId = service === 'vehicle-maintenance' ? rng.pick(COSTLY_VEHICLES) : rng.pick(SEED_VEHICLES).id;
      const driverId = service === 'traffic-violation' ? rng.pick(REPEAT_DRIVERS) : rng.pick(SEED_DRIVERS.filter((d) => d.active)).id;
      const vehicle = SEED_VEHICLES.find((v) => v.id === vehicleId)!;
      const driver = SEED_DRIVERS.find((d) => d.id === driverId)!;
      details['vehicleId'] = vehicle.id;
      details['plate'] = vehicle.plate;
      details['vehicleType'] = vehicle.typeAr;
      details['driverId'] = driver.id;
      details['driverName'] = driver.nameAr;
      branchId = vehicle.branchId;
      if (service === 'traffic-violation') {
        details['violationNo'] = String(rng.int(1_000_000_000, 1_999_999_999));
        details['violationDate'] = new Date(createdAt.getTime() - 2 * DAY).toISOString().slice(0, 10);
      }
      if (service === 'traffic-accident') {
        details['accidentDate'] = new Date(createdAt.getTime() - DAY).toISOString().slice(0, 10);
        details['atFaultName'] = rng.pick(['السائق', 'الطرف الآخر', 'مشترك']);
        details['najmReportAttached'] = true;
      }
      break;
    }
    case 'internal-event': {
      // Finished events took place already; the others are still ahead.
      const ahead = spec.target === 'closed' ? rng.int(3, 10) : spec.target === 'pending_confirmation' ? 0 : rng.int(10, 30);
      details['eventDate'] = new Date(createdAt.getTime() + ahead * DAY).toISOString().slice(0, 10);
      break;
    }
    case 'bus-booking': {
      const passengers = spec.passengers ?? Number(details['passengers'] ?? 23);
      details['passengers'] = passengers;
      details['buses'] = busesFor(passengers);
      if (spec.depart) details['departTime'] = spec.depart;
      if (spec.ret) details['returnTime'] = spec.ret;
      details['tripDate'] = trip.day;
      details['tripCode'] = tripCodeFor(trip.day!, rng.int(0, 89));
      details['withinRules'] = spec.withinRules ?? true;
      details['waitlisted'] = spec.waitlisted === true;
      details['pledgeAccepted'] = true;
      details['pledgeBy'] = trip.requesterName;
      details['pledgeAt'] = createdAt.toISOString();
      break;
    }
    default:
      break;
  }
  return { details, value, branchId };
}

// Builder -------------------------------------------------------------------------------------

export function buildSeedRequests(now: Date): SeedRequestsResult {
  const rng = new SeededRandom(20261019);
  // Stock is consumed by the seeded issues, so inventory and movements agree with the requests.
  const stock = new Map<string, WarehouseItem>(SEED_ITEMS.map((i) => [i.id, { ...i }]));
  const stockMovements: StockMovement[] = [];
  let movementCounter = 0;
  const issueFromStock = (lines: readonly IssueLine[], req: ServiceRequest, at: Date, byName: string): void => {
    for (const l of lines) {
      stock.get(l.itemId)!.stock -= l.qty;
      stockMovements.push({ id: `sm-${++movementCounter}`, itemId: l.itemId, kind: 'issue', delta: -l.qty, at: at.toISOString(), byId: null, byName, requestId: req.id, requestRef: req.refNo, noteAr: 'صرف للطلب' });
    }
  };
  const slaHours = DEFAULT_SETTINGS.slaHours;
  const pools = new Map<ServiceKey, number>();

  interface Planned {
    spec: Spec;
    sample: Sample;
    requester: Person;
    ageH: number;
    priority: Priority;
    /** Bus bookings: the trip day (`yyyy-MM-dd`), chosen so that no branch exceeds its daily bus capacity. */
    tripDay?: string;
  }

  // Trip days: weekends and the calendar's blocked days are skipped; capacity is tracked per branch-day.
  const blocked = new Set(seedBlockedDays(now).map((b) => b.date));
  const busesUsed = new Map<string, number>();
  const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const openDay = (from: Date): Date => {
    let d = nextWorkingDay(from);
    while (blocked.has(dayKey(d))) d = nextWorkingDay(addDays(d, 1));
    return d;
  };
  const tripDayFor = (spec: Spec, branchId: string | null, passengers: number, createdAt: Date): string => {
    if (spec.target === 'closed' || spec.target === 'rejected') return dayKey(openDay(addDays(createdAt, rng.int(8, 14))));
    const buses = busesFor(passengers);
    let day = openDay(addDays(now, spec.tripOffset ?? rng.int(22, 58)));
    // Waitlisted, cancelled and rejected bookings hold no buses.
    if (spec.waitlisted || spec.target === 'cancelled') return dayKey(day);
    const capacity = BRANCHES.find((b) => b.id === branchId)?.busesPerDay ?? 3;
    const keyOf = (d: Date) => `${branchId}|${dayKey(d)}`;
    for (let guard = 0; (busesUsed.get(keyOf(day)) ?? 0) + buses > capacity && guard < 120; guard++) day = openDay(addDays(day, 1));
    busesUsed.set(keyOf(day), (busesUsed.get(keyOf(day)) ?? 0) + buses);
    return dayKey(day);
  };

  const planned: Planned[] = SPECS.map((planSpec) => {
    let spec = planSpec;
    const idx = pools.get(spec.service) ?? 0;
    pools.set(spec.service, idx + 1);
    const samples = SAMPLES[spec.service];
    const sample = samples[idx % samples.length];
    let priority: Priority = sample.priority ?? 'normal';
    // Emergencies are auto-approved, so states that need an approver use a non-emergency priority.
    if (spec.service === 'building-maintenance' && priority === 'emergency' && ['pending_approval', 'rejected', 'returned', 'cancelled'].includes(spec.target)) {
      priority = 'urgent';
    }
    const target = slaHours[priority];
    let ageH: number;
    switch (spec.target) {
      case 'closed':
        ageH = rng.int(15 * 24, 85 * 24);
        break;
      case 'pending_confirmation':
        ageH = rng.int(30, 140);
        break;
      case 'in_progress':
        ageH = spec.overdue ? Math.round(target * (2.2 + rng.next() * 1.3) + 6) : Math.min(rng.int(6, 30), Math.floor(target * 0.6));
        break;
      case 'on_hold':
        ageH = rng.int(30, 160);
        break;
      case 'approved':
        ageH = rng.int(2, 10);
        break;
      case 'pending_approval':
        ageH = rng.int(2, 40);
        break;
      case 'under_review':
      case 'new':
        ageH = rng.int(2, 20);
        break;
      default:
        ageH = rng.int(10, 200);
    }
    if (spec.service === 'bus-booking' && spec.target === 'closed') ageH = rng.int(20 * 24, 60 * 24);
    const requester = requesterFor(spec.service, spec.by, rng);
    // A booking never needs more buses than the branch has per day.
    if (spec.service === 'bus-booking') {
      const capacity = BRANCHES.find((b) => b.id === requester.branchId)?.busesPerDay ?? 3;
      spec = { ...spec, passengers: Math.min(spec.passengers ?? Number(sample.details?.['passengers'] ?? 23), capacity * 23) };
    }
    const tripDay =
      spec.service === 'bus-booking'
        ? tripDayFor(spec, requester.branchId, spec.passengers ?? Number(sample.details?.['passengers'] ?? 23), new Date(now.getTime() - ageH * HOURS))
        : undefined;
    return { spec, sample, requester, ageH, priority, tripDay };
  }).sort((a, b) => b.ageH - a.ageH); // oldest first => increasing reference numbers

  const notifications: AppNotification[] = [];
  const audit: AuditEntry[] = [];
  const requests: ServiceRequest[] = [];
  let seq = 101;
  let counter = 0;

  const ctxFor = (who: Person, at: Date, deny: readonly string[] = []): EngineContext => ({
    actor: who,
    actorRoleAr: who.roleAr,
    can: (key) => !deny.includes(key),
    now: at,
    limits: DEFAULT_SETTINGS.approvalLimits,
    slaHours,
    usersWith: seedUsersWith,
    roleUsers: seedRoleUsers,
  });

  const realIds = new Set<string>(['u-e1001', 'u-e1002', 'u-e1003', 'u-e1004', 'u-e1005', 'u-e1006', 'u-e1007', 'u-e1008', 'u-e1009', 'u-e1010', 'u-e1011', 'u-e1012', 'u-e1013', 'u-e1014', 'u-e1015']);

  const collect = (res: EngineResult, at: Date, who: Person): void => {
    for (const n of res.notifications) {
      if (!realIds.has(n.userId)) continue;
      notifications.push({
        id: `n-${++counter}`,
        userId: n.userId,
        kind: n.kind,
        titleAr: n.titleAr,
        bodyAr: n.bodyAr,
        at: at.toISOString(),
        read: now.getTime() - at.getTime() > 3 * DAY || rng.chance(0.4),
        requestId: res.request.id,
        channels: n.channels,
      });
    }
    for (const a of res.audit) {
      audit.push({
        id: `au-${++counter}`,
        at: at.toISOString(),
        actorId: who.id,
        actorName: who.nameAr,
        actionAr: a.actionAr,
        entityType: a.entityType,
        entityId: res.request.id,
        summaryAr: a.summaryAr,
        before: a.before,
        after: a.after,
      });
    }
  };

  // Seed allocations hand out each active fleet bus/driver once per day; extra buses are contracted ones.
  const allocated = new Set<string>();
  let partsHolds = 0;
  const allocationFor = (r: ServiceRequest): { slots: BusSlot[] } => {
    const date = String(r.details['tripDate']);
    const fleet = SEED_VEHICLES.filter((v) => v.status === 'active' && v.branchId === r.branchId && (v.seats ?? 0) >= 20);
    const drivers = SEED_DRIVERS.filter((d) => d.active && (d.branchId === r.branchId || d.branchId === null));
    const slots: BusSlot[] = [];
    for (let i = 0; i < Number(r.details['buses'] ?? 1); i++) {
      const vehicle = fleet.find((v) => !allocated.has(`${date}|${v.id}`));
      const driver = drivers.find((d) => !allocated.has(`${date}|${d.id}`));
      if (vehicle && driver) {
        allocated.add(`${date}|${vehicle.id}`);
        allocated.add(`${date}|${driver.id}`);
        slots.push({ vehicleId: vehicle.id, driverId: driver.id });
      } else {
        slots.push({ vehicleId: null, driverId: null });
      }
    }
    return { slots };
  };

  /** Builds one request and drives it through the engine to its target status. Events spawn their children recursively. */
  const process = (p: Planned, spawn?: { parent: ServiceRequest; draft: RequestDraft; actor?: Actor }): ServiceRequest => {
    const { spec, sample, requester, ageH, priority } = p;
    const createdAt = new Date(now.getTime() - ageH * HOURS);
    const wf = WORKFLOWS[spec.service];
    const gap = Math.max(0.25, (ageH * 0.85) / 10) * HOURS;
    let t = createdAt;

    let draft: RequestDraft;
    if (spawn) {
      draft = spawn.draft;
    } else {
      const extra = detailsFor(spec.service, sample, spec, rng, createdAt, { day: p.tripDay, requesterName: requester.nameAr });
      draft = {
        service: spec.service,
        titleAr: sample.titleAr,
        descriptionAr: sample.descriptionAr,
        priority,
        details: extra.details,
        estimatedValue: extra.value,
        branchId: extra.branchId !== undefined ? extra.branchId : requester.branchId,
        departmentId: extra.branchId !== undefined ? null : requester.departmentId,
        attachments: attachmentsFor(spec.service, rng, requester, createdAt),
        neededBy: new Date(createdAt.getTime() + 7 * DAY).toISOString(),
      };
    }

    const created = spawn
      ? spawnChild(spawn.parent, draft, ctxFor(requester, createdAt), seq++, `r-${seq - 1}`, spawn.actor)
      : createRequest(draft, ctxFor(requester, createdAt), seq++, `r-${seq - 1}`);
    let req = created.request;
    collect(created, createdAt, requester);

    const step = (action: ActionKey, who: Person, payload: ActionPayload = {}): void => {
      t = new Date(t.getTime() + gap);
      // `start` is for executors who cannot assign work to others.
      const res = perform(req, action, ctxFor(who, t, action === 'start' ? ['request.assign'] : []), payload);
      req = res.request;
      collect(res, t, who);
    };
    const comment = (who: Person, internal: boolean): void => {
      const text = internal ? rng.pick(INTERNAL_COMMENTS) : rng.pick(PUBLIC_COMMENTS);
      const at = new Date(t.getTime() + gap / 3);
      const res = addComment(req, ctxFor(who, at), text, internal);
      req = res.request;
      collect(res, at, who);
    };

    const review = (): void => {
      if (!wf.reviewRequired) return;
      step('start_review', reviewerFor(spec.service));
      step('review_pass', reviewerFor(spec.service));
    };
    const approveAll = (stopBefore?: number): void => {
      while (req.status === 'pending_approval') {
        const next = currentStep(req);
        if (!next) break;
        if (stopBefore !== undefined && req.approvals.indexOf(next) >= stopBefore) break;
        step('approve', approverFor(next.permissionKey, req), rng.chance(0.3) ? { noteAr: 'موافق' } : {});
      }
    };
    const startWork = (): Person => {
      const exec = executorFor(spec.service, req, rng);
      if (spec.service === 'building-maintenance' || spec.service === 'works-execution') {
        step('assign', MAJED, { assigneeId: exec.id, assigneeName: exec.nameAr });
      } else if (spec.service === 'bus-booking') {
        step('allocate', exec, { allocation: allocationFor(req) });
      } else {
        step('start', exec);
      }
      if (rng.chance(0.55)) comment(exec, true);
      if (rng.chance(0.4)) comment(requester, false);
      return exec;
    };
    const addCosts = (exec: Person): void => {
      if (spec.service === 'building-maintenance' || spec.service === 'vehicle-maintenance') {
        step('add_cost', exec, { cost: { kind: 'part', descriptionAr: rng.pick(['مكثف', 'قطعة غيار', 'فلتر', 'مفتاح']), quantity: rng.int(1, 3), unitCost: rng.int(40, 400) } });
        step('add_cost', exec, { cost: { kind: 'labour', descriptionAr: 'ساعات عمل', quantity: rng.int(1, 6), unitCost: 60 } });
      } else if (spec.service === 'works-execution') {
        step('add_cost', exec, { cost: { kind: 'purchase', descriptionAr: 'قيمة التوريد/التنفيذ', quantity: 1, unitCost: Math.round(req.estimatedValue * 0.95) } });
      }
    };
    // Warehouse need: issue from stock (clamped to what is left), then the requester confirms.
    const issueNeed = (exec: Person): void => {
      const lines = ((req.details['items'] as Array<{ itemId: string; qty: number }>) ?? []).map((l) => ({ itemId: l.itemId, qty: Math.min(l.qty, stock.get(l.itemId)?.stock ?? 0) })).filter((l) => l.qty > 0);
      const plan = planFulfilment([...stock.values()], lines);
      step('issue_items', exec, { fulfilment: plan });
      issueFromStock(plan.issued, req, t, exec.nameAr);
    };
    // Purchase: quotes when the value needs them, purchase order, and (for finished ones) the goods receipt.
    const purchase = (exec: Person, receive: boolean): void => {
      const value = req.estimatedValue;
      if (value > DEFAULT_SETTINGS.approvalLimits.departmentMax) {
        const quotes: Quote[] = [1, 0.93, 1.08].map((f, i) => ({
          id: `q-${i + 1}`,
          supplierId: SEED_SUPPLIERS[(rng.int(0, 7) + i * 3) % SEED_SUPPLIERS.length].id,
          supplierName: '',
          amount: Math.round(value * f),
          deliveryDays: rng.int(3, 14),
        }));
        // Distinct suppliers, named, lowest quote selected.
        quotes.forEach((q, i) => {
          const supplier = SEED_SUPPLIERS[(i * 3 + (value % 5)) % SEED_SUPPLIERS.length];
          q.supplierId = supplier.id;
          q.supplierName = supplier.nameAr;
        });
        const best = [...quotes].sort((a, b) => a.amount - b.amount)[0];
        step('save_quotes', exec, { quotes: { quotes, selectedId: best.id } });
        step('issue_po', exec, { po: { supplierId: best.supplierId, supplierName: best.supplierName, amount: best.amount } });
      } else {
        const supplier = SEED_SUPPLIERS[value % SEED_SUPPLIERS.length];
        step('issue_po', exec, { po: { supplierId: supplier.id, supplierName: supplier.nameAr, amount: Math.round(value * 0.97) } });
      }
      if (!receive) return;
      const receiver = rng.chance(0.5) ? exec : ABDULLAH;
      step('receive_goods', receiver, { receipt: { condition: 'complete', custodyAck: true } });
    };
    // Maintenance parts that the warehouse cannot cover: hold, then a linked purchase raised in the executor's name.
    const holdForParts = (exec: Person): void => {
      const code = spec.service === 'vehicle-maintenance' ? 'VEH-002' : 'ACR-001';
      const item = SEED_ITEMS.find((i) => i.code === code)!;
      const qty = spec.service === 'vehicle-maintenance' ? item.stock + 2 : 1;
      step('save_execution', exec, {
        execution: {
          inspection: { result: 'تبين تلف القطعة الأساسية', rootCause: 'تآكل طبيعي بسبب الاستخدام', repairPlan: 'استبدال القطعة ثم الاختبار', needsParts: true },
          parts: [{ itemId: item.id, description: item.nameAr, partNo: item.code, qty, source: 'stock', cost: item.unitPrice }],
        },
      });
      const plan = planFulfilment([...stock.values()], [{ itemId: item.id, qty }]);
      step('request_parts', exec, { fulfilment: plan });
      const draft = buildReplenishmentDraft(req, plan.shortages);
      const targets: RequestStatus[] = ['in_progress', 'pending_approval', 'approved'];
      const target = targets[partsHolds++ % targets.length];
      const child = process(
        { spec: { service: 'purchase-request', target }, sample: { titleAr: draft.titleAr, descriptionAr: draft.descriptionAr }, requester: exec, ageH: Math.max(2, Math.round((now.getTime() - t.getTime()) / HOURS)), priority: draft.priority },
        { parent: req, draft, actor: exec },
      );
      req = attachChildren(req, [child], ctxFor(exec, new Date(t.getTime() + 60_000)));
      const fulfilment = req.details['fulfilment'] as { purchaseRef?: string } | undefined;
      if (fulfilment) fulfilment.purchaseRef = child.refNo;
    };
    const finish = (): void => {
      const exec = startWork();
      if (spec.target === 'in_progress') {
        if (spec.service === 'purchase-request' && !spec.overdue) purchase(exec, false);
        return;
      }
      if (spec.target === 'on_hold') {
        const reason = spec.holdReason ?? 'parts';
        if (reason === 'parts' && (spec.service === 'building-maintenance' || spec.service === 'vehicle-maintenance')) {
          holdForParts(exec);
          return;
        }
        step('hold', exec, { holdReason: reason, noteAr: reason === 'requester_info' ? 'نرجو إرسال المواصفات النهائية للأصناف.' : undefined });
        return;
      }
      if (spec.service === 'warehouse-need') issueNeed(exec);
      else if (spec.service === 'purchase-request') purchase(exec, true);
      else {
        addCosts(exec);
        step('complete', exec, { noteAr: 'تم التنفيذ حسب المطلوب' });
      }
      if (spec.target === 'pending_confirmation' || spec.target === 'executed') return;
      if (wf.confirmRequired) {
        const stars = rng.pick([5, 5, 4, 4, 4, 3, 2]) as 1 | 2 | 3 | 4 | 5;
        step('confirm', requester, { outcome: 'accepted', rating: { stars } });
      } else {
        step('close', exec);
      }
    };

    switch (spec.target) {
      case 'new':
        break;
      case 'under_review':
        step('start_review', reviewerFor(spec.service));
        break;
      case 'pending_approval':
        review();
        approveAll(spec.stopAtStep ?? Math.max(0, req.approvals.length - 1));
        if (rng.chance(0.4)) comment(requester, false);
        break;
      case 'approved':
        review();
        approveAll();
        break;
      case 'in_progress':
      case 'on_hold':
      case 'pending_confirmation':
      case 'executed':
      case 'closed':
        review();
        approveAll();
        finish();
        break;
      case 'rejected':
        if (wf.reviewRequired) {
          step('start_review', reviewerFor(spec.service));
          step('reject', reviewerFor(spec.service), { noteAr: 'البيانات المرفقة غير كافية ولا تستوفي الشروط.' });
        } else if (req.status === 'pending_approval') {
          const next = currentStep(req)!;
          step('reject', approverFor(next.permissionKey, req), { noteAr: rng.pick(['لا توجد ميزانية معتمدة لهذا البند حاليًا.', 'يمكن تلبية الاحتياج من المخزون الحالي.', 'غير مبرر وفق التقييم الأولي.']) });
        } else {
          step('reject', YUSUF, { noteAr: 'التاريخ المطلوب خارج قواعد الحجز المتاحة.' });
        }
        break;
      case 'cancelled':
        step('cancel', requester, { noteAr: 'تم تغيير الخطة ولم يعد الطلب مطلوبًا.' });
        break;
      case 'returned':
        if (wf.reviewRequired) {
          step('start_review', reviewerFor(spec.service));
          step('return', reviewerFor(spec.service), { noteAr: 'يرجى إرفاق المستندات الداعمة.' });
        } else {
          const next = currentStep(req)!;
          step('return', approverFor(next.permissionKey, req), { noteAr: 'يرجى استكمال التفاصيل وتحديد التاريخ المطلوب بدقة.' });
        }
        break;
    }

    // Approved events carry their children: finished ones for finished events, work in progress for the approved one.
    const routedAt = req.timeline.find((e) => e.type === 'routed')?.at;
    if (spec.service === 'internal-event' && !spawn && routedAt && ['approved', 'pending_confirmation', 'closed'].includes(req.status)) {
      const at = new Date(routedAt);
      const live: Record<string, RequestStatus> = { bus: 'pending_approval', venue: 'in_progress', materials: 'pending_approval' };
      const parent = req;
      const children = planChildren(parent).map((plan) =>
        process(
          {
            spec: { service: plan.draft.service, target: parent.status === 'approved' ? live[plan.need] : 'closed', by: requester, withinRules: false },
            sample: { titleAr: plan.draft.titleAr, descriptionAr: plan.draft.descriptionAr },
            requester,
            ageH: Math.max(2, Math.round((now.getTime() - at.getTime()) / HOURS)),
            priority: 'normal',
          },
          { parent, draft: plan.draft },
        ),
      );
      req = attachChildren(parent, children, ctxFor(requester, new Date(at.getTime() + 60_000)));
    }

    // Close the SLA loop for requests that ran out of time while open.
    const swept = sweepSla(req, ctxFor({ id: 'system', nameAr: 'النظام', roleAr: 'النظام', branchId: null, departmentId: null }, now));
    if (swept) {
      req = swept.request;
      collect(swept, now, { id: 'system', nameAr: 'النظام', roleAr: 'النظام', branchId: null, departmentId: null });
    }
    requests.push(req);
    return req;
  };

  for (const p of planned) process(p);

  linkRequests(requests, now);
  for (const r of requests) r.timeline.sort((a, b) => a.at.localeCompare(b.at));

  // Newest notifications first, capped per user so the bell stays readable.
  const perUser = new Map<string, number>();
  const trimmed = notifications
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((n) => {
      const c = (perUser.get(n.userId) ?? 0) + 1;
      perUser.set(n.userId, c);
      return c <= 12;
    });

  // Older stock-in history (it is already part of the stock levels): gives the movement log some past.
  SEED_ITEMS.filter((_, i) => i % 5 === 0).forEach((item, i) => {
    const at = new Date(now.getTime() - (12 + i * 6) * DAY);
    stockMovements.push({
      id: `sm-${++movementCounter}`,
      itemId: item.id,
      kind: 'in',
      delta: 20 + (i % 4) * 10,
      at: at.toISOString(),
      byId: ABDULLAH.id,
      byName: ABDULLAH.nameAr,
      noteAr: `توريد ${SEED_SUPPLIERS[i % SEED_SUPPLIERS.length].nameAr}`,
    });
  });

  return {
    items: [...stock.values()],
    stockMovements: stockMovements.sort((a, b) => b.at.localeCompare(a.at)),
    requests: requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    notifications: trimmed,
    audit: audit.sort((a, b) => b.at.localeCompare(a.at)),
    refSeq: seq,
  };
}

/** Cross-service links not created by the engine: complaint ↔ complained-about request. */
function linkRequests(requests: ServiceRequest[], now: Date): void {
  const complaints = requests.filter((r) => r.service === 'complaint' && r.details['confidential'] !== true);
  const overdueMaintenance = requests.filter((r) => r.service === 'building-maintenance' && r.sla.breached);
  complaints.slice(0, 2).forEach((complaint, i) => {
    const target = overdueMaintenance[i];
    if (!target) return;
    complaint.links.push({ requestId: target.id, relation: 'related' });
    complaint.details['linkedRequestRef'] = target.refNo;
    target.links.push({ requestId: complaint.id, relation: 'complaint' });
    target.timeline.push({
      id: `ev-cl-${complaint.id}`,
      type: 'complaint_linked',
      at: new Date(Math.min(now.getTime(), new Date(complaint.createdAt).getTime() + HOURS)).toISOString(),
      actorId: null,
      actorRoleAr: 'النظام',
      textAr: `رُبطت شكوى (${complaint.refNo}) بهذا الطلب`,
    });
  });
}
