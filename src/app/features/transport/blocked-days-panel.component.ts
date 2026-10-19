import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BookingService } from '../../core/bookings/booking.service';
import { liveResource } from '../../core/live-resource';
import { ToastService } from '../../core/notifications/toast.service';
import { RequestService } from '../../core/requests/request.service';
import { ArDatePipe } from '../../shared/pipes/format';
import { DateFieldComponent } from '../../shared/ui/date-field.component';

/** Holidays and exam days on which no trips can be booked (Fridays and Saturdays are always blocked). */
@Component({
  selector: 'app-blocked-days-panel',
  imports: [ReactiveFormsModule, ArDatePipe, DateFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row g-4">
      <div class="col-lg-5">
        <form class="card" [formGroup]="form" (ngSubmit)="add()" novalidate>
          <div class="card-header">حجب يوم جديد</div>
          <div class="card-body">
            <div class="mb-3">
              <label class="form-label" for="bd-date">التاريخ <span class="text-danger" aria-hidden="true">*</span></label>
              <app-date-field inputId="bd-date" formControlName="date" [invalid]="invalid('date')" />
              @if (invalid('date')) {
                <div class="text-danger small mt-1" role="alert">حدد التاريخ.</div>
              }
            </div>
            <div class="mb-3">
              <label class="form-label" for="bd-reason">السبب <span class="text-danger" aria-hidden="true">*</span></label>
              <input id="bd-reason" class="form-control" formControlName="reasonAr" placeholder="مثال: إجازة رسمية أو اختبارات" [class.is-invalid]="invalid('reasonAr')" />
              <div class="invalid-feedback">اكتب سبب الحجب.</div>
            </div>
            <button type="submit" class="btn btn-primary" [disabled]="busy()"><i class="bi bi-slash-circle me-1" aria-hidden="true"></i>حجب اليوم</button>
          </div>
        </form>
      </div>
      <div class="col-lg-7">
        <div class="card">
          <div class="card-header">الأيام المحجوبة</div>
          <ul class="list-group list-group-flush">
            @for (d of days.value() ?? []; track d.id) {
              <li class="list-group-item d-flex align-items-center justify-content-between gap-2">
                <div>
                  <span class="ltr-inline fw-semibold">{{ d.date | arDate }}</span>
                  <span class="text-muted-ar ms-2">{{ d.reasonAr }}</span>
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger" [disabled]="busy()" (click)="remove(d.id)" [attr.aria-label]="'رفع الحجب عن ' + d.reasonAr"><i class="bi bi-trash" aria-hidden="true"></i></button>
              </li>
            } @empty {
              <li class="list-group-item text-muted-ar">لا توجد أيام محجوبة غير العطلة الأسبوعية.</li>
            }
          </ul>
        </div>
      </div>
    </div>
  `,
})
export class BlockedDaysPanelComponent {
  private readonly bookings = inject(BookingService);
  private readonly requests = inject(RequestService);
  private readonly toasts = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly days = liveResource(
    () => ({}),
    () => this.bookings.blockedDays(),
  );

  protected readonly form = new FormGroup({
    date: new FormControl<string | null>(null, { validators: [Validators.required] }),
    reasonAr: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected invalid(name: 'date' | 'reasonAr'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  protected async add(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const { date, reasonAr } = this.form.getRawValue();
      await firstValueFrom(this.bookings.addBlockedDay(date!, reasonAr));
      this.toasts.success('تم حجب اليوم', 'لن يظهر هذا اليوم متاحًا في تقويم الحجز.');
      this.form.reset({ date: null, reasonAr: '' });
      this.submitted.set(false);
    } catch (err) {
      this.requests.reportError(err, 'تعذر حجب اليوم');
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(id: string): Promise<void> {
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
