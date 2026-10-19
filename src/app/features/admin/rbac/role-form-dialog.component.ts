import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal';
import { Role } from '../../../domain/models/rbac';

export interface RoleFormResult {
  nameAr: string;
  descriptionAr: string;
  cloneFromId?: string;
}

export type RoleFormMode = 'create' | 'clone' | 'rename';

const TITLES: Record<RoleFormMode, string> = { create: 'دور جديد', clone: 'نسخ الدور', rename: 'تعديل بيانات الدور' };

/** Create, clone or rename a role. */
@Component({
  selector: 'app-role-form-dialog',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (submit)="$event.preventDefault(); submit()" novalidate>
      <div class="modal-header">
        <h2 class="modal-title h5">{{ title() }}</h2>
        <button type="button" class="btn-close" aria-label="إغلاق" (click)="modal.dismiss()"></button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label" for="rf-name">اسم الدور <span class="text-danger" aria-hidden="true">*</span></label>
          <input id="rf-name" class="form-control" formControlName="nameAr" [class.is-invalid]="invalid('nameAr')" />
          <div class="invalid-feedback">اسم الدور مطلوب.</div>
        </div>
        <div class="mb-3">
          <label class="form-label" for="rf-desc">الوصف</label>
          <textarea id="rf-desc" class="form-control" rows="2" formControlName="descriptionAr"></textarea>
        </div>
        @if (mode() === 'create') {
          <div>
            <label class="form-label" for="rf-clone">البدء من دور موجود (اختياري)</label>
            <select id="rf-clone" class="form-select" formControlName="cloneFromId">
              <option value="">دور فارغ بلا صلاحيات</option>
              @for (r of roles(); track r.id) {
                <option [value]="r.id">{{ r.nameAr }}</option>
              }
            </select>
          </div>
        }
      </div>
      <div class="modal-footer">
        <button type="submit" class="btn btn-primary">{{ mode() === 'rename' ? 'حفظ' : 'إنشاء' }}</button>
        <button type="button" class="btn btn-outline-secondary" (click)="modal.dismiss()">إلغاء</button>
      </div>
    </form>
  `,
})
export class RoleFormDialogComponent {
  protected readonly modal = inject(NgbActiveModal);

  protected readonly mode = signal<RoleFormMode>('create');
  protected readonly title = signal(TITLES.create);
  protected readonly roles = signal<Role[]>([]);
  protected readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    nameAr: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    descriptionAr: new FormControl('', { nonNullable: true }),
    cloneFromId: new FormControl('', { nonNullable: true }),
  });

  /** Called by the opener right after `NgbModal.open`. */
  init(mode: RoleFormMode, roles: Role[], role?: Role): void {
    this.mode.set(mode);
    this.title.set(TITLES[mode]);
    this.roles.set(roles);
    if (mode === 'clone' && role) this.form.patchValue({ nameAr: `${role.nameAr} (نسخة)`, descriptionAr: role.descriptionAr, cloneFromId: role.id });
    if (mode === 'rename' && role) this.form.patchValue({ nameAr: role.nameAr, descriptionAr: role.descriptionAr });
  }

  protected invalid(name: 'nameAr'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.modal.close({ nameAr: v.nameAr, descriptionAr: v.descriptionAr, cloneFromId: v.cloneFromId || undefined } satisfies RoleFormResult);
  }
}
