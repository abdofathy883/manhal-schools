import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { RequestService } from '../../../core/requests/request.service';
import { SettingsStore } from '../../../core/settings-store';
import { Priority } from '../../../domain/models/request';
import { PRIORITY_LABELS } from '../../../domain/reference-data';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';

const ORDER: readonly Priority[] = ['emergency', 'urgent', 'high', 'normal', 'preventive'];

/** `/admin/sla`: target response hours per priority; open requests take the new target immediately. */
@Component({
  selector: 'app-sla-page',
  imports: [ReactiveFormsModule, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="مدد الاستجابة" subtitle="المدة المستهدفة بالساعات لكل أولوية؛ عند انقضائها يُوسَم الطلب متأخرًا ويُصعَّد تلقائيًا" />
    <div class="alert alert-info small" role="note"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>الحدود والصلاحيات الظاهرة قيم افتراضية للعرض وتُحدد نهائيًا في جلسة تحليل المتطلبات.</div>

    <form class="card" [formGroup]="form" (submit)="$event.preventDefault(); save()" novalidate style="max-inline-size: 40rem">
      <div class="card-header">المدة المستهدفة لكل أولوية</div>
      <div class="card-body">
        <div class="row g-3">
          @for (p of priorities; track p.key) {
            <div class="col-sm-6">
              <label class="form-label" [for]="'sla-' + p.key">{{ p.label }} (بالساعات)</label>
              <input [id]="'sla-' + p.key" type="number" min="1" class="form-control ltr text-start" [formControlName]="p.key" [class.is-invalid]="bad(p.key)" />
              <div class="invalid-feedback">أدخل عددًا صحيحًا من الساعات (1 أو أكثر).</div>
              <div class="form-text">≈ {{ days(p.key) }}</div>
            </div>
          }
        </div>
      </div>
      <div class="card-footer d-flex flex-wrap align-items-center gap-2">
        <button type="submit" class="btn btn-primary" [disabled]="saving() || form.pristine"><i class="bi bi-save me-1" aria-hidden="true"></i>حفظ وتطبيق</button>
        <span class="small text-muted-ar">يُطبَّق على الطلبات المفتوحة ويُسجَّل في سجل التدقيق.</span>
      </div>
    </form>
  `,
})
export class SlaPageComponent {
  private readonly admin = inject(AdminService);
  private readonly settings = inject(SettingsStore);
  private readonly requests = inject(RequestService);
  private readonly toasts = inject(ToastService);

  protected readonly priorities = ORDER.map((key) => ({ key, label: PRIORITY_LABELS[key] }));
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);

  protected readonly form = new FormGroup(
    Object.fromEntries(ORDER.map((p) => [p, new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)] })])) as Record<Priority, FormControl<number>>,
  );

  constructor() {
    effect(() => {
      const hours = this.settings.settings().slaHours;
      if (this.form.pristine) this.form.reset(hours, { emitEvent: false });
    });
  }

  protected bad(key: Priority): boolean {
    const c = this.form.controls[key];
    return c.invalid && (c.touched || this.submitted());
  }

  protected days(key: Priority): string {
    const h = Number(this.form.controls[key].value);
    if (!(h > 0)) return '—';
    return h < 24 ? `${h} ساعة` : `${Math.round((h / 24) * 10) / 10} يوم`;
  }

  protected save(): void {
    this.submitted.set(true);
    if (this.form.invalid) return;
    this.saving.set(true);
    const raw = this.form.getRawValue();
    this.admin.saveSla({ ...raw }).subscribe({
      next: (n) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.toasts.success('تم حفظ مدد الاستجابة', `طُبّقت على ${n} من الطلبات المفتوحة.`);
      },
      error: (err) => {
        this.saving.set(false);
        this.requests.reportError(err, 'تعذر حفظ مدد الاستجابة');
      },
    });
  }
}
