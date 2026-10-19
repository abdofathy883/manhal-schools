import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DateFieldComponent } from '../../../shared/ui/date-field.component';
import { FleetFieldsComponent } from './fleet-fields.component';
import { ServiceSectionBase } from './section-base';

const AT_FAULT_OPTIONS = ['السائق', 'الطرف الآخر', 'مشترك'] as const;

/** Traffic accident: date, place, at-fault party, fault % and the mandatory Najm report (an attachment). */
@Component({
  selector: 'app-traffic-accident-section',
  imports: [ReactiveFormsModule, FleetFieldsComponent, DateFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">بيانات الحادث</div>
      <div class="card-body">
        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <label class="form-label" for="ta-date">تاريخ الحادث <span class="text-danger" aria-hidden="true">*</span></label>
            <app-date-field inputId="ta-date" formControlName="accidentDate" [invalid]="bad('accidentDate')" />
            @if (bad('accidentDate')) {
              <div class="text-danger small mt-1" role="alert">حدد تاريخ الحادث.</div>
            }
          </div>
          <div class="col-md-6">
            <label class="form-label" for="ta-loc">الموقع <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="ta-loc" class="form-control" formControlName="location" [class.is-invalid]="bad('location')" />
            <div class="invalid-feedback">حدد موقع الحادث.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="ta-fault">المتسبب بالحادث <span class="text-danger" aria-hidden="true">*</span></label>
            <select id="ta-fault" class="form-select" formControlName="atFaultName" [class.is-invalid]="bad('atFaultName')">
              <option value="">اختر</option>
              @for (o of atFault; track o) {
                <option [value]="o">{{ o }}</option>
              }
            </select>
            <div class="invalid-feedback">حدد المتسبب.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="ta-pct">نسبة الخطأ % <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="ta-pct" type="number" min="0" max="100" class="form-control ltr text-start" formControlName="faultPercent" [class.is-invalid]="bad('faultPercent')" />
            <div class="invalid-feedback">أدخل نسبة بين 0 و100.</div>
          </div>
        </div>
        <app-fleet-fields [group]="group()" [submitted]="submitted()" />
        <div class="mt-3 small" [class.text-success]="hasReport()" [class.text-danger]="!hasReport() && submitted()" [class.text-muted-ar]="!hasReport() && !submitted()" role="status">
          <i class="bi me-1" [class]="hasReport() ? 'bi-check-circle-fill' : 'bi-paperclip'" aria-hidden="true"></i>
          @if (hasReport()) {
            تقرير نجم مرفق.
          } @else {
            تقرير نجم مطلوب: أرفقه من قسم «المرفقات» أدناه قبل التقديم.
          }
        </div>
        <div class="form-text mt-1"><i class="bi bi-lock me-1" aria-hidden="true"></i>الحوادث سرّية: لا يراها إلا فريق الورشة المركزية ومقدّم الطلب.</div>
      </div>
    </section>
  `,
})
export class TrafficAccidentSectionComponent extends ServiceSectionBase {
  /** Whether the request has an attachment (the Najm report). */
  readonly hasReport = input(false);
  protected readonly atFault = AT_FAULT_OPTIONS;

  protected build(): Record<string, AbstractControl> {
    return {
      accidentDate: new FormControl<string | null>(null, { validators: [Validators.required] }),
      location: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      atFaultName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      faultPercent: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0), Validators.max(100)] }),
      najmReportAttached: new FormControl(true, { nonNullable: true }),
    };
  }
}
