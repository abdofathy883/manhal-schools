import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../core/notifications/toast.service';
import { RequestService } from '../../core/requests/request.service';
import { WarehouseService } from '../../core/warehouse/warehouse.service';

/** Stock-in: manual receipt of items into the warehouse (the movement is logged and audited). */
@Component({
  selector: 'app-stock-in-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="card" [formGroup]="form" (submit)="$event.preventDefault(); save()" novalidate style="max-inline-size: 42rem">
      <div class="card-header">إدخال مخزون</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-12">
            <label class="form-label" for="si-item">الصنف <span class="text-danger" aria-hidden="true">*</span></label>
            <select id="si-item" class="form-select" formControlName="itemId" [class.is-invalid]="bad('itemId')">
              <option value="">اختر الصنف</option>
              @for (it of items.value() ?? []; track it.id) {
                <option [value]="it.id">{{ it.nameAr }} ({{ it.code }}) — الرصيد {{ it.stock }}</option>
              }
            </select>
            <div class="invalid-feedback">اختر الصنف.</div>
          </div>
          <div class="col-md-4">
            <label class="form-label" for="si-qty">الكمية <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="si-qty" type="number" min="1" class="form-control ltr text-start" formControlName="qty" [class.is-invalid]="bad('qty')" />
            <div class="invalid-feedback">أدخل كمية صحيحة.</div>
          </div>
          <div class="col-md-8">
            <label class="form-label" for="si-note">المرجع / ملاحظة</label>
            <input id="si-note" class="form-control" formControlName="noteAr" placeholder="مثال: فاتورة المورد رقم 1234" />
          </div>
        </div>
      </div>
      <div class="card-footer"><button type="submit" class="btn btn-primary" [disabled]="busy()"><i class="bi bi-box-arrow-in-down me-1" aria-hidden="true"></i>إدخال إلى المخزون</button></div>
    </form>
  `,
})
export class StockInFormComponent {
  private readonly warehouse = inject(WarehouseService);
  private readonly requests = inject(RequestService);
  private readonly toasts = inject(ToastService);

  protected readonly items = rxResource({ stream: () => this.warehouse.items() });
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    itemId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    qty: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1)] }),
    noteAr: new FormControl('', { nonNullable: true }),
  });

  protected bad(name: 'itemId' | 'qty'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  protected save(): void {
    this.submitted.set(true);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.warehouse.stockIn(v.itemId, Number(v.qty), v.noteAr).subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.success('تم إدخال المخزون');
        this.form.reset({ itemId: '', qty: null, noteAr: '' });
        this.submitted.set(false);
        this.items.reload();
      },
      error: (err) => {
        this.busy.set(false);
        this.requests.reportError(err, 'تعذر إدخال المخزون');
      },
    });
  }
}
