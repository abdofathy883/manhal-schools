import { ActorContext, ScopedResource } from '../../domain/models/rbac';
import { ServiceRequest } from '../../domain/models/request';

export type CanFn = (key: string, resource?: ScopedResource) => boolean;

export const resourceOfRequest = (r: ServiceRequest): ScopedResource => ({
  branchId: r.branchId,
  departmentId: r.departmentId,
  createdBy: r.requesterId,
  assigneeId: r.assigneeId ?? null,
  service: r.service,
});

/**
 * The single rule for "may this user receive this request?".
 * - You always see what you submitted.
 * - Otherwise `request.view` must cover the record (scope + service).
 * - Confidential records (accidents, violations, confidential complaints) additionally need `request.view.confidential`.
 */
export function canViewRequest(request: ServiceRequest, actor: ActorContext | null, can: CanFn): boolean {
  if (!actor) return false;
  if (request.requesterId === actor.userId) return true;
  const resource = resourceOfRequest(request);
  if (!can('request.view', resource)) return false;
  return !request.confidential || can('request.view.confidential', resource);
}
