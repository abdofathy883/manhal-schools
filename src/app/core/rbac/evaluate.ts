import { ActorContext, Scope, ScopedResource } from '../../domain/models/rbac';
import { EffectiveGrant, EffectiveMap } from './effective';
import { inScope, maxScope } from './scope';

const appliesToService = (grant: EffectiveGrant, service: string | undefined): boolean =>
  grant.services === null || service === undefined || grant.services.includes(service);

/**
 * Pure permission check.
 * Without a `resource` it answers "does the user hold this permission at all?" (menus, buttons).
 * With a `resource` the grant's service limit and scope must also match the record.
 */
export function evaluateCan(
  map: EffectiveMap,
  actor: ActorContext | null,
  key: string,
  resource?: ScopedResource,
): boolean {
  const grants = map.get(key);
  if (!grants || !actor) return false;
  if (!resource) return true;
  return grants.some(
    (g) => appliesToService(g, resource.service) && (g.scope === null || inScope(g.scope, actor, resource)),
  );
}

/**
 * Broadest scope the user holds for `key`, optionally limited to one service.
 * Unscoped permissions that are held report `all`; not held reports `null`.
 */
export function evaluateScope(map: EffectiveMap, key: string, service?: string): Scope | null {
  const grants = map.get(key)?.filter((g) => appliesToService(g, service));
  if (!grants?.length) return null;
  return grants.reduce<Scope | null>((acc, g) => maxScope(acc, g.scope ?? 'all'), null);
}
