import { RequestStatus, ServiceRequest, SlaState } from '../models/request';

export const TERMINAL_STATUSES: readonly RequestStatus[] = ['closed', 'rejected', 'cancelled'];

export const isTerminal = (status: RequestStatus): boolean => TERMINAL_STATUSES.includes(status);

export type SlaPhase = 'not_started' | 'running' | 'paused' | 'stopped' | 'breached';

/** Milliseconds the SLA clock has actually run (excluding paused time). */
export function slaElapsedMs(sla: SlaState, now: Date): number {
  if (!sla.startedAt) return 0;
  const end = sla.stoppedAt ? new Date(sla.stoppedAt).getTime() : now.getTime();
  const pausedNow = sla.pausedSince && !sla.stoppedAt ? end - new Date(sla.pausedSince).getTime() : 0;
  return Math.max(0, end - new Date(sla.startedAt).getTime() - sla.pausedMs - pausedNow);
}

export const slaTargetMs = (sla: SlaState): number => sla.targetHours * 3_600_000;

export const slaRemainingMs = (sla: SlaState, now: Date): number => slaTargetMs(sla) - slaElapsedMs(sla, now);

export function slaPhase(request: Pick<ServiceRequest, 'sla' | 'status'>, now: Date): SlaPhase {
  const { sla } = request;
  if (!sla.startedAt) return 'not_started';
  if (sla.breached || (!sla.stoppedAt && !isTerminal(request.status) && slaRemainingMs(sla, now) < 0)) return 'breached';
  if (sla.stoppedAt || isTerminal(request.status)) return 'stopped';
  if (sla.pausedSince) return 'paused';
  return 'running';
}

/** Overdue = breached and still open (used for dashboards and the red badge). */
export const isOverdue = (request: Pick<ServiceRequest, 'sla' | 'status'>, now: Date): boolean =>
  !isTerminal(request.status) && slaPhase(request, now) === 'breached';

/** Arabic number-noun agreement: 1 singular, 2 dual, 3–10 plural, 11+ tamyeez (singular). */
function unit(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}

/** Human-readable duration in Arabic, e.g. `3 ساعات و 20 دقيقة`. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(unit(days, 'يوم', 'يومان', 'أيام', 'يومًا'));
  if (hours) parts.push(unit(hours, 'ساعة', 'ساعتان', 'ساعات', 'ساعة'));
  if (!days && (minutes || !parts.length)) parts.push(unit(minutes, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة'));
  return parts.join(' و ');
}
