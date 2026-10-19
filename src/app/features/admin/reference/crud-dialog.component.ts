import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'bool';
  required?: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
  /** Western-digit / English-token fields (plates, phones, numbers) are shown left-to-right. */
  ltr?: boolean;
  pattern?: RegExp;
  patternMessage?: string;
  min?: number;
  /** Value for a new row. */
  default?: string | number | boolean;
  /** Hide the column in the table (still editable). */
  hideInTable?: boolean;
}

export type Row = Record<string, unknown> & { id: string };

/** Generic add / edit form built from field definitions. */
@Component({
  selector: 'app-crud-dialog',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (submit)="$event.preventDefault(); submit()" novalidate>
      <div class="modal-header">
        <h2 class="modal-title h5">{{ title() }}</h2>
        <button type="button" class="btn-close" aria-label="إغلاق" (click)="modal.dismiss()"></button>
      </div>
      <div class="modal-body">
        <div class="row g-3">
          @for (f of fields(); track f.key) {
            <div class="col-md-6">
              @if (f.type === 'bool') {
                <div class="form-check form-switch mt-4">
                  <input class="form-check-input" type="checkbox" role="switch" [id]="'cd-' + f.key" [formControlName]="f.key" />
                  <label class="form-check-label" [for]="'cd-' + f.key">{{ f.label }}</label>
                </div>
              } @else {
                <label class="form-label" [for]="'cd-' + f.key">{{ f.label }} @if (f.required) { <span class="text-danger" aria-hidden="true">*</span> }</label>
                @if (f.type === 'select') {
                  <select class="form-select" [id]="'cd-' + f.key" [formControlName]="f.key" [class.is-invalid]="bad(f.key)">
                    @if (!f.required) { <option value="">—</option> }
                    @for (o of f.options; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
                  </select>
                } @else {
                  <input
                    class="form-control"
                    [class.ltr]="f.ltr || f.type === 'number' || f.type === 'date'"
                    [class.text-start]="f.ltr || f.type === 'number' || f.type === 'date'"
                    [id]="'cd-' + f.key"
                    [type]="f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'"
                    [formControlName]="f.key"
                    [class.is-invalid]="bad(f.key)"
                  />
                }
                <div class="invalid-feedback">{{ f.patternMessage ?? 'هذا الحقل مطلوب أو غير صحيح.' }}</div>
              }
            </div>
          }
        </div>
      </div>
      <div class="modal-footer">
        <button type="submit" class="btn btn-primary">حفظ</button>
        <button type="button" class="btn btn-outline-secondary" (click)="modal.dismiss()">إلغاء</button>
      </div>
    </form>
  `,
})
export class CrudDialogComponent {
  protected readonly modal = inject(NgbActiveModal);

  protected readonly title = signal('');
  protected readonly fields = signal<readonly FieldDef[]>([]);
  protected readonly submitted = signal(false);
  protected form = new FormGroup<Record<string, AbstractControl>>({});
  private source: Row | null = null;

  /** Called by the opener right after `NgbModal.open`; `row` is `null` for a new record. */
  init(title: string, fields: readonly FieldDef[], row: Row | null): void {
    this.title.set(title);
    this.fields.set(fields);
    this.source = row;
    const controls: Record<string, AbstractControl> = {};
    for (const f of fields) {
      const validators = [
        ...(f.required && f.type !== 'bool' ? [Validators.required] : []),
        ...(f.pattern ? [Validators.pattern(f.pattern)] : []),
        ...(f.min !== undefined ? [Validators.min(f.min)] : []),
      ];
      const raw = row ? row[f.key] : f.default;
      const value = f.type === 'bool' ? Boolean(raw ?? false) : (raw ?? (f.type === 'number' ? null : ''));
      controls[f.key] = new FormControl(value, { validators });
    }
    this.form = new FormGroup(controls);
  }

  protected bad(key: string): boolean {
    const c = this.form.get(key);
    return !!c && c.invalid && (c.touched || this.submitted());
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const out: Record<string, unknown> = { id: this.source?.id ?? '' };
    for (const f of this.fields()) {
      const v = this.form.get(f.key)!.value;
      if (f.type === 'number') out[f.key] = v === null || v === '' ? undefined : Number(v);
      else if (f.type === 'select' || f.type === 'text' || f.type === 'date') out[f.key] = typeof v === 'string' ? v.trim() : v;
      else out[f.key] = v;
      if (out[f.key] === '' && !f.required && f.type !== 'text') out[f.key] = null;
    }
    this.modal.close(out);
  }
}
