import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap/tooltip';
import { firstValueFrom, forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { BookingService, capacityOf } from '../../core/bookings/booking.service';
import { liveResource } from '../../core/live-resource';
import { ToastService } from '../../core/notifications/toast.service';
import { RequestService } from '../../core/requests/request.service';
import { BusAllocation, BusOccupancy, occupies, peakUsage } from '../../domain/bookings/booking-rules';
import { ServiceRequest } from '../../domain/models/request';
import { BRANCHES, DEPARTMENTS } from '../../domain/reference-data';
import { ReferenceRepository } from '../../domain/repositories';
import { ActionDescriptor } from '../../domain/workflows/engine';
import { ArDatePipe } from '../../shared/pipes/format';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { ActionRunner } from '../requests/action-runner.service';

type Filter = 'open' | 'allocate' | 'running' | 'done' | 'all';

interface Row {
  request: ServiceRequest;
  date: string;
  depart: string;
  back: string;
  buses: number;
  passengers: number;
  branch: string;
  department: string;
  allocation: string;
  /** Waitlist only: buses free for the booking's window right now. */
  free: number;
  actions: ActionDescriptor[];
}

const ROW_ACTIONS = ['approve', 'reject', 'allocate', 'complete', 'close'] as const;

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: 'open', label: 'بانتظار الاعتماد' },
  { key: 'allocate', label: 'بانتظار التخصيص' },
  { key: 'running', label: 'قيد التنفيذ' },
  { key: 'done', label: 'منتهية / ملغاة' },
  { key: 'all', label: 'الكل' },
];

/** Bookings queue and waitlist of the transport officer (same table, different filter and actions). */
@Component({
  selector: 'app-bookings-queue',
  imports: [RouterLink, NgbTooltipModule, ArDatePipe, EmptyStateComponent, SkeletonRowsComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!waitlist()) {
      <div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="تصفية الحجوزات">
        @for (f of filters; track f.key) {
          <button type="button" class="btn btn-sm" [class]="filter() === f.key ? 'btn-primary' : 'btn-outline-secondary'" [attr.aria-pressed]="filter() === f.key" (click)="filter.set(f.key)">
            {{ f.label }} <span class="badge bg-body-secondary text-body ms-1">{{ counts()[f.key] }}</span>
          </button>
        }
      </div>
    } @else {
      <div class="alert alert-info" role="note">
        الحجوزات هنا لا تحجز باصات حتى تتوفر سعة لفترتها. عند توفر باص يصبح زر «اعتماد من الانتظار» متاحًا، ويُنقل الحجز إلى الحجوزات المعتمدة.
      </div>
    }

    @if (loading()) {
      <app-skeleton-rows [count]="5" />
    } @else if (rows().length === 0) {
      <app-empty-state [title]="waitlist() ? 'قائمة الانتظار فارغة' : 'لا توجد حجوزات'" message="لا توجد حجوزات مطابقة ضمن صلاحيتك." />
    } @else {
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <caption class="visually-hidden">{{ waitlist() ? 'قائمة انتظار الحجوزات' : 'حجوزات الباصات' }}</caption>
          <thead>
            <tr>
              <th scope="col">الرقم المرجعي</th>
              <th scope="col">الفرع / القسم</th>
              <th scope="col">التاريخ</th>
              <th scope="col">الوقت</th>
              <th scope="col">الباصات</th>
              <th scope="col">{{ waitlist() ? 'المتاح الآن' : 'الحالة' }}</th>
              @if (!waitlist()) {
                <th scope="col">التخصيص</th>
              }
              <th scope="col"><span class="visually-hidden">إجراءات</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.request.id) {
              <tr>
                <td>
                  <a [routerLink]="['/requests', row.request.id]" class="fw-semibold text-decoration-none"><span class="ltr-inline">{{ row.request.refNo }}</span></a>
                  <div class="small text-muted-ar">{{ row.request.titleAr }}</div>
                </td>
                <td>{{ row.branch }}<div class="small text-muted-ar">{{ row.department }}</div></td>
                <td><span class="ltr-inline">{{ row.date | arDate }}</span></td>
                <td><span class="ltr-inline">{{ row.depart }} – {{ row.back }}</span></td>
                <td><span class="ltr-inline">{{ row.buses }}</span> <span class="small text-muted-ar">({{ row.passengers }} راكبًا)</span></td>
                @if (waitlist()) {
                  <td>
                    <span class="badge" [class]="row.free >= row.buses ? 'bg-success-subtle text-success-emphasis' : 'bg-warning-subtle text-warning-emphasis'">
                      <span class="ltr-inline">{{ row.free }}</span> من <span class="ltr-inline">{{ row.buses }}</span>
                    </span>
                  </td>
                } @else {
                  <td><app-status-badge [status]="row.request.status" [holdReason]="row.request.holdReason" /></td>
                  <td class="small">{{ row.allocation }}</td>
                }
                <td class="text-end">
                  <div class="d-flex flex-wrap gap-1 justify-content-end">
                    @if (waitlist()) {
                      <span [ngbTooltip]="row.free >= row.buses ? null : 'لا تتوفر باصات كافية لهذه الفترة بعد'" class="d-inline-block">
                        <button type="button" class="btn btn-sm btn-success" [disabled]="row.free < row.buses || busy()" (click)="promote(row)"><i class="bi bi-box-arrow-in-up me-1" aria-hidden="true"></i>اعتماد من الانتظار</button>
                      </span>
                    }
                    @for (a of row.actions; track a.key) {
                      <span [ngbTooltip]="a.enabled ? null : a.disabledReasonAr" class="d-inline-block">
                        <button type="button" class="btn btn-sm" [class]="'btn-outline-' + (a.tone === 'danger' ? 'danger' : a.tone === 'success' ? 'success' : 'primary')" [disabled]="!a.enabled || busy()" (click)="run(row, a)">
                          <i class="bi me-1" [class]="a.icon" aria-hidden="true"></i>{{ a.labelAr }}
                        </button>
                      </span>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class BookingsQueueComponent {
  private readonly requests = inject(RequestService);
  private readonly bookings = inject(BookingService);
  private readonly reference = inject(ReferenceRepository);
  private readonly runner = inject(ActionRunner);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly waitlist = input(false);

  protected readonly filters = FILTERS;
  protected readonly filter = signal<Filter>('open');
  protected readonly busy = signal(false);

  private readonly data = liveResource(
    () => ({ user: this.auth.currentUser()?.id ?? null }),
    () => forkJoin({ requests: this.requests.list(), occupancy: this.bookings.occupancy() }),
  );
  private readonly lookups = rxResource({ stream: () => this.reference.vehicles() });

  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());

  private readonly all = computed<Row[]>(() => {
    const { requests = [], occupancy = [] } = this.data.value() ?? {};
    const vehicles = this.lookups.value() ?? [];
    return requests
      .filter((r) => r.service === 'bus-booking')
      .map((r): Row => {
        const buses = Number(r.details['buses'] ?? 1);
        const slots = (r.details['allocation'] as BusAllocation | undefined)?.slots ?? [];
        const plates = slots.map((s) => (s.vehicleId ? (vehicles.find((v) => v.id === s.vehicleId)?.plate ?? '—') : 'متعاقد'));
        return {
          request: r,
          date: String(r.details['tripDate'] ?? ''),
          depart: String(r.details['departTime'] ?? ''),
          back: String(r.details['returnTime'] ?? ''),
          buses,
          passengers: Number(r.details['passengers'] ?? 0),
          branch: BRANCHES.find((b) => b.id === r.branchId)?.nameAr ?? 'مركزي',
          department: DEPARTMENTS.find((d) => d.id === r.departmentId)?.nameAr ?? '',
          allocation: slots.length ? plates.join('، ') : r.status === 'approved' || r.status === 'in_progress' ? 'لم يُخصَّص بعد' : '—',
          free: this.freeFor(r, occupancy),
          actions: this.requests.describe(r).filter((a) => a.enabled && (ROW_ACTIONS as readonly string[]).includes(a.key)),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  });

  private inFilter(row: Row, f: Filter): boolean {
    const r = row.request;
    switch (f) {
      case 'open':
        return r.status === 'pending_approval' && r.details['waitlisted'] !== true;
      case 'allocate':
        return r.status === 'approved';
      case 'running':
        return r.status === 'in_progress' || r.status === 'executed';
      case 'done':
        return (['closed', 'cancelled', 'rejected'] as string[]).includes(r.status);
      default:
        return true;
    }
  }

  protected readonly counts = computed(() => {
    const rows = this.all();
    return Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => this.inFilter(r, f.key)).length])) as Record<Filter, number>;
  });

  protected readonly rows = computed(() =>
    this.waitlist()
      ? this.all().filter((r) => r.request.status === 'pending_approval' && r.request.details['waitlisted'] === true)
      : this.all().filter((r) => this.inFilter(r, this.filter()) && !(r.request.details['waitlisted'] === true && r.request.status === 'pending_approval')),
  );

  private freeFor(r: ServiceRequest, occupancy: readonly BusOccupancy[]): number {
    const depart = String(r.details['departTime'] ?? '');
    const back = String(r.details['returnTime'] ?? '');
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const used = peakUsage(
      occupancy.filter((o) => o.id !== r.id && occupies(o) && o.branchId === r.branchId && o.date === r.details['tripDate']),
      toMin(depart),
      toMin(back),
    );
    return Math.max(0, capacityOf(r.branchId) - used);
  }

  protected async run(row: Row, action: ActionDescriptor): Promise<void> {
    this.busy.set(true);
    try {
      await this.runner.run(row.request, action);
    } finally {
      this.busy.set(false);
    }
  }

  protected async promote(row: Row): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.bookings.promote(row.request));
      this.toasts.success('نُقل الحجز من قائمة الانتظار', `${row.request.refNo} — أصبح حجزًا معتمدًا.`);
    } catch (err) {
      this.requests.reportError(err, 'تعذر اعتماد الحجز');
    } finally {
      this.busy.set(false);
    }
  }
}
