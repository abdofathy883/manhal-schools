import { ActorContext, SCOPE_ORDER, Scope, ScopedResource } from '../../domain/models/rbac';

export function scopeRank(scope: Scope): number {
  return SCOPE_ORDER.indexOf(scope);
}

/** The broader of two scopes (`null` means "none"). */
export function maxScope(a: Scope | null, b: Scope | null): Scope | null {
  if (a === null) return b;
  if (b === null) return a;
  return scopeRank(a) >= scopeRank(b) ? a : b;
}

/** Records the actor created or is assigned to; every scope level includes these. */
export function isOwn(actor: ActorContext, resource: ScopedResource): boolean {
  return resource.createdBy === actor.userId || resource.assigneeId === actor.userId;
}

/**
 * Does `resource` fall inside `scope` for `actor`?
 * - `all`: always.
 * - `branch`: same branch (an actor without a branch matches only own records).
 * - `department`: same branch AND same department (department ids repeat across branches).
 * - `own`: created by or assigned to the actor.
 * Higher scopes include `own`.
 */
export function inScope(scope: Scope, actor: ActorContext, resource: ScopedResource): boolean {
  if (scope === 'all') return true;
  if (isOwn(actor, resource)) return true;
  if (scope === 'own') return false;

  const sameBranch = actor.branchId !== null && resource.branchId === actor.branchId;
  if (scope === 'branch') return sameBranch;

  return sameBranch && actor.departmentId !== null && resource.departmentId === actor.departmentId;
}
