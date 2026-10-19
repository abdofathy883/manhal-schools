import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal';
import { Role, User } from '../../../domain/models/rbac';
import { BRANCHES, DEPARTMENTS } from '../../../domain/reference-data';

const COLORS = ['#1B4F7B', '#2B93B0', '#2E7D4F', '#8E5BA8', '#C0392B', '#D2822A', '#3F6FB0', '#5C7A29'];

/** Add or edit a user: identity, place (branch / department) and roles. */
@Component({
  selector: 'app-user-form-dialog',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (submit)="$event.preventDefault(); submit()" novalidate>
      <div class="modal-header">
        <h2 class="modal-title h5">{{ isNew() ? 'مستخدم جديد' : 'تعديل المستخدم' }}</h2>
        <button type="button" class="btn-close" aria-label="إغلاق" (click)="modal.dismiss()"></button>
      </div>
      <div class="modal-body">
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label" for="uf-id">الرقم الوظيفي <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="uf-id" class="form-control ltr text-start" formControlName="employeeId" placeholder="E1016" [readonly]="!isNew()" [class.is-invalid]="bad('employeeId')" />
            <div class="invalid-feedback">الحرف E وأربعة أرقام.</div>
          </div>
          <div class="col-md-8">
            <label class="form-label" for="uf-name">الاسم <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="uf-name" class="form-control" formControlName="nameAr" [class.is-invalid]="bad('nameAr')" />
            <div class="invalid-feedback">الاسم مطلوب.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="uf-job">المسمى الوظيفي</label>
            <input id="uf-job" class="form-control" formControlName="jobTitleAr" />
          </div>
          <div class="col-md-6">
            <label class="form-label" for="uf-mobile">الجوال <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="uf-mobile" class="form-control ltr text-start" formControlName="mobile" inputmode="numeric" maxlength="10" [class.is-invalid]="bad('mobile')" />
            <div class="invalid-feedback">05 ثم 8 أرقام.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="uf-email">البريد الإلكتروني</label>
            <input id="uf-email" type="email" class="form-control ltr text-start" formControlName="email" />
          </div>
          <div class="col-md-3">
            <label class="form-label" for="uf-branch">الفرع</label>
            <select id="uf-branch" class="form-select" formControlName="branchId">
              <option value="">مركزي</option>
              @for (b of branches; track b.id) { <option [value]="b.id">{{ b.nameAr }}</option> }
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label" for="uf-dept">القسم</label>
            <select id="uf-dept" class="form-select" formControlName="departmentId" [class.is-invalid]="bad('departmentId')">
              <option value="">بلا قسم</option>
              @for (d of departments; track d.id) { <option [value]="d.id">{{ d.nameAr }}</option> }
            </select>
            <div class="invalid-feedback">حدد الفرع أولًا.</div>
          </div>
          <div class="col-12">
            <fieldset>
              <legend class="form-label">الأدوار <span class="text-danger" aria-hidden="true">*</span></legend>
              <div class="row g-1">
                @for (r of roles(); track r.id) {
                  <div class="col-sm-6">
                    <div class="form-check">
                      <input class="form-check-input" type="checkbox" [id]="'uf-r-' + r.id" [checked]="has(r.id)" (change)="toggle(r.id)" />
                      <label class="form-check-label" [for]="'uf-r-' + r.id">{{ r.nameAr }}</label>
                    </div>
                  </div>
                }
              </div>
              @if (submitted() && !selected().length) { <div class="text-danger small mt-1" role="alert">اختر دورًا واحدًا على الأقل.</div> }
              <div class="form-text">الصلاحيات الفعلية = اتحاد صلاحيات الأدوار المختارة (الأعلى نطاقًا يغلب).</div>
            </fieldset>
          </div>
          <div class="col-12">
            <div class="form-check form-switch">
              <input id="uf-active" class="form-check-input" type="checkbox" role="switch" formControlName="active" />
              <label class="form-check-label" for="uf-active">الحساب نشط</label>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="submit" class="btn btn-primary">حفظ</button>
        <button type="button" class="btn btn-outline-secondary" (click)="modal.dismiss()">إلغاء</button>
      </div>
    </form>
  `,
})
export class UserFormDialogComponent {
  protected readonly modal = inject(NgbActiveModal);

  protected readonly branches = BRANCHES;
  protected readonly departments = DEPARTMENTS;
  protected readonly roles = signal<Role[]>([]);
  protected readonly isNew = signal(true);
  protected readonly submitted = signal(false);
  protected readonly selected = signal<string[]>([]);
  private source: User | null = null;

  protected readonly form = new FormGroup({
    employeeId: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^E\d{4}$/i)] }),
    nameAr: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    jobTitleAr: new FormControl('', { nonNullable: true }),
    mobile: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^05\d{8}$/)] }),
    email: new FormControl('', { nonNullable: true }),
    branchId: new FormControl('', { nonNullable: true }),
    departmentId: new FormControl('', { nonNullable: true }),
    active: new FormControl(true, { nonNullable: true }),
  });

  /** Called by the opener right after `NgbModal.open`; `user` is `null` for a new user. */
  init(user: User | null, roles: Role[]): void {
    this.roles.set(roles);
    this.isNew.set(!user);
    this.source = user;
    if (user) {
      this.form.patchValue({ ...user, branchId: user.branchId ?? '', departmentId: user.departmentId ?? '' });
      this.selected.set([...user.roleIds]);
    } else {
      this.selected.set([roles.find((r) => r.id === 'role-requester')?.id ?? roles[0]?.id].filter((x): x is string => !!x));
    }
  }

  protected has(id: string): boolean {
    return this.selected().includes(id);
  }

  protected toggle(id: string): void {
    this.selected.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  protected bad(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    const v = this.form.getRawValue();
    if (name === 'departmentId' && v.departmentId && !v.branchId) return true;
    return c.invalid && (c.touched || this.submitted());
  }

  protected submit(): void {
    this.submitted.set(true);
    const v = this.form.getRawValue();
    if (this.form.invalid || !this.selected().length || (v.departmentId && !v.branchId)) {
      this.form.markAllAsTouched();
      return;
    }
    const employeeId = v.employeeId.trim().toUpperCase();
    const user: User = {
      id: this.source?.id ?? `u-${employeeId.toLowerCase()}`,
      employeeId,
      nameAr: v.nameAr.trim(),
      mobile: v.mobile,
      email: v.email.trim() || `${employeeId.toLowerCase()}@manhal.edu.sa`,
      avatarColor: this.source?.avatarColor ?? COLORS[Math.floor(Math.random() * COLORS.length)],
      branchId: v.branchId || null,
      departmentId: v.departmentId || null,
      roleIds: this.selected(),
      jobTitleAr: v.jobTitleAr.trim(),
      active: v.active,
    };
    this.modal.close(user);
  }
}
