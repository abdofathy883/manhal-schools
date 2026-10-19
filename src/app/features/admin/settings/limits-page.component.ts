import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, startWith, switchMap, catchError, of } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { RequestService } from '../../../core/requests/request.service';
import { SettingsStore } from '../../../core/settings-store';
import { buildApprovalChain } from '../../../domain/workflows/approval-chain';
import { MoneyPipe } from '../../../shared/pipes/format';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';

const EXAMPLES = [3000, 8000, 30000, 60000, 120000];

/** `/admin/limits`: the financial limits that decide the approval chain; the chain of requests still waiting is recomputed on save. */
@Component({
  selector: 'app-limits-page',
  imports: [ReactiveFormsModule, MoneyPipe, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="الحدود المالية" subtitle="تحدد قيمة الطلب من يعتمده: مدير القسم، ثم الإدارة المالية، ثم الإدارة العليا" />
    <div class="alert alert-info small" role="note"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>الحدود والصلاحيات الظاهرة قيم افتراضية للعرض وتُحدد نهائيًا في جلسة تحليل المتطلبات.</div>

    <div class="row g-4">
      <div class="col-lg-5">
        <form class="card" [formGroup]="form" (submit)="$event.preventDefault(); save()" novalidate>
          <div class="card-header">الحدود (ر.س)</div>
          <div class="card-body">
            <div class="mb-3">
              <label class="form-label" for="lm-dept">حد اعتماد مدير القسم وحده</label>
              <input id="lm-dept" type="number" min="1" class="form-control ltr text-start" formControlName="departmentMax" [class.is-invalid]="bad('departmentMax')" />
              <div class="form-text">حتى هذا المبلغ يكفي اعتماد مدير القسم.</div>
              <div class="invalid-feedback">أدخل مبلغًا أكبر من صفر.</div>
            </div>
            <div class="mb-3">
              <label class="form-label" for="lm-fin">حد الإدارة المالية</label>
              <input id="lm-fin" type="number" min="1" class="form-control ltr text-start" formControlName="financeMax" [class.is-invalid]="bad('financeMax') || crossInvalid()" />
              <div class="form-text">فوق حد القسم وحتى هذا المبلغ تعتمد الإدارة المالية؛ وما فوقه تعتمده الإدارة العليا أيضًا.</div>
              <div class="invalid-feedback">يجب أن يكون أكبر من حد مدير القسم.</div>
            </div>
            @if (affected() !== null) {
              <div class="alert small" [class]="affected() ? 'alert-warning' : 'alert-secondary'" role="status">
                @if (affected()) {
                  سيُعاد احتساب مسار الاعتماد لعدد <strong>{{ affected() }}</strong> من الطلبات التي لم تُعتمد بعد.
                } @else {
                  لن يتغير مسار أي طلب قائم بهذه القيم.
                }
              </div>
            }
          </div>
          <div class="card-footer"><button type="submit" class="btn btn-primary" [disabled]="saving() || form.pristine"><i class="bi bi-save me-1" aria-hidden="true"></i>حفظ وإعادة الاحتساب</button></div>
        </form>
      </div>

      <div class="col-lg-7">
        <div class="card">
          <div class="card-header">معاينة المسار لقيم تقديرية (طلب شراء)</div>
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <caption class="visually-hidden">معاينة مسار الاعتماد</caption>
              <thead><tr><th scope="col">قيمة الطلب</th><th scope="col">مسار الاعتماد</th></tr></thead>
              <tbody>
                @for (row of preview(); track row.value) {
                  <tr>
                    <td class="fw-semibold">{{ row.value | money }}</td>
                    <td>@for (s of row.steps; track s; let last = $last) { <span class="badge bg-primary-subtle text-primary-emphasis">{{ s }}</span>{{ last ? '' : ' ← ' }} }</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LimitsPageComponent {
  private readonly admin = inject(AdminService);
  private readonly settings = inject(SettingsStore);
  private readonly requests = inject(RequestService);
  private readonly toasts = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly affected = signal<number | null>(null);

  protected readonly form = new FormGroup({
    departmentMax: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    financeMax: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
  });
  private readonly values = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), { initialValue: this.form.getRawValue() });

  protected readonly crossInvalid = computed(() => {
    const v = this.values();
    return Number(v.financeMax) <= Number(v.departmentMax);
  });

  protected readonly preview = computed(() => {
    const v = this.values();
    const limits = { departmentMax: Number(v.departmentMax) || 0, financeMax: Number(v.financeMax) || 0 };
    return EXAMPLES.map((value) => ({
      value,
      steps: buildApprovalChain({ service: 'purchase-request', priority: 'normal', estimatedValue: value, details: {} }, limits).map((s) => s.labelAr),
    }));
  });

  constructor() {
    effect(() => {
      const limits = this.settings.settings().approvalLimits;
      if (this.form.pristine) this.form.reset(limits, { emitEvent: true });
    });
    // How many waiting requests the entered limits would affect.
    this.form.valueChanges
      .pipe(
        debounceTime(250),
        switchMap((v) => {
          const limits = { departmentMax: Number(v.departmentMax), financeMax: Number(v.financeMax) };
          if (!(limits.departmentMax > 0) || !(limits.financeMax > limits.departmentMax)) return of(null);
          return this.admin.previewLimits(limits).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((n) => this.affected.set(this.form.pristine ? null : n));
  }

  protected bad(name: 'departmentMax' | 'financeMax'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  protected save(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.crossInvalid()) return;
    this.saving.set(true);
    this.admin.saveLimits(this.form.getRawValue()).subscribe({
      next: (n) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.affected.set(null);
        this.toasts.success('تم حفظ الحدود المالية', n ? `أُعيد احتساب مسار الاعتماد لعدد ${n} من الطلبات.` : 'لا توجد طلبات تأثرت.');
      },
      error: (err) => {
        this.saving.set(false);
        this.requests.reportError(err, 'تعذر حفظ الحدود');
      },
    });
  }
}
