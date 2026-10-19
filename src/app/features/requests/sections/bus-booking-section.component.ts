import { DestroyRef, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { rxResource } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbDate } from '@ng-bootstrap/ng-bootstrap/datepicker';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { BookingService } from '../../../core/bookings/booking.service';
import { Clock } from '../../../core/clock.service';
import { liveResource } from '../../../core/live-resource';
import {
  EARLIEST_DEPARTURE,
  LATEST_RETURN,
  LEAD_DAYS,
  MAX_PASSENGERS,
  MIN_PASSENGERS,
  dayBlockReason,
  dayKey,
  isDayKey,
  toMinutes,
} from '../../../domain/bookings/booking-rules';
import { ReferenceRepository } from '../../../domain/repositories';
import { BRANCHES, PASSENGERS_PER_BUS } from '../../../domain/reference-data';
import { tripCodeFor } from '../../../domain/workflows/event-children';
import { DateFieldComponent } from '../../../shared/ui/date-field.component';
import { AvailabilityCalendarComponent } from '../../transport/availability-calendar.component';
import { ServiceSectionBase } from './section-base';

const PLEDGE =
  'أتعهد أنا مقدّم الطلب بأن الرحلة تخدم غرضًا تعليميًا أو تربويًا معتمدًا من المدرسة، وأن عدد الركاب المسجَّل صحيح ولن يتجاوز السعة المخصصة، ' +
  'وأتحمّل مسؤولية الإشراف على الطلاب والمرافقين طوال الرحلة، وأتقيّد بتعليمات السلامة وبتعليمات سائق الباص وبموعدي الانطلاق والعودة المحددين، ' +
  'وأُبلغ مسؤول النقل بأي تغيير أو إلغاء قبل موعد الرحلة بثلاثة أيام على الأقل. وأقرّ بأن عدم الالتزام بما سبق قد يؤدي إلى إيقاف حقي في حجز الباصات مستقبلًا.';

/** Bus booking: trip details with live availability (calendar, time window, buses needed) and the signed pledge. */
@Component({
  selector: 'app-bus-booking-section',
  imports: [ReactiveFormsModule, DateFieldComponent, AvailabilityCalendarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">بيانات الرحلة</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-12">
            @if (branch(); as b) {
              <div class="alert alert-info py-2 mb-0" role="status">
                <i class="bi bi-bus-front me-1" aria-hidden="true"></i>{{ b.nameAr }}: <strong><span class="ltr-inline">{{ b.busesPerDay }}</span> باصات يوميًا</strong>
              </div>
            } @else {
              <div class="alert alert-warning py-2 mb-0" role="status">اختر الفرع من بيانات مقدم الطلب لعرض توفر الباصات.</div>
            }
          </div>

          <div class="col-lg-6">
            <label class="form-label" for="bb-date">تاريخ الرحلة <span class="text-danger" aria-hidden="true">*</span></label>
            <app-date-field inputId="bb-date" formControlName="tripDate" [min]="earliest" [disabledDays]="disabledDays" [invalid]="bad('tripDate')" />
            @if (bad('tripDate')) {
              <div class="text-danger small mt-1" role="alert">حدد تاريخ الرحلة.</div>
            }
            <div class="form-text">يجب الحجز قبل الرحلة بـ {{ leadDays }} أيام على الأقل، ولا تُنفَّذ الرحلات يومي الجمعة والسبت.</div>
          </div>
          <div class="col-lg-3 col-6">
            <label class="form-label" for="bb-depart">وقت الانطلاق <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="bb-depart" type="time" class="form-control ltr text-start" formControlName="departTime" [min]="earliestDeparture" [class.is-invalid]="bad('departTime')" />
            <div class="form-text">ليس قبل <span class="ltr-inline">{{ earliestDeparture }}</span></div>
          </div>
          <div class="col-lg-3 col-6">
            <label class="form-label" for="bb-return">وقت العودة <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="bb-return" type="time" class="form-control ltr text-start" formControlName="returnTime" [max]="latestReturn" [class.is-invalid]="bad('returnTime')" />
            <div class="form-text">ليس بعد <span class="ltr-inline">{{ latestReturn }}</span></div>
          </div>

          <div class="col-md-4 col-6">
            <label class="form-label" for="bb-pax">عدد الركاب <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="bb-pax" type="number" [min]="minPassengers" [max]="maxPassengers" class="form-control ltr text-start" formControlName="passengers" [class.is-invalid]="bad('passengers')" />
            <div class="invalid-feedback">من {{ minPassengers }} إلى {{ maxPassengers }} راكبًا.</div>
          </div>
          <div class="col-md-4 col-6">
            <div class="form-label" id="bb-buses-label">عدد الباصات (تلقائي)</div>
            <div class="form-control bg-body-tertiary" aria-labelledby="bb-buses-label"><span class="ltr-inline">{{ evaluation().buses || '—' }}</span> <span class="text-muted-ar small">(باص لكل {{ perBus }} راكبًا)</span></div>
          </div>
          <div class="col-md-4">
            <div class="form-label" id="bb-code-label">ترميز الرحلة</div>
            <div class="form-control bg-body-tertiary ltr text-start" aria-labelledby="bb-code-label">{{ tripCode() || '—' }}</div>
          </div>

          <div class="col-md-6">
            <label class="form-label" for="bb-dest">وجهة الرحلة <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="bb-dest" class="form-control" formControlName="destination" [class.is-invalid]="bad('destination')" />
            <div class="invalid-feedback">حدد وجهة الرحلة.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="bb-map">رابط الموقع (اختياري)</label>
            <input id="bb-map" type="url" class="form-control ltr text-start" formControlName="mapUrl" placeholder="https://maps.google.com/..." [class.is-invalid]="bad('mapUrl')" />
            <div class="invalid-feedback">أدخل رابطًا صحيحًا يبدأ بـ https://</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="bb-purpose">الغرض <span class="text-danger" aria-hidden="true">*</span></label>
            <select id="bb-purpose" class="form-select" formControlName="purposeId" [class.is-invalid]="bad('purposeId')">
              <option value="">اختر الغرض</option>
              @for (p of purposes(); track p.id) {
                <option [value]="p.id">{{ p.nameAr }}</option>
              }
            </select>
            <div class="invalid-feedback">اختر غرض الرحلة.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="bb-notes">ملاحظات (اختياري)</label>
            <input id="bb-notes" class="form-control" formControlName="notes" />
          </div>
        </div>
      </div>
    </section>

    <section class="card mb-4">
      <div class="card-header">توفر الباصات</div>
      <div class="card-body">
        <div class="row g-4">
          <div class="col-lg-7">
            <app-availability-calendar [branchId]="branchId()" [selected]="values().tripDate" [fromMin]="window()[0]" [toMin]="window()[1]" (selectedChange)="pickDay($event)" />
          </div>
          <div class="col-lg-5">
            <h3 class="h6">نتيجة التحقق من قواعد الحجز</h3>
            @if (evaluation().errors.length && touchedAny()) {
              <ul class="alert alert-danger ps-4 mb-0" role="alert">
                @for (e of evaluation().errors; track e) {
                  <li>{{ e }}</li>
                }
              </ul>
            } @else if (evaluation().waitlist) {
              <div class="alert alert-warning mb-0" role="status">
                <i class="bi bi-hourglass-split me-1" aria-hidden="true"></i><strong>لا تتوفر باصات كافية</strong> لهذه الفترة (المتاح <span class="ltr-inline">{{ evaluation().free }}</span> من <span class="ltr-inline">{{ evaluation().buses }}</span>).
                سيُضاف حجزك إلى <strong>قائمة الانتظار</strong> ويُعتمد حين يتوفر باص.
              </div>
            } @else if (evaluation().withinRules) {
              <div class="alert alert-success mb-0" role="status">
                <i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i><strong>ضمن قواعد الحجز.</strong> يتوفر <span class="ltr-inline">{{ evaluation().free }}</span> باص لهذه الفترة، وسيُعتمد حجزك تلقائيًا.
              </div>
            } @else {
              <div class="text-muted-ar">اختر التاريخ والأوقات وعدد الركاب لمعرفة التوفر.</div>
            }
            <p class="small text-muted-ar mt-3 mb-0">يُحسب التوفر حسب فترة الرحلة نفسها (من الانطلاق إلى العودة) لا حسب اليوم فقط، فقد تتشارك رحلتان الباص نفسه إن لم تتداخل أوقاتهما.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">التعهد والموافقة</div>
      <div class="card-body">
        <p class="bg-body-tertiary rounded-3 p-3 mb-3">{{ pledge }}</p>
        <div class="form-check">
          <input id="bb-pledge" type="checkbox" class="form-check-input" formControlName="pledgeAccepted" [class.is-invalid]="bad('pledgeAccepted')" />
          <label class="form-check-label" for="bb-pledge">أوافق على التعهد أعلاه <span class="text-danger" aria-hidden="true">*</span></label>
          <div class="invalid-feedback">الموافقة على التعهد مطلوبة لإرسال الحجز.</div>
        </div>
        @if (identity(); as who) {
          <div class="small text-muted-ar mt-2"><i class="bi bi-person-check me-1" aria-hidden="true"></i>سيُسجَّل إقرارك باسم: {{ who }}</div>
        }
      </div>
    </section>
  `,
})
export class BusBookingSectionComponent extends ServiceSectionBase {
  private readonly booking = inject(BookingService);
  private readonly reference = inject(ReferenceRepository);
  private readonly auth = inject(AuthService);
  private readonly clock = inject(Clock);
  private readonly destroyRef = inject(DestroyRef);

  /** Branch of the booking (the requester's own, or the one central staff picked in the header). */
  readonly branchId = input<string | null>(null);

  protected readonly pledge = PLEDGE;
  protected readonly leadDays = LEAD_DAYS;
  protected readonly minPassengers = MIN_PASSENGERS;
  protected readonly maxPassengers = MAX_PASSENGERS;
  protected readonly perBus = PASSENGERS_PER_BUS;
  protected readonly earliestDeparture = EARLIEST_DEPARTURE;
  protected readonly latestReturn = LATEST_RETURN;
  protected readonly earliest = dayKey(this.addDays(LEAD_DAYS));
  protected readonly identity = computed(() => {
    const u = this.auth.currentUser();
    return u ? `${u.nameAr} (${u.employeeId})` : '';
  });

  private readonly tick = signal(0);
  private readonly lists = rxResource({ stream: () => this.reference.lists() });
  protected readonly purposes = () => this.lists.value()?.tripPurposes ?? [];
  private readonly live = liveResource(
    () => ({}),
    () => forkJoin({ occupancy: this.booking.occupancy(), blocked: this.booking.blockedDays() }),
  );

  protected readonly branch = computed(() => BRANCHES.find((b) => b.id === this.branchId()) ?? null);

  protected readonly values = computed(() => {
    this.tick();
    const g = this.group();
    const day = g.get('tripDate')?.value;
    return {
      tripDate: isDayKey(day) ? day : null,
      passengers: g.get('passengers')?.value as number | null,
      departTime: String(g.get('departTime')?.value ?? ''),
      returnTime: String(g.get('returnTime')?.value ?? ''),
    };
  });

  protected readonly window = computed<readonly [number, number]>(() => {
    const v = this.values();
    const from = toMinutes(v.departTime);
    const to = toMinutes(v.returnTime);
    return from !== null && to !== null && to > from ? [from, to] : [toMinutes(EARLIEST_DEPARTURE)!, toMinutes(LATEST_RETURN)!];
  });

  protected readonly evaluation = computed(() =>
    this.booking.evaluate(this.values(), this.branchId(), this.live.value()?.occupancy ?? [], this.live.value()?.blocked ?? []),
  );

  protected readonly tripCode = computed(() => {
    this.tick();
    return String(this.group().get('tripCode')?.value ?? '');
  });

  /** Weekends and blocked days are greyed out in the date picker. */
  protected readonly disabledDays = (date: NgbDate): boolean => {
    const key = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
    return dayBlockReason(key, { blocked: this.live.value()?.blocked ?? [] }) !== null;
  };

  protected build(): Record<string, AbstractControl> {
    return {
      tripDate: new FormControl<string | null>(null, { validators: [Validators.required] }),
      departTime: new FormControl('08:00', { nonNullable: true, validators: [Validators.required] }),
      returnTime: new FormControl('12:00', { nonNullable: true, validators: [Validators.required] }),
      passengers: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(MIN_PASSENGERS), Validators.max(MAX_PASSENGERS)] }),
      destination: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      mapUrl: new FormControl('', { nonNullable: true, validators: [Validators.pattern(/^$|^https?:\/\/\S+$/i)] }),
      purposeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      notes: new FormControl('', { nonNullable: true }),
      tripCode: new FormControl('', { nonNullable: true }),
      pledgeAccepted: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
    };
  }

  override ngOnInit(): void {
    super.ngOnInit();
    const date = this.group().get('tripDate')!;
    date.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((day) => {
      this.group().get('tripCode')!.setValue(isDayKey(day) ? tripCodeFor(day, Math.floor(this.clock.now().getTime() / 1000)) : '');
    });
    this.group().valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.tick.update((n) => n + 1));
  }

  protected pickDay(day: string | null): void {
    this.group().get('tripDate')!.setValue(day);
    this.group().get('tripDate')!.markAsTouched();
  }

  protected touchedAny(): boolean {
    return this.submitted() || !!this.group().get('tripDate')?.touched || !!this.values().tripDate;
  }

  private addDays(n: number): Date {
    const now = this.clock.now();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  }
}
