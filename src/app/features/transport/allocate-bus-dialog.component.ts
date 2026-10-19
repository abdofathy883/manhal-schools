import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal';
import { forkJoin } from 'rxjs';
import { BookingService, occupancyOf } from '../../core/bookings/booking.service';
import { BusAllocation, BusOccupancy, BusSlot, occupies } from '../../domain/bookings/booking-rules';
import { Driver, Vehicle } from '../../domain/models/reference';
import { ServiceRequest } from '../../domain/models/request';
import { ReferenceRepository } from '../../domain/repositories';
import { BRANCHES } from '../../domain/reference-data';
import { formatDate } from '../../shared/pipes/format';

type SlotGroup = FormGroup<{ source: FormControl<'fleet' | 'contracted'>; vehicleId: FormControl<string>; driverId: FormControl<string> }>;

/** Transport officer: one row per bus of the booking — a fleet bus with its driver, or a contracted bus. */
@Component({
  selector: 'app-allocate-bus-dialog',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (request(); as r) {
      <form (submit)="$event.preventDefault(); submit()" novalidate>
        <div class="modal-header">
          <h2 class="modal-title h5"><i class="bi bi-bus-front me-2" aria-hidden="true"></i>تخصيص باص وسائق</h2>
          <button type="button" class="btn-close" aria-label="إغلاق" (click)="modal.dismiss()"></button>
        </div>
        <div class="modal-body">
          <p class="mb-3">
            <span class="ltr-inline fw-semibold">{{ r.refNo }}</span> — {{ r.titleAr }}<br />
            <span class="text-muted-ar small">
              {{ date() }} · من <span class="ltr-inline">{{ r.details['departTime'] }}</span> إلى <span class="ltr-inline">{{ r.details['returnTime'] }}</span>
              · <span class="ltr-inline">{{ buses() }}</span> باصات لعدد <span class="ltr-inline">{{ r.details['passengers'] }}</span> راكبًا
            </span>
          </p>

          @for (slot of slots.controls; track slot; let i = $index) {
            <fieldset class="border rounded-3 p-3 mb-3" [formGroup]="slot">
              <legend class="float-none w-auto fs-6 px-2 mb-0">الباص {{ i + 1 }}</legend>
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label" [for]="'al-src-' + i">المصدر</label>
                  <select [id]="'al-src-' + i" class="form-select" formControlName="source">
                    <option value="fleet">باص من أسطول المدارس</option>
                    <option value="contracted">باص متعاقد (خارجي)</option>
                  </select>
                </div>
                @if (slot.controls.source.value === 'fleet') {
                  <div class="col-md-4">
                    <label class="form-label" [for]="'al-bus-' + i">الباص <span class="text-danger" aria-hidden="true">*</span></label>
                    <select [id]="'al-bus-' + i" class="form-select" formControlName="vehicleId" [class.is-invalid]="showErrors() && !slot.controls.vehicleId.value">
                      <option value="">اختر الباص</option>
                      @for (v of vehicles(); track v.id) {
                        <option [value]="v.id" [disabled]="unavailable(v) || busyVehicles().has(v.id) || takenElsewhere(i, 'vehicleId', v.id)">
                          {{ v.plate }} — {{ v.typeAr }}{{ note(v) }}
                        </option>
                      }
                    </select>
                    <div class="invalid-feedback">اختر الباص.</div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label" [for]="'al-drv-' + i">السائق <span class="text-danger" aria-hidden="true">*</span></label>
                    <select [id]="'al-drv-' + i" class="form-select" formControlName="driverId" [class.is-invalid]="showErrors() && !slot.controls.driverId.value">
                      <option value="">اختر السائق</option>
                      @for (d of drivers(); track d.id) {
                        <option [value]="d.id" [disabled]="busyDrivers().has(d.id) || takenElsewhere(i, 'driverId', d.id)">{{ d.nameAr }}{{ busyDrivers().has(d.id) ? ' (مشغول في الفترة)' : '' }}</option>
                      }
                    </select>
                    <div class="invalid-feedback">اختر السائق.</div>
                  </div>
                } @else {
                  <div class="col-md-8 d-flex align-items-end"><span class="text-muted-ar small">يُنسّق سائق الجهة المتعاقدة خارج النظام.</span></div>
                }
              </div>
            </fieldset>
          }
        </div>
        <div class="modal-footer">
          <button type="submit" class="btn btn-primary" [disabled]="saving()">حفظ التخصيص</button>
          <button type="button" class="btn btn-outline-secondary" (click)="modal.dismiss()">إلغاء</button>
        </div>
      </form>
    }
  `,
})
export class AllocateBusDialogComponent {
  protected readonly modal = inject(NgbActiveModal);
  private readonly reference = inject(ReferenceRepository);
  private readonly bookings = inject(BookingService);

  protected readonly request = signal<ServiceRequest | null>(null);
  protected readonly saving = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly slots = new FormArray<SlotGroup>([]);
  private readonly fleet = signal<{ vehicles: Vehicle[]; drivers: Driver[]; others: BusOccupancy[] }>({ vehicles: [], drivers: [], others: [] });

  protected readonly buses = computed(() => Number(this.request()?.details['buses'] ?? 1));
  protected readonly date = computed(() => formatDate(String(this.request()?.details['tripDate'] ?? '')));
  protected readonly vehicles = computed(() => this.fleet().vehicles);
  protected readonly drivers = computed(() => this.fleet().drivers);

  /** Bookings that overlap this one in time and already hold buses or drivers. */
  private readonly overlapping = computed(() => {
    const me = this.request() ? occupancyOf(this.request()!) : null;
    return me
      ? this.fleet().others.filter((o) => o.id !== me.id && occupies(o) && o.date === me.date && o.departMin < me.returnMin && o.returnMin > me.departMin)
      : [];
  });
  protected readonly busyVehicles = computed(() => new Set(this.overlapping().flatMap((o) => o.vehicleIds)));
  protected readonly busyDrivers = computed(() => new Set(this.overlapping().flatMap((o) => o.driverIds)));

  /** Called by the opener right after `NgbModal.open`. */
  init(request: ServiceRequest): void {
    this.request.set(request);
    forkJoin([this.reference.vehicles(), this.reference.drivers(), this.bookings.occupancy()]).subscribe(([vehicles, drivers, others]) => {
      const branchId = request.branchId;
      const buses = vehicles
        .filter((v) => (v.seats ?? 0) >= 12)
        .sort((a, b) => Number(b.branchId === branchId) - Number(a.branchId === branchId) || a.plate.localeCompare(b.plate));
      this.fleet.set({ vehicles: buses, drivers: drivers.filter((d) => d.active), others });
    });

    const existing = (request.details['allocation'] as BusAllocation | undefined)?.slots ?? [];
    for (let i = 0; i < this.buses(); i++) {
      const slot = existing[i];
      this.slots.push(
        new FormGroup({
          source: new FormControl<'fleet' | 'contracted'>(slot && !slot.vehicleId ? 'contracted' : 'fleet', { nonNullable: true }),
          vehicleId: new FormControl(slot?.vehicleId ?? '', { nonNullable: true }),
          driverId: new FormControl(slot?.driverId ?? '', { nonNullable: true }),
        }),
      );
    }
  }

  protected unavailable(v: Vehicle): boolean {
    return v.status !== 'active';
  }

  protected note(v: Vehicle): string {
    if (v.status === 'in_workshop') return ' (في الورشة)';
    if (this.busyVehicles().has(v.id)) return ' (مشغول في الفترة)';
    return v.branchId ? ` — ${BRANCHES.find((b) => b.id === v.branchId)?.nameAr ?? ''}` : '';
  }

  /** The same bus or driver cannot serve two rows of this booking. */
  protected takenElsewhere(index: number, field: 'vehicleId' | 'driverId', id: string): boolean {
    return this.slots.controls.some((s, i) => i !== index && s.controls.source.value === 'fleet' && s.controls[field].value === id);
  }

  protected submit(): void {
    this.showErrors.set(true);
    const slots: BusSlot[] = this.slots.controls.map((s) =>
      s.controls.source.value === 'contracted'
        ? { vehicleId: null, driverId: null }
        : { vehicleId: s.controls.vehicleId.value || null, driverId: s.controls.driverId.value || null },
    );
    const incomplete = this.slots.controls.some((s) => s.controls.source.value === 'fleet' && (!s.controls.vehicleId.value || !s.controls.driverId.value));
    if (incomplete) return;
    this.modal.close(slots);
  }
}
