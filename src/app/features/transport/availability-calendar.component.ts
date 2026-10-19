import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { BookingService } from '../../core/bookings/booking.service';
import { Clock } from '../../core/clock.service';
import { liveResource } from '../../core/live-resource';
import { DayInfo, DayState, WINDOW_FROM, WINDOW_TO, dayInfo, dayKey } from '../../domain/bookings/booking-rules';
import { BRANCHES } from '../../domain/reference-data';
import { formatLongDate } from '../../shared/pipes/format';

interface Cell {
  key: string;
  day: number;
  inMonth: boolean;
  today: boolean;
  info: DayInfo | null;
}

const STATE_LABELS: Record<DayState, string> = {
  available: 'متاح',
  partial: 'متاح جزئيًا',
  full: 'مكتمل',
  blocked: 'محجوب',
  closed: 'غير متاح للحجز',
};

const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTH_FORMAT = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric' });

/**
 * Bus availability calendar of one branch. It recomputes from the live bookings, so a booking made anywhere
 * (even by someone else) changes the colours immediately. Green = free, amber = partly taken, grey = full or
 * too close to book, hatched = blocked (weekend, holiday, exams).
 */
@Component({
  selector: 'app-availability-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cal">
      <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" (click)="shift(-1)" aria-label="الشهر السابق"><i class="bi bi-chevron-right" aria-hidden="true"></i></button>
        <div class="text-center">
          <div class="fw-bold" aria-live="polite">{{ monthLabel() }}</div>
          <div class="small text-muted-ar">{{ branchName() }} — <span class="ltr-inline">{{ capacity() }}</span> باصات يوميًا</div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary" (click)="shift(1)" aria-label="الشهر التالي"><i class="bi bi-chevron-left" aria-hidden="true"></i></button>
      </div>

      <div class="cal-grid cal-head" aria-hidden="true">
        @for (w of weekdays; track w) {
          <div>{{ w }}</div>
        }
      </div>
      <div class="cal-grid" role="group" [attr.aria-label]="'تقويم توفر الباصات — ' + monthLabel()">
        @for (cell of cells(); track cell.key) {
          @if (cell.inMonth && cell.info; as info) {
            <button
              type="button"
              class="cal-day"
              [class]="'cal-day cal-day--' + info.state"
              [class.cal-day--today]="cell.today"
              [class.cal-day--selected]="selected() === cell.key"
              [disabled]="!selectable(info)"
              [attr.aria-pressed]="selected() === cell.key"
              [attr.aria-label]="label(cell, info)"
              [attr.title]="info.reasonAr ?? null"
              (click)="select(cell.key)"
            >
              <span class="cal-num">{{ cell.day }}</span>
              @if (info.state === 'available' || info.state === 'partial') {
                <span class="cal-sub"><span class="ltr-inline">{{ info.free }}</span> متاح</span>
              } @else if (info.state === 'full') {
                <span class="cal-sub">مكتمل</span>
              } @else if (info.state === 'blocked') {
                <span class="cal-sub">محجوب</span>
              }
            </button>
          } @else {
            <div class="cal-day cal-day--empty" aria-hidden="true"></div>
          }
        }
      </div>

      <ul class="list-inline small mt-3 mb-0 d-flex flex-wrap gap-3" aria-label="دليل الألوان">
        <li class="d-flex align-items-center gap-1"><span class="cal-key cal-day--available"></span>متاح</li>
        <li class="d-flex align-items-center gap-1"><span class="cal-key cal-day--partial"></span>متاح جزئيًا</li>
        <li class="d-flex align-items-center gap-1"><span class="cal-key cal-day--full"></span>مكتمل / غير متاح</li>
        <li class="d-flex align-items-center gap-1"><span class="cal-key cal-day--blocked"></span>محجوب (عطلة / إجازة / اختبارات)</li>
      </ul>
    </div>
  `,
})
export class AvailabilityCalendarComponent {
  private readonly booking = inject(BookingService);
  private readonly clock = inject(Clock);

  readonly branchId = input<string | null>(null);
  /** `pick`: only bookable days can be chosen. `manage`: every day can be opened (transport officer). */
  readonly mode = input<'pick' | 'manage'>('pick');
  /** Requested time window in minutes; defaults to the whole 07:15–12:15 booking window. */
  readonly fromMin = input(WINDOW_FROM);
  readonly toMin = input(WINDOW_TO);
  readonly selected = model<string | null>(null);

  protected readonly weekdays = WEEKDAYS;
  private readonly month = signal(new Date(this.clock.now().getFullYear(), this.clock.now().getMonth(), 1));

  private readonly data = liveResource(
    () => ({}),
    () => forkJoin({ occupancy: this.booking.occupancy(), blocked: this.booking.blockedDays() }),
  );

  protected readonly capacity = computed(() => BRANCHES.find((b) => b.id === this.branchId())?.busesPerDay ?? 0);
  protected readonly branchName = computed(() => BRANCHES.find((b) => b.id === this.branchId())?.nameAr ?? 'اختر الفرع');
  protected readonly monthLabel = computed(() => MONTH_FORMAT.format(this.month()));

  protected readonly cells = computed<Cell[]>(() => {
    const first = this.month();
    const now = this.clock.now();
    const todayKey = dayKey(now);
    const data = this.data.value();
    const branch = this.branchId();
    const ctx = {
      now,
      capacity: this.capacity(),
      occupancy: (data?.occupancy ?? []).filter((o) => o.branchId === branch),
      blocked: data?.blocked ?? [],
    };
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key = dayKey(d);
      const inMonth = d.getMonth() === first.getMonth();
      return {
        key,
        day: d.getDate(),
        inMonth,
        today: key === todayKey,
        info: inMonth && data && branch ? dayInfo(key, ctx, [this.fromMin(), this.toMin()]) : null,
      };
    });
  });

  protected shift(by: number): void {
    const m = this.month();
    this.month.set(new Date(m.getFullYear(), m.getMonth() + by, 1));
  }

  protected selectable(info: DayInfo): boolean {
    return this.mode() === 'manage' || info.state === 'available' || info.state === 'partial' || info.state === 'full';
  }

  protected select(key: string): void {
    this.selected.set(this.selected() === key && this.mode() === 'pick' ? null : key);
  }

  protected label(cell: Cell, info: DayInfo): string {
    const free = info.state === 'available' || info.state === 'partial' ? ` — ${info.free} باصات متاحة` : '';
    return `${formatLongDate(cell.key)} — ${STATE_LABELS[info.state]}${free}${info.reasonAr ? ` (${info.reasonAr})` : ''}`;
  }
}
