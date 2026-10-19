import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_IDS } from '../../domain/seed/roles.seed';
import { AuthService } from '../auth/auth.service';
import { MOCK_LATENCY } from '../mock-db/latency';
import { MockDb } from '../mock-db/mock-db.service';
import { provideMockBackend } from '../mock-db/mock-repositories';
import { PermissionService } from './permission.service';

describe('PermissionService', () => {
  let auth: AuthService;
  let permissions: PermissionService;
  let db: MockDb;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideMockBackend(), { provide: MOCK_LATENCY, useValue: [0, 0] }],
    });
    auth = TestBed.inject(AuthService);
    permissions = TestBed.inject(PermissionService);
    db = TestBed.inject(MockDb);
  });

  const signInAs = (employeeId: string) => {
    const user = db.state().users.find((u) => u.employeeId === employeeId)!;
    expect(auth.switchTo(user.id)).toBe(true);
  };

  it('grants nothing while signed out', () => {
    expect(permissions.can('request.view')).toBe(false);
    expect(permissions.visibleMenu()).toHaveLength(0);
  });

  it('builds a role-specific menu', () => {
    signInAs('E1001');
    const routes = permissions.visibleMenu().map((m) => m.route);
    expect(routes).toContain('/requests/new');
    expect(routes).not.toContain('/approvals');
    expect(routes).not.toContain('/admin/rbac');

    signInAs('E1013');
    expect(permissions.visibleMenu().map((m) => m.route)).toContain('/admin/rbac');
  });

  it('evaluates scope against the record: department manager vs another branch', () => {
    signInAs('E1015'); // Rayyan — secondary boys
    expect(permissions.can('request.view', { branchId: 'br-rayyan', departmentId: 'dp-sec-b' })).toBe(true);
    expect(permissions.can('request.view', { branchId: 'br-taawun', departmentId: 'dp-prim-g' })).toBe(false);
    expect(permissions.scopeOf('request.approve.department')).toBe('department');
  });

  it('reflects live RBAC edits immediately', () => {
    signInAs('E1001');
    expect(permissions.can('request.approve.department')).toBe(false);

    db.update((d) => {
      d.roles.find((r) => r.id === ROLE_IDS.requester)!.permissions.push({ key: 'request.approve.department', scope: 'branch' });
    });

    expect(permissions.can('request.approve.department')).toBe(true);
    expect(permissions.scopeOf('request.approve.department')).toBe('branch');
    expect(permissions.visibleMenu().map((m) => m.route)).toContain('/approvals');
  });

  it('unions permissions when a user holds several roles', () => {
    signInAs('E1001');
    const userId = auth.currentUser()!.id;
    db.update((d) => {
      d.users.find((u) => u.id === userId)!.roleIds.push(ROLE_IDS.finance);
    });
    expect(permissions.can('request.approve.finance')).toBe(true);
    expect(permissions.can('request.create.building-maintenance')).toBe(true);
  });
});
