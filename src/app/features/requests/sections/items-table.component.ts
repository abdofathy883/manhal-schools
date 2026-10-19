import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MoneyPipe } from '../../../shared/pipes/format';

export type ItemRowGroup = FormGroup<{
  description: FormControl<string>;
  unit: FormControl<string>;
  qty: FormControl<number>;
  price: FormControl<number>;
  notes: FormControl<string>;
}>;

export const newItemRow = (): ItemRowGroup =>
  new FormGroup({
    description: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    unit: new FormControl('قطعة', { nonNullable: true, validators: [Validators.required] }),
    qty: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    price: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    notes: new FormControl('', { nonNullable: true }),
  });

export function itemsTotal(rows: ReadonlyArray<{ qty?: number | null; price?: number | null }>): number {
  return rows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);
}

/** Editable items table (م، الوصف والمواصفات، الوحدة، الكمية، السعر التقديري، ملاحظات) with a running total. */
@Component({
  selector: 'app-items-table',
  imports: [ReactiveFormsModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-2">
        <caption class="visually-hidden">جدول الأصناف</caption>
        <thead>
          <tr>
            <th scope="col" style="inline-size: 3rem">م</th>
            <th scope="col" style="min-inline-size: 14rem">الوصف والمواصفات</th>
            <th scope="col" style="inline-size: 7rem">الوحدة</th>
            <th scope="col" style="inline-size: 6rem">الكمية</th>
            <th scope="col" style="inline-size: 8rem">السعر التقديري</th>
            <th scope="col" style="min-inline-size: 9rem">ملاحظات</th>
            <th scope="col" style="inline-size: 3rem"><span class="visually-hidden">حذف</span></th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows().controls; track row; let i = $index) {
            <tr [formGroup]="row">
              <td>{{ i + 1 }}</td>
              <td><input class="form-control form-control-sm" formControlName="description" [attr.aria-label]="'وصف الصنف ' + (i + 1)" [class.is-invalid]="bad(row.controls.description)" /></td>
              <td><input class="form-control form-control-sm" formControlName="unit" [attr.aria-label]="'الوحدة ' + (i + 1)" [class.is-invalid]="bad(row.controls.unit)" /></td>
              <td><input type="number" min="1" class="form-control form-control-sm ltr text-start" formControlName="qty" [attr.aria-label]="'الكمية ' + (i + 1)" [class.is-invalid]="bad(row.controls.qty)" /></td>
              <td><input type="number" min="0" class="form-control form-control-sm ltr text-start" formControlName="price" [attr.aria-label]="'السعر ' + (i + 1)" [class.is-invalid]="bad(row.controls.price)" /></td>
              <td><input class="form-control form-control-sm" formControlName="notes" [attr.aria-label]="'ملاحظات ' + (i + 1)" /></td>
              <td>
                <button type="button" class="btn btn-sm btn-link text-danger p-0" (click)="remove(i)" [disabled]="!optional() && rows().length === 1" [attr.aria-label]="'حذف الصنف ' + (i + 1)">
                  <i class="bi bi-trash" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="text-center text-muted-ar">لا توجد أصناف. أضف صنفًا بالزر أدناه.</td></tr>
          }
        </tbody>
        <tfoot>
          <tr class="fw-bold">
            <td colspan="4" class="text-end">الإجمالي التقديري</td>
            <td colspan="3">{{ total() | money }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <button type="button" class="btn btn-outline-primary btn-sm" (click)="add()"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>إضافة صنف</button>
    @if (submitted() && !optional() && rows().length === 0) {
      <div class="text-danger small mt-2" role="alert">أضف صنفًا واحدًا على الأقل.</div>
    }
  `,
})
export class ItemsTableComponent {
  readonly rows = input.required<FormArray<ItemRowGroup>>();
  readonly submitted = input(false);
  /** Optional tables (works execution) may be empty. */
  readonly optional = input(false);

  /** Re-evaluated on every change detection triggered by an edit inside the table. */
  protected total(): number {
    return itemsTotal(this.rows().getRawValue());
  }

  protected bad(control: FormControl<string | number>): boolean {
    return control.invalid && (control.touched || this.submitted());
  }

  protected add(): void {
    this.rows().push(newItemRow());
  }

  protected remove(index: number): void {
    this.rows().removeAt(index);
  }
}
