import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ReferenceRepository } from '../../../domain/repositories';
import { ServiceSectionBase } from './section-base';

/**
 * Vehicle and driver lookup shared by the fleet services. It adds `vehicleId` / `driverId` (required) to the
 * details group, plus the derived `plate`, `vehicleType` and `driverName` that the request page and files show.
 */
@Component({
  selector: 'app-fleet-fields',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row g-3" [formGroup]="group()">
      @if (showVehicle()) {
        <div class="col-md-6">
          <label class="form-label" for="fl-vehicle">رقم السيارة <span class="text-danger" aria-hidden="true">*</span></label>
          <select id="fl-vehicle" class="form-select" formControlName="vehicleId" [class.is-invalid]="bad('vehicleId')">
            <option value="">اختر المركبة من الأسطول</option>
            @for (v of vehicles(); track v.id) {
              <option [value]="v.id">{{ v.plate }} — {{ v.typeAr }}</option>
            }
          </select>
          <div class="invalid-feedback">اختر المركبة.</div>
        </div>
        <div class="col-md-6">
          <label class="form-label" for="fl-type">نوع السيارة</label>
          <input id="fl-type" class="form-control" [value]="group().get('vehicleType')?.value ?? ''" readonly placeholder="يُملأ تلقائيًا عند اختيار المركبة" />
        </div>
      }
      @if (showDriver()) {
        <div class="col-md-6">
          <label class="form-label" for="fl-driver">{{ driverLabel() }} <span class="text-danger" aria-hidden="true">*</span></label>
          <select id="fl-driver" class="form-select" formControlName="driverId" [class.is-invalid]="bad('driverId')">
            <option value="">اختر السائق</option>
            @for (d of drivers(); track d.id) {
              <option [value]="d.id">{{ d.nameAr }}</option>
            }
          </select>
          <div class="invalid-feedback">اختر السائق.</div>
        </div>
      }
    </div>
  `,
})
export class FleetFieldsComponent extends ServiceSectionBase {
  private readonly reference = inject(ReferenceRepository);

  readonly showVehicle = input(true);
  readonly showDriver = input(true);
  readonly driverLabel = input('اسم السائق');

  private readonly lookups = rxResource({ stream: () => forkJoin({ vehicles: this.reference.vehicles(), drivers: this.reference.drivers() }) });
  protected readonly vehicles = computed(() => (this.lookups.value()?.vehicles ?? []).filter((v) => v.status !== 'retired'));
  protected readonly drivers = computed(() => (this.lookups.value()?.drivers ?? []).filter((d) => d.active));

  protected build(): Record<string, AbstractControl> {
    const controls: Record<string, AbstractControl> = {};
    if (this.showVehicle()) {
      const vehicleId = new FormControl('', { nonNullable: true, validators: [Validators.required] });
      const plate = new FormControl('', { nonNullable: true });
      const vehicleType = new FormControl('', { nonNullable: true });
      vehicleId.valueChanges.subscribe((id) => {
        const v = this.vehicles().find((x) => x.id === id);
        plate.setValue(v?.plate ?? '');
        vehicleType.setValue(v?.typeAr ?? '');
      });
      Object.assign(controls, { vehicleId, plate, vehicleType });
    }
    if (this.showDriver()) {
      const driverId = new FormControl('', { nonNullable: true, validators: [Validators.required] });
      const driverName = new FormControl('', { nonNullable: true });
      driverId.valueChanges.subscribe((id) => driverName.setValue(this.drivers().find((x) => x.id === id)?.nameAr ?? ''));
      Object.assign(controls, { driverId, driverName });
    }
    return controls;
  }
}
