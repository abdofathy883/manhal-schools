import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { liveResource } from '../../core/live-resource';
import { ToastService } from '../../core/notifications/toast.service';
import { RequestService } from '../../core/requests/request.service';
import { WarehouseService } from '../../core/warehouse/warehouse.service';

/** Stock count: enter what was counted on the shelf; applying it adjusts the stock and logs a movement per difference. */
@Component({
  selector: 'app-stock-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-body">
        <div class="d-flex flex-wrap gap-2 align-items-end mb-3">
          <div class="flex-grow-1" style="max-inline-size: 22rem">
            <label class="form-label" for="sc-note">سبب / مرجع الجرد</label>
            <input id="sc-note" class="form-control" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="مثال: جرد نهاية الشهر" />
          </div>
          <button type="button" class="btn btn-primary" [disabled]="differences().length === 0 || busy()" (click)="apply()">
            <i class="bi bi-clipboard-check me-1" aria-hidden="true"></i>اعتماد الجرد ({{ differences().length }} فرق)
          </button>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <caption class="visually-hidden">جرد المستودع</caption>
            <thead>
              <tr>
                <th scope="col">الصنف</th>
                <th scope="col">الموقع</th>
                <th scope="col">رصيد النظام</th>
                <th scope="col" style="inline-size: 9rem">الكمية المعدودة</th>
                <th scope="col">الفرق</th>
              </tr>
            </thead>
            <tbody>
              @for (it of items(); track it.id) {
                <tr>
                  <td>{{ it.nameAr }} <span class="small text-muted-ar ltr-inline">{{ it.code }}</span></td>
                  <td><span class="ltr-inline">{{ it.location }}</span></td>
                  <td><span class="ltr-inline">{{ it.stock }}</span></td>
                  <td><input type="number" min="0" class="form-control form-control-sm ltr text-start" [value]="counted(it.id, it.stock)" (input)="setCount(it.id, $any($event.target).value)" [attr.aria-label]="'الكمية المعدودة للصنف ' + it.nameAr" /></td>
                  <td>
                    @if (counted(it.id, it.stock) - it.stock; as diff) {
                      <span class="badge" [class]="diff < 0 ? 'bg-danger-subtle text-danger-emphasis' : 'bg-success-subtle text-success-emphasis'"><span class="ltr-inline">{{ diff > 0 ? '+' : '' }}{{ diff }}</span></span>
                    } @else {
                      <span class="text-muted-ar">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class StockCountComponent {
  private readonly warehouse = inject(WarehouseService);
  private readonly requests = inject(RequestService);
  private readonly toasts = inject(ToastService);

  protected readonly note = signal('');
  protected readonly busy = signal(false);
  private readonly entered = signal<Record<string, number>>({});

  private readonly data = liveResource(
    () => ({}),
    () => this.warehouse.items(),
  );
  protected readonly items = computed(() => this.data.value() ?? []);

  protected counted(id: string, stock: number): number {
    return this.entered()[id] ?? stock;
  }

  protected setCount(id: string, raw: string): void {
    const n = raw === '' ? NaN : Number(raw);
    this.entered.update((m) => (Number.isFinite(n) && n >= 0 ? { ...m, [id]: n } : Object.fromEntries(Object.entries(m).filter(([k]) => k !== id))));
  }

  protected readonly differences = computed(() =>
    this.items()
      .filter((it) => this.entered()[it.id] !== undefined && this.entered()[it.id] !== it.stock)
      .map((it) => ({ itemId: it.id, counted: this.entered()[it.id], system: it.stock })),
  );

  protected apply(): void {
    this.busy.set(true);
    this.warehouse.count(this.differences(), this.note()).subscribe({
      next: (n) => {
        this.busy.set(false);
        this.entered.set({});
        this.note.set('');
        this.toasts.success('تم اعتماد الجرد', `سُوّي رصيد ${n} صنف.`);
      },
      error: (err) => {
        this.busy.set(false);
        this.requests.reportError(err, 'تعذر اعتماد الجرد');
      },
    });
  }
}
