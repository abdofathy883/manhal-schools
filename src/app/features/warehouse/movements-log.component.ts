import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { liveResource } from '../../core/live-resource';
import { WarehouseService } from '../../core/warehouse/warehouse.service';
import { STOCK_KIND_LABELS } from '../../domain/models/procurement';
import { ArDateTimePipe } from '../../shared/pipes/format';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';

/** Latest stock movements: receipts, issues to requests and count adjustments. */
@Component({
  selector: 'app-movements-log',
  imports: [RouterLink, ArDateTimePipe, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      @if (rows().length) {
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <caption class="visually-hidden">حركة المخزون</caption>
            <thead>
              <tr>
                <th scope="col">التاريخ</th>
                <th scope="col">الصنف</th>
                <th scope="col">النوع</th>
                <th scope="col">الكمية</th>
                <th scope="col">الطلب</th>
                <th scope="col">بواسطة</th>
                <th scope="col">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              @for (m of rows(); track m.id) {
                <tr>
                  <td><span class="ltr-inline">{{ m.at | arDateTime }}</span></td>
                  <td>{{ m.item }}</td>
                  <td><span class="badge" [class]="m.delta > 0 ? 'bg-success-subtle text-success-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'">{{ m.kind }}</span></td>
                  <td class="fw-semibold"><span class="ltr-inline">{{ m.delta > 0 ? '+' : '' }}{{ m.delta }}</span></td>
                  <td>
                    @if (m.requestId) {
                      <a [routerLink]="['/requests', m.requestId]" class="text-decoration-none"><span class="ltr-inline">{{ m.requestRef }}</span></a>
                    } @else {
                      —
                    }
                  </td>
                  <td>{{ m.byName }}</td>
                  <td class="small text-muted-ar">{{ m.noteAr }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <app-empty-state title="لا توجد حركات" message="ستظهر هنا حركات الإدخال والصرف والجرد." />
      }
    </div>
  `,
})
export class MovementsLogComponent {
  private readonly warehouse = inject(WarehouseService);

  private readonly data = liveResource(
    () => ({}),
    () => forkJoin({ movements: this.warehouse.movements(), items: this.warehouse.items() }),
  );

  protected readonly rows = computed(() => {
    const { movements = [], items = [] } = this.data.value() ?? {};
    return movements.slice(0, 80).map((m) => ({
      ...m,
      item: items.find((i) => i.id === m.itemId)?.nameAr ?? m.itemId,
      kind: STOCK_KIND_LABELS[m.kind],
    }));
  });
}
