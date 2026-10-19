import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import {
  BlockedDay,
  BookingEvaluation,
  BookingInput,
  BusAllocation,
  BusOccupancy,
  BusSlot,
  evaluateBooking,
  isDayKey,
  occupies,
  peakUsage,
  toMinutes,
} from '../../domain/bookings/booking-rules';
import { ServiceRequest } from '../../domain/models/request';
import { AuditRepository, ReferenceRepository, RequestRepository } from '../../domain/repositories';
import { BRANCHES } from '../../domain/reference-data';
import { RequestDraft, WorkflowError } from '../../domain/workflows/engine';
import { tripCodeFor } from '../../domain/workflows/event-children';
import { AuthService } from '../auth/auth.service';
import { Clock } from '../clock.service';
import { DataVersion } from '../data-version';
import { PermissionService } from '../rbac/permission.service';
import { RequestService } from '../requests/request.service';

/** Availability facts of one bus booking; free text and requester data never leave the repository. */
export function occupancyOf(r: ServiceRequest): BusOccupancy | null {
  const date = r.details['tripDate'];
  const depart = toMinutes(String(r.details['departTime'] ?? ''));
  const back = toMinutes(String(r.details['returnTime'] ?? ''));
  if (r.service !== 'bus-booking' || !isDayKey(date) || depart === null || back === null) return null;
  const allocation = r.details['allocation'] as BusAllocation | undefined;
  const slots = allocation?.slots ?? [];
  return {
    id: r.id,
    branchId: r.branchId,
    departmentId: r.departmentId,
    date,
    departMin: depart,
    returnMin: back,
    buses: Number(r.details['buses'] ?? 1),
    passengers: Number(r.details['passengers'] ?? 0),
    status: r.status,
    waitlisted: r.details['waitlisted'] === true,
    vehicleIds: slots.map((s) => s.vehicleId).filter((v): v is string => !!v),
    driverIds: slots.map((s) => s.driverId).filter((v): v is string => !!v),
  };
}

export const capacityOf = (branchId: string | null): number => BRANCHES.find((b) => b.id === branchId)?.busesPerDay ?? 0;

/**
 * Bus-booking business rules at the service layer: availability by time window, lead time, blocked days,
 * waitlist, allocation conflicts and the calendar's blocked days. Components only call this.
 */
@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly requests = inject(RequestService);
  private readonly repo = inject(RequestRepository);
  private readonly reference = inject(ReferenceRepository);
  private readonly audit = inject(AuditRepository);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly clock = inject(Clock);
  private readonly version = inject(DataVersion);

  occupancy(): Observable<BusOccupancy[]> {
    return this.repo.inspect((all) => all.map(occupancyOf).filter((o): o is BusOccupancy => o !== null));
  }

  blockedDays(): Observable<BlockedDay[]> {
    return this.reference.lists().pipe(map((l) => [...l.blockedDays].sort((a, b) => a.date.localeCompare(b.date))));
  }

  /** Evaluates one booking against the live calendar of its branch. */
  evaluate(input: BookingInput, branchId: string | null, occupancy: readonly BusOccupancy[], blocked: readonly BlockedDay[]): BookingEvaluation {
    return evaluateBooking(input, {
      now: this.clock.now(),
      capacity: capacityOf(branchId),
      occupancy: occupancy.filter((o) => o.branchId === branchId),
      blocked,
    });
  }

  /** Re-checks every rule (the form's live hint is only advice), then creates the booking or puts it on the waitlist. */
  submit(draft: RequestDraft): Observable<ServiceRequest> {
    const d = draft.details;
    const user = this.auth.currentUser();
    if (!draft.branchId) return throwError(() => new WorkflowError('اختر الفرع.'));
    if (d['pledgeAccepted'] !== true || !user) return throwError(() => new WorkflowError('الموافقة على التعهد مطلوبة لإرسال الحجز.'));

    return forkJoin([this.occupancy(), this.blockedDays()]).pipe(
      switchMap(([occupancy, blocked]) => {
        const result = this.evaluate(
          { tripDate: String(d['tripDate'] ?? ''), passengers: Number(d['passengers']), departTime: String(d['departTime'] ?? ''), returnTime: String(d['returnTime'] ?? '') },
          draft.branchId,
          occupancy,
          blocked,
        );
        if (result.errors.length) return throwError(() => new WorkflowError(result.errors[0]));
        const tripDate = String(d['tripDate']);
        return this.requests.create({
          ...draft,
          priority: 'normal',
          details: {
            ...d,
            buses: result.buses,
            withinRules: result.withinRules,
            waitlisted: result.waitlist,
            tripCode: String(d['tripCode'] || tripCodeFor(tripDate, Date.now())),
            pledgeBy: `${user.nameAr} (${user.employeeId})`,
            pledgeAt: this.clock.nowIso(),
          },
        });
      }),
    );
  }

  /** Allocates buses and drivers; refuses a bus or driver that already serves an overlapping booking. */
  allocate(request: ServiceRequest, slots: BusSlot[]): Observable<ServiceRequest> {
    const me = occupancyOf(request);
    if (!me) return throwError(() => new WorkflowError('بيانات الرحلة غير مكتملة.'));
    return forkJoin([this.occupancy(), this.reference.vehicles(), this.reference.drivers()]).pipe(
      switchMap(([all, vehicles, drivers]) => {
        const overlapping = all.filter(
          (o) => o.id !== me.id && occupies(o) && o.date === me.date && o.departMin < me.returnMin && o.returnMin > me.departMin,
        );
        for (const s of slots) {
          const bus = vehicles.find((v) => v.id === s.vehicleId);
          if (bus && overlapping.some((o) => o.vehicleIds.includes(bus.id))) {
            return throwError(() => new WorkflowError(`الباص ${bus.plate} مخصّص لرحلة أخرى في الفترة نفسها.`));
          }
          const driver = drivers.find((x) => x.id === s.driverId);
          if (driver && overlapping.some((o) => o.driverIds.includes(driver.id))) {
            return throwError(() => new WorkflowError(`السائق ${driver.nameAr} مخصّص لرحلة أخرى في الفترة نفسها.`));
          }
        }
        return this.requests.perform(request.id, 'allocate', { allocation: { slots } });
      }),
    );
  }

  /** Moves a waitlisted booking to approved once buses are free for its window. */
  promote(request: ServiceRequest, noteAr?: string): Observable<ServiceRequest> {
    const me = occupancyOf(request);
    if (!me) return throwError(() => new WorkflowError('بيانات الرحلة غير مكتملة.'));
    return this.occupancy().pipe(
      switchMap((all) => {
        const used = peakUsage(
          all.filter((o) => o.id !== me.id && o.branchId === me.branchId && o.date === me.date),
          me.departMin,
          me.returnMin,
        );
        return capacityOf(me.branchId) - used < me.buses
          ? throwError(() => new WorkflowError('لا تتوفر باصات كافية لهذه الفترة بعد — يبقى الحجز في قائمة الانتظار.'))
          : this.requests.perform(request.id, 'promote', { noteAr });
      }),
    );
  }

  addBlockedDay(date: string, reasonAr: string): Observable<void> {
    return this.editBlocked(`حجب يوم ${date}`, (days) => {
      if (!isDayKey(date) || !reasonAr.trim()) throw new WorkflowError('أدخل التاريخ وسبب الحجب.');
      if (days.some((d) => d.date === date)) throw new WorkflowError('هذا اليوم محجوب مسبقًا.');
      return [...days, { id: `bd-${date}`, date, reasonAr: reasonAr.trim() }];
    });
  }

  removeBlockedDay(id: string): Observable<void> {
    return this.editBlocked('رفع الحجب عن يوم', (days) => days.filter((d) => d.id !== id));
  }

  private editBlocked(actionAr: string, edit: (days: BlockedDay[]) => BlockedDay[]): Observable<void> {
    if (!this.permissions.can('transport.calendar.manage')) return throwError(() => new WorkflowError('ليست لديك صلاحية إدارة تقويم الباصات.'));
    const user = this.auth.currentUser();
    return this.reference.lists().pipe(
      switchMap((lists) => {
        let blockedDays: BlockedDay[];
        try {
          blockedDays = edit(lists.blockedDays);
        } catch (e) {
          return throwError(() => e);
        }
        return forkJoin([
          this.reference.saveLists({ ...lists, blockedDays }),
          this.audit.add([
            {
              at: this.clock.nowIso(),
              actorId: user?.id ?? null,
              actorName: user?.nameAr ?? 'النظام',
              actionAr,
              entityType: 'reference',
              entityId: 'blocked-days',
              summaryAr: `تقويم الباصات — ${actionAr}`,
            },
          ]),
        ]).pipe(map(() => undefined));
      }),
      switchMap((value) => {
        this.version.bump();
        return of(value);
      }),
    );
  }
}
