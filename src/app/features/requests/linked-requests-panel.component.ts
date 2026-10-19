import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { liveResource } from '../../core/live-resource';
import { RequestService } from '../../core/requests/request.service';
import { RequestLink, ServiceRequest } from '../../domain/models/request';
import { SERVICE_BY_KEY } from '../../domain/reference-data';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const RELATION_LABELS: Record<RequestLink['relation'], string> = {
  parent: 'الطلب الأصلي',
  child: 'طلب مرتبط (فرعي)',
  related: 'طلب ذو صلة',
  complaint: 'شكوى مرتبطة',
};

interface LinkRow {
  link: RequestLink;
  /** `null` when the linked request is outside the viewer's scope. */
  request: ServiceRequest | null;
}

/** "الطلبات المرتبطة": status badges and quick navigation; hides records the viewer may not open. */
@Component({
  selector: 'app-linked-requests-panel',
  imports: [RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="card-header"><i class="bi bi-diagram-3 me-2" aria-hidden="true"></i>الطلبات المرتبطة</div>
      <ul class="list-group list-group-flush">
        @for (row of rows.value() ?? []; track row.link.requestId) {
          <li class="list-group-item">
            <div class="small text-muted-ar mb-1">{{ relation(row.link) }}</div>
            @if (row.request; as r) {
              <a class="fw-semibold text-decoration-none" [routerLink]="['/requests', r.id]">
                <span class="ltr-inline">{{ r.refNo }}</span> — {{ r.titleAr }}
              </a>
              <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
                <span class="small text-muted-ar">{{ serviceName(r) }}</span>
                <app-status-badge [status]="r.status" [holdReason]="r.holdReason" />
              </div>
            } @else {
              <span class="text-muted-ar"><i class="bi bi-lock me-1" aria-hidden="true"></i>طلب مرتبط خارج صلاحيتك</span>
            }
          </li>
        } @empty {
          <li class="list-group-item text-muted-ar">لا توجد طلبات مرتبطة.</li>
        }
      </ul>
    </div>
  `,
})
export class LinkedRequestsPanelComponent {
  private readonly requests = inject(RequestService);

  readonly links = input.required<readonly RequestLink[]>();

  protected readonly rows = liveResource(
    () => ({ links: this.links() }),
    (p) =>
      p.links.length === 0
        ? of([] as LinkRow[])
        : forkJoin(
            p.links.map((link) =>
              this.requests.get(link.requestId).pipe(
                catchError(() => of(null)),
                map((request): LinkRow => ({ link, request })),
              ),
            ),
          ),
  );

  protected relation(link: RequestLink): string {
    return RELATION_LABELS[link.relation];
  }

  protected serviceName(r: ServiceRequest): string {
    return SERVICE_BY_KEY[r.service].nameAr;
  }
}
