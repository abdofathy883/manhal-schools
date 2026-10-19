import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PermissionService } from '../../core/rbac/permission.service';
import { RequestService } from '../../core/requests/request.service';
import { ToastService } from '../../core/notifications/toast.service';
import { WarehouseService } from '../../core/warehouse/warehouse.service';
import { FULFILMENT_KEY, Fulfilment } from '../../domain/models/procurement';
import { stockLevel } from '../../domain/warehouse/fulfilment';
import {
  ASSET_CONDITION_LABELS,
  AssetCondition,
  CLOSURE_KEY,
  ClosureData,
  ClosureDecision,
  DECISION_LABELS,
  EXECUTION_KEY,
  ExecutionData,
  ExecutionMethod,
  LABOUR_RATE,
  METHOD_LABELS,
  PART_SOURCE_LABELS,
  PartSource,
  REQUEST_CATEGORY_OPTIONS,
} from '../../domain/models/execution';
import { ServiceRequest } from '../../domain/models/request';
import { ReferenceRepository } from '../../domain/repositories';
import { ArDatePipe, MoneyPipe } from '../../shared/pipes/format';

type PartGroup = FormGroup<{
  itemId: FormControl<string>;
  description: FormControl<string>;
  partNo: FormControl<string>;
  qty: FormControl<number>;
  source: FormControl<PartSource>;
  cost: FormControl<number>;
}>;

const newPart = (): PartGroup =>
  new FormGroup({
    itemId: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    partNo: new FormControl('', { nonNullable: true }),
    qty: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    source: new FormControl<PartSource>('stock', { nonNullable: true }),
    cost: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
  });

/** `datetime-local` value (yyyy-MM-ddTHH:mm) from an ISO string, in local time. */
const toLocalInput = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value: string): string | undefined => (value ? new Date(value).toISOString() : undefined);

/**
 * Executor-only stages of a building-maintenance request: classification, inspection and diagnosis,
 * parts, work performed, test result, time and cost; then the closing stage (requester result,
 * maintenance lead's decision, asset condition after closure).
 */
@Component({
  selector: 'app-executor-stages',
  imports: [ReactiveFormsModule, MoneyPipe, ArDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './executor-stages.component.html',
})
export class ExecutorStagesComponent {
  private readonly requests = inject(RequestService);
  private readonly permissions = inject(PermissionService);
  private readonly reference = inject(ReferenceRepository);
  private readonly toasts = inject(ToastService);
  private readonly warehouse = inject(WarehouseService);

  readonly request = input.required<ServiceRequest>();

  protected readonly categories = REQUEST_CATEGORY_OPTIONS;
  protected readonly methods = (Object.keys(METHOD_LABELS) as ExecutionMethod[]).map((k) => ({ key: k, label: METHOD_LABELS[k] }));
  protected readonly sources = (Object.keys(PART_SOURCE_LABELS) as PartSource[]).map((k) => ({ key: k, label: PART_SOURCE_LABELS[k] }));
  protected readonly decisions = (Object.keys(DECISION_LABELS) as ClosureDecision[]).map((k) => ({ key: k, label: DECISION_LABELS[k] }));
  protected readonly conditions = (Object.keys(ASSET_CONDITION_LABELS) as AssetCondition[]).map((k) => ({ key: k, label: ASSET_CONDITION_LABELS[k] }));
  protected readonly decisionLabels = DECISION_LABELS;
  protected readonly conditionLabels = ASSET_CONDITION_LABELS;
  protected readonly outcomeLabels = {
    accepted: 'مقبول ويعمل بصورة سليمة',
    accepted_with_note: 'مقبول مع ملاحظة',
    rejected: 'غير مقبول',
  } as const;
  protected readonly labourRate = LABOUR_RATE;

  protected readonly lists = rxResource({ stream: () => this.reference.lists() });
  protected readonly stock = rxResource({ stream: () => this.warehouse.items() });
  protected readonly stockLevel = stockLevel;
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);

  protected readonly form = new FormGroup({
    category: new FormControl('', { nonNullable: true }),
    specialtyId: new FormControl('', { nonNullable: true }),
    targetResponse: new FormControl('', { nonNullable: true }),
    method: new FormControl<ExecutionMethod | ''>('', { nonNullable: true }),
    inspResult: new FormControl('', { nonNullable: true }),
    inspCause: new FormControl('', { nonNullable: true }),
    inspPlan: new FormControl('', { nonNullable: true }),
    needsParts: new FormControl(false, { nonNullable: true }),
    parts: new FormArray<PartGroup>([]),
    workDone: new FormControl('', { nonNullable: true }),
    testResult: new FormControl('', { nonNullable: true }),
    startAt: new FormControl('', { nonNullable: true }),
    endAt: new FormControl('', { nonNullable: true }),
    downtimeHours: new FormControl<number | null>(null),
    labourHours: new FormControl<number | null>(null),
  });

  protected readonly closeForm = new FormGroup({
    decision: new FormControl<ClosureDecision | ''>('', { nonNullable: true, validators: [Validators.required] }),
    assetCondition: new FormControl<AssetCondition | ''>('', { nonNullable: true, validators: [Validators.required] }),
    followUpDate: new FormControl('', { nonNullable: true }),
  });

  protected readonly execution = computed(() => this.request().details[EXECUTION_KEY] as ExecutionData | undefined);
  protected readonly closure = computed(() => this.request().details[CLOSURE_KEY] as ClosureData | undefined);
  protected readonly fulfilment = computed(() => this.request().details[FULFILMENT_KEY] as Fulfilment | undefined);
  /** Part lines picked from the warehouse that have not been checked against stock yet. */
  protected readonly pendingParts = computed(() => this.warehouse.pendingPartLines(this.request()).length);
  protected readonly canCheckStock = computed(() => this.request().status === 'in_progress' && this.canEdit() && this.pendingParts() > 0);

  protected readonly canEdit = computed(() => {
    const r = this.request();
    return (
      (['approved', 'in_progress', 'on_hold'] as string[]).includes(r.status) &&
      this.permissions.can('request.execute', { branchId: r.branchId, departmentId: r.departmentId, createdBy: r.requesterId, assigneeId: r.assigneeId ?? null, service: r.service })
    );
  });
  protected readonly isClosingStage = computed(() => (['pending_confirmation', 'executed', 'closed'] as string[]).includes(this.request().status));
  protected readonly canClose = computed(() => {
    const r = this.request();
    return (
      this.isClosingStage() &&
      !this.closure() &&
      this.permissions.can('request.close', { branchId: r.branchId, departmentId: r.departmentId, createdBy: r.requesterId, assigneeId: r.assigneeId ?? null, service: r.service })
    );
  });

  constructor() {
    // Load the saved execution data into the form whenever the stored copy changes (and nothing is being edited).
    effect(() => {
      const data = this.execution();
      if (this.form.dirty) return;
      this.patch(data);
    });
  }

  protected get parts(): FormArray<PartGroup> {
    return this.form.controls.parts;
  }

  protected partsTotal(): number {
    return this.parts.getRawValue().reduce((sum, p) => sum + (Number(p.qty) || 0) * (Number(p.cost) || 0), 0);
  }

  protected labourTotal(): number {
    return (Number(this.form.controls.labourHours.value) || 0) * LABOUR_RATE;
  }

  protected specialtyName(id?: string): string {
    return this.lists.value()?.maintenanceSpecialties.find((s) => s.id === id)?.nameAr ?? '—';
  }

  /** Picking a warehouse item fills the line (description, part number, unit cost) and marks the source as stock. */
  protected pickItem(i: number, itemId: string): void {
    const item = (this.stock.value() ?? []).find((x) => x.id === itemId);
    const row = this.parts.at(i);
    row.controls.itemId.setValue(itemId);
    if (item) row.patchValue({ description: item.nameAr, partNo: item.code, cost: item.unitPrice, source: 'stock' });
    this.form.markAsDirty();
  }

  protected stockOf(itemId: string): { stock: number; unitAr: string; level: 'out' | 'low' | 'ok' } | null {
    const item = (this.stock.value() ?? []).find((x) => x.id === itemId);
    return item ? { stock: item.stock, unitAr: item.unitAr, level: stockLevel(item) } : null;
  }

  /** Checks the picked parts against stock: available ones are issued, missing ones hold the request and raise a linked purchase. */
  protected checkStock(): void {
    this.saving.set(true);
    this.warehouse.requestParts(this.request()).subscribe({
      next: ({ plan, purchaseRef }) => {
        this.saving.set(false);
        if (plan.shortages.length) {
          this.toasts.warning('الصنف غير متوفر — الطلب معلّق بانتظار القطعة', `أُنشئ طلب شراء مرتبط ${purchaseRef}، ويعود طلبك تلقائيًا إلى قيد التنفيذ عند الاستلام.`);
        } else {
          this.toasts.success('صُرفت القطع من المستودع', 'يمكنك متابعة التركيب والاختبار.');
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.requests.reportError(err, 'تعذر فحص المستودع');
      },
    });
  }

  protected addPart(): void {
    this.parts.push(newPart());
    this.form.markAsDirty();
  }

  protected removePart(i: number): void {
    this.parts.removeAt(i);
    this.form.markAsDirty();
  }

  protected badPart(c: FormControl<string | number>): boolean {
    return c.invalid && (c.touched || this.submitted());
  }

  protected saveExecution(): void {
    this.submitted.set(true);
    const v = this.form.getRawValue();
    const hasInspection = !!(v.inspResult.trim() || v.inspCause.trim() || v.inspPlan.trim());
    if (this.parts.invalid || (hasInspection && !(v.inspResult.trim() && v.inspCause.trim() && v.inspPlan.trim()))) {
      this.parts.markAllAsTouched();
      this.toasts.warning('أكمل البيانات المطلوبة', 'الفحص يتطلب النتيجة والسبب الجذري وخطة الإصلاح، وقطع الغيار تتطلب الوصف والكمية.');
      return;
    }
    const execution: ExecutionData = {
      category: v.category || undefined,
      specialtyId: v.specialtyId || undefined,
      targetResponse: v.targetResponse ? new Date(v.targetResponse).toISOString() : undefined,
      method: v.method || undefined,
      inspection: hasInspection
        ? { result: v.inspResult.trim(), rootCause: v.inspCause.trim(), repairPlan: v.inspPlan.trim(), needsParts: v.needsParts }
        : undefined,
      parts: v.parts.map((p) => ({
        ...(p.itemId ? { itemId: p.itemId } : {}),
        description: p.description.trim(),
        partNo: p.partNo.trim(),
        qty: Number(p.qty),
        source: p.source,
        cost: Number(p.cost),
      })),
      workDone: v.workDone.trim() || undefined,
      testResult: v.testResult.trim() || undefined,
      startAt: fromLocalInput(v.startAt),
      endAt: fromLocalInput(v.endAt),
      downtimeHours: v.downtimeHours ?? undefined,
      labourHours: v.labourHours ?? undefined,
    };
    this.saving.set(true);
    this.requests.perform(this.request().id, 'save_execution', { execution }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.toasts.success('تم حفظ بيانات التنفيذ');
      },
      error: (err) => {
        this.saving.set(false);
        this.requests.reportError(err, 'تعذر حفظ بيانات التنفيذ');
      },
    });
  }

  protected saveClosure(): void {
    if (this.closeForm.invalid) {
      this.closeForm.markAllAsTouched();
      return;
    }
    const v = this.closeForm.getRawValue();
    this.saving.set(true);
    this.requests
      .perform(this.request().id, 'record_closure', {
        closure: { decision: v.decision as ClosureDecision, assetCondition: v.assetCondition as AssetCondition, followUpDate: v.followUpDate || undefined },
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toasts.success('تم تسجيل قرار الإغلاق');
        },
        error: (err) => {
          this.saving.set(false);
          this.requests.reportError(err, 'تعذر تسجيل القرار');
        },
      });
  }

  private patch(data: ExecutionData | undefined): void {
    this.parts.clear();
    for (const p of data?.parts ?? []) {
      const g = newPart();
      g.setValue({ itemId: p.itemId ?? '', description: p.description, partNo: p.partNo, qty: p.qty, source: p.source, cost: p.cost });
      this.parts.push(g);
    }
    this.form.patchValue(
      {
        category: data?.category ?? '',
        specialtyId: data?.specialtyId ?? '',
        targetResponse: toLocalInput(data?.targetResponse),
        method: data?.method ?? '',
        inspResult: data?.inspection?.result ?? '',
        inspCause: data?.inspection?.rootCause ?? '',
        inspPlan: data?.inspection?.repairPlan ?? '',
        needsParts: data?.inspection?.needsParts ?? false,
        workDone: data?.workDone ?? '',
        testResult: data?.testResult ?? '',
        startAt: toLocalInput(data?.startAt),
        endAt: toLocalInput(data?.endAt),
        downtimeHours: data?.downtimeHours ?? null,
        labourHours: data?.labourHours ?? null,
      },
      { emitEvent: false },
    );
  }
}
