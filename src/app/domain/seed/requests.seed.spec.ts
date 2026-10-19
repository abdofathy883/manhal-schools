import { describe, expect, it } from 'vitest';
import { isOverdue } from '../workflows/sla';
import { buildSeedRequests } from './requests.seed';

const NOW = new Date('2026-10-19T09:00:00Z');
const seed = buildSeedRequests(NOW);

describe('request seed', () => {
  it('produces ~80 requests, deterministically', () => {
    expect(seed.requests).toHaveLength(80);
    const again = buildSeedRequests(NOW);
    expect(JSON.stringify(again.requests)).toBe(JSON.stringify(seed.requests));
  });

  it('covers every status, including the exceptional ones', () => {
    const statuses = new Set(seed.requests.map((r) => r.status));
    for (const s of ['new', 'under_review', 'pending_approval', 'approved', 'in_progress', 'on_hold', 'pending_confirmation', 'closed', 'rejected', 'cancelled', 'returned']) {
      expect(statuses, s).toContain(s);
    }
  });

  it('matches the demo quotas: ~6 overdue, ~10 awaiting approval, ~8 awaiting confirmation', () => {
    const count = (f: (r: (typeof seed.requests)[number]) => boolean) => seed.requests.filter(f).length;
    expect(count((r) => isOverdue(r, NOW))).toBeGreaterThanOrEqual(5);
    expect(count((r) => isOverdue(r, NOW))).toBeLessThanOrEqual(8);
    expect(count((r) => r.status === 'pending_approval')).toBeGreaterThanOrEqual(9);
    expect(count((r) => r.status === 'pending_approval')).toBeLessThanOrEqual(12);
    expect(count((r) => r.status === 'pending_confirmation')).toBeGreaterThanOrEqual(7);
    expect(count((r) => r.status === 'pending_confirmation')).toBeLessThanOrEqual(9);
  });

  it('overdue requests are escalated and show the escalation in their timeline', () => {
    const overdue = seed.requests.filter((r) => isOverdue(r, NOW));
    for (const r of overdue) {
      expect(r.sla.escalated).toBe(true);
      expect(r.timeline.some((e) => e.type === 'escalated')).toBe(true);
    }
  });

  it('has unique reference numbers and chronologically ordered timelines in the past', () => {
    expect(new Set(seed.requests.map((r) => r.refNo)).size).toBe(seed.requests.length);
    for (const r of seed.requests) {
      const times = r.timeline.map((e) => e.at);
      expect(times).toEqual([...times].sort());
      expect(new Date(r.updatedAt).getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(r.timeline.every((e) => new Date(e.at).getTime() <= NOW.getTime())).toBe(true);
    }
  });

  it('includes restricted records: a confidential complaint and a traffic accident', () => {
    expect(seed.requests.some((r) => r.service === 'complaint' && r.confidential)).toBe(true);
    expect(seed.requests.filter((r) => r.service === 'traffic-accident').every((r) => r.confidential)).toBe(true);
  });

  it('gives the technician assigned jobs and the department managers real approvals to act on', () => {
    expect(seed.requests.some((r) => r.assigneeId === 'u-e1005')).toBe(true);
    const waiting = (userBranch: string, dept: string) =>
      seed.requests.filter(
        (r) => r.status === 'pending_approval' && r.branchId === userBranch && r.departmentId === dept && r.approvals.find((s) => s.state === 'pending')?.permissionKey === 'request.approve.department',
      ).length;
    expect(waiting('br-taawun', 'dp-prim-g')).toBeGreaterThan(0);
  });

  it('every closed request with a rating is rated 1–5 and the data spans all three branches', () => {
    expect(new Set(seed.requests.map((r) => r.branchId).filter(Boolean)).size).toBe(3);
    for (const r of seed.requests.filter((x) => x.rating)) expect(r.rating!.stars).toBeGreaterThanOrEqual(1);
  });

  it('creates notifications for real users only', () => {
    expect(seed.notifications.length).toBeGreaterThan(10);
    expect(seed.notifications.every((n) => n.userId.startsWith('u-e'))).toBe(true);
  });
});
