import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { PermissionService } from '../../core/rbac/permission.service';
import { RequestService } from '../../core/requests/request.service';
import { SettingsStore } from '../../core/settings-store';
import { FOR_LINES_KEY, PROCUREMENT_KEY, ProcurementData, Quote, RECEIPT_CONDITION_LABELS, ReceiptCondition } from '../../domain/models/procurement';
import { ServiceRequest } from '../../domain/models/request';
import { ReferenceRepository } from '../../domain/repositories';
import { MIN_QUOTES, quotesReady, quotesRequired } from '../../domain/workflows/engine';
import { ArDateTimePipe, MoneyPipe } from '../../shared/pipes/format';

type QuoteGroup = FormGroup<{ supplierId: FormControl<string>; amount: FormControl<number | null>; deliveryDays: FormControl<number | null>; noteAr: FormControl<string> }>;

const newQuote = (): QuoteGroup =>
  new FormGroup({
    supplierId: new FormControl('', { nonNullable: true }),
    amount: new FormControl<number | null>(null),
    deliveryDays: new FormControl<number | null>(null),
    noteAr: new FormControl('', { nonNullable: true }),
  });

/**
 * Procurement stages of a purchase request: quotes comparison (3 suppliers), purchase order, and the
 * receipt + custody acknowledgement that only the receiver sees.
 */
@Component({
  selector: 'app-procurement-panel',
  imports: [ReactiveFormsModule, ArDateTimePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <section class="card mb-4">
        <div class="card-header"><i class="bi bi-cart-check me-2" aria-hidden="true"></i>مراحل التوريد</div>
        <div class="card-body">
          @if (forLines()) {
            <div class="alert alert-info small" role="note"><i class="bi bi-diagram-3 me-1" aria-hidden="true"></i>هذا الطلب يوفّر أصنافًا للمستودع لطلب آخر: عند الاستلام تُضاف الأصناف للمخزون وتُصرف للطلب الأصلي ويعود للتنفيذ تلقائيًا.</div>
          }

          <h3 class="h6 text-info-emphasis">1) مقارنة عروض الأسعار</h3>
          @if (quotesNeeded()) {
            <p class="small text-muted-ar">القيمة التقديرية تتجاوز {{ limit() | money }}: يلزم تسجيل {{ minQuotes }} عروض واختيار أحدها قبل إصدار أمر التوريد.</p>
          } @else {
            <p class="small text-muted-ar">مقارنة العروض اختيارية لهذه القيمة (حتى {{ limit() | money }}).</p>
          }

          @if (canEditQuotes()) {
            <form [formGroup]="quoteForm" (submit)="$event.preventDefault(); saveQuotes()" novalidate>
              <div class="table-responsive">
                <table class="table table-sm align-middle">
                  <caption class="visually-hidden">عروض الأسعار</caption>
                  <thead>
                    <tr>
                      <th scope="col" style="inline-size: 3rem">اختيار</th>
                      <th scope="col">المورد</th>
                      <th scope="col" style="inline-size: 9rem">المبلغ (ر.س)</th>
                      <th scope="col" style="inline-size: 8rem">مدة التوريد (يوم)</th>
                      <th scope="col">ملاحظة</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of quoteRows.controls; track row; let i = $index) {
                      <tr [formGroup]="row">
                        <td><input type="radio" class="form-check-input" name="pp-pick" [checked]="pick() === i" (change)="pick.set(i)" [attr.aria-label]="'اختيار العرض ' + (i + 1)" /></td>
                        <td>
                          <select class="form-select form-select-sm" formControlName="supplierId" [attr.aria-label]="'المورد ' + (i + 1)">
                            <option value="">اختر المورد</option>
                            @for (s of suppliers.value() ?? []; track s.id) {
                              <option [value]="s.id" [disabled]="usedElsewhere(i, s.id)">{{ s.nameAr }}</option>
                            }
                          </select>
                        </td>
                        <td><input type="number" min="1" class="form-control form-control-sm ltr text-start" formControlName="amount" [attr.aria-label]="'المبلغ ' + (i + 1)" /></td>
                        <td><input type="number" min="0" class="form-control form-control-sm ltr text-start" formControlName="deliveryDays" [attr.aria-label]="'مدة التوريد ' + (i + 1)" /></td>
                        <td><input class="form-control form-control-sm" formControlName="noteAr" [attr.aria-label]="'ملاحظة ' + (i + 1)" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <button type="submit" class="btn btn-outline-primary btn-sm" [disabled]="busy()"><i class="bi bi-save me-1" aria-hidden="true"></i>حفظ العروض والمقارنة</button>
            </form>
          } @else if (data().quotes?.length) {
            <div class="table-responsive">
              <table class="table table-sm align-middle">
                <caption class="visually-hidden">مقارنة العروض</caption>
                <thead><tr><th scope="col">المورد</th><th scope="col">المبلغ</th><th scope="col">مدة التوريد</th><th scope="col"><span class="visually-hidden">الحالة</span></th></tr></thead>
                <tbody>
                  @for (q of data().quotes; track q.id) {
                    <tr [class.table-success]="q.id === data().selectedQuoteId">
                      <td>{{ q.supplierName }}</td>
                      <td>{{ q.amount | money }}</td>
                      <td><span class="ltr-inline">{{ q.deliveryDays }}</span> يومًا</td>
                      <td>
                        @if (q.id === data().selectedQuoteId) { <span class="badge bg-success-subtle text-success-emphasis">المختار</span> }
                        @if (q.id === lowest()) { <span class="badge bg-info-subtle text-info-emphasis ms-1">الأقل سعرًا</span> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="text-muted-ar">لم تُسجَّل عروض أسعار.</p>
          }
          @if (data().quotes?.length && canEditQuotes()) {
            <div class="small text-muted-ar mt-2">الأقل سعرًا حاليًا: {{ lowestName() }}</div>
          }

          <hr />
          <h3 class="h6 text-info-emphasis">2) أمر التوريد</h3>
          @if (data().po; as po) {
            <dl class="row mb-0 small">
              <dt class="col-sm-3 fw-normal text-muted-ar">رقم الأمر</dt><dd class="col-sm-9 fw-semibold"><span class="ltr-inline">{{ po.no }}</span></dd>
              <dt class="col-sm-3 fw-normal text-muted-ar">المورد</dt><dd class="col-sm-9 fw-semibold">{{ po.supplierName }}</dd>
              <dt class="col-sm-3 fw-normal text-muted-ar">المبلغ</dt><dd class="col-sm-9 fw-semibold">{{ po.amount | money }}</dd>
              <dt class="col-sm-3 fw-normal text-muted-ar">أصدره</dt><dd class="col-sm-9">{{ po.byName }} — <span class="ltr-inline">{{ po.issuedAt | arDateTime }}</span></dd>
            </dl>
          } @else if (canIssuePo()) {
            @if (poBlocked(); as reason) {
              <div class="alert alert-warning small" role="status">{{ reason }}</div>
            }
            <form [formGroup]="poForm" class="row g-2 align-items-end" (submit)="$event.preventDefault(); issuePo()" novalidate>
              <div class="col-md-6">
                <label class="form-label" for="pp-po-supplier">المورد</label>
                <select id="pp-po-supplier" class="form-select" formControlName="supplierId">
                  <option value="">اختر المورد</option>
                  @for (s of suppliers.value() ?? []; track s.id) {
                    <option [value]="s.id">{{ s.nameAr }}</option>
                  }
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label" for="pp-po-amount">المبلغ (ر.س)</label>
                <input id="pp-po-amount" type="number" min="1" class="form-control ltr text-start" formControlName="amount" />
              </div>
              <div class="col-md-3">
                <button type="submit" class="btn btn-primary w-100" [disabled]="busy() || !!poBlocked()"><i class="bi bi-file-earmark-text me-1" aria-hidden="true"></i>إصدار أمر التوريد</button>
              </div>
            </form>
          } @else {
            <p class="text-muted-ar mb-0">لم يصدر أمر التوريد بعد.</p>
          }

          @if (canSeeReceipt()) {
            <hr />
            <h3 class="h6 text-info-emphasis">3) الاستلام والعهدة</h3>
            @if (data().receipt; as rc) {
              <dl class="row mb-0 small">
                <dt class="col-sm-3 fw-normal text-muted-ar">حالة الاستلام</dt><dd class="col-sm-9 fw-semibold">{{ conditionLabels[rc.condition] }}</dd>
                <dt class="col-sm-3 fw-normal text-muted-ar">المستلم</dt><dd class="col-sm-9 fw-semibold">{{ rc.receiverName }}</dd>
                <dt class="col-sm-3 fw-normal text-muted-ar">تاريخ الاستلام</dt><dd class="col-sm-9"><span class="ltr-inline">{{ rc.receivedAt | arDateTime }}</span></dd>
                <dt class="col-sm-3 fw-normal text-muted-ar">إقرار العهدة</dt><dd class="col-sm-9"><i class="bi bi-check-circle-fill text-success me-1" aria-hidden="true"></i>تم الإقرار</dd>
                @if (rc.noteAr) { <dt class="col-sm-3 fw-normal text-muted-ar">ملاحظات</dt><dd class="col-sm-9">{{ rc.noteAr }}</dd> }
              </dl>
            } @else if (canReceive()) {
              <form [formGroup]="receiptForm" class="row g-3" (submit)="$event.preventDefault(); receive()" novalidate>
                <div class="col-md-4">
                  <label class="form-label" for="pp-rc-cond">حالة الاستلام</label>
                  <select id="pp-rc-cond" class="form-select" formControlName="condition">
                    @for (c of conditions; track c.key) { <option [value]="c.key">{{ c.label }}</option> }
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label" for="pp-rc-name">اسم المستلم</label>
                  <input id="pp-rc-name" class="form-control" [value]="receiver()" readonly />
                </div>
                <div class="col-md-4">
                  <label class="form-label" for="pp-rc-date">تاريخ الاستلام</label>
                  <input id="pp-rc-date" class="form-control ltr text-start" [value]="today | arDateTime" readonly />
                </div>
                @if (receiptForm.controls.condition.value === 'with_notes') {
                  <div class="col-12">
                    <label class="form-label" for="pp-rc-note">ملاحظات الاستلام <span class="text-danger" aria-hidden="true">*</span></label>
                    <textarea id="pp-rc-note" class="form-control" rows="2" formControlName="noteAr" [class.is-invalid]="receiptForm.controls.noteAr.invalid && submitted()"></textarea>
                    <div class="invalid-feedback">اذكر الملاحظات.</div>
                  </div>
                }
                <div class="col-12">
                  <div class="form-check">
                    <input id="pp-rc-ack" class="form-check-input" type="checkbox" formControlName="custodyAck" [class.is-invalid]="receiptForm.controls.custodyAck.invalid && submitted()" />
                    <label class="form-check-label" for="pp-rc-ack">أُقرّ باستلام المواد المذكورة وبتحمّل مسؤولية العهدة عنها <span class="text-danger" aria-hidden="true">*</span></label>
                    <div class="invalid-feedback">إقرار العهدة مطلوب.</div>
                  </div>
                </div>
                <div class="col-12">
                  <button type="submit" class="btn btn-success" [disabled]="busy() || !data().po"><i class="bi bi-box2-heart me-1" aria-hidden="true"></i>تسجيل الاستلام</button>
                  @if (!data().po) { <span class="small text-muted-ar ms-2">أصدر أمر التوريد أولًا.</span> }
                </div>
              </form>
            } @else {
              <p class="text-muted-ar mb-0">لم يتم الاستلام بعد.</p>
            }
          }
        </div>
      </section>
    }
  `,
})
export class ProcurementPanelComponent {
  private readonly requests = inject(RequestService);
  private readonly permissions = inject(PermissionService);
  private readonly reference = inject(ReferenceRepository);
  private readonly settings = inject(SettingsStore);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);

  readonly request = input.required<ServiceRequest>();

  protected readonly minQuotes = MIN_QUOTES;
  protected readonly conditions = (Object.keys(RECEIPT_CONDITION_LABELS) as ReceiptCondition[]).map((key) => ({ key, label: RECEIPT_CONDITION_LABELS[key] }));
  protected readonly conditionLabels = RECEIPT_CONDITION_LABELS;
  protected readonly today = new Date().toISOString();
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly pick = signal<number | null>(null);
  protected readonly suppliers = rxResource({ stream: () => this.reference.suppliers() });

  protected readonly quoteRows = new FormArray<QuoteGroup>([newQuote(), newQuote(), newQuote()]);
  protected readonly quoteForm = new FormGroup({ rows: this.quoteRows });
  protected readonly poForm = new FormGroup({
    supplierId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1)] }),
  });
  protected readonly receiptForm = new FormGroup({
    condition: new FormControl<ReceiptCondition>('complete', { nonNullable: true }),
    noteAr: new FormControl('', { nonNullable: true }),
    custodyAck: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });

  protected readonly data = computed<ProcurementData>(() => (this.request().details[PROCUREMENT_KEY] as ProcurementData | undefined) ?? {});
  protected readonly forLines = computed(() => !!this.request().details[FOR_LINES_KEY]);
  protected readonly limit = computed(() => this.settings.settings().approvalLimits.departmentMax);
  protected readonly quotesNeeded = computed(() => quotesRequired(this.request(), this.settings.settings().approvalLimits));
  protected readonly receiver = computed(() => this.auth.currentUser()?.nameAr ?? '');

  private readonly working = computed(() => (['approved', 'in_progress'] as string[]).includes(this.request().status));
  protected readonly canEditQuotes = computed(() => this.working() && !this.data().po && this.permissions.can('purchasing.quote'));
  protected readonly canIssuePo = computed(() => this.working() && !this.data().po && this.permissions.can('purchasing.po'));
  protected readonly canReceive = computed(() => this.request().status === 'in_progress' && !!this.data().po && !this.data().receipt && (this.permissions.can('purchasing.receive') || this.permissions.can('warehouse.stockin')));
  /** The receipt section is for the receiver (and, once recorded, for anyone who sees the procurement data). */
  protected readonly canSeeReceipt = computed(() => this.permissions.can('purchasing.receive') || this.permissions.can('warehouse.stockin') || !!this.data().receipt);
  protected readonly visible = computed(
    () => this.request().service === 'purchase-request' && (Object.keys(this.data()).length > 0 || this.canEditQuotes() || this.canIssuePo()),
  );

  protected readonly lowest = computed(() => [...(this.data().quotes ?? [])].sort((a, b) => a.amount - b.amount)[0]?.id);
  protected readonly lowestName = computed(() => (this.data().quotes ?? []).find((q) => q.id === this.lowest())?.supplierName ?? '—');

  protected readonly poBlocked = computed<string | null>(() => {
    const r = this.request();
    if (this.quotesNeeded() && !quotesReady(r)) return `سجّل ${MIN_QUOTES} عروض واختر أحدها قبل إصدار أمر التوريد.`;
    return null;
  });

  constructor() {
    // Load saved quotes into the form (and default the PO to the selected quote).
    effect(() => {
      const d = this.data();
      const quotes = d.quotes ?? [];
      if (this.quoteForm.dirty) return;
      quotes.slice(0, 3).forEach((q, i) => this.quoteRows.at(i).setValue({ supplierId: q.supplierId, amount: q.amount, deliveryDays: q.deliveryDays, noteAr: q.noteAr ?? '' }, { emitEvent: false }));
      this.pick.set(quotes.length ? Math.max(0, quotes.findIndex((q) => q.id === d.selectedQuoteId)) : null);
      const chosen = quotes.find((q) => q.id === d.selectedQuoteId);
      if (chosen && !this.poForm.dirty) this.poForm.patchValue({ supplierId: chosen.supplierId, amount: chosen.amount }, { emitEvent: false });
    });
    effect(() => {
      const note = this.receiptForm.controls.noteAr;
      note.setValidators(this.receiptForm.controls.condition.value === 'with_notes' ? [Validators.required] : []);
    });
  }

  protected usedElsewhere(index: number, supplierId: string): boolean {
    return this.quoteRows.controls.some((g, i) => i !== index && g.controls.supplierId.value === supplierId);
  }

  protected saveQuotes(): void {
    const names = new Map((this.suppliers.value() ?? []).map((s) => [s.id, s.nameAr]));
    const filled = this.quoteRows.controls
      .map((g, i) => ({ g: g.getRawValue(), i }))
      .filter(({ g }) => g.supplierId || g.amount);
    const quotes: Quote[] = filled.map(({ g, i }) => ({
      id: `q-${i + 1}`,
      supplierId: g.supplierId,
      supplierName: names.get(g.supplierId) ?? '',
      amount: Number(g.amount),
      deliveryDays: Number(g.deliveryDays ?? 0),
      ...(g.noteAr.trim() ? { noteAr: g.noteAr.trim() } : {}),
    }));
    const pickedIndex = this.pick();
    const selected = pickedIndex !== null ? quotes.find((q) => q.id === `q-${pickedIndex + 1}`) : undefined;
    this.run('save_quotes', { quotes: { quotes, selectedId: selected?.id } }, 'تم حفظ عروض الأسعار', () => this.quoteForm.markAsPristine());
  }

  protected issuePo(): void {
    if (this.poForm.invalid) {
      this.poForm.markAllAsTouched();
      this.toasts.warning('أكمل بيانات أمر التوريد', 'اختر المورد وأدخل المبلغ.');
      return;
    }
    const v = this.poForm.getRawValue();
    const supplierName = (this.suppliers.value() ?? []).find((s) => s.id === v.supplierId)?.nameAr ?? '';
    this.run('issue_po', { po: { supplierId: v.supplierId, supplierName, amount: Number(v.amount) } }, 'تم إصدار أمر التوريد');
  }

  protected receive(): void {
    this.submitted.set(true);
    this.receiptForm.controls.noteAr.updateValueAndValidity();
    if (this.receiptForm.invalid) return;
    const v = this.receiptForm.getRawValue();
    this.run('receive_goods', { receipt: { condition: v.condition, custodyAck: v.custodyAck, noteAr: v.noteAr } }, 'تم تسجيل الاستلام والعهدة');
  }

  private run(action: 'save_quotes' | 'issue_po' | 'receive_goods', payload: Parameters<RequestService['perform']>[2], successAr: string, done?: () => void): void {
    this.busy.set(true);
    this.requests.perform(this.request().id, action, payload).subscribe({
      next: () => {
        this.busy.set(false);
        done?.();
        this.toasts.success(successAr);
      },
      error: (err) => {
        this.busy.set(false);
        this.requests.reportError(err);
      },
    });
  }
}
