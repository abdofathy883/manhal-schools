import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal';
import { firstValueFrom, forkJoin, startWith } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { DemoModeService, placeOf } from '../../../core/demo-mode/demo-mode.service';
import { liveResource } from '../../../core/live-resource';
import { ToastService } from '../../../core/notifications/toast.service';
import { EffectivePermissionsPanelComponent } from '../../../core/rbac/effective-permissions-panel.component';
import { RequestService } from '../../../core/requests/request.service';
import { User } from '../../../domain/models/rbac';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../../shared/ui/skeleton-rows.component';
import { UserFormDialogComponent } from './user-form-dialog.component';

/** `/admin/users`: add and edit users, assign roles and place, activate or deactivate, and inspect what each user can do. */
@Component({
  selector: 'app-users-page',
  imports: [ReactiveFormsModule, EffectivePermissionsPanelComponent, EmptyStateComponent, PageHeaderComponent, SkeletonRowsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="المستخدمون" subtitle="الحسابات وأدوارها ونطاقها (الفرع والقسم) وحالتها">
      <button type="button" class="btn btn-primary" (click)="edit(null)"><i class="bi bi-person-plus me-1" aria-hidden="true"></i>مستخدم جديد</button>
    </app-page-header>

    @if (loading()) {
      <div class="card"><div class="card-body"><app-skeleton-rows [count]="8" /></div></div>
    } @else {
      <div class="card mb-3">
        <div class="card-body">
          <div class="row g-2">
            <div class="col-md-5">
              <label class="form-label" for="us-search">بحث</label>
              <input id="us-search" class="form-control" [formControl]="search" placeholder="الاسم أو الرقم الوظيفي أو المسمى" />
            </div>
            <div class="col-md-4">
              <label class="form-label" for="us-role">الدور</label>
              <select id="us-role" class="form-select" (change)="roleFilter.set($any($event.target).value)">
                <option value="">كل الأدوار</option>
                @for (r of roles(); track r.id) { <option [value]="r.id">{{ r.nameAr }}</option> }
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label" for="us-status">الحالة</label>
              <select id="us-status" class="form-select" (change)="statusFilter.set($any($event.target).value)">
                <option value="">الكل</option>
                <option value="active">نشط</option>
                <option value="inactive">موقوف</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        @if (rows().length) {
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <caption class="visually-hidden">المستخدمون</caption>
              <thead>
                <tr><th scope="col">الموظف</th><th scope="col">الفرع / القسم</th><th scope="col">الأدوار</th><th scope="col">الحالة</th><th scope="col"><span class="visually-hidden">إجراءات</span></th></tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.user.id) {
                  <tr [class.text-muted]="!row.user.active">
                    <td>
                      <div class="d-flex align-items-center gap-2">
                        <span class="rounded-circle d-inline-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0" style="inline-size: 2.2rem; block-size: 2.2rem" [style.background]="row.user.avatarColor" aria-hidden="true">{{ row.user.nameAr.charAt(0) }}</span>
                        <div>
                          <div class="fw-semibold">{{ row.user.nameAr }} <span class="small text-muted-ar ltr-inline">{{ row.user.employeeId }}</span></div>
                          <div class="small text-muted-ar">{{ row.user.jobTitleAr }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="small">{{ row.place }}</td>
                    <td>
                      <div class="d-flex flex-wrap gap-1">
                        @for (r of row.roleNames; track r) { <span class="badge bg-primary-subtle text-primary-emphasis">{{ r }}</span> }
                      </div>
                    </td>
                    <td><span class="badge" [class]="row.user.active ? 'bg-success-subtle text-success-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'">{{ row.user.active ? 'نشط' : 'موقوف' }}</span></td>
                    <td class="text-end">
                      <div class="d-flex flex-wrap gap-1 justify-content-end">
                        <button type="button" class="btn btn-sm btn-outline-secondary" (click)="toggleExpanded(row.user.id)" [attr.aria-expanded]="expanded() === row.user.id"><i class="bi bi-eye me-1" aria-hidden="true"></i>الصلاحيات</button>
                        <button type="button" class="btn btn-sm btn-outline-primary" (click)="edit(row.user)"><i class="bi bi-pencil me-1" aria-hidden="true"></i>تعديل</button>
                        <button type="button" class="btn btn-sm" [class]="row.user.active ? 'btn-outline-danger' : 'btn-outline-success'" [disabled]="busy()" (click)="setActive(row.user, !row.user.active)">
                          {{ row.user.active ? 'إيقاف' : 'تفعيل' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                  @if (expanded() === row.user.id) {
                    <tr>
                      <td colspan="5" class="bg-body-tertiary">
                        <div class="d-flex justify-content-end mb-2">
                          <button type="button" class="btn btn-sm btn-primary" [disabled]="!row.user.active" (click)="viewAs(row.user)"><i class="bi bi-person-badge me-1" aria-hidden="true"></i>عرض كـ هذا المستخدم</button>
                        </div>
                        <app-effective-permissions-panel [user]="row.user" />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        } @else {
          <app-empty-state title="لا يوجد مستخدمون" message="لا يوجد مستخدمون مطابقون للبحث." />
        }
      </div>
    }
  `,
})
export class UsersPageComponent {
  private readonly admin = inject(AdminService);
  private readonly demo = inject(DemoModeService);
  private readonly requests = inject(RequestService);
  private readonly toasts = inject(ToastService);
  private readonly modals = inject(NgbModal);

  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly query = toSignal(this.search.valueChanges.pipe(startWith('')), { initialValue: '' });
  protected readonly roleFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly expanded = signal<string | null>(null);
  protected readonly busy = signal(false);

  private readonly data = liveResource(
    () => ({}),
    () => forkJoin({ users: this.admin.users(), roles: this.admin.roles() }),
  );
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());
  protected readonly roles = computed(() => this.data.value()?.roles ?? []);

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const roles = this.roles();
    return (this.data.value()?.users ?? [])
      .filter((u) => !this.roleFilter() || u.roleIds.includes(this.roleFilter()))
      .filter((u) => !this.statusFilter() || (this.statusFilter() === 'active') === u.active)
      .filter((u) => !q || u.nameAr.toLowerCase().includes(q) || u.employeeId.toLowerCase().includes(q) || u.jobTitleAr.includes(q))
      .map((user) => ({ user, place: placeOf(user), roleNames: user.roleIds.map((id) => roles.find((r) => r.id === id)?.nameAr ?? id) }));
  });

  protected toggleExpanded(id: string): void {
    this.expanded.update((cur) => (cur === id ? null : id));
  }

  protected viewAs(user: User): void {
    this.demo.switchTo(user);
  }

  protected async edit(user: User | null): Promise<void> {
    const ref = this.modals.open(UserFormDialogComponent, { centered: true, size: 'lg' });
    (ref.componentInstance as UserFormDialogComponent).init(user, this.roles());
    let result: User;
    try {
      result = (await ref.result) as User;
    } catch {
      return;
    }
    try {
      await firstValueFrom(this.admin.saveUser(result, !user));
      this.toasts.success(user ? 'تم حفظ بيانات المستخدم' : 'تمت إضافة المستخدم', 'التغيير سارٍ فورًا ومسجّل في سجل التدقيق.');
    } catch (err) {
      this.requests.reportError(err, 'تعذر حفظ المستخدم');
    }
  }

  protected async setActive(user: User, active: boolean): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.admin.setUserActive(user.id, active));
      this.toasts.success(active ? 'تم تفعيل الحساب' : 'تم إيقاف الحساب');
    } catch (err) {
      this.requests.reportError(err, 'تعذر تغيير حالة الحساب');
    } finally {
      this.busy.set(false);
    }
  }
}
