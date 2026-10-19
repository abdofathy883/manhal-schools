import { Injectable, Provider, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { AppNotification, AuditEntry, PlatformSettings } from '../../domain/models/platform';
import { Role, ScopedResource, User } from '../../domain/models/rbac';
import { ServiceRequest } from '../../domain/models/request';
import { Driver, RefLists, Supplier, Vehicle, WarehouseItem } from '../../domain/models/reference';
import { StockChange, StockMovement } from '../../domain/models/procurement';
import {
  AuditRepository,
  Directory,
  ForbiddenError,
  NotFoundError,
  NotificationRepository,
  StockError,
  ReferenceRepository,
  RequestRepository,
  RoleRepository,
  SettingsRepository,
  UserRepository,
  WarehouseRepository,
} from '../../domain/repositories';
import { AuthService } from '../auth/auth.service';
import { computeEffective } from '../rbac/effective';
import { evaluateCan } from '../rbac/evaluate';
import { PermissionService, actorOf } from '../rbac/permission.service';
import { redactRequest, restoreHidden } from '../rbac/redaction';
import { canViewRequest } from '../rbac/request-visibility';
import { MOCK_LATENCY, latencyFrom } from './latency';
import { MockDb } from './mock-db.service';

abstract class MockRepositoryBase {
  protected readonly db = inject(MockDb);
  private readonly window = inject(MOCK_LATENCY);

  protected run<T>(work: () => T): Observable<T> {
    return latencyFrom(this.window, work);
  }
}

@Injectable()
export class MockUserRepository extends MockRepositoryBase implements UserRepository {
  list(): Observable<User[]> {
    return this.run(() => structuredClone(this.db.state().users));
  }

  getByEmployeeId(employeeId: string): Observable<User | null> {
    const wanted = employeeId.trim().toUpperCase();
    return this.run(() => {
      const found = this.db.state().users.find((u) => u.employeeId.toUpperCase() === wanted);
      return found ? structuredClone(found) : null;
    });
  }

  getById(id: string): Observable<User | null> {
    return this.run(() => {
      const found = this.db.state().users.find((u) => u.id === id);
      return found ? structuredClone(found) : null;
    });
  }

  save(user: User): Observable<User> {
    return this.run(() => {
      this.db.update((d) => {
        const i = d.users.findIndex((u) => u.id === user.id);
        if (i >= 0) d.users[i] = user;
        else d.users.push(user);
      });
      return structuredClone(user);
    });
  }
}

@Injectable()
export class MockRoleRepository extends MockRepositoryBase implements RoleRepository {
  list(): Observable<Role[]> {
    return this.run(() => structuredClone(this.db.state().roles));
  }

  save(role: Role): Observable<Role> {
    return this.run(() => {
      this.db.update((d) => {
        const i = d.roles.findIndex((r) => r.id === role.id);
        if (i >= 0) d.roles[i] = role;
        else d.roles.push(role);
      });
      return structuredClone(role);
    });
  }

  remove(roleId: string): Observable<void> {
    return this.run(() => {
      const role = this.db.state().roles.find((r) => r.id === roleId);
      if (role?.isSystem) throw new Error('لا يمكن حذف دور أساسي في النظام.');
      this.db.update((d) => {
        d.roles = d.roles.filter((r) => r.id !== roleId);
      });
    });
  }
}

@Injectable()
export class MockReferenceRepository extends MockRepositoryBase implements ReferenceRepository {
  vehicles(): Observable<Vehicle[]> {
    return this.run(() => structuredClone(this.db.state().vehicles));
  }

  drivers(): Observable<Driver[]> {
    return this.run(() => structuredClone(this.db.state().drivers));
  }

  items(): Observable<WarehouseItem[]> {
    return this.run(() => structuredClone(this.db.state().items));
  }

  suppliers(): Observable<Supplier[]> {
    return this.run(() => structuredClone(this.db.state().suppliers));
  }

  lists(): Observable<RefLists> {
    return this.run(() => structuredClone(this.db.state().refLists));
  }

  saveLists(lists: RefLists): Observable<RefLists> {
    return this.run(() => {
      this.db.update((d) => {
        d.refLists = lists;
      });
      return structuredClone(lists);
    });
  }

  saveVehicles(vehicles: Vehicle[]): Observable<Vehicle[]> {
    return this.run(() => {
      this.db.update((d) => {
        d.vehicles = vehicles;
      });
      return structuredClone(vehicles);
    });
  }

  saveDrivers(drivers: Driver[]): Observable<Driver[]> {
    return this.run(() => {
      this.db.update((d) => {
        d.drivers = drivers;
      });
      return structuredClone(drivers);
    });
  }

  saveSuppliers(suppliers: Supplier[]): Observable<Supplier[]> {
    return this.run(() => {
      this.db.update((d) => {
        d.suppliers = suppliers;
      });
      return structuredClone(suppliers);
    });
  }
}

@Injectable()
export class MockRequestRepository extends MockRepositoryBase implements RequestRepository {
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);

  private visible(request: ServiceRequest): boolean {
    return canViewRequest(request, actorOf(this.auth.currentUser()), (key, res) => this.permissions.can(key, res));
  }

  private canSeeInternal(): boolean {
    return this.permissions.can('request.comment.internal');
  }

  list(): Observable<ServiceRequest[]> {
    return this.run(() =>
      structuredClone(this.db.state().requests.filter((r) => this.visible(r)).map((r) => redactRequest(r, this.canSeeInternal()))),
    );
  }

  get(id: string): Observable<ServiceRequest> {
    return this.run(() => {
      const found = this.db.state().requests.find((r) => r.id === id);
      if (!found) throw new NotFoundError();
      if (!this.visible(found)) throw new ForbiddenError();
      return structuredClone(redactRequest(found, this.canSeeInternal()));
    });
  }

  create(build: (seq: number, id: string) => ServiceRequest): Observable<ServiceRequest> {
    return this.run(() => {
      const seq = this.db.state().refSeq;
      const request = build(seq, `r-${seq}`);
      this.db.update((d) => {
        d.requests.unshift(request);
        d.refSeq = seq + 1;
      });
      return structuredClone(request);
    });
  }

  save(request: ServiceRequest): Observable<ServiceRequest> {
    return this.run(() => {
      const existing = this.db.state().requests.find((r) => r.id === request.id);
      if (!existing) throw new NotFoundError();
      if (!this.visible(existing)) throw new ForbiddenError();
      const merged = restoreHidden(existing, request, this.canSeeInternal());
      this.db.update((d) => {
        d.requests[d.requests.findIndex((r) => r.id === request.id)] = merged;
      });
      return structuredClone(redactRequest(merged, this.canSeeInternal()));
    });
  }

  sweep(fn: (request: ServiceRequest) => ServiceRequest | null): Observable<ServiceRequest[]> {
    return this.run(() => {
      const changed = new Map<string, ServiceRequest>();
      for (const r of this.db.state().requests) {
        const next = fn(structuredClone(r));
        if (next) changed.set(r.id, next);
      }
      if (changed.size) {
        this.db.update((d) => {
          d.requests = d.requests.map((r) => changed.get(r.id) ?? r);
        });
      }
      return structuredClone([...changed.values()]);
    });
  }

  inspect<T>(fn: (requests: readonly ServiceRequest[]) => T): Observable<T> {
    return this.run(() => structuredClone(fn(this.db.state().requests)));
  }
}

@Injectable()
export class MockWarehouseRepository extends MockRepositoryBase implements WarehouseRepository {
  private nextId = 1;

  movements(): Observable<StockMovement[]> {
    return this.run(() => structuredClone(this.db.state().stockMovements));
  }

  apply(changes: readonly StockChange[], by: { id: string | null; name: string }, at: string): Observable<void> {
    return this.run(() => {
      if (!changes.length) return;
      const net = new Map<string, number>();
      for (const c of changes) net.set(c.itemId, (net.get(c.itemId) ?? 0) + c.delta);
      for (const [itemId, delta] of net) {
        const item = this.db.state().items.find((i) => i.id === itemId);
        if (!item) throw new NotFoundError();
        if (item.stock + delta < 0) throw new StockError(item.nameAr, item.stock);
      }
      this.db.update((d) => {
        for (const c of changes) {
          const item = d.items.find((i) => i.id === c.itemId)!;
          item.stock += c.delta;
          d.stockMovements.unshift({
            id: `sm-${Date.now()}-${this.nextId++}`,
            itemId: c.itemId,
            kind: c.kind,
            delta: c.delta,
            at,
            byId: by.id,
            byName: by.name,
            requestId: c.requestId,
            requestRef: c.requestRef,
            noteAr: c.noteAr,
          });
        }
      });
    });
  }
}

@Injectable()
export class MockNotificationRepository extends MockRepositoryBase implements NotificationRepository {
  private readonly auth = inject(AuthService);
  private nextId = 1;

  private sorted(list: AppNotification[]): AppNotification[] {
    return [...list].sort((a, b) => b.at.localeCompare(a.at));
  }

  listMine(): Observable<AppNotification[]> {
    return this.run(() => {
      const me = this.auth.currentUser()?.id;
      return structuredClone(this.sorted(this.db.state().notifications.filter((n) => n.userId === me)));
    });
  }

  add(notifications: Array<Omit<AppNotification, 'id'>>): Observable<void> {
    return this.run(() => {
      if (!notifications.length) return;
      this.db.update((d) => {
        for (const n of notifications) d.notifications.push({ ...n, id: `n-${Date.now()}-${this.nextId++}` });
      });
    });
  }

  markRead(ids: readonly string[]): Observable<void> {
    return this.run(() => {
      const me = this.auth.currentUser()?.id;
      this.db.update((d) => {
        for (const n of d.notifications) if (n.userId === me && ids.includes(n.id)) n.read = true;
      });
    });
  }

  markAllRead(): Observable<void> {
    return this.run(() => {
      const me = this.auth.currentUser()?.id;
      this.db.update((d) => {
        for (const n of d.notifications) if (n.userId === me) n.read = true;
      });
    });
  }

  channelLog(limit: number): Observable<AppNotification[]> {
    return this.run(() => structuredClone(this.sorted(this.db.state().notifications).slice(0, limit)));
  }
}

@Injectable()
export class MockAuditRepository extends MockRepositoryBase implements AuditRepository {
  private readonly permissions = inject(PermissionService);
  private nextId = 1;

  add(entries: Array<Omit<AuditEntry, 'id'>>): Observable<void> {
    return this.run(() => {
      if (!entries.length) return;
      this.db.update((d) => {
        for (const e of entries) d.audit.unshift({ ...e, id: `au-${Date.now()}-${this.nextId++}` });
      });
    });
  }

  list(): Observable<AuditEntry[]> {
    if (!this.permissions.can('admin.audit')) return throwError(() => new ForbiddenError());
    return this.run(() => structuredClone(this.db.state().audit));
  }
}

@Injectable()
export class MockSettingsRepository extends MockRepositoryBase implements SettingsRepository {
  get(): Observable<PlatformSettings> {
    return this.run(() => structuredClone(this.db.state().settings));
  }

  save(settings: PlatformSettings): Observable<PlatformSettings> {
    return this.run(() => {
      this.db.update((d) => {
        d.settings = settings;
      });
      return structuredClone(settings);
    });
  }
}

@Injectable()
export class MockDirectory implements Directory {
  private readonly db = inject(MockDb);

  private matching(permissionKey: string, resource: ScopedResource, users: User[]): User[] {
    const roles = this.db.state().roles;
    return users.filter((u) => u.active && evaluateCan(computeEffective(u.roleIds, roles), actorOf(u), permissionKey, resource));
  }

  usersWith(permissionKey: string, resource: ScopedResource): string[] {
    return this.matching(permissionKey, resource, this.db.state().users).map((u) => u.id);
  }

  roleUsers(roleId: string): string[] {
    return this.db.state().users.filter((u) => u.active && u.roleIds.includes(roleId)).map((u) => u.id);
  }

  userName(userId: string): string {
    return this.db.state().users.find((u) => u.id === userId)?.nameAr ?? 'مستخدم';
  }

  assignableUsers(resource: ScopedResource): User[] {
    // A user is a candidate if, once assigned, they could execute it (so `own`-scoped technicians qualify).
    return this.db
      .state()
      .users.filter((u) => u.active && (u.branchId === null || u.branchId === resource.branchId))
      .filter((u) => this.matching('request.execute', { ...resource, assigneeId: u.id }, [u]).length > 0);
  }
}

/** Binds the repository contracts to their in-browser mock implementations. */
export function provideMockBackend(): Provider[] {
  return [
    { provide: UserRepository, useClass: MockUserRepository },
    { provide: RoleRepository, useClass: MockRoleRepository },
    { provide: ReferenceRepository, useClass: MockReferenceRepository },
    { provide: RequestRepository, useClass: MockRequestRepository },
    { provide: WarehouseRepository, useClass: MockWarehouseRepository },
    { provide: NotificationRepository, useClass: MockNotificationRepository },
    { provide: AuditRepository, useClass: MockAuditRepository },
    { provide: SettingsRepository, useClass: MockSettingsRepository },
    { provide: Directory, useClass: MockDirectory },
  ];
}
