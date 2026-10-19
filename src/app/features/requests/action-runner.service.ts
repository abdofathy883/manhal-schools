import { Injectable, inject } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal';
import { firstValueFrom } from 'rxjs';
import { BookingService } from '../../core/bookings/booking.service';
import { ToastService } from '../../core/notifications/toast.service';
import { WarehouseService } from '../../core/warehouse/warehouse.service';
import { PermissionService } from '../../core/rbac/permission.service';
import { RequestService } from '../../core/requests/request.service';
import { ServiceRequest } from '../../domain/models/request';
import { ActionDescriptor, ActionPayload } from '../../domain/workflows/engine';
import type { BusSlot } from '../../domain/bookings/booking-rules';
import { ActionDialogComponent } from './action-dialog.component';

/**
 * Runs an engine action on behalf of any screen (detail page, approvals inbox, workbench):
 * opens the input dialog when the action needs one, performs it, and reports the outcome in Arabic.
 */
@Injectable({ providedIn: 'root' })
export class ActionRunner {
  private readonly modals = inject(NgbModal);
  private readonly requests = inject(RequestService);
  private readonly permissions = inject(PermissionService);
  private readonly toasts = inject(ToastService);
  private readonly bookings = inject(BookingService);
  private readonly warehouse = inject(WarehouseService);

  /** Resolves `true` when the action was performed, `false` if cancelled or rejected by a rule. */
  async run(request: ServiceRequest, action: ActionDescriptor, preset: ActionPayload = {}): Promise<boolean> {
    if (!action.enabled) return false;
    if (action.key === 'allocate') return this.allocate(request, action);
    if (action.key === 'issue_items') return this.issueItems(request);
    let payload: ActionPayload = preset;

    if (action.dialog !== 'none') {
      const ref = this.modals.open(ActionDialogComponent, { centered: true });
      (ref.componentInstance as ActionDialogComponent).init(action, this.requests.assignees(request), this.permissions.can('request.rate'));
      try {
        payload = { ...preset, ...((await ref.result) as ActionPayload) };
      } catch {
        return false; // dismissed
      }
    }

    try {
      await firstValueFrom(this.requests.perform(request.id, action.key, payload));
      this.toasts.success(`تم تنفيذ الإجراء: ${action.labelAr}`);
      return true;
    } catch (err) {
      this.requests.reportError(err);
      return false;
    }
  }

  /** Issues a warehouse need from stock; whatever is missing becomes a linked purchase request. */
  private async issueItems(request: ServiceRequest): Promise<boolean> {
    try {
      const { plan, purchaseRef } = await firstValueFrom(this.warehouse.fulfilNeed(request));
      if (plan.shortages.length) {
        this.toasts.warning('صُرف المتوفر وأُنشئ طلب شراء للعجز', `${purchaseRef} — يعود الطلب تلقائيًا عند استلام التوريد.`);
      } else {
        this.toasts.success('تم صرف الأصناف من المستودع');
      }
      return true;
    } catch (err) {
      this.requests.reportError(err, 'تعذر الصرف من المستودع');
      return false;
    }
  }

  /** Bus + driver allocation has its own dialog and goes through the booking rules (conflict checks). */
  private async allocate(request: ServiceRequest, action: ActionDescriptor): Promise<boolean> {
    const { AllocateBusDialogComponent } = await import('../transport/allocate-bus-dialog.component');
    const ref = this.modals.open(AllocateBusDialogComponent, { centered: true, size: 'lg' });
    (ref.componentInstance as InstanceType<typeof AllocateBusDialogComponent>).init(request);
    let slots: BusSlot[];
    try {
      slots = (await ref.result) as BusSlot[];
    } catch {
      return false; // dismissed
    }
    try {
      await firstValueFrom(this.bookings.allocate(request, slots));
      this.toasts.success(`تم تنفيذ الإجراء: ${action.labelAr}`);
      return true;
    } catch (err) {
      this.requests.reportError(err);
      return false;
    }
  }
}
