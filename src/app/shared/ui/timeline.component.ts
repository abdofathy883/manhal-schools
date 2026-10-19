import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TimelineEvent, TimelineEventType } from '../../domain/models/request';
import { ArDateTimePipe } from '../pipes/format';

const ICONS: Record<TimelineEventType, { icon: string; tone: string }> = {
  created: { icon: 'bi-plus-circle', tone: 'info' },
  routed: { icon: 'bi-signpost-split', tone: 'secondary' },
  status: { icon: 'bi-arrow-repeat', tone: 'primary' },
  approved: { icon: 'bi-patch-check', tone: 'success' },
  rejected: { icon: 'bi-x-octagon', tone: 'danger' },
  returned: { icon: 'bi-arrow-return-right', tone: 'warning' },
  assigned: { icon: 'bi-person-gear', tone: 'primary' },
  comment: { icon: 'bi-chat-dots', tone: 'secondary' },
  inspection: { icon: 'bi-clipboard2-pulse', tone: 'primary' },
  part_requested: { icon: 'bi-box-seam', tone: 'warning' },
  part_issued: { icon: 'bi-box-arrow-left', tone: 'success' },
  linked_created: { icon: 'bi-diagram-3', tone: 'info' },
  linked_completed: { icon: 'bi-link-45deg', tone: 'success' },
  escalated: { icon: 'bi-arrow-up-circle', tone: 'danger' },
  sla_breach: { icon: 'bi-alarm', tone: 'danger' },
  confirmed: { icon: 'bi-person-check', tone: 'success' },
  rated: { icon: 'bi-star', tone: 'warning' },
  cancelled: { icon: 'bi-slash-circle', tone: 'secondary' },
  complaint_linked: { icon: 'bi-chat-left-text', tone: 'danger' },
  system: { icon: 'bi-cpu', tone: 'secondary' },
};

@Component({
  selector: 'app-timeline',
  imports: [ArDateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="list-unstyled m-0 ps-0">
      @for (e of events(); track e.id) {
        <li class="d-flex gap-3 position-relative pb-4 timeline-item">
          <span
            class="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0 z-1"
            [class]="'bg-' + style(e).tone + '-subtle text-' + style(e).tone + '-emphasis'"
            style="inline-size: 2.25rem; block-size: 2.25rem"
          >
            <i class="bi" [class]="style(e).icon" aria-hidden="true"></i>
          </span>
          <div class="flex-grow-1">
            <div class="fw-semibold">{{ e.textAr }}</div>
            @if (e.noteAr) {
              <div class="small bg-body-tertiary rounded-2 p-2 mt-1">{{ e.noteAr }}</div>
            }
            <div class="small text-muted-ar mt-1">
              {{ e.actorRoleAr }} · <span class="ltr-inline">{{ e.at | arDateTime }}</span>
            </div>
          </div>
        </li>
      }
    </ol>
  `,
  styles: `
    .timeline-item:not(:last-child)::before {
      content: '';
      position: absolute;
      inset-block: 2.25rem 0;
      inset-inline-start: 1.05rem;
      border-inline-start: 2px solid var(--mnh-border);
    }
  `,
})
export class TimelineComponent {
  readonly events = input.required<readonly TimelineEvent[]>();

  protected style(e: TimelineEvent) {
    return ICONS[e.type];
  }
}
