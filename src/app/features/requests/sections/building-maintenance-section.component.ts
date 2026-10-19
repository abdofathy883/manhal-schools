import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ServiceSectionBase } from './section-base';

export const FLOORS: readonly string[] = ['الأرضي', 'الأول', 'الثاني', 'الثالث', 'السطح', 'القبو'];
export const ENTRY_TIMES: readonly string[] = ['طوال الدوام', 'أثناء الحصص بالتنسيق', 'بعد الدوام', 'خارج أيام الدراسة'];

/** Building maintenance: location, floor, room, allowed entry time, injury flag (photos are the common uploader). */
@Component({
  selector: 'app-building-maintenance-section',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">موقع العطل</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label" for="bm-building">المبنى / الموقع <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="bm-building" class="form-control" formControlName="building" placeholder="مثال: المبنى الرئيسي" [class.is-invalid]="bad('building')" />
            <div class="invalid-feedback">حدد المبنى أو الموقع.</div>
          </div>
          <div class="col-md-3">
            <label class="form-label" for="bm-floor">الدور <span class="text-danger" aria-hidden="true">*</span></label>
            <select id="bm-floor" class="form-select" formControlName="floor" [class.is-invalid]="bad('floor')">
              <option value="">اختر</option>
              @for (f of floors; track f) {
                <option [value]="f">{{ f }}</option>
              }
            </select>
            <div class="invalid-feedback">اختر الدور.</div>
          </div>
          <div class="col-md-3">
            <label class="form-label" for="bm-room">الغرفة <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="bm-room" class="form-control" formControlName="room" placeholder="مثال: فصل 3/ب" [class.is-invalid]="bad('room')" />
            <div class="invalid-feedback">حدد الغرفة.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="bm-entry">وقت السماح بالدخول <span class="text-danger" aria-hidden="true">*</span></label>
            <select id="bm-entry" class="form-select" formControlName="entryAllowedTime" [class.is-invalid]="bad('entryAllowedTime')">
              <option value="">اختر</option>
              @for (t of entryTimes; track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
            <div class="invalid-feedback">اختر وقت السماح بالدخول للفني.</div>
          </div>
          <div class="col-md-6">
            <span class="form-label d-block">هل توجد إصابة أو حادث؟</span>
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="radio" id="bm-inj-no" [value]="false" formControlName="injury" />
              <label class="form-check-label" for="bm-inj-no">لا</label>
            </div>
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="radio" id="bm-inj-yes" [value]="true" formControlName="injury" />
              <label class="form-check-label" for="bm-inj-yes">نعم</label>
            </div>
          </div>
        </div>
        @if (group().get('injury')?.value === true) {
          <div class="alert alert-danger mt-3 mb-0" role="alert">
            <i class="bi bi-exclamation-octagon-fill me-1" aria-hidden="true"></i>
            في حال وجود إصابة يرجى إبلاغ الإدارة والإسعاف فورًا، وتحديد الأولوية «طارئة» لتُوجَّه الصيانة دون انتظار الاعتماد.
          </div>
        }
      </div>
    </section>
  `,
})
export class BuildingMaintenanceSectionComponent extends ServiceSectionBase {
  protected readonly floors = FLOORS;
  protected readonly entryTimes = ENTRY_TIMES;

  protected build(): Record<string, AbstractControl> {
    const required = [Validators.required];
    return {
      building: new FormControl('', { nonNullable: true, validators: required }),
      floor: new FormControl('', { nonNullable: true, validators: required }),
      room: new FormControl('', { nonNullable: true, validators: required }),
      entryAllowedTime: new FormControl('', { nonNullable: true, validators: required }),
      injury: new FormControl(false, { nonNullable: true }),
    };
  }
}
