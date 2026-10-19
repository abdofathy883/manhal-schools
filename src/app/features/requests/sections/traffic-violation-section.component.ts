import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DateFieldComponent } from '../../../shared/ui/date-field.component';
import { FleetFieldsComponent } from './fleet-fields.component';
import { ServiceSectionBase } from './section-base';

/** Traffic violation: violation number, date, offender (driver lookup), vehicle and amount. The record is confidential. */
@Component({
  selector: 'app-traffic-violation-section',
  imports: [ReactiveFormsModule, FleetFieldsComponent, DateFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">بيانات المخالفة</div>
      <div class="card-body">
        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <label class="form-label" for="tv-no">رقم المخالفة <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="tv-no" class="form-control ltr text-start" formControlName="violationNo" inputmode="numeric" maxlength="12" [class.is-invalid]="bad('violationNo')" />
            <div class="invalid-feedback">أدخل رقم المخالفة (أرقام فقط، 6 إلى 12 رقمًا).</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="tv-date">تاريخ المخالفة <span class="text-danger" aria-hidden="true">*</span></label>
            <app-date-field inputId="tv-date" formControlName="violationDate" [invalid]="bad('violationDate')" />
            @if (bad('violationDate')) {
              <div class="text-danger small mt-1" role="alert">حدد تاريخ المخالفة.</div>
            }
          </div>
          <div class="col-md-6">
            <label class="form-label" for="tv-amount">المبلغ (ر.س) <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="tv-amount" type="number" min="1" class="form-control ltr text-start" formControlName="amount" [class.is-invalid]="bad('amount')" />
            <div class="invalid-feedback">أدخل مبلغ المخالفة.</div>
          </div>
        </div>
        <app-fleet-fields [group]="group()" [submitted]="submitted()" driverLabel="المخالف (السائق)" />
        <div class="form-text mt-2"><i class="bi bi-lock me-1" aria-hidden="true"></i>المخالفات سرّية: لا يراها إلا فريق الورشة المركزية ومقدّم الطلب.</div>
      </div>
    </section>
  `,
})
export class TrafficViolationSectionComponent extends ServiceSectionBase {
  protected build(): Record<string, AbstractControl> {
    return {
      violationNo: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6,12}$/)] }),
      violationDate: new FormControl<string | null>(null, { validators: [Validators.required] }),
      amount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1)] }),
    };
  }
}
