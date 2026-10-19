import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { EXECUTION_KEY, ExecutionData } from '../../domain/models/execution';
import { FULFILMENT_KEY, Fulfilment, FulfilmentPlan, StockChange, StockMovement } from '../../domain/models/procurement';
import { WarehouseItem } from '../../domain/models/reference';
import { ServiceRequest } from '../../domain/models/request';
import { AuditRepository, ReferenceRepository, WarehouseRepository } from '../../domain/repositories';
import { WorkflowError } from '../../domain/workflows/engine';
import { ItemQty, planFulfilment } from '../../domain/warehouse/fulfilment';
import { AuthService } from '../auth/auth.service';
import { Clock } from '../clock.service';
import { DataVersion } from '../data-version';
import { PermissionService } from '../rbac/permission.service';
import { RequestService } from '../requests/request.service';

/** Result of a stock check that was acted on. */
export interface FulfilmentOutcome {
  plan: FulfilmentPlan;
  /** Reference of the purchase request raised for the shortages, if any. */
  purchaseRef?: string;
}

/**
 * Warehouse operations: stock checks for maintenance parts and warehouse needs (issue what is there, raise a
 * linked purchase for what is not), manual stock-in and stock counts. Stock is only ever changed through
 * `WarehouseRepository.apply`, so item stock and the movement log never drift apart.
 */
@Injectable({ providedIn: 'root' })
export class WarehouseService {
  private readonly requests = inject(RequestService);
  private readonly repo = inject(WarehouseRepository);
  private readonly reference = inject(ReferenceRepository);
  private readonly audit = inject(AuditRepository);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly clock = inject(Clock);
  private readonly version = inject(DataVersion);

  items(): Observable<WarehouseItem[]> {
    return this.reference.items();
  }

  movements(): Observable<StockMovement[]> {
    return this.repo.movements();
  }

  /** The lines of a maintenance request that still have to be checked against stock. */
  pendingPartLines(request: ServiceRequest): ItemQty[] {
    const execution = request.details[EXECUTION_KEY] as ExecutionData | undefined;
    const done = request.details[FULFILMENT_KEY] as Fulfilment | undefined;
    const handled = new Set([...(done?.issued ?? []), ...(done?.awaiting ?? [])].map((l) => l.itemId));
    return (execution?.parts ?? [])
      .filter((p) => p.itemId && p.source === 'stock' && !handled.has(p.itemId))
      .map((p) => ({ itemId: p.itemId!, qty: p.qty }));
  }

  /** Warehouse need: issue the lines the stock covers; a purchase is raised for the rest and the need waits for it. */
  fulfilNeed(request: ServiceRequest): Observable<FulfilmentOutcome> {
    const lines = ((request.details['items'] as ItemQty[] | undefined) ?? []).map((l) => ({ itemId: l.itemId, qty: Number(l.qty) }));
    return this.fulfil(request, lines, 'issue_items');
  }

  /** Maintenance: check the flagged parts against stock, issue available ones, hold the request for the missing ones. */
  requestParts(request: ServiceRequest): Observable<FulfilmentOutcome> {
    const lines = this.pendingPartLines(request);
    if (!lines.length) return throwError(() => new WorkflowError('أضف قطعة من المستودع إلى جدول القطع واحفظ بيانات التنفيذ أولًا.'));
    return this.fulfil(request, lines, 'request_parts');
  }

  stockIn(itemId: string, qty: number, noteAr: string): Observable<void> {
    if (!this.permissions.can('warehouse.stockin')) return throwError(() => new WorkflowError('ليست لديك صلاحية إدخال المخزون.'));
    if (!(qty > 0)) return throwError(() => new WorkflowError('أدخل كمية صحيحة.'));
    return this.write([{ itemId, kind: 'in', delta: qty, noteAr: noteAr.trim() || 'إدخال مخزون' }], 'إدخال مخزون');
  }

  /** Applies a stock count: the system stock of every counted item becomes the counted quantity. */
  count(counted: ReadonlyArray<{ itemId: string; counted: number; system: number }>, noteAr: string): Observable<number> {
    if (!this.permissions.can('warehouse.audit')) return throwError(() => new WorkflowError('ليست لديك صلاحية الجرد.'));
    const changes: StockChange[] = counted
      .filter((c) => Number.isFinite(c.counted) && c.counted >= 0 && c.counted !== c.system)
      .map((c) => ({ itemId: c.itemId, kind: 'adjust', delta: c.counted - c.system, noteAr: noteAr.trim() || 'تسوية جرد' }));
    if (!changes.length) return of(0);
    return this.write(changes, 'تسوية جرد').pipe(map(() => changes.length));
  }

  private fulfil(request: ServiceRequest, lines: ItemQty[], action: 'issue_items' | 'request_parts'): Observable<FulfilmentOutcome> {
    const user = this.auth.currentUser();
    return this.items().pipe(
      map((items) => planFulfilment(items, lines)),
      switchMap((plan) =>
        this.requests.perform(request.id, action, { fulfilment: plan }).pipe(
          // The engine accepted the action: now the stock moves.
          switchMap((saved) =>
            this.repo
              .apply(
                plan.issued.map((l) => ({ itemId: l.itemId, kind: 'issue' as const, delta: -l.qty, requestId: saved.id, requestRef: saved.refNo, noteAr: 'صرف للطلب' })),
                { id: user?.id ?? null, name: user?.nameAr ?? 'النظام' },
                this.clock.nowIso(),
              )
              .pipe(map(() => saved)),
          ),
          switchMap((saved) =>
            plan.shortages.length
              ? this.requests.createLinkedPurchase(saved, plan.shortages).pipe(map((purchase): FulfilmentOutcome => ({ plan, purchaseRef: purchase.refNo })))
              : of<FulfilmentOutcome>({ plan }),
          ),
          tap(() => this.version.bump()),
        ),
      ),
    );
  }

  private write(changes: StockChange[], actionAr: string): Observable<void> {
    const user = this.auth.currentUser();
    return forkJoin([this.repo.apply(changes, { id: user?.id ?? null, name: user?.nameAr ?? 'النظام' }, this.clock.nowIso())]).pipe(
      switchMap(() =>
        this.audit.add([
          {
            at: this.clock.nowIso(),
            actorId: user?.id ?? null,
            actorName: user?.nameAr ?? 'النظام',
            actionAr,
            entityType: 'reference',
            entityId: 'warehouse',
            summaryAr: `المستودع — ${actionAr} (${changes.length} صنف)`,
          },
        ]),
      ),
      tap(() => this.version.bump()),
    );
  }
}
