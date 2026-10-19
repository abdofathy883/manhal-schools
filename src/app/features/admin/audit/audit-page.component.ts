import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';
import { liveResource } from '../../../core/live-resource';
import { AuditEntityType, AuditEntry } from '../../../domain/models/platform';
import { AuditRepository } from '../../../domain/repositories';
import { ArDateTimePipe, formatDateTime } from '../../../shared/pipes/format';
import { downloadCsv } from '../../../shared/util/csv';
import { DateFieldComponent } from '../../../shared/ui/date-field.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../../shared/ui/skeleton-rows.component';

const ENTITY_LABELS: Record<AuditEntityType, string> = {
  request: 'طلب',
  role: 'دور وصلاحيات',
  user: 'مستخدم',
  reference: 'بيانات مرجعية',
  limits: 'حدود مالية',
  sla: 'مدد الاستجابة',
  system: 'النظام',
};

const PAGE_SIZE = 25;

/** `/admin/audit`: who did what and when, filterable, searchable, with before → after values, exportable to CSV. */
@Component({
  selector: 'app-audit-page',
  imports: [ReactiveFormsModule, ArDateTimePipe, DateFieldComponent, EmptyStateComponent, PageHeaderComponent, SkeletonRowsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="سجل التدقيق" subtitle="كل إجراء على الطلبات والصلاحيات والمستخدمين والإعدادات: من نفّذه وماذا تغيّر ومتى">
      <button type="button" class="btn btn-outline-primary" [disabled]="filtered().length === 0" (click)="export()"><i class="bi bi-download me-1" aria-hidden="true"></i>تصدير CSV</button>
    </app-page-header>

    <div class="card mb-3">
      <div class="card-body">
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label" for="au-search">بحث</label>
            <input id="au-search" class="form-control" [formControl]="search" placeholder="الإجراء أو الملخص أو المنفّذ" />
          </div>
          <div class="col-md-2">
            <label class="form-label" for="au-entity">النوع</label>
            <select id="au-entity" class="form-select" (change)="setEntity($event)">
              <option value="">الكل</option>
              @for (e of entityTypes; track e.key) { <option [value]="e.key">{{ e.label }}</option> }
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label" for="au-actor">المنفّذ</label>
            <select id="au-actor" class="form-select" (change)="setActor($event)">
              <option value="">الكل</option>
              @for (a of actors(); track a) { <option [value]="a">{{ a }}</option> }
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label" for="au-from">من تاريخ</label>
            <app-date-field inputId="au-from" [formControl]="from" />
          </div>
          <div class="col-md-2">
            <label class="form-label" for="au-to">إلى تاريخ</label>
            <app-date-field inputId="au-to" [formControl]="to" />
          </div>
        </div>
      </div>
    </div>

    @if (loading()) {
      <div class="card"><div class="card-body"><app-skeleton-rows [count]="8" /></div></div>
    } @else {
      <div class="card">
        @if (pageRows().length) {
          <div class="table-responsive">
            <table class="table align-middle mb-0">
              <caption class="visually-hidden">سجل التدقيق</caption>
              <thead>
                <tr><th scope="col">الوقت</th><th scope="col">المنفّذ</th><th scope="col">الإجراء</th><th scope="col">النوع</th><th scope="col">الملخص</th><th scope="col"><span class="visually-hidden">التفاصيل</span></th></tr>
              </thead>
              <tbody>
                @for (e of pageRows(); track e.id) {
                  <tr>
                    <td class="text-nowrap small"><span class="ltr-inline">{{ e.at | arDateTime }}</span></td>
                    <td class="small">{{ e.actorName }}</td>
                    <td class="fw-semibold">{{ e.actionAr }}</td>
                    <td><span class="badge bg-body-secondary text-body">{{ entityLabel(e.entityType) }}</span></td>
                    <td class="small">{{ e.summaryAr }}</td>
                    <td class="text-end">
                      @if (hasDetails(e)) {
                        <button type="button" class="btn btn-sm btn-outline-secondary" (click)="toggle(e.id)" [attr.aria-expanded]="open() === e.id">قبل ← بعد</button>
                      }
                    </td>
                  </tr>
                  @if (open() === e.id) {
                    <tr>
                      <td colspan="6" class="bg-body-tertiary">
                        <div class="row g-3">
                          <div class="col-md-6"><div class="small fw-bold mb-1">قبل</div><pre class="small mb-0 ltr text-start" dir="ltr">{{ pretty(e.before) }}</pre></div>
                          <div class="col-md-6"><div class="small fw-bold mb-1">بعد</div><pre class="small mb-0 ltr text-start" dir="ltr">{{ pretty(e.after) }}</pre></div>
                        </div>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
          <div class="card-footer d-flex flex-wrap align-items-center justify-content-between gap-2">
            <span class="small text-muted-ar">{{ filtered().length }} سجل — صفحة <span class="ltr-inline">{{ current() + 1 }}</span> من <span class="ltr-inline">{{ pages() }}</span></span>
            <div class="btn-group">
              <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="current() === 0" (click)="page.set(current() - 1)"><i class="bi bi-chevron-right me-1" aria-hidden="true"></i>السابق</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="current() + 1 >= pages()" (click)="page.set(current() + 1)">التالي<i class="bi bi-chevron-left ms-1" aria-hidden="true"></i></button>
            </div>
          </div>
        } @else {
          <app-empty-state title="لا توجد سجلات" message="لا توجد سجلات مطابقة للتصفية الحالية." />
        }
      </div>
    }
  `,
})
export class AuditPageComponent {
  private readonly repo = inject(AuditRepository);

  protected readonly entityTypes = (Object.keys(ENTITY_LABELS) as AuditEntityType[]).map((key) => ({ key, label: ENTITY_LABELS[key] }));
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly from = new FormControl<string | null>(null);
  protected readonly to = new FormControl<string | null>(null);
  private readonly query = toSignal(this.search.valueChanges.pipe(startWith('')), { initialValue: '' });
  private readonly fromDay = toSignal(this.from.valueChanges.pipe(startWith(null)), { initialValue: null });
  private readonly toDay = toSignal(this.to.valueChanges.pipe(startWith(null)), { initialValue: null });
  protected readonly entity = signal('');
  protected readonly actor = signal('');
  protected readonly page = signal(0);
  protected readonly open = signal<string | null>(null);

  private readonly data = liveResource(
    () => ({}),
    () => this.repo.list(),
  );
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());
  protected readonly actors = computed(() => [...new Set((this.data.value() ?? []).map((e) => e.actorName))].sort((a, b) => a.localeCompare(b, 'ar')));

  protected readonly filtered = computed<AuditEntry[]>(() => {
    const q = this.query().trim().toLowerCase();
    const from = this.fromDay();
    const to = this.toDay();
    const rows = (this.data.value() ?? []).filter((e) => {
      const day = e.at.slice(0, 10);
      return (
        (!this.entity() || e.entityType === this.entity()) &&
        (!this.actor() || e.actorName === this.actor()) &&
        (!from || day >= from) &&
        (!to || day <= to) &&
        (!q || e.actionAr.toLowerCase().includes(q) || e.summaryAr.toLowerCase().includes(q) || e.actorName.toLowerCase().includes(q))
      );
    });
    return rows;
  });

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  /** The page in range even when a filter shrank the result. */
  protected readonly current = computed(() => Math.min(this.page(), this.pages() - 1));
  protected readonly pageRows = computed(() => this.filtered().slice(this.current() * PAGE_SIZE, (this.current() + 1) * PAGE_SIZE));

  protected entityLabel(type: AuditEntityType): string {
    return ENTITY_LABELS[type];
  }

  protected setEntity(event: Event): void {
    this.entity.set((event.target as HTMLSelectElement).value);
    this.page.set(0);
  }

  protected setActor(event: Event): void {
    this.actor.set((event.target as HTMLSelectElement).value);
    this.page.set(0);
  }

  protected toggle(id: string): void {
    this.open.update((cur) => (cur === id ? null : id));
  }

  protected hasDetails(e: AuditEntry): boolean {
    return e.before !== undefined || e.after !== undefined;
  }

  protected pretty(value: unknown): string {
    return value === undefined ? '—' : JSON.stringify(value, null, 2);
  }

  protected export(): void {
    downloadCsv(
      'audit-log',
      ['الوقت', 'المنفّذ', 'الإجراء', 'النوع', 'المرجع', 'الملخص'],
      this.filtered().map((e) => [formatDateTime(e.at), e.actorName, e.actionAr, ENTITY_LABELS[e.entityType], e.entityId, e.summaryAr]),
    );
  }
}
