import { Injectable, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Role, User } from '../../domain/models/rbac';
import { BRANCHES, DEPARTMENTS } from '../../domain/reference-data';
import { AuthService } from '../auth/auth.service';
import { MockDb } from '../mock-db/mock-db.service';
import { ToastService } from '../notifications/toast.service';
import { DataVersion } from '../data-version';
import { SettingsStore } from '../settings-store';
import { SettingsService } from '../settings.service';

export interface UserGroup {
  role: Role;
  users: User[];
}

export function placeOf(user: User): string {
  const branch = BRANCHES.find((b) => b.id === user.branchId)?.nameAr;
  const dept = DEPARTMENTS.find((d) => d.id === user.departmentId)?.nameAr;
  if (branch && dept) return `${branch.replace('فرع ', '')} — ${dept}`;
  return branch ?? (dept ? dept : 'مركزي');
}

/** Demo Mode: instant identity switching, data reset, bar visibility. */
@Injectable({ providedIn: 'root' })
export class DemoModeService {
  private readonly auth = inject(AuthService);
  private readonly db = inject(MockDb);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly settings = inject(SettingsService);
  private readonly platformSettings = inject(SettingsStore);
  private readonly version = inject(DataVersion);

  readonly hidden = this.settings.demoBarHidden;

  /** Active users grouped by their primary role, in role order. */
  readonly groups = computed<UserGroup[]>(() => {
    const users = this.db.users().filter((u) => u.active);
    return this.db
      .roles()
      .map((role) => ({ role, users: users.filter((u) => u.roleIds[0] === role.id) }))
      .filter((g) => g.users.length > 0);
  });

  switchTo(user: User): void {
    if (!this.auth.switchTo(user.id)) {
      this.toasts.error('تعذر التبديل', 'هذا المستخدم غير متاح أو موقوف.');
      return;
    }
    void this.router.navigateByUrl('/home').then(() => this.toasts.info(`تم التبديل إلى ${user.nameAr}`, user.jobTitleAr));
  }

  /** Re-seeds the mock database. The signed-in identity is kept (if the user still exists). */
  resetData(): void {
    this.db.reset();
    this.platformSettings.refresh();
    this.version.bump();
    void this.router.navigateByUrl('/home').then(() => this.toasts.success('تمت إعادة ضبط بيانات العرض'));
  }

  toggleBar(): void {
    this.hidden.update((v) => !v);
  }
}
