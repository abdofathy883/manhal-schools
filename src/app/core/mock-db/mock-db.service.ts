import { Injectable, computed, signal } from '@angular/core';
import { AppNotification, AuditEntry, DEFAULT_SETTINGS, PlatformSettings } from '../../domain/models/platform';
import { Driver, RefLists, Supplier, Vehicle, WarehouseItem } from '../../domain/models/reference';
import { StockMovement } from '../../domain/models/procurement';
import { ServiceRequest } from '../../domain/models/request';
import { buildSeedRequests } from '../../domain/seed/requests.seed';
import { Role, User } from '../../domain/models/rbac';
import { DEFAULT_REF_LISTS } from '../../domain/reference-data';
import { SEED_ROLES } from '../../domain/seed/roles.seed';
import { SEED_USERS } from '../../domain/seed/users.seed';
import {
  SEED_DRIVERS,
  SEED_SUPPLIERS,
  SEED_VEHICLES,
  seedBlockedDays,
} from '../../domain/seed/reference.seed';

/** Bump when the seed shape changes; an old key is discarded and re-seeded. */
export const DB_VERSION = 4;
export const DB_STORAGE_KEY = `manhal:v${DB_VERSION}`;

/** Everything the mock backend persists. Later phases add collections here (requests, bookings, ...). */
export interface DbState {
  version: number;
  users: User[];
  roles: Role[];
  vehicles: Vehicle[];
  drivers: Driver[];
  items: WarehouseItem[];
  suppliers: Supplier[];
  refLists: RefLists;
  requests: ServiceRequest[];
  notifications: AppNotification[];
  audit: AuditEntry[];
  stockMovements: StockMovement[];
  settings: PlatformSettings;
  /** Next free reference-number sequence (MNH-yyyy-NNNNNN). */
  refSeq: number;
}

function createSeed(): DbState {
  const now = new Date();
  const seeded = buildSeedRequests(now);
  return structuredClone({
    version: DB_VERSION,
    users: [...SEED_USERS],
    roles: [...SEED_ROLES],
    vehicles: [...SEED_VEHICLES],
    drivers: [...SEED_DRIVERS],
    items: seeded.items,
    suppliers: [...SEED_SUPPLIERS],
    refLists: { ...DEFAULT_REF_LISTS, blockedDays: seedBlockedDays(now) },
    requests: seeded.requests,
    notifications: seeded.notifications,
    audit: seeded.audit,
    stockMovements: seeded.stockMovements,
    settings: DEFAULT_SETTINGS,
    refSeq: seeded.refSeq,
  });
}

function readStored(): DbState | null {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DbState;
    return parsed.version === DB_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * In-memory + localStorage backed store. Repositories read slices through `select()`
 * and write through `update()`; every write is persisted. `reset()` re-seeds deterministically.
 */
@Injectable({ providedIn: 'root' })
export class MockDb {
  private readonly _state = signal<DbState>(readStored() ?? createSeed());

  readonly state = this._state.asReadonly();
  readonly users = computed(() => this._state().users);
  readonly roles = computed(() => this._state().roles);

  constructor() {
    this.persist();
  }

  update(mutator: (draft: DbState) => void): void {
    const next = structuredClone(this._state());
    mutator(next);
    this._state.set(next);
    this.persist();
  }

  reset(): void {
    this._state.set(createSeed());
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(this._state()));
    } catch {
      // Storage may be unavailable (private mode / quota); the in-memory state still works.
    }
  }
}
