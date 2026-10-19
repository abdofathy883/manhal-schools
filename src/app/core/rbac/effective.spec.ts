import { describe, expect, it } from 'vitest';
import { ActorContext, Role } from '../../domain/models/rbac';
import { SEED_ROLES, ROLE_IDS } from '../../domain/seed/roles.seed';
import { computeEffective } from './effective';
import { evaluateCan, evaluateScope } from './evaluate';

const role = (id: string, permissions: Role['permissions']): Role => ({
  id,
  nameAr: id,
  descriptionAr: '',
  isSystem: false,
  permissions,
});

const actor: ActorContext = { userId: 'u1', branchId: 'br-taawun', departmentId: 'dp-prim-g' };

describe('computeEffective', () => {
  it('unions grants of several roles and keeps the highest scope per key', () => {
    const roles = [
      role('a', [{ key: 'request.view', scope: 'own' }]),
      role('b', [{ key: 'request.view', scope: 'branch' }]),
    ];
    const map = computeEffective(['a', 'b'], roles);
    expect(evaluateScope(map, 'request.view')).toBe('branch');
    expect(map.get('request.view')).toHaveLength(1);
  });

  it('ignores roles the user does not hold', () => {
    const roles = [role('a', [{ key: 'admin.rbac' }]), role('b', [{ key: 'admin.users' }])];
    const map = computeEffective(['b'], roles);
    expect(map.has('admin.rbac')).toBe(false);
    expect(map.has('admin.users')).toBe(true);
  });

  it('defaults a scoped permission without scope to own, and ignores scope on unscoped ones', () => {
    const map = computeEffective(['a'], [role('a', [{ key: 'request.view' }, { key: 'admin.rbac', scope: 'own' }])]);
    expect(evaluateScope(map, 'request.view')).toBe('own');
    expect(evaluateScope(map, 'admin.rbac')).toBe('all');
  });
});

describe('evaluateCan', () => {
  const map = computeEffective(
    ['a'],
    [
      role('a', [
        { key: 'request.view', scope: 'all', services: ['vehicle-maintenance'] },
        { key: 'request.view', scope: 'own' },
      ]),
    ],
  );

  it('without a resource answers "held at all"', () => {
    expect(evaluateCan(map, actor, 'request.view')).toBe(true);
    expect(evaluateCan(map, actor, 'request.approve.finance')).toBe(false);
  });

  it('service-limited grants only widen scope for their services', () => {
    expect(evaluateCan(map, actor, 'request.view', { service: 'vehicle-maintenance', branchId: 'br-rayyan' })).toBe(true);
    expect(evaluateCan(map, actor, 'request.view', { service: 'complaint', branchId: 'br-rayyan' })).toBe(false);
    expect(evaluateCan(map, actor, 'request.view', { service: 'complaint', createdBy: 'u1' })).toBe(true);
  });

  it('denies everything when signed out', () => {
    expect(evaluateCan(map, null, 'request.view')).toBe(false);
  });
});

describe('seed roles', () => {
  const effective = (id: string) => computeEffective([id], SEED_ROLES);

  it('a requester sees only own requests and cannot approve', () => {
    const map = effective(ROLE_IDS.requester);
    expect(evaluateScope(map, 'request.view')).toBe('own');
    expect(evaluateCan(map, actor, 'request.approve.department')).toBe(false);
    expect(evaluateCan(map, actor, 'request.create.building-maintenance')).toBe(true);
    expect(evaluateCan(map, actor, 'request.create.traffic-accident')).toBe(false);
  });

  it('the workshop sees all vehicle services but only own records elsewhere', () => {
    const map = effective(ROLE_IDS.workshop);
    expect(evaluateScope(map, 'request.view', 'vehicle-maintenance')).toBe('all');
    expect(evaluateScope(map, 'request.view', 'purchase-request')).toBeNull();
  });

  it('a technician sees assigned jobs only', () => {
    const map = effective(ROLE_IDS.technician);
    expect(evaluateCan(map, actor, 'request.view', { assigneeId: 'u1', service: 'building-maintenance' })).toBe(true);
    expect(evaluateCan(map, actor, 'request.view', { assigneeId: 'u2', branchId: 'br-taawun' })).toBe(false);
  });

  it('executive management cannot view confidential requests', () => {
    expect(evaluateCan(effective(ROLE_IDS.executive), actor, 'request.view.confidential')).toBe(false);
  });

  it('only the admin role holds admin.rbac', () => {
    for (const r of SEED_ROLES) {
      expect(evaluateCan(effective(r.id), actor, 'admin.rbac')).toBe(r.id === ROLE_IDS.admin);
    }
  });
});
