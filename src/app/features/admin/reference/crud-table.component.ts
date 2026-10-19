import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal';
import { Observable, firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/notifications/toast.service';
import { formatDate } from '../../../shared/pipes/format';
import { CrudDialogComponent, FieldDef, Row } from './crud-dialog.component';

export interface CrudChange {
  next: Row[];
  summaryAr: string;
}

/** Editable reference table: add, edit and delete rows. Deleting is refused while a request still uses the record. */
@Component({
  selector: 'app-crud-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span>{{ plural() }} <span class="badge bg-body-secondary text-body">{{ rows().length }}</span></span>
        <button type="button" class="btn btn-sm btn-primary" (click)="edit(null)"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>إضافة {{ singular() }}</button>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
          <caption class="visually-hidden">{{ plural() }}</caption>
          <thead>
            <tr>
              @for (f of columns(); track f.key) { <th scope="col">{{ f.label }}</th> }
              <th scope="col"><span class="visually-hidden">إجراءات</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr>
                @for (f of columns(); track f.key) {
                  <td>
                    @if (f.ltr || f.type === 'number') { <span class="ltr-inline">{{ show(row, f) }}</span> } @else { {{ show(row, f) }} }
                  </td>
                }
                <td class="text-end text-nowrap">
                  <button type="button" class="btn btn-sm btn-outline-primary me-1" (click)="edit(row)" [attr.aria-label]="'تعديل ' + singular()"><i class="bi bi-pencil" aria-hidden="true"></i></button>
                  <button type="button" class="btn btn-sm btn-outline-danger" [disabled]="busy()" (click)="remove(row)" [attr.aria-label]="'حذف ' + singular()"><i class="bi bi-trash" aria-hidden="true"></i></button>
                </td>
              </tr>
            } @empty {
              <tr><td [attr.colspan]="columns().length + 1" class="text-center text-muted-ar py-4">لا توجد سجلات.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class CrudTableComponent {
  private readonly modals = inject(NgbModal);
  private readonly toasts = inject(ToastService);

  readonly rows = input.required<readonly Row[]>();
  readonly fields = input.required<readonly FieldDef[]>();
  readonly singular = input.required<string>();
  readonly plural = input.required<string>();
  readonly idPrefix = input.required<string>();
  /** How many requests use a record; deleting is refused when above zero. */
  readonly usage = input<(id: string) => Observable<number>>();
  /** Persists the new list; resolves when saved. The parent shows errors. */
  readonly save = input.required<(change: CrudChange) => Observable<void>>();

  protected readonly busy = signal(false);
  protected readonly columns = () => this.fields().filter((f) => !f.hideInTable);
  readonly changed = output<void>();

  protected show(row: Row, f: FieldDef): string {
    const v = row[f.key];
    if (v === undefined || v === null || v === '') return '—';
    if (f.type === 'bool') return v ? 'نعم' : 'لا';
    if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? String(v);
    if (f.type === 'date') return formatDate(String(v));
    return String(v);
  }

  protected async edit(row: Row | null): Promise<void> {
    const ref = this.modals.open(CrudDialogComponent, { centered: true, size: 'lg' });
    (ref.componentInstance as CrudDialogComponent).init(row ? `تعديل ${this.singular()}` : `إضافة ${this.singular()}`, this.fields(), row);
    let result: Row;
    try {
      result = (await ref.result) as Row;
    } catch {
      return;
    }
    const saved: Row = { ...row, ...result, id: row?.id ?? `${this.idPrefix()}-${Date.now().toString(36)}` };
    const next = row ? this.rows().map((r) => (r.id === row.id ? saved : r)) : [...this.rows(), saved];
    await this.persist({ next: [...next], summaryAr: `${row ? 'تعديل' : 'إضافة'} ${this.singular()}: ${this.label(saved)}` }, row ? 'تم حفظ التعديل' : 'تمت الإضافة');
  }

  protected async remove(row: Row): Promise<void> {
    const usage = this.usage();
    this.busy.set(true);
    try {
      const used = usage ? await firstValueFrom(usage(row.id)) : 0;
      if (used > 0) {
        this.toasts.warning('لا يمكن الحذف', `${this.label(row)} مستخدم في ${used} من الطلبات. عدّله بدل الحذف أو أوقفه.`);
        return;
      }
      await this.persist({ next: this.rows().filter((r) => r.id !== row.id), summaryAr: `حذف ${this.singular()}: ${this.label(row)}` }, 'تم الحذف');
    } finally {
      this.busy.set(false);
    }
  }

  private label(row: Row): string {
    const first = this.fields()[0];
    return String(row[first.key] ?? row.id);
  }

  private async persist(change: CrudChange, successAr: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.save()(change));
      this.toasts.success(successAr);
      this.changed.emit();
    } catch (err) {
      const message = (err as { messageAr?: string })?.messageAr ?? 'حدث خطأ غير متوقع.';
      this.toasts.error('تعذر الحفظ', message);
    } finally {
      this.busy.set(false);
    }
  }
}
