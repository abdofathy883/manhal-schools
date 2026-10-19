import { INTERNAL_DETAIL_KEYS } from '../../domain/models/execution';
import { ServiceRequest } from '../../domain/models/request';

/**
 * Internal comments, the timeline events that mention them and executor-only detail blocks
 * (`details.execution` / `details.closure`) are for executors only.
 * Users without `request.comment.internal` never receive them — this runs in the data layer.
 */
export function redactRequest(request: ServiceRequest, canSeeInternal: boolean): ServiceRequest {
  if (canSeeInternal) return request;
  return {
    ...request,
    comments: request.comments.filter((c) => !c.internal),
    timeline: request.timeline.filter((e) => !e.internal),
    details: Object.fromEntries(Object.entries(request.details).filter(([k]) => !INTERNAL_DETAIL_KEYS.includes(k))),
  };
}

/**
 * When a user who cannot see internal data saves a request, the hidden internal comments/events
 * from the stored copy are carried over so they are never lost.
 */
export function restoreHidden(stored: ServiceRequest, incoming: ServiceRequest, canSeeInternal: boolean): ServiceRequest {
  if (canSeeInternal) return incoming;
  const byTime = <T extends { at: string }>(a: T, b: T) => a.at.localeCompare(b.at);
  return {
    ...incoming,
    details: {
      ...incoming.details,
      ...Object.fromEntries(Object.entries(stored.details).filter(([k]) => INTERNAL_DETAIL_KEYS.includes(k))),
    },
    comments: [...incoming.comments, ...stored.comments.filter((c) => c.internal)].sort(byTime),
    timeline: [...incoming.timeline, ...stored.timeline.filter((e) => e.internal)].sort(byTime),
  };
}
