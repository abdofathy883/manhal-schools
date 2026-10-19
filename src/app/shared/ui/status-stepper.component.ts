import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_FLOW, STATUS_META } from '../../domain/reference-data';
import { RequestStatus } from '../../domain/models/request';

/** Horizontal lifecycle stepper (reads right-to-left in RTL). Exceptional statuses show as a banner. */
@Component({
  selector: 'app-status-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="d-flex flex-wrap gap-2 list-unstyled m-0" aria-label="مراحل الطلب">
      @for (s of steps(); track s.status; let last = $last) {
        <li class="d-flex align-items-center gap-2" [attr.aria-current]="s.current ? 'step' : null">
          <span
            class="badge d-inline-flex align-items-center gap-1"
            [class]="s.current ? 'text-bg-primary' : s.done ? 'bg-success-subtle text-success-emphasis' : 'bg-body-secondary text-secondary'"
          >
            <i class="bi" [class]="s.done ? 'bi-check-lg' : s.icon" aria-hidden="true"></i>
            {{ s.label }}
          </span>
          @if (!last) {
            <i class="bi bi-chevron-left text-secondary small" aria-hidden="true"></i>
          }
        </li>
      }
    </ol>
  `,
})
export class StatusStepperComponent {
  readonly status = input.required<RequestStatus>();

  protected readonly steps = computed(() => {
    const idx = STATUS_FLOW.indexOf(this.status());
    return STATUS_FLOW.map((status, i) => ({
      status,
      label: STATUS_META[status].labelAr,
      icon: STATUS_META[status].icon,
      current: i === idx,
      done: idx >= 0 && i < idx,
    }));
  });
}
