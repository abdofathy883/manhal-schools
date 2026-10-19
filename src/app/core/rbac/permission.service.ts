import { Injectable, computed, inject } from '@angular/core';
import { ActorContext, PermissionDef, Role, Scope, ScopedResource, User } from '../../domain/models/rbac';
import { PERMISSION_BY_KEY } from '../../domain/permission-catalog';
import { AuthService } from '../auth/auth.service';
import { MenuItem, MENU } from '../layout/menu.config';
import { MockDb } from '../mock-db/mock-db.service';
import { EffectiveGrant, EffectiveMap, computeEffective } from './effective';
import { evaluateCan, evaluateScope } from './evaluate';
import { scopeRank } from './scope';

export interface EffectivePermission {
  def: PermissionDef;
  scope: Scope | null;
  /** `null` = all services. */
  services: readonly string[] | null;
}

export function actorOf(user: User | null): ActorContext | null {
  return user ? { userId: user.id, branchId: user.branchId, departmentId: user.departmentId } : null;
}

export function visibleMenuFor(map: EffectiveMap, items: readonly MenuItem[] = MENU): MenuItem[] {
  return items.filter((i) => {
    if (i.requiresAny?.length && !i.requiresAny.some((k) => map.has(k))) return false;
    if (i.requiresScope) {
      const scope = evaluateScope(map, i.requiresScope.key);
      if (!scope || scopeRank(scope) < scopeRank(i.requiresScope.atLeast)) return false;
    }
    return true;
  });
}

export function listEffective(map: EffectiveMap): EffectivePermission[] {
  const rows: EffectivePermission[] = [];
  for (const [key, grants] of map) {
    const def = PERMISSION_BY_KEY.get(key);
    if (!def) continue;
    for (const g of grants as readonly EffectiveGrant[]) rows.push({ def, scope: g.scope, services: g.services });
  }
  return rows;
}

/**
 * Signals-based RBAC for the signed-in user. It reads roles and users from the live mock
 * database, so editing a role in the admin UI changes `can()` results, menus and (through the
 * repositories) the records a user receives — immediately.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly auth = inject(AuthService);
  private readonly db = inject(MockDb);

  private readonly actor = computed(() => actorOf(this.auth.currentUser()));

  /** Effective permissions of the signed-in user, merged across all their roles. */
  readonly effective = computed<EffectiveMap>(() => {
    const user = this.auth.currentUser();
    return user ? computeEffective(user.roleIds, this.db.roles()) : new Map();
  });

  readonly effectivePermissions = computed(() => listEffective(this.effective()));

  readonly roles = computed<Role[]>(() => {
    const user = this.auth.currentUser();
    return user ? this.db.roles().filter((r) => user.roleIds.includes(r.id)) : [];
  });

  /** Menu entries the signed-in user may see; empty when signed out. */
  readonly visibleMenu = computed(() => (this.auth.currentUser() ? visibleMenuFor(this.effective()) : []));

  /** Reads `effective()`, so calling it inside `computed`/templates tracks RBAC changes. */
  can(key: string, resource?: ScopedResource): boolean {
    return evaluateCan(this.effective(), this.actor(), key, resource);
  }

  canAny(keys: readonly string[], resource?: ScopedResource): boolean {
    return keys.some((k) => this.can(k, resource));
  }

  /** Broadest scope held for `key` (optionally for one service), or `null` if not held. */
  scopeOf(key: string, service?: string): Scope | null {
    return evaluateScope(this.effective(), key, service);
  }
}
