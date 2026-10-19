import { computeEffective } from '../core/rbac/effective';
import { PermissionGrant, Role, SCOPE_LABELS, Scope, User } from './models/rbac';
import { PERMISSION_BY_KEY } from './permission-catalog';
import { ROLE_IDS } from './seed/roles.seed';

export type ChangeKind = 'added' | 'removed' | 'scope';

/** One difference between the saved roles and the draft in the permission matrix. */
export interface RoleChange {
  roleId: string;
  roleName: string;
  key: string;
  label: string;
  kind: ChangeKind;
  /** Scope before / after (scoped permissions only). */
  before?: string;
  after?: string;
}

export const cloneRoles = (roles: readonly Role[]): Role[] => structuredClone(roles) as Role[];

/** Grants of one key held by a role (a key can have several service-limited grants). */
export const grantsOf = (role: Role, key: string): PermissionGrant[] => role.permissions.filter((p) => p.key === key);

const rank: Record<Scope, number> = { own: 0, department: 1, branch: 2, all: 3 };

/** Highest scope among the grants of a key, `null` when the role does not hold it. */
export function scopeOfKey(role: Role, key: string): Scope | null {
  const grants = grantsOf(role, key);
  if (!grants.length) return null;
  return grants.map((g) => g.scope ?? 'own').reduce((a, b) => (rank[b] > rank[a] ? b : a));
}

export function limitedServices(role: Role, key: string): string[] | null {
  const grants = grantsOf(role, key);
  if (!grants.length || grants.some((g) => !g.services?.length)) return null;
  return [...new Set(grants.flatMap((g) => g.services ?? []))];
}

export function diffRoles(before: readonly Role[], after: readonly Role[]): RoleChange[] {
  const changes: RoleChange[] = [];
  for (const next of after) {
    const prev = before.find((r) => r.id === next.id);
    if (!prev) continue;
    const keys = new Set([...prev.permissions, ...next.permissions].map((p) => p.key));
    for (const key of keys) {
      const label = PERMISSION_BY_KEY.get(key)?.label ?? key;
      const scoped = PERMISSION_BY_KEY.get(key)?.scoped ?? false;
      const had = scopeOfKey(prev, key);
      const has = scopeOfKey(next, key);
      const base = { roleId: next.id, roleName: next.nameAr, key, label };
      if (!had && has) changes.push({ ...base, kind: 'added', after: scoped ? SCOPE_LABELS[has] : undefined });
      else if (had && !has) changes.push({ ...base, kind: 'removed', before: scoped ? SCOPE_LABELS[had] : undefined });
      else if (scoped && had && has && had !== has) changes.push({ ...base, kind: 'scope', before: SCOPE_LABELS[had], after: SCOPE_LABELS[has] });
    }
  }
  return changes;
}

/** `null` when the roles and users leave someone able to administer permissions, otherwise the Arabic reason. */
export function lockOutReason(roles: readonly Role[], users: readonly User[], actingUserId: string | null): string | null {
  const admin = roles.find((r) => r.id === ROLE_IDS.admin);
  if (admin && !grantsOf(admin, 'admin.rbac').length) return 'لا يمكن إزالة صلاحية إدارة الأدوار من دور مدير النظام.';
  const canAdminister = (u: User) => u.active && computeEffective(u.roleIds, roles).has('admin.rbac');
  if (!users.some(canAdminister)) return 'يجب أن يبقى مستخدم نشط واحد على الأقل يملك صلاحية إدارة الأدوار.';
  const me = users.find((u) => u.id === actingUserId);
  if (me && !canAdminister(me)) return 'لا يمكنك سحب صلاحية إدارة الأدوار من حسابك الحالي.';
  return null;
}

/** Short Arabic summary of a role's changes for the audit trail. */
export function summarizeChanges(changes: readonly RoleChange[]): string {
  const count = (k: ChangeKind) => changes.filter((c) => c.kind === k).length;
  const parts = [
    count('added') ? `إضافة ${count('added')}` : '',
    count('removed') ? `إزالة ${count('removed')}` : '',
    count('scope') ? `تغيير نطاق ${count('scope')}` : '',
  ].filter(Boolean);
  return parts.join('، ');
}
