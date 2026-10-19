import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReferenceRepository } from '../../../domain/repositories';
import { FleetFieldsComponent } from './fleet-fields.component';
import { ServiceSectionBase } from './section-base';

/** Vehicle maintenance: plate lookup from the fleet, driver and maintenance type. The fault description is the request details. */
@Component({
  selector: 'app-vehicle-maintenance-section',
  imports: [ReactiveFormsModule, FleetFieldsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">بيانات المركبة</div>
      <div class="card-body">
        <app-fleet-fields [group]="group()" [submitted]="submitted()" />
        <div class="row g-3 mt-0">
          <div class="col-md-6">
            <label class="form-label" for="vm-type">نوع الصيانة <span class="text-danger" aria-hidden="true">*</span></label>
            <select id="vm-type" class="form-select" formControlName="maintenanceTypeId" [class.is-invalid]="bad('maintenanceTypeId')">
              <option value="">اختر نوع الصيانة</option>
              @for (t of types(); track t.id) {
                <option [value]="t.id">{{ t.nameAr }}</option>
              }
            </select>
            <div class="invalid-feedback">اختر نوع الصيانة.</div>
          </div>
        </div>
        <div class="form-text mt-2">اكتب وصف العطل في خانة «التفاصيل» أعلاه، وأرفق صور العطل إن وجدت.</div>
      </div>
    </section>
  `,
})
export class VehicleMaintenanceSectionComponent extends ServiceSectionBase {
  private readonly reference = inject(ReferenceRepository);
  private readonly lists = rxResource({ stream: () => this.reference.lists() });
  protected readonly types = () => this.lists.value()?.vehicleMaintenanceTypes ?? [];

  protected build(): Record<string, AbstractControl> {
    return { maintenanceTypeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }) };
  }
}
