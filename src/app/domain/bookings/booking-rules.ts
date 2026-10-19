import { PASSENGERS_PER_BUS, WEEKEND_DAYS } from '../reference-data';
import { RequestStatus } from '../models/request';

/** Business rules of the bus-booking service. Pure functions: the service layer calls them, never components. */
export const MIN_PASSENGERS = 23;
export const MAX_PASSENGERS = 161;
export const LEAD_DAYS = 7;
export const CANCEL_BLOCK_DAYS = 3;
export const EARLIEST_DEPARTURE = '07:15';
export const LATEST_RETURN = '12:15';

const DAY_MS = 86_400_000;

/** `yyyy-MM-dd` key of a local calendar day. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Local midnight of a `yyyy-MM-dd` key. */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const isDayKey = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Whole calendar days from `now` to the given day (negative for the past). */
export function daysUntil(key: string, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDay(key).getTime() - today.getTime()) / DAY_MS);
}

export const isWeekend = (key: string): boolean => WEEKEND_DAYS.includes(parseDay(key).getDay());

export function toMinutes(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export const busesFor = (passengers: number): number => Math.max(1, Math.ceil(passengers / PASSENGERS_PER_BUS));

export const WINDOW_FROM = toMinutes(EARLIEST_DEPARTURE)!;
export const WINDOW_TO = toMinutes(LATEST_RETURN)!;

/** A booking as the availability calculation sees it — no requester or free-text data. */
export interface BusOccupancy {
  id: string;
  branchId: string | null;
  departmentId: string | null;
  date: string;
  departMin: number;
  returnMin: number;
  buses: number;
  passengers: number;
  status: RequestStatus;
  waitlisted: boolean;
  vehicleIds: string[];
  driverIds: string[];
}

export interface BlockedDay {
  id: string;
  date: string;
  reasonAr: string;
}

const NOT_OCCUPYING: readonly RequestStatus[] = ['rejected', 'cancelled', 'returned', 'new', 'under_review'];

/** Waitlisted, rejected and cancelled bookings do not hold buses. */
export const occupies = (o: BusOccupancy): boolean => !o.waitlisted && !NOT_OCCUPYING.includes(o.status);

/** Highest number of buses in use at any moment of `[from, to)` on one branch-day. */
export function peakUsage(list: readonly BusOccupancy[], from: number, to: number): number {
  const active = list.filter((o) => occupies(o) && o.departMin < to && o.returnMin > from);
  const points = new Set<number>([from, ...active.map((o) => o.departMin).filter((t) => t > from && t < to)]);
  let peak = 0;
  for (const t of points) {
    peak = Math.max(peak, active.filter((o) => o.departMin <= t && t < o.returnMin).reduce((sum, o) => sum + o.buses, 0));
  }
  return peak;
}

export type DayState = 'available' | 'partial' | 'full' | 'blocked' | 'closed';

export interface DayInfo {
  date: string;
  state: DayState;
  /** Buses free for the whole standard window. */
  free: number;
  capacity: number;
  reasonAr?: string;
}

export interface DayContext {
  now: Date;
  capacity: number;
  occupancy: readonly BusOccupancy[];
  blocked: readonly BlockedDay[];
}

/** Why a day cannot take bookings regardless of capacity, or `null`. */
export function dayBlockReason(key: string, ctx: Pick<DayContext, 'blocked'>): string | null {
  if (isWeekend(key)) return 'عطلة نهاية الأسبوع (الجمعة والسبت)';
  const blocked = ctx.blocked.find((b) => b.date === key);
  return blocked ? blocked.reasonAr : null;
}

/** State of one day for the availability calendar; `window` (minutes) narrows the check to a requested time window. */
export function dayInfo(key: string, ctx: DayContext, window: readonly [from: number, to: number] = [WINDOW_FROM, WINDOW_TO]): DayInfo {
  const blockReason = dayBlockReason(key, ctx);
  if (blockReason) return { date: key, state: 'blocked', free: 0, capacity: ctx.capacity, reasonAr: blockReason };
  const used = peakUsage(
    ctx.occupancy.filter((o) => o.date === key),
    window[0],
    window[1],
  );
  const free = Math.max(0, ctx.capacity - used);
  if (daysUntil(key, ctx.now) < LEAD_DAYS) return { date: key, state: 'closed', free, capacity: ctx.capacity, reasonAr: `الحجز قبل الرحلة بـ ${LEAD_DAYS} أيام على الأقل` };
  if (free === 0) return { date: key, state: 'full', free, capacity: ctx.capacity, reasonAr: 'اكتملت الباصات — يمكن الانضمام لقائمة الانتظار' };
  return { date: key, state: used === 0 ? 'available' : 'partial', free, capacity: ctx.capacity };
}

export interface BookingInput {
  tripDate: string | null;
  passengers: number | null;
  departTime: string;
  returnTime: string;
}

export interface BookingEvaluation {
  /** Rule violations that stop the booking. */
  errors: string[];
  buses: number;
  /** Buses free for the requested window (0 when the inputs are incomplete). */
  free: number;
  /** Valid, but there is no capacity: the booking joins the waitlist. */
  waitlist: boolean;
  /** Valid and fits: approved automatically. */
  withinRules: boolean;
}

/** Applies every booking rule to one request. `ctx.occupancy` should hold the branch's bookings. */
export function evaluateBooking(input: BookingInput, ctx: DayContext): BookingEvaluation {
  const errors: string[] = [];
  const passengers = Number(input.passengers);
  const hasPassengers = Number.isFinite(passengers) && passengers > 0;
  const buses = hasPassengers ? busesFor(passengers) : 0;

  if (!hasPassengers || passengers < MIN_PASSENGERS || passengers > MAX_PASSENGERS) {
    errors.push(`عدد الركاب يجب أن يكون بين ${MIN_PASSENGERS} و${MAX_PASSENGERS} راكبًا.`);
  }

  const depart = toMinutes(input.departTime);
  const back = toMinutes(input.returnTime);
  if (depart === null || back === null) errors.push('حدد وقتي الانطلاق والعودة.');
  else {
    if (depart < WINDOW_FROM) errors.push(`لا يمكن الانطلاق قبل ${EARLIEST_DEPARTURE}.`);
    if (back > WINDOW_TO) errors.push(`يجب أن تكون العودة في ${LATEST_RETURN} أو قبله.`);
    if (back <= depart) errors.push('وقت العودة يجب أن يكون بعد وقت الانطلاق.');
  }

  if (!isDayKey(input.tripDate)) errors.push('حدد تاريخ الرحلة.');
  else {
    const block = dayBlockReason(input.tripDate, ctx);
    if (block) errors.push(`لا يمكن الحجز في هذا اليوم: ${block}.`);
    else if (daysUntil(input.tripDate, ctx.now) < LEAD_DAYS) {
      errors.push(`يجب الحجز قبل موعد الرحلة بـ ${LEAD_DAYS} أيام على الأقل.`);
    }
  }

  const complete = errors.length === 0;
  const free =
    complete && depart !== null && back !== null
      ? Math.max(0, ctx.capacity - peakUsage(ctx.occupancy.filter((o) => o.date === input.tripDate), depart, back))
      : 0;
  const waitlist = complete && free < buses;
  return { errors, buses, free, waitlist, withinRules: complete && !waitlist };
}

/** `null` when the booking may still be cancelled, otherwise the Arabic reason. */
export function cancellationBlock(tripDate: unknown, now: Date): string | null {
  if (!isDayKey(tripDate)) return null;
  return daysUntil(tripDate, now) < CANCEL_BLOCK_DAYS
    ? `لا يمكن إلغاء الحجز قبل موعد الرحلة بأقل من ${CANCEL_BLOCK_DAYS} أيام.`
    : null;
}

/** Next `n` bookable working days from `from` (skips weekends); used by seeds. */
export function nextWorkingDay(from: Date): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (isWeekend(dayKey(d))) d.setDate(d.getDate() + 1);
  return d;
}

export interface BusSlot {
  /** Fleet bus, or `null` for a contracted (external) bus. */
  vehicleId: string | null;
  /** Fleet driver; required for fleet buses. */
  driverId: string | null;
}

export interface BusAllocation {
  slots: BusSlot[];
  byName: string;
  at: string;
}
