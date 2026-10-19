import { PermissionGrant, Role, Scope } from '../../domain/models/rbac';
import { PERMISSION_BY_KEY } from '../../domain/permission-catalog';
import { maxScope } from './scope';

export interface EffectiveGrant {
  key: string;
  /** `null` for unscoped permissions. */
  scope: Scope | null;
  /** `null` = every service; otherwise the grant only applies to these services. */
  services: readonly string[] | null;
}

export type EffectiveMap = ReadonlyMap<string, readonly EffectiveGrant[]>;

const servicesSignature = (services: readonly string[] | null): string =>
  services ? [...services].sort().join(',') : '*';

function normalise(grant: PermissionGrant): EffectiveGrant {
  const scoped = PERMISSION_BY_KEY.get(grant.key)?.scoped ?? false;
  return {
    key: grant.key,
    scope: scoped ? (grant.scope ?? 'own') : null,
    services: grant.services?.length ? [...grant.services] : null,
  };
}

/**
 * Union of the grants of all given roles. Grants with the same key and service set
 * collapse to the highest scope ("highest scope wins per key").
 */
export function computeEffective(roleIds: readonly string[], roles: readonly Role[]): EffectiveMap {
  const merged = new Map<string, Map<string, EffectiveGrant>>();

  for (const role of roles) {
    if (!roleIds.includes(role.id)) continue;
    for (const raw of role.permissions) {
      const grant = normalise(raw);
      const bySignature = merged.get(grant.key) ?? new Map<string, EffectiveGrant>();
      const sig = servicesSignature(grant.services);
      const existing = bySignature.get(sig);
      bySignature.set(sig, existing ? { ...existing, scope: maxScope(existing.scope, grant.scope) } : grant);
      merged.set(grant.key, bySignature);
    }
  }

  return new Map([...merged].map(([key, bySig]) => [key, [...bySig.values()]]));
}
