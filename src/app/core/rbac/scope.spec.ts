import { describe, expect, it } from 'vitest';
import { ActorContext } from '../../domain/models/rbac';
import { inScope, maxScope } from './scope';

const nora: ActorContext = { userId: 'u1', branchId: 'br-taawun', departmentId: 'dp-prim-g' };
const central: ActorContext = { userId: 'u9', branchId: null, departmentId: null };

describe('inScope', () => {
  it('own matches records created by or assigned to the actor', () => {
    expect(inScope('own', nora, { createdBy: 'u1' })).toBe(true);
    expect(inScope('own', nora, { assigneeId: 'u1' })).toBe(true);
    expect(inScope('own', nora, { createdBy: 'u2', branchId: 'br-taawun', departmentId: 'dp-prim-g' })).toBe(false);
  });

  it('department requires the same branch AND department', () => {
    expect(inScope('department', nora, { branchId: 'br-taawun', departmentId: 'dp-prim-g' })).toBe(true);
    expect(inScope('department', nora, { branchId: 'br-taawun', departmentId: 'dp-mid-g' })).toBe(false);
    // Department ids repeat across branches: same department in another branch is out of scope.
    expect(inScope('department', nora, { branchId: 'br-rayyan', departmentId: 'dp-prim-g' })).toBe(false);
  });

  it('branch matches the whole branch but nothing in other branches', () => {
    expect(inScope('branch', nora, { branchId: 'br-taawun', departmentId: 'dp-sec-b' })).toBe(true);
    expect(inScope('branch', nora, { branchId: 'br-rayyan' })).toBe(false);
  });

  it('all matches everything', () => {
    expect(inScope('all', nora, { branchId: 'br-rayyan' })).toBe(true);
  });

  it('higher scopes include own records, even from another branch', () => {
    expect(inScope('branch', nora, { branchId: 'br-rayyan', createdBy: 'u1' })).toBe(true);
    expect(inScope('department', nora, { branchId: 'br-rayyan', assigneeId: 'u1' })).toBe(true);
  });

  it('an actor without branch/department only matches own records for branch/department scope', () => {
    expect(inScope('branch', central, { branchId: null })).toBe(false);
    expect(inScope('department', central, { branchId: null, departmentId: null })).toBe(false);
    expect(inScope('branch', central, { createdBy: 'u9' })).toBe(true);
  });
});

describe('maxScope', () => {
  it('returns the broader scope and treats null as none', () => {
    expect(maxScope('own', 'branch')).toBe('branch');
    expect(maxScope('all', 'department')).toBe('all');
    expect(maxScope(null, 'own')).toBe('own');
    expect(maxScope(null, null)).toBeNull();
  });
});
