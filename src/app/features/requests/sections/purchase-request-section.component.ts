import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { SettingsStore } from '../../../core/settings-store';
import { Directory } from '../../../domain/repositories';
import { DEPARTMENTS } from '../../../domain/reference-data';
import { buildApprovalChain } from '../../../domain/workflows/approval-chain';
import { MoneyPipe } from '../../../shared/pipes/format';
import { ItemRowGroup, ItemsTableComponent, itemsTotal, newItemRow } from './items-table.component';
import { ServiceSectionBase } from './section-base';

/** Purchase request: requesting party, delivery location, items table with running total, justification and delay impact. */
@Component({
  selector: 'app-purchase-request-section',
  imports: [ReactiveFormsModule, ItemsTableComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">بيانات الشراء</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label" for="pr-party">الجهة الطالبة <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="pr-party" class="form-control" formControlName="requestingParty" [class.is-invalid]="bad('requestingParty')" />
            <div class="invalid-feedback">حدد الجهة الطالبة.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="pr-manager">مدير القسم</label>
            <input id="pr-manager" class="form-control" formControlName="deptManagerName" readonly />
          </div>
          <div class="col-12">
            <label class="form-label" for="pr-delivery">موقع التسليم <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="pr-delivery" class="form-control" formControlName="deliveryLocation" [class.is-invalid]="bad('deliveryLocation')" />
            <div class="invalid-feedback">حدد موقع التسليم.</div>
          </div>
          <div class="col-12">
            <h3 class="h6">جدول الأصناف <span class="text-danger" aria-hidden="true">*</span></h3>
            <app-items-table [rows]="items" [submitted]="submitted()" />
          </div>
          <div class="col-md-6">
            <label class="form-label" for="pr-just">مبررات الحاجة <span class="text-danger" aria-hidden="true">*</span></label>
            <textarea id="pr-just" class="form-control" rows="3" formControlName="justification" [class.is-invalid]="bad('justification')"></textarea>
            <div class="invalid-feedback">اذكر مبررات الحاجة.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="pr-delay">الأثر عند التأخير <span class="text-danger" aria-hidden="true">*</span></label>
            <textarea id="pr-delay" class="form-control" rows="3" formControlName="delayImpact" [class.is-invalid]="bad('delayImpact')"></textarea>
            <div class="invalid-feedback">اذكر الأثر المتوقع عند التأخير.</div>
          </div>
        </div>
        <div class="alert alert-info mt-3 mb-0 small" role="status">
          <i class="bi bi-diagram-3 me-1" aria-hidden="true"></i>
          الإجمالي التقديري <strong>{{ total() | money }}</strong> — مسار الاعتماد:
          @for (step of chain(); track step.id; let last = $last) {
            <strong>{{ step.labelAr }}</strong>{{ last ? '' : '، ثم ' }}
          }
        </div>
      </div>
    </section>
  `,
})
export class PurchaseRequestSectionComponent extends ServiceSectionBase {
  private readonly auth = inject(AuthService);
  private readonly directory = inject(Directory);
  private readonly settings = inject(SettingsStore);

  protected readonly items = new FormArray<ItemRowGroup>([newItemRow()], [Validators.minLength(1)]);
  private readonly rows = toSignal(this.items.valueChanges.pipe(startWith(this.items.getRawValue())), { initialValue: this.items.getRawValue() });
  protected readonly total = computed(() => itemsTotal(this.rows()));
  protected readonly chain = computed(() =>
    buildApprovalChain({ service: 'purchase-request', priority: 'normal', estimatedValue: this.total(), details: {} }, this.settings.settings().approvalLimits),
  );

  protected build(): Record<string, AbstractControl> {
    const user = this.auth.currentUser();
    const party = DEPARTMENTS.find((d) => d.id === user?.departmentId)?.nameAr ?? '';
    const manager = user
      ? this.directory.usersWith('request.approve.department', { branchId: user.branchId, departmentId: user.departmentId, service: 'purchase-request' })[0]
      : undefined;
    const required = [Validators.required];
    return {
      requestingParty: new FormControl(party, { nonNullable: true, validators: required }),
      deptManagerName: new FormControl(manager ? this.directory.userName(manager) : 'مدير القسم', { nonNullable: true }),
      deliveryLocation: new FormControl('', { nonNullable: true, validators: required }),
      items: this.items,
      justification: new FormControl('', { nonNullable: true, validators: required }),
      delayImpact: new FormControl('', { nonNullable: true, validators: required }),
    };
  }
}
