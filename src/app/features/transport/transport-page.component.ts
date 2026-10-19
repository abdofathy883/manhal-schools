import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap/nav';
import { firstValueFrom, forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { BookingService, capacityOf } from '../../core/bookings/booking.service';
import { Clock } from '../../core/clock.service';
import { liveResource } from '../../core/live-resource';
import { ToastService } from '../../core/notifications/toast.service';
import { PermissionService } from '../../core/rbac/permission.service';
import { RequestService } from '../../core/requests/request.service';
import { WINDOW_FROM, WINDOW_TO, dayInfo } from '../../domain/bookings/booking-rules';
import { BRANCHES } from '../../domain/reference-data';
import { formatLongDate } from '../../shared/pipes/format';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { AvailabilityCalendarComponent } from './availability-calendar.component';
import { BlockedDaysPanelComponent } from './blocked-days-panel.component';
import { BookingsQueueComponent } from './bookings-queue.component';

const minutesLabel = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const SPAN = WINDOW_TO - WINDOW_FROM;

/** النقل وتقويم الباصات: availability calendar for everyone with calendar access; queue, waitlist and blocked days for the transport officer. */
@Component({
  selector: 'app-transport-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgbNavModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    AvailabilityCalendarComponent,
    BookingsQueueComponent,
    BlockedDaysPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="النقل وتقويم الباصات" subtitle="توفر الباصات حسب الفرع والفترة الزمنية، وإدارة الحجوزات وقائمة الانتظار" />

    <ul ngbNav #nav="ngbNav" [(activeId)]="tab" class="nav-tabs mb-3">
      <li ngbNavItem="calendar">
        <button ngbNavLink type="button">التقويم</button>
        <ng-template ngbNavContent>
          <div class="row g-4">
            <div class="col-xl-7">
              <div class="card">
                <div class="card-body">
                  @if (branchChoices().length > 1) {
                    <div class="mb-3" style="max-inline-size: 20rem">
                      <label class="form-label" for="tr-branch">الفرع</label>
                      <select id="tr-branch" class="form-select" [value]="branchId()" (change)="chooseBranch($event)">
                        @for (b of branchChoices(); track b.id) {
                          <option [value]="b.id">{{ b.nameAr }}</option>
                        }
                      </select>
                    </div>
                  }
                  <app-availability-calendar [branchId]="branchId()" mode="manage" [(selected)]="selectedDay" />
                </div>
              </div>
            </div>
            <div class="col-xl-5">
              <div class="card">
                <div class="card-header">تفاصيل اليوم</div>
                <div class="card-body">
                  @if (day(); as d) {
                    <h2 class="h6">{{ longDate() }}</h2>
                    @if (d.info.state === 'blocked') {
                      <div class="alert alert-secondary py-2" role="status"><i class="bi bi-slash-circle me-1" aria-hidden="true"></i>يوم محجوب: {{ d.info.reasonAr }}</div>
                    } @else {
                      <p class="mb-2">
                        <span class="badge" [class]="d.info.free > 0 ? 'bg-success-subtle text-success-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'">
                          المتاح طوال الفترة: <span class="ltr-inline">{{ d.info.free }}</span> من <span class="ltr-inline">{{ d.info.capacity }}</span> باصات
                        </span>
                      </p>
                    }

                    @if (d.bookings.length) {
                      <div class="small text-muted-ar mb-1" aria-hidden="true">
                        <span class="ltr-inline">{{ windowStart }}</span> ← الفترة المتاحة للرحلات → <span class="ltr-inline">{{ windowEnd }}</span>
                      </div>
                      <ul class="list-unstyled mb-0">
                        @for (b of d.bookings; track b.id) {
                          <li class="mb-3">
                            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                              <span class="fw-semibold">
                                <span class="ltr-inline">{{ b.from }} – {{ b.to }}</span>
                                · <span class="ltr-inline">{{ b.buses }}</span> باصات / <span class="ltr-inline">{{ b.passengers }}</span> راكبًا
                              </span>
                              @if (b.waitlisted) {
                                <span class="badge bg-warning-subtle text-warning-emphasis">قائمة الانتظار</span>
                              } @else {
                                <app-status-badge [status]="b.status" />
                              }
                            </div>
                            <div class="cal-bar mt-1" aria-hidden="true">
                              <span class="cal-bar-fill" [class.cal-bar-wait]="b.waitlisted" [style.margin-inline-start.%]="b.offset" [style.inline-size.%]="b.width"></span>
                            </div>
                            @if (b.link) {
                              <a class="small" [routerLink]="['/requests', b.link]">فتح الحجز</a>
                            }
                          </li>
                        }
                      </ul>
                    } @else if (d.info.state !== 'blocked') {
                      <div class="text-muted-ar">لا توجد حجوزات في هذا اليوم.</div>
                    }

                    @if (canManage() && !d.weekend) {
                      <hr />
                      @if (d.blockedId; as blockedId) {
                        <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="busy()" (click)="unblock(blockedId)"><i class="bi bi-unlock me-1" aria-hidden="true"></i>رفع الحجب عن اليوم</button>
                      } @else {
                        <div class="input-group input-group-sm">
                          <input class="form-control" [formControl]="reason" placeholder="سبب الحجب (مثال: إجازة رسمية)" aria-label="سبب حجب اليوم" />
                          <button type="button" class="btn btn-outline-danger" [disabled]="busy() || reason.invalid" (click)="block(d.date)"><i class="bi bi-slash-circle me-1" aria-hidden="true"></i>حجب اليوم</button>
                        </div>
                      }
                    }
                  } @else {
                    <div class="text-muted-ar">اختر يومًا من التقويم لعرض حجوزاته وتوفر الباصات.</div>
                  }
                </div>
              </div>
            </div>
          </div>
        </ng-template>
      </li>

      @if (canAllocate()) {
        <li ngbNavItem="queue">
          <button ngbNavLink type="button">الحجوزات</button>
          <ng-template ngbNavContent><app-bookings-queue /></ng-template>
        </li>
        <li ngbNavItem="waitlist">
          <button ngbNavLink type="button">قائمة الانتظار</button>
          <ng-template ngbNavContent><app-bookings-queue [waitlist]="true" /></ng-template>
        </li>
      }
      @if (canManage()) {
        <li ngbNavItem="blocked">
          <button ngbNavLink type="button">الأيام المحجوبة</button>
          <ng-template ngbNavContent><app-blocked-days-panel /></ng-template>
        </li>
      }
    </ul>
    <div [ngbNavOutlet]="nav"></div>
  `,
})
export class TransportPageComponent {
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly bookings = inject(BookingService);
  private readonly requests = inject(RequestService);
  private readonly clock = inject(Clock);
  private readonly toasts = inject(ToastService);

  protected readonly tab = signal('calendar');
  protected readonly selectedDay = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly reason = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  protected readonly windowStart = minutesLabel(WINDOW_FROM);
  protected readonly windowEnd = minutesLabel(WINDOW_TO);

  protected readonly canAllocate = computed(() => this.permissions.can('transport.allocate'));
  protected readonly canManage = computed(() => this.permissions.can('transport.calendar.manage'));

  /** Branches whose calendar this user may open: all of them for the transport officer / executives, otherwise their own. */
  protected readonly branchChoices = computed(() => {
    const scope = this.permissions.scopeOf('transport.calendar.view');
    const own = this.auth.currentUser()?.branchId;
    return scope === 'all' || !own ? BRANCHES : BRANCHES.filter((b) => b.id === own);
  });
  protected readonly chosenBranch = signal<string | null>(null);
  protected readonly branchId = computed(() => {
    const chosen = this.chosenBranch();
    return this.branchChoices().find((b) => b.id === chosen)?.id ?? this.branchChoices()[0]?.id ?? null;
  });

  private readonly data = liveResource(
    () => ({ user: this.auth.currentUser()?.id ?? null }),
    () => forkJoin({ occupancy: this.bookings.occupancy(), blocked: this.bookings.blockedDays(), mine: this.requests.list() }),
  );

  protected readonly longDate = computed(() => formatLongDate(this.selectedDay()));

  protected readonly day = computed(() => {
    const date = this.selectedDay();
    const data = this.data.value();
    const branch = this.branchId();
    if (!date || !data || !branch) return null;
    const occupancy = data.occupancy.filter((o) => o.branchId === branch);
    const info = dayInfo(date, { now: this.clock.now(), capacity: capacityOf(branch), occupancy, blocked: data.blocked });
    const visible = new Set(data.mine.map((r) => r.id));
    const bookings = occupancy
      .filter((o) => o.date === date && !(['rejected', 'cancelled', 'returned'] as string[]).includes(o.status))
      .sort((a, b) => a.departMin - b.departMin)
      .map((o) => ({
        id: o.id,
        from: minutesLabel(o.departMin),
        to: minutesLabel(o.returnMin),
        buses: o.buses,
        passengers: o.passengers,
        status: o.status,
        waitlisted: o.waitlisted,
        offset: ((o.departMin - WINDOW_FROM) / SPAN) * 100,
        width: ((o.returnMin - o.departMin) / SPAN) * 100,
        link: visible.has(o.id) ? o.id : null,
      }));
    const blockedEntry = data.blocked.find((b) => b.date === date);
    return {
      date,
      info,
      bookings,
      weekend: info.state === 'blocked' && !blockedEntry,
      blockedId: blockedEntry?.id ?? null,
    };
  });

  protected chooseBranch(event: Event): void {
    this.chosenBranch.set((event.target as HTMLSelectElement).value);
  }

  protected async block(date: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.bookings.addBlockedDay(date, this.reason.value));
      this.reason.reset('');
      this.toasts.success('تم حجب اليوم');
    } catch (err) {
      this.requests.reportError(err, 'تعذر حجب اليوم');
    } finally {
      this.busy.set(false);
    }
  }

  protected async unblock(id: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.bookings.removeBlockedDay(id));
      this.toasts.success('تم رفع الحجب');
    } catch (err) {
      this.requests.reportError(err, 'تعذر رفع الحجب');
    } finally {
      this.busy.set(false);
    }
  }
}
