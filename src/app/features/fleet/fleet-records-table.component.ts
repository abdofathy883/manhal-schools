import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceRequest } from '../../domain/models/request';
import { ArDatePipe, MoneyPipe } from '../../shared/pipes/format';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { costOf, fineOf } from './fleet-stats';

/** One block of a vehicle/driver file: the requests of a kind with status and cost. */
@Component({
  selector: 'app-fleet-records-table',
  imports: [RouterLink, ArDatePipe, MoneyPipe, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4">
      <div class="card-header d-flex justify-content-between"><span>{{ title() }}</span><span class="badge bg-body-secondary text-body">{{ rows().length }}</span></div>
      @if (rows().length) {
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <caption class="visually-hidden">{{ title() }}</caption>
            <thead>
              <tr>
                <th scope="col">الرقم المرجعي</th>
                <th scope="col">العنوان</th>
                <th scope="col">التاريخ</th>
                <th scope="col">الحالة</th>
                <th scope="col">{{ amountLabel() }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr>
                  <td><a [routerLink]="['/requests', r.id]" class="text-decoration-none fw-semibold"><span class="ltr-inline">{{ r.refNo }}</span></a></td>
                  <td>{{ r.titleAr }}</td>
                  <td><span class="ltr-inline">{{ r.createdAt | arDate }}</span></td>
                  <td><app-status-badge [status]="r.status" [holdReason]="r.holdReason" /></td>
                  <td>{{ amount(r) | money }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="card-body text-muted-ar">لا توجد سجلات.</div>
      }
    </section>
  `,
})
export class FleetRecordsTableComponent {
  readonly title = input.required<string>();
  readonly rows = input.required<readonly ServiceRequest[]>();
  readonly amountLabel = input('التكلفة');
  /** `fine`: show the violation amount instead of the recorded cost. */
  readonly kind = input<'cost' | 'fine'>('cost');

  protected amount(r: ServiceRequest): number {
    return this.kind() === 'fine' ? fineOf(r) : costOf(r);
  }
}
