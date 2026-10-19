import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NowService } from '../../core/now.service';
import { ServiceRequest } from '../../domain/models/request';
import { formatDuration, slaPhase, slaRemainingMs, slaTargetMs } from '../../domain/workflows/sla';

/** Live SLA indicator: time left, paused, met, or overdue (red) with an escalation marker. */
@Component({
  selector: 'app-sla-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge d-inline-flex align-items-center gap-1" [class]="view().classes" [attr.title]="view().title">
      <i class="bi" [class]="view().icon" aria-hidden="true"></i>
      <span>{{ view().text }}</span>
      @if (request().sla.escalated && request().status !== 'closed') {
        <i class="bi bi-arrow-up-circle-fill" aria-label="تم التصعيد" role="img"></i>
      }
    </span>
  `,
})
export class SlaBadgeComponent {
  private readonly clock = inject(NowService);

  readonly request = input.required<Pick<ServiceRequest, 'sla' | 'status'>>();

  protected readonly view = computed(() => {
    const r = this.request();
    const now = this.clock.now();
    const phase = slaPhase(r, now);
    const remaining = slaRemainingMs(r.sla, now);
    const target = `المدة المستهدفة: ${r.sla.targetHours} ساعة`;
    switch (phase) {
      case 'not_started':
        return { text: 'لم يبدأ العدّاد', icon: 'bi-hourglass', classes: 'bg-secondary-subtle text-secondary-emphasis', title: target };
      case 'paused':
        return { text: 'العدّاد متوقف (معلّق)', icon: 'bi-pause-circle', classes: 'bg-warning-subtle text-warning-emphasis', title: target };
      case 'stopped':
        return remaining >= 0
          ? { text: 'أُنجز ضمن المدة', icon: 'bi-check-circle', classes: 'bg-success-subtle text-success-emphasis', title: target }
          : { text: 'أُنجز بعد المدة', icon: 'bi-exclamation-circle', classes: 'bg-secondary-subtle text-secondary-emphasis', title: target };
      case 'breached':
        return { text: `متأخر ${formatDuration(remaining)}`, icon: 'bi-alarm-fill', classes: 'bg-danger text-white', title: target };
      default: {
        const low = remaining < slaTargetMs(r.sla) * 0.25;
        return {
          text: `متبقي ${formatDuration(remaining)}`,
          icon: 'bi-stopwatch',
          classes: low ? 'bg-warning-subtle text-warning-emphasis' : 'bg-success-subtle text-success-emphasis',
          title: target,
        };
      }
    }
  });
}
