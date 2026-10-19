import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal';
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap/nav';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap/tooltip';
import { firstValueFrom, forkJoin, startWith } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { AuthService } from '../../../core/auth/auth.service';
import { DemoModeService } from '../../../core/demo-mode/demo-mode.service';
import { liveResource } from '../../../core/live-resource';
import { ToastService } from '../../../core/notifications/toast.service';
import { EffectivePermissionsPanelComponent } from '../../../core/rbac/effective-permissions-panel.component';
import { RequestService } from '../../../core/requests/request.service';
import { PermissionDef, Role, SCOPE_LABELS, SCOPE_ORDER, Scope } from '../../../domain/models/rbac';
import { PERMISSION_CATALOG, PERMISSION_MODULES } from '../../../domain/permission-catalog';
import { SERVICE_BY_KEY } from '../../../domain/reference-data';
import { ServiceKey } from '../../../domain/models/request';
import { cloneRoles, diffRoles, limitedServices, lockOutReason, scopeOfKey } from '../../../domain/rbac-admin';
import { ROLE_IDS } from '../../../domain/seed/roles.seed';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../../shared/ui/skeleton-rows.component';
import { RoleFormDialogComponent, RoleFormMode, RoleFormResult } from './role-form-dialog.component';

interface Group {
  module: string;
  perms: PermissionDef[];
}

/** `/admin/rbac`: roles, the permission matrix (live, with an unsaved-changes bar and a diff) and the effective-permissions panel. */
@Component({
  selector: 'app-rbac-page',
  imports: [ReactiveFormsModule, NgbNavModule, NgbTooltipModule, PageHeaderComponent, SkeletonRowsComponent, EffectivePermissionsPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  templateUrl: './rbac-page.component.html',
})
export class RbacPageComponent {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly demo = inject(DemoModeService);
  private readonly requests = inject(RequestService);
  private readonly toasts = inject(ToastService);
  private readonly modals = inject(NgbModal);

  protected readonly tab = signal('matrix');
  protected readonly scopes = SCOPE_ORDER.map((key) => ({ key, label: SCOPE_LABELS[key] }));
  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly query = toSignal(this.search.valueChanges.pipe(startWith('')), { initialValue: '' });
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  protected readonly showDiff = signal(false);
  protected readonly saving = signal(false);
  protected readonly expandedRole = signal<string | null>(null);
  protected readonly pickedUserId = signal<string | null>(null);

  private readonly data = liveResource(
    () => ({}),
    () => forkJoin({ roles: this.admin.roles(), users: this.admin.users() }),
  );
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());
  protected readonly saved = computed<Role[]>(() => this.data.value()?.roles ?? []);
  protected readonly users = computed(() => this.data.value()?.users ?? []);

  /** The matrix works on a copy; nothing is saved until "حفظ". */
  protected readonly draft = signal<Role[]>([]);
  protected readonly changes = computed(() => diffRoles(this.saved(), this.draft()));
  protected readonly dirty = computed(() => this.changes().length > 0);
  protected readonly lockReason = computed(() => (this.draft().length ? lockOutReason(this.draft(), this.users(), this.auth.currentUser()?.id ?? null) : null));

  protected readonly changesByRole = computed(() => {
    const map = new Map<string, { role: string; items: ReturnType<typeof diffRoles> }>();
    for (const c of this.changes()) {
      const entry = map.get(c.roleId) ?? { role: c.roleName, items: [] };
      entry.items.push(c);
      map.set(c.roleId, entry);
    }
    return [...map.values()];
  });

  private readonly cells = computed(() => {
    const map = new Map<string, { scope: Scope; services: string[] | null }>();
    for (const role of this.draft()) {
      for (const p of role.permissions) {
        const key = `${role.id}|${p.key}`;
        if (!map.has(key)) map.set(key, { scope: scopeOfKey(role, p.key) ?? 'own', services: limitedServices(role, p.key) });
      }
    }
    return map;
  });

  protected readonly groups = computed<Group[]>(() => {
    const q = this.query().trim().toLowerCase();
    return PERMISSION_MODULES.map((module) => ({
      module,
      perms: PERMISSION_CATALOG.filter((p) => p.module === module && (!q || p.label.includes(q) || p.key.toLowerCase().includes(q) || p.description.includes(q))),
    })).filter((g) => g.perms.length > 0);
  });

  protected readonly roleStats = computed(() =>
    this.saved().map((role) => ({
      role,
      users: this.users().filter((u) => u.roleIds.includes(role.id)),
      permissionCount: new Set(role.permissions.map((p) => p.key)).size,
    })),
  );

  protected readonly pickedUser = computed(() => this.users().find((u) => u.id === (this.pickedUserId() ?? this.auth.currentUser()?.id)) ?? null);

  constructor() {
    // Follow the saved roles while there is nothing unsaved (live edits from elsewhere, first load, after saving).
    effect(() => {
      const saved = this.saved();
      untracked(() => {
        if (!this.dirty()) this.draft.set(cloneRoles(saved));
      });
    });
  }

  protected cell(roleId: string, key: string): { scope: Scope; services: string[] | null } | undefined {
    return this.cells().get(`${roleId}|${key}`);
  }

  protected servicesLabel(services: string[]): string {
    return 'مقيّدة بالخدمات: ' + services.map((s) => SERVICE_BY_KEY[s as ServiceKey]?.nameAr ?? s).join('، ');
  }

  /** The system administrator role always keeps the permission to administer permissions. */
  protected locked(roleId: string, key: string): boolean {
    return roleId === ROLE_IDS.admin && key === 'admin.rbac';
  }

  protected toggle(roleId: string, key: string): void {
    if (this.locked(roleId, key)) return;
    const def = PERMISSION_CATALOG.find((p) => p.key === key)!;
    this.draft.update((roles) =>
      roles.map((r) => {
        if (r.id !== roleId) return r;
        const has = r.permissions.some((p) => p.key === key);
        return { ...r, permissions: has ? r.permissions.filter((p) => p.key !== key) : [...r.permissions, def.scoped ? { key, scope: 'own' as Scope } : { key }] };
      }),
    );
  }

  protected setScope(roleId: string, key: string, scope: string): void {
    this.draft.update((roles) => roles.map((r) => (r.id !== roleId ? r : { ...r, permissions: r.permissions.map((p) => (p.key === key ? { ...p, scope: scope as Scope } : p)) })));
  }

  /** Grants or removes every permission of a module for one role (the admin lock is respected). */
  protected toggleModule(roleId: string, group: Group): void {
    const role = this.draft().find((r) => r.id === roleId);
    if (!role) return;
    const allOn = group.perms.every((p) => role.permissions.some((g) => g.key === p.key));
    this.draft.update((roles) =>
      roles.map((r) => {
        if (r.id !== roleId) return r;
        if (allOn) return { ...r, permissions: r.permissions.filter((g) => !group.perms.some((p) => p.key === g.key) || this.locked(roleId, g.key)) };
        const missing = group.perms.filter((p) => !r.permissions.some((g) => g.key === p.key));
        return { ...r, permissions: [...r.permissions, ...missing.map((p) => (p.scoped ? { key: p.key, scope: 'own' as Scope } : { key: p.key }))] };
      }),
    );
  }

  protected toggleCollapse(module: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }

  protected revert(): void {
    this.draft.set(cloneRoles(this.saved()));
    this.showDiff.set(false);
  }

  protected save(): void {
    this.saving.set(true);
    this.admin.saveMatrix(this.draft()).subscribe({
      next: (n) => {
        this.saving.set(false);
        this.showDiff.set(false);
        this.toasts.success('تم حفظ الصلاحيات', `طُبّق ${n} تغيير على الجلسات الحالية فورًا وسُجّل في سجل التدقيق.`);
      },
      error: (err) => {
        this.saving.set(false);
        this.requests.reportError(err, 'تعذر حفظ الصلاحيات');
      },
    });
  }

  // Roles tab ------------------------------------------------------------------------------------------

  protected async openRoleDialog(mode: RoleFormMode, role?: Role): Promise<void> {
    const ref = this.modals.open(RoleFormDialogComponent, { centered: true });
    (ref.componentInstance as RoleFormDialogComponent).init(mode, this.saved(), role);
    let result: RoleFormResult;
    try {
      result = (await ref.result) as RoleFormResult;
    } catch {
      return;
    }
    try {
      if (mode === 'rename' && role) await firstValueFrom(this.admin.renameRole(role.id, result.nameAr, result.descriptionAr));
      else await firstValueFrom(this.admin.createRole(result.nameAr, result.descriptionAr, result.cloneFromId));
      this.toasts.success(mode === 'rename' ? 'تم تعديل الدور' : 'تم إنشاء الدور', 'يمكنك الآن تعديل صلاحياته من المصفوفة.');
    } catch (err) {
      this.requests.reportError(err, 'تعذر حفظ الدور');
    }
  }

  protected async deleteRole(role: Role): Promise<void> {
    try {
      await firstValueFrom(this.admin.deleteRole(role.id));
      this.toasts.success('تم حذف الدور');
    } catch (err) {
      this.requests.reportError(err, 'تعذر حذف الدور');
    }
  }

  protected toggleExpanded(id: string): void {
    this.expandedRole.update((current) => (current === id ? null : id));
  }

  protected viewAs(): void {
    const user = this.pickedUser();
    if (user) this.demo.switchTo(user);
  }

  protected pickUser(event: Event): void {
    this.pickedUserId.set((event.target as HTMLSelectElement).value);
  }
}
