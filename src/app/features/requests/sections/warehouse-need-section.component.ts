import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { WarehouseItem } from '../../../domain/models/reference';
import { ReferenceRepository } from '../../../domain/repositories';
import { ServiceSectionBase } from './section-base';

type NeedRow = FormGroup<{ itemId: FormControl<string>; qty: FormControl<number> }>;

const newRow = (): NeedRow =>
  new FormGroup({
    itemId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    qty: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
  });

/** Warehouse need: item picker that shows the live stock, and warns when stock will not cover the quantity. */
@Component({
  selector: 'app-warehouse-need-section',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">الأصناف والكميات</div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-2">
            <caption class="visually-hidden">أصناف الاحتياج</caption>
            <thead>
              <tr>
                <th scope="col" style="inline-size: 3rem">م</th>
                <th scope="col" style="min-inline-size: 16rem">الصنف</th>
                <th scope="col" style="inline-size: 7rem">الكمية</th>
                <th scope="col">الرصيد الحالي</th>
                <th scope="col" style="inline-size: 3rem"><span class="visually-hidden">حذف</span></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows.controls; track row; let i = $index) {
                <tr [formGroup]="row">
                  <td>{{ i + 1 }}</td>
                  <td>
                    <select class="form-select form-select-sm" formControlName="itemId" [attr.aria-label]="'الصنف ' + (i + 1)" [class.is-invalid]="badRow(row.controls.itemId)">
                      <option value="">اختر الصنف</option>
                      @for (it of items(); track it.id) {
                        <option [value]="it.id">{{ it.nameAr }} ({{ it.code }})</option>
                      }
                    </select>
                  </td>
                  <td><input type="number" min="1" class="form-control form-control-sm ltr text-start" formControlName="qty" [attr.aria-label]="'الكمية ' + (i + 1)" [class.is-invalid]="badRow(row.controls.qty)" /></td>
                  <td>
                    @if (stockOf(row.controls.itemId.value); as it) {
                      @if (row.controls.qty.value > it.stock) {
                        <span class="badge bg-warning-subtle text-warning-emphasis">المتاح <span class="ltr-inline">{{ it.stock }}</span> {{ it.unitAr }} فقط — سيُنشأ طلب شراء للعجز</span>
                      } @else if (it.stock <= it.reorderLevel) {
                        <span class="badge bg-info-subtle text-info-emphasis">متوفر (<span class="ltr-inline">{{ it.stock }}</span> {{ it.unitAr }}) — قرب حد الطلب</span>
                      } @else {
                        <span class="badge bg-success-subtle text-success-emphasis">متوفر (<span class="ltr-inline">{{ it.stock }}</span> {{ it.unitAr }})</span>
                      }
                    } @else {
                      <span class="text-muted-ar">—</span>
                    }
                  </td>
                  <td>
                    <button type="button" class="btn btn-sm btn-link text-danger p-0" (click)="remove(i)" [disabled]="rows.length === 1" [attr.aria-label]="'حذف الصنف ' + (i + 1)">
                      <i class="bi bi-trash" aria-hidden="true"></i>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <button type="button" class="btn btn-outline-primary btn-sm" (click)="add()"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>إضافة صنف</button>
      </div>
    </section>
  `,
})
export class WarehouseNeedSectionComponent extends ServiceSectionBase {
  private readonly reference = inject(ReferenceRepository);

  protected readonly rows = new FormArray<NeedRow>([newRow()]);
  private readonly catalog = rxResource({ stream: () => this.reference.items() });
  protected readonly items = () => this.catalog.value() ?? [];

  protected build(): Record<string, AbstractControl> {
    return { items: this.rows };
  }

  protected stockOf(itemId: string): WarehouseItem | undefined {
    return this.items().find((i) => i.id === itemId);
  }

  protected badRow(control: FormControl<string | number>): boolean {
    return control.invalid && (control.touched || this.submitted());
  }

  protected add(): void {
    this.rows.push(newRow());
  }

  protected remove(index: number): void {
    this.rows.removeAt(index);
  }
}
