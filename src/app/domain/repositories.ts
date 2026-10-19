import { Observable } from 'rxjs';
import { AppNotification, AuditEntry, PlatformSettings } from './models/platform';
import { Role, ScopedResource, User } from './models/rbac';
import { ServiceRequest } from './models/request';
import { Driver, RefLists, Supplier, Vehicle, WarehouseItem } from './models/reference';
import { StockChange, StockMovement } from './models/procurement';

/**
 * Repository contracts. The UI depends only on these abstract classes (used as DI tokens),
 * so the mock implementations can later be swapped for HttpClient-based ones.
 */
export abstract class UserRepository {
  abstract list(): Observable<User[]>;
  abstract getByEmployeeId(employeeId: string): Observable<User | null>;
  abstract getById(id: string): Observable<User | null>;
  abstract save(user: User): Observable<User>;
}

export abstract class RoleRepository {
  abstract list(): Observable<Role[]>;
  abstract save(role: Role): Observable<Role>;
  abstract remove(roleId: string): Observable<void>;
}

export abstract class ReferenceRepository {
  abstract vehicles(): Observable<Vehicle[]>;
  abstract drivers(): Observable<Driver[]>;
  abstract items(): Observable<WarehouseItem[]>;
  abstract suppliers(): Observable<Supplier[]>;
  abstract lists(): Observable<RefLists>;
  abstract saveLists(lists: RefLists): Observable<RefLists>;
  abstract saveVehicles(vehicles: Vehicle[]): Observable<Vehicle[]>;
  abstract saveDrivers(drivers: Driver[]): Observable<Driver[]>;
  abstract saveSuppliers(suppliers: Supplier[]): Observable<Supplier[]>;
}

/** The record exists but the signed-in user may not see it. */
export class ForbiddenError extends Error {
  readonly messageAr = 'ليست لديك صلاحية للاطلاع على هذا السجل.';

  constructor() {
    super('forbidden');
  }
}

/** Stock would go negative. */
export class StockError extends Error {
  readonly messageAr: string;

  constructor(itemAr: string, available: number) {
    super('insufficient stock');
    this.messageAr = `الرصيد غير كافٍ للصنف «${itemAr}» (المتاح ${available}).`;
  }
}

export class NotFoundError extends Error {
  readonly messageAr = 'السجل المطلوب غير موجود.';

  constructor() {
    super('not found');
  }
}

/** Every read is filtered to what the signed-in user may see — enforced here, not in the UI. */
export abstract class RequestRepository {
  abstract list(): Observable<ServiceRequest[]>;
  /** Errors with `NotFoundError` / `ForbiddenError`. */
  abstract get(id: string): Observable<ServiceRequest>;
  /** Allocates the next reference-number sequence and id, then stores the request `build` returns. */
  abstract create(build: (seq: number, id: string) => ServiceRequest): Observable<ServiceRequest>;
  abstract save(request: ServiceRequest): Observable<ServiceRequest>;
  /** System job (SLA monitor): applies `fn` to every request, bypassing user scope. Returns the changed ones. */
  abstract sweep(fn: (request: ServiceRequest) => ServiceRequest | null): Observable<ServiceRequest[]>;
  /**
   * System query for cross-request rules (bus availability, event auto-close): runs `fn` over every request,
   * bypassing user scope. `fn` must return only data that is safe to show everyone (no requester or free text).
   */
  abstract inspect<T>(fn: (requests: readonly ServiceRequest[]) => T): Observable<T>;
}

/** Stock movements. Every change goes through `apply`, which keeps item stock and the movement log in step. */
export abstract class WarehouseRepository {
  /** Newest first. */
  abstract movements(): Observable<StockMovement[]>;
  /** Applies all changes or none: errors when an item would drop below zero or does not exist. */
  abstract apply(changes: readonly StockChange[], by: { id: string | null; name: string }, at: string): Observable<void>;
}

export abstract class NotificationRepository {
  /** The signed-in user's notifications, newest first. */
  abstract listMine(): Observable<AppNotification[]>;
  abstract add(notifications: Array<Omit<AppNotification, 'id'>>): Observable<void>;
  abstract markRead(ids: readonly string[]): Observable<void>;
  abstract markAllRead(): Observable<void>;
  /** Demo feed of simulated channel deliveries across the system, newest first. */
  abstract channelLog(limit: number): Observable<AppNotification[]>;
}

export abstract class AuditRepository {
  abstract add(entries: Array<Omit<AuditEntry, 'id'>>): Observable<void>;
  /** Requires `admin.audit`. */
  abstract list(): Observable<AuditEntry[]>;
}

export abstract class SettingsRepository {
  abstract get(): Observable<PlatformSettings>;
  abstract save(settings: PlatformSettings): Observable<PlatformSettings>;
}

/**
 * Synchronous people lookups the workflow engine needs (who to notify, who can be assigned).
 * In a real deployment this is server-side knowledge; the mock reads the in-browser database.
 */
export abstract class Directory {
  /** Active users holding `permissionKey` for this record. */
  abstract usersWith(permissionKey: string, resource: ScopedResource): string[];
  abstract roleUsers(roleId: string): string[];
  abstract userName(userId: string): string;
  /** Users who can execute the request (candidates for assignment). */
  abstract assignableUsers(resource: ScopedResource): User[];
}
