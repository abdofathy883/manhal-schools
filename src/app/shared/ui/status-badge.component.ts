import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HOLD_REASON_LABELS, PRIORITY_LABELS, STATUS_META } from '../../domain/reference-data';
import { HoldReason, Priority, RequestStatus } from '../../domain/models/request';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge d-inline-flex align-items-center gap-1" [class]="classes()">
      <i class="bi" [class]="meta().icon" aria-hidden="true"></i>
      <span>{{ meta().labelAr }}</span>
      @if (holdReasonLabel(); as reason) {
        <span class="opacity-75">: {{ reason }}</span>
      }
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<RequestStatus>();
  readonly holdReason = input<HoldReason | undefined>();

  protected readonly meta = computed(() => STATUS_META[this.status()]);
  protected readonly classes = computed(
    () => `bg-${this.meta().tone}-subtle text-${this.meta().tone}-emphasis border border-${this.meta().tone}-subtle`,
  );
  protected readonly holdReasonLabel = computed(() => {
    const reason = this.holdReason();
    return this.status() === 'on_hold' && reason ? HOLD_REASON_LABELS[reason] : null;
  });
}

@Component({
  selector: 'app-priority-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="classes()">{{ label() }}</span>`,
})
export class PriorityBadgeComponent {
  readonly priority = input.required<Priority>();

  protected readonly label = computed(() => PRIORITY_LABELS[this.priority()]);
  protected readonly classes = computed(() => {
    const tone: Record<Priority, string> = {
      normal: 'secondary',
      preventive: 'info',
      high: 'warning',
      urgent: 'warning',
      emergency: 'danger',
    };
    const t = tone[this.priority()];
    return `bg-${t}-subtle text-${t}-emphasis`;
  });
}
