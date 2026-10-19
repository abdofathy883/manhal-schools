import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, RequestRepository } from '../../domain/repositories';
import { ROLE_IDS } from '../../domain/seed/roles.seed';
import { AuthService } from '../auth/auth.service';
import { MOCK_LATENCY } from './latency';
import { MockDb } from './mock-db.service';
import { provideMockBackend } from './mock-repositories';

describe('RequestRepository scope enforcement (data layer)', () => {
  let repo: RequestRepository;
  let auth: AuthService;
  let db: MockDb;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideMockBackend(), { provide: MOCK_LATENCY, useValue: [0, 0] }] });
    repo = TestBed.inject(RequestRepository);
    auth = TestBed.inject(AuthService);
    db = TestBed.inject(MockDb);
  });

  const as = (employeeId: string) => auth.switchTo(db.state().users.find((u) => u.employeeId === employeeId)!.id);
  const list = () => firstValueFrom(repo.list());

  it('returns nothing to a signed-out caller', async () => {
    expect(await list()).toHaveLength(0);
  });

  it('a requester receives only their own requests', async () => {
    as('E1001');
    const mine = await list();
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.requesterId === 'u-e1001')).toBe(true);
  });

  it('Rayyan users never receive Al-Taawun records', async () => {
    for (const id of ['E1014', 'E1015']) {
      as(id);
      const visible = await list();
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.some((r) => r.branchId === 'br-taawun'), id).toBe(false);
    }
  });

  it('a department manager sees their department and nothing from other departments or branches', async () => {
    as('E1002');
    const visible = await list();
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((r) => r.branchId === 'br-taawun' && r.departmentId === 'dp-prim-g')).toBe(true);
  });

  it('a branch supervisor sees the whole branch but not other branches', async () => {
    as('E1003');
    const visible = await list();
    expect(visible.some((r) => r.departmentId !== 'dp-prim-g')).toBe(true);
    expect(visible.every((r) => r.branchId === 'br-taawun' || r.requesterId === 'u-e1003')).toBe(true);
  });

  it('a technician only receives jobs assigned to them', async () => {
    as('E1005');
    const visible = await list();
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((r) => r.assigneeId === 'u-e1005' || r.requesterId === 'u-e1005')).toBe(true);
  });

  it('confidential accidents/violations reach the workshop only; executive management and branch supervisors do not get them', async () => {
    as('E1010');
    const workshop = await list();
    expect(workshop.some((r) => r.service === 'traffic-accident')).toBe(true);

    for (const id of ['E1012', 'E1003', 'E1004']) {
      as(id);
      const visible = await list();
      expect(visible.some((r) => r.confidential && r.service !== 'complaint'), id).toBe(false);
    }
  });

  it('confidential complaints reach the complaints officer but not executives or the maintenance lead', async () => {
    as('E1011');
    expect((await list()).some((r) => r.service === 'complaint' && r.confidential)).toBe(true);
    for (const id of ['E1012', 'E1004', 'E1003']) {
      as(id);
      expect((await list()).some((r) => r.service === 'complaint' && r.confidential), id).toBe(false);
    }
  });

  it('get() distinguishes missing from forbidden, and save() refuses out-of-scope writes', async () => {
    as('E1014');
    const taawun = db.state().requests.find((r) => r.branchId === 'br-taawun' && r.requesterId !== 'u-e1014')!;
    await expect(firstValueFrom(repo.get(taawun.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(firstValueFrom(repo.get('r-does-not-exist'))).rejects.toBeInstanceOf(NotFoundError);
    await expect(firstValueFrom(repo.save({ ...taawun, titleAr: 'تعديل غير مصرح' }))).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.state().requests.find((r) => r.id === taawun.id)!.titleAr).toBe(taawun.titleAr);
  });

  it('editing a role widens what the repository returns, immediately', async () => {
    as('E1001');
    const before = (await list()).length;
    db.update((d) => {
      const role = d.roles.find((r) => r.id === ROLE_IDS.requester)!;
      role.permissions = role.permissions.map((p) => (p.key === 'request.view' ? { ...p, scope: 'branch' as const } : p));
    });
    const after = await list();
    expect(after.length).toBeGreaterThan(before);
    expect(after.every((r) => r.branchId === 'br-taawun' || r.requesterId === 'u-e1001')).toBe(true);
  });

  it('allocates sequential reference numbers on create()', async () => {
    as('E1001');
    const seq = db.state().refSeq;
    const created = await firstValueFrom(
      repo.create((n, id) => ({ ...structuredClone(db.state().requests[0]), id, refNo: `MNH-2026-${String(n).padStart(6, '0')}`, requesterId: 'u-e1001' })),
    );
    expect(created.id).toBe(`r-${seq}`);
    expect(db.state().refSeq).toBe(seq + 1);
  });

  it('never sends internal comments (or their timeline events) to users without the permission', async () => {
    const withInternal = db.state().requests.find((r) => r.requesterId === 'u-e1001' && r.comments.some((c) => c.internal))!;
    expect(withInternal).toBeTruthy();
    as('E1001');
    const mine = await firstValueFrom(repo.get(withInternal.id));
    expect(mine.comments.some((c) => c.internal)).toBe(false);
    expect(mine.timeline.some((e) => e.internal)).toBe(false);
    expect((await list()).every((r) => r.comments.every((c) => !c.internal))).toBe(true);

    // The executor still sees them.
    as('E1004');
    expect((await firstValueFrom(repo.get(withInternal.id))).comments.some((c) => c.internal)).toBe(true);
  });

  it('saving as a requester keeps the hidden internal comments in storage', async () => {
    const target = db.state().requests.find((r) => r.requesterId === 'u-e1001' && r.comments.some((c) => c.internal))!;
    const internalCount = target.comments.filter((c) => c.internal).length;
    as('E1001');
    const seen = await firstValueFrom(repo.get(target.id));
    await firstValueFrom(repo.save({ ...seen, titleAr: seen.titleAr + ' (معدّل)' }));
    const stored = db.state().requests.find((r) => r.id === target.id)!;
    expect(stored.comments.filter((c) => c.internal)).toHaveLength(internalCount);
    expect(stored.titleAr).toContain('(معدّل)');
  });
});
