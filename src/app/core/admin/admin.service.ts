import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { ApprovalLimits, AuditEntityType, SlaHours } from '../../domain/models/platform';
import { Driver, RefListItem, RefLists, Supplier, Vehicle } from '../../domain/models/reference';
import { PermissionGrant, Role, User } from '../../domain/models/rbac';
import { diffRoles, lockOutReason, summarizeChanges } from '../../domain/rbac-admin';
import {
  AuditRepository,
  ReferenceRepository,
  RequestRepository,
  RoleRepository,
  SettingsRepository,
  UserRepository,
} from '../../domain/repositories';
import { EngineResult, WorkflowError, reapplyChain, reapplySlaTarget } from '../../domain/workflows/engine';
import { AuthService } from '../auth/auth.service';
import { Clock } from '../clock.service';
import { DataVersion } from '../data-version';
import { PermissionService } from '../rbac/permission.service';
import { RequestService } from '../requests/request.service';
import { SettingsStore } from '../settings-store';

/** Where a reference record is used by requests (so it cannot be deleted while in use). */
export type UsageKind = 'maintenanceSpecialties' | 'vehicleMaintenanceTypes' | 'tripPurposes' | 'complaintCategories' | 'vehicles' | 'drivers' | 'suppliers';

const USAGE_KEY: Record<UsageKind, (details: Record<string, unknown>) => unknown> = {
  maintenanceSpecialties: (d) => d['specialty'],
  vehicleMaintenanceTypes: (d) => d['maintenanceTypeId'],
  tripPurposes: (d) => d['purposeId'],
  complaintCategories: (d) => d['categoryId'],
  vehicles: (d) => d['vehicleId'],
  drivers: (d) => d['driverId'],
  suppliers: (d) => (d['procurement'] as { po?: { supplierId?: string } } | undefined)?.po?.supplierId,
};

const grantSnapshot = (role: Role): string[] =>
  role.permissions.map((p) => `${p.key}${p.scope ? ':' + p.scope : ''}${p.services?.length ? '[' + p.services.join(',') + ']' : ''}`);

/**
 * Administration: roles and permissions, users, reference data, SLA hours and approval limits. Every change checks the
 * admin permission, is guarded against lock-out where it can happen, takes effect live and writes an audit entry
 * with the before and after values.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly roleRepo = inject(RoleRepository);
  private readonly userRepo = inject(UserRepository);
  private readonly reference = inject(ReferenceRepository);
  private readonly settingsRepo = inject(SettingsRepository);
  private readonly audit = inject(AuditRepository);
  private readonly requestRepo = inject(RequestRepository);
  private readonly requests = inject(RequestService);
  private readonly settings = inject(SettingsStore);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly clock = inject(Clock);
  private readonly version = inject(DataVersion);

  roles(): Observable<Role[]> {
    return this.roleRepo.list();
  }

  users(): Observable<User[]> {
    return this.userRepo.list();
  }

  // Roles and the permission matrix ---------------------------------------------------------------------

  /** Saves the roles of the matrix draft; returns how many permission changes were applied. */
  saveMatrix(draft: readonly Role[]): Observable<number> {
    return this.need('admin.rbac', () =>
      forkJoin([this.roles(), this.users()]).pipe(
        switchMap(([current, users]) => {
          const changes = diffRoles(current, draft);
          if (!changes.length) return of(0);
          const reason = lockOutReason(draft, users, this.auth.currentUser()?.id ?? null);
          if (reason) return throwError(() => new WorkflowError(reason));
          const ids = [...new Set(changes.map((c) => c.roleId))];
          const saves = ids.map((id) => this.roleRepo.save(structuredClone(draft.find((r) => r.id === id)!)));
          const entries = ids.map((id) => {
            const roleChanges = changes.filter((c) => c.roleId === id);
            const before = current.find((r) => r.id === id)!;
            const after = draft.find((r) => r.id === id)!;
            return this.entry('role', id, 'تعديل صلاحيات دور', `الدور «${after.nameAr}»: ${summarizeChanges(roleChanges)}`, grantSnapshot(before), grantSnapshot(after));
          });
          return forkJoin(saves).pipe(
            switchMap(() => this.audit.add(entries)),
            tap(() => this.version.bump()),
            map(() => changes.length),
          );
        }),
      ),
    );
  }

  /** New role, optionally a copy of another one (the way system roles are "edited": clone, then change). */
  createRole(nameAr: string, descriptionAr: string, cloneFromId?: string): Observable<Role> {
    return this.need('admin.rbac', () =>
      this.roles().pipe(
        switchMap((roles) => {
          if (!nameAr.trim()) return throwError(() => new WorkflowError('اسم الدور مطلوب.'));
          if (roles.some((r) => r.nameAr === nameAr.trim())) return throwError(() => new WorkflowError('يوجد دور بالاسم نفسه.'));
          const source = roles.find((r) => r.id === cloneFromId);
          const role: Role = {
            id: `role-c-${Date.now().toString(36)}`,
            nameAr: nameAr.trim(),
            descriptionAr: descriptionAr.trim() || source?.descriptionAr || '',
            isSystem: false,
            permissions: source ? (structuredClone(source.permissions) as PermissionGrant[]) : [],
          };
          return this.roleRepo.save(role).pipe(
            switchMap((saved) => this.audit.add([this.entry('role', saved.id, source ? 'نسخ دور' : 'إنشاء دور', `الدور «${saved.nameAr}»${source ? ` (نسخة من «${source.nameAr}»)` : ''}`, undefined, grantSnapshot(saved))]).pipe(map(() => saved))),
            tap(() => this.version.bump()),
          );
        }),
      ),
    );
  }

  renameRole(id: string, nameAr: string, descriptionAr: string): Observable<Role> {
    return this.need('admin.rbac', () =>
      this.roles().pipe(
        switchMap((roles) => {
          const role = roles.find((r) => r.id === id);
          if (!role) return throwError(() => new WorkflowError('الدور غير موجود.'));
          if (!nameAr.trim()) return throwError(() => new WorkflowError('اسم الدور مطلوب.'));
          if (roles.some((r) => r.id !== id && r.nameAr === nameAr.trim())) return throwError(() => new WorkflowError('يوجد دور بالاسم نفسه.'));
          const next = { ...role, nameAr: nameAr.trim(), descriptionAr: descriptionAr.trim() };
          return this.roleRepo.save(next).pipe(
            switchMap((saved) => this.audit.add([this.entry('role', id, 'تعديل بيانات دور', `«${role.nameAr}» ← «${saved.nameAr}»`, { nameAr: role.nameAr, descriptionAr: role.descriptionAr }, { nameAr: saved.nameAr, descriptionAr: saved.descriptionAr })]).pipe(map(() => saved))),
            tap(() => this.version.bump()),
          );
        }),
      ),
    );
  }

  /** Only custom roles that nobody holds can be deleted; system roles are cloned instead. */
  deleteRole(id: string): Observable<void> {
    return this.need('admin.rbac', () =>
      forkJoin([this.roles(), this.users()]).pipe(
        switchMap(([roles, users]) => {
          const role = roles.find((r) => r.id === id);
          if (!role) return throwError(() => new WorkflowError('الدور غير موجود.'));
          if (role.isSystem) return throwError(() => new WorkflowError('لا يمكن حذف دور أساسي في النظام، يمكنك نسخه وتعديل النسخة.'));
          const holders = users.filter((u) => u.roleIds.includes(id)).length;
          if (holders) return throwError(() => new WorkflowError(`لا يمكن حذف الدور: يحمله ${holders} مستخدم. انقلهم إلى دور آخر أولًا.`));
          return this.roleRepo.remove(id).pipe(
            switchMap(() => this.audit.add([this.entry('role', id, 'حذف دور', `الدور «${role.nameAr}»`, grantSnapshot(role), undefined)])),
            tap(() => this.version.bump()),
          );
        }),
      ),
    );
  }

  // Users -----------------------------------------------------------------------------------------------

  saveUser(user: User, isNew: boolean): Observable<User> {
    return this.need('admin.users', () =>
      forkJoin([this.users(), this.roles()]).pipe(
        switchMap(([users, roles]) => {
          const error = this.validateUser(user, users, isNew);
          if (error) return throwError(() => new WorkflowError(error));
          const after = users.filter((u) => u.id !== user.id).concat(user);
          const reason = lockOutReason(roles, after, this.auth.currentUser()?.id ?? null);
          if (reason) return throwError(() => new WorkflowError(reason));
          const before = users.find((u) => u.id === user.id);
          const roleNames = (u: User | undefined) => (u ? u.roleIds.map((id) => roles.find((r) => r.id === id)?.nameAr ?? id).join('، ') : '');
          const snap = (u: User | undefined) => (u ? { nameAr: u.nameAr, branchId: u.branchId, departmentId: u.departmentId, roles: roleNames(u), active: u.active } : undefined);
          return this.userRepo.save(user).pipe(
            switchMap((saved) =>
              this.audit.add([this.entry('user', saved.id, isNew ? 'إضافة مستخدم' : 'تعديل مستخدم', `${saved.nameAr} (${saved.employeeId}) — ${roleNames(saved)}`, snap(before), snap(saved))]).pipe(map(() => saved)),
            ),
            tap(() => this.version.bump()),
          );
        }),
      ),
    );
  }

  setUserActive(userId: string, active: boolean): Observable<User> {
    return this.users().pipe(
      switchMap((users) => {
        const user = users.find((u) => u.id === userId);
        if (!user) return throwError(() => new WorkflowError('المستخدم غير موجود.'));
        if (!active && user.id === this.auth.currentUser()?.id) return throwError(() => new WorkflowError('لا يمكنك إيقاف حسابك الحالي.'));
        return this.saveUser({ ...user, active }, false);
      }),
    );
  }

  private validateUser(user: User, users: readonly User[], isNew: boolean): string | null {
    if (!/^E\d{4}$/i.test(user.employeeId.trim())) return 'الرقم الوظيفي يتكوّن من الحرف E وأربعة أرقام (مثال E1016).';
    if (isNew && users.some((u) => u.employeeId.toUpperCase() === user.employeeId.trim().toUpperCase())) return 'الرقم الوظيفي مستخدم لموظف آخر.';
    if (!user.nameAr.trim()) return 'اسم الموظف مطلوب.';
    if (!/^05\d{8}$/.test(user.mobile)) return 'رقم الجوال يبدأ بـ 05 ويتكوّن من 10 أرقام.';
    if (!user.roleIds.length) return 'اختر دورًا واحدًا على الأقل.';
    if (user.departmentId && !user.branchId) return 'حدد الفرع عند تحديد القسم.';
    return null;
  }

  // Reference data --------------------------------------------------------------------------------------

  /** How many requests use a reference record (`0` = safe to delete). */
  usage(kind: UsageKind, id: string): Observable<number> {
    return this.requestRepo.inspect((all) => all.filter((r) => USAGE_KEY[kind](r.details) === id).length);
  }

  saveLists(lists: RefLists, summaryAr: string, before?: RefListItem[], after?: RefListItem[]): Observable<void> {
    return this.saveReference('admin.reference', this.reference.saveLists(lists), 'تعديل قائمة مرجعية', summaryAr, before, after);
  }

  saveVehicles(list: Vehicle[], summaryAr: string): Observable<void> {
    return this.saveReference('admin.reference', this.reference.saveVehicles(list), 'تعديل بيانات المركبات', summaryAr);
  }

  saveDrivers(list: Driver[], summaryAr: string): Observable<void> {
    return this.saveReference('admin.reference', this.reference.saveDrivers(list), 'تعديل بيانات السائقين', summaryAr);
  }

  saveSuppliers(list: Supplier[], summaryAr: string): Observable<void> {
    return this.saveReference('admin.reference', this.reference.saveSuppliers(list), 'تعديل بيانات الموردين', summaryAr);
  }

  private saveReference(key: string, save: Observable<unknown>, actionAr: string, summaryAr: string, before?: unknown, after?: unknown): Observable<void> {
    return this.need(key, () =>
      save.pipe(
        switchMap(() => this.audit.add([this.entry('reference', 'reference', actionAr, summaryAr, before, after)])),
        tap(() => this.version.bump()),
      ),
    );
  }

  // SLA hours and approval limits -----------------------------------------------------------------------

  /** How many requests still waiting for approval would get a different chain under these limits. */
  previewLimits(limits: ApprovalLimits): Observable<number> {
    const ctx = { ...this.requests.context(), limits };
    return this.requestRepo.inspect((all) => all.filter((r) => reapplyChain(r, ctx) !== null).length);
  }

  /** Saves the limits and rebuilds the approval chain of every request that was not approved yet. Returns how many changed. */
  saveLimits(limits: ApprovalLimits): Observable<number> {
    if (!(limits.departmentMax > 0) || !(limits.financeMax > limits.departmentMax)) {
      return throwError(() => new WorkflowError('حد الإدارة العليا يجب أن يكون أكبر من حد مدير القسم، وكلاهما أكبر من صفر.'));
    }
    const before = this.settings.settings().approvalLimits;
    return this.need('admin.limits', () => {
      const results = new Map<string, EngineResult>();
      return this.settingsRepo.get().pipe(
        switchMap((current) => this.settingsRepo.save({ ...current, approvalLimits: limits })),
        tap(() => this.settings.refresh()),
        switchMap(() => {
          const ctx = { ...this.requests.context(), limits };
          return this.requestRepo.sweep((r) => {
            const res = reapplyChain(r, ctx);
            if (res) results.set(r.id, res);
            return res?.request ?? null;
          });
        }),
        switchMap((changed) => (changed.length ? forkJoin(changed.map((c) => this.requests.afterWrite(c, results.get(c.id)!))) : of([]))),
        switchMap((changed) =>
          this.audit.add([this.entry('limits', 'limits', 'تعديل الحدود المالية', `حد مدير القسم ${limits.departmentMax} / حد المالية ${limits.financeMax} — أُعيد احتساب ${changed.length} من الطلبات`, before, limits)]).pipe(map(() => changed.length)),
        ),
        tap(() => this.version.bump()),
      );
    });
  }

  saveSla(slaHours: SlaHours): Observable<number> {
    if (Object.values(slaHours).some((h) => !(h > 0))) return throwError(() => new WorkflowError('كل مدة استجابة يجب أن تكون ساعة واحدة على الأقل.'));
    const before = this.settings.settings().slaHours;
    return this.need('admin.sla', () => {
      const ctx = { ...this.requests.context(), slaHours };
      return this.settingsRepo.get().pipe(
        switchMap((current) => this.settingsRepo.save({ ...current, slaHours })),
        tap(() => this.settings.refresh()),
        switchMap(() => this.requestRepo.sweep((r) => reapplySlaTarget(r, ctx))),
        switchMap((changed) => this.audit.add([this.entry('sla', 'sla', 'تعديل مدد الاستجابة', `تحديث مدد الاستجابة — طُبّقت على ${changed.length} من الطلبات المفتوحة`, before, slaHours)]).pipe(map(() => changed.length))),
        tap(() => this.version.bump()),
      );
    });
  }

  // Helpers ---------------------------------------------------------------------------------------------

  private need<T>(permission: string, work: () => Observable<T>): Observable<T> {
    return this.permissions.can(permission) ? work() : throwError(() => new WorkflowError('ليست لديك صلاحية تنفيذ هذا الإجراء.'));
  }

  private entry(entityType: AuditEntityType, entityId: string, actionAr: string, summaryAr: string, before?: unknown, after?: unknown) {
    const user = this.auth.currentUser();
    return {
      at: this.clock.nowIso(),
      actorId: user?.id ?? null,
      actorName: user ? `${user.nameAr} (${this.permissions.roles()[0]?.nameAr ?? ''})` : 'النظام',
      actionAr,
      entityType,
      entityId,
      summaryAr,
      before,
      after,
    };
  }
}
