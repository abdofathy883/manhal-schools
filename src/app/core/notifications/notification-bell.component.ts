import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap/dropdown';
import {
  AppNotification,
  CHANNEL_ICONS,
  CHANNEL_LABELS,
  NotificationKind,
} from '../../domain/models/platform';
import { ArDateTimePipe } from '../../shared/pipes/format';
import { Directory } from '../../domain/repositories';
import { NotificationService } from './notification.service';

export const KIND_ICONS: Record<NotificationKind, string> = {
  status: 'bi-arrow-repeat text-primary',
  approval: 'bi-patch-check text-warning',
  assignment: 'bi-person-gear text-info',
  sla: 'bi-alarm text-danger',
  comment: 'bi-chat-dots text-secondary',
  info: 'bi-info-circle text-info',
};

/** Bell with unread count, the latest notifications, and the simulated channel log (WhatsApp / SMS / email). */
@Component({
  selector: 'app-notification-bell',
  imports: [NgbDropdownModule, RouterLink, ArDateTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div ngbDropdown placement="bottom-end" class="d-inline-block" #dd="ngbDropdown">
      <button
        type="button"
        class="btn btn-light border-0 position-relative"
        ngbDropdownToggle
        id="bell-toggle"
        [attr.aria-label]="'الإشعارات' + (service.unreadCount() ? ' — ' + service.unreadCount() + ' غير مقروء' : '')"
      >
        <i class="bi bi-bell fs-5" aria-hidden="true"></i>
        @if (service.unreadCount() > 0) {
          <span class="position-absolute top-0 start-0 translate-middle badge rounded-pill bg-danger">{{ service.unreadCount() > 99 ? '99+' : service.unreadCount() }}</span>
        }
      </button>
      <div ngbDropdownMenu aria-labelledby="bell-toggle" class="p-0 bell-menu">
        <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom">
          <div class="btn-group btn-group-sm" role="group" aria-label="نوع الإشعارات">
            <button type="button" class="btn" [class]="tab() === 'mine' ? 'btn-primary' : 'btn-outline-primary'" (click)="tab.set('mine')">إشعاراتي</button>
            <button type="button" class="btn" [class]="tab() === 'log' ? 'btn-primary' : 'btn-outline-primary'" (click)="tab.set('log')">سجل القنوات (محاكاة)</button>
          </div>
          @if (tab() === 'mine' && service.unreadCount() > 0) {
            <button type="button" class="btn btn-link btn-sm p-0" (click)="service.markAllRead()">تعليم الكل كمقروء</button>
          }
        </div>

        <div class="bell-scroll">
          @if (tab() === 'mine') {
            @for (n of latest(); track n.id) {
              <button type="button" class="dropdown-item d-flex gap-2 align-items-start py-2 text-wrap" [class.fw-semibold]="!n.read" (click)="open(n, dd)">
                <i class="bi mt-1" [class]="icons[n.kind]" aria-hidden="true"></i>
                <span class="flex-grow-1 text-start">
                  <span class="d-block">{{ n.titleAr }}</span>
                  <span class="d-block small text-muted-ar fw-normal">{{ n.bodyAr }}</span>
                  <span class="d-block small text-muted-ar fw-normal ltr-inline">{{ n.at | arDateTime }}</span>
                </span>
                @if (!n.read) {
                  <span class="rounded-circle bg-primary flex-shrink-0 mt-2" style="inline-size: 0.5rem; block-size: 0.5rem" aria-label="غير مقروء"></span>
                }
              </button>
            } @empty {
              <p class="text-center text-muted-ar my-4">لا توجد إشعارات.</p>
            }
          } @else {
            @for (n of service.channelLog(); track n.id) {
              <div class="px-3 py-2 border-bottom small">
                <div class="d-flex flex-wrap gap-1 mb-1">
                  @for (c of n.channels; track c) {
                    <span class="badge bg-success-subtle text-success-emphasis"><i class="bi me-1" [class]="channelIcons[c]" aria-hidden="true"></i>{{ channelLabels[c] }}</span>
                  }
                  <span class="text-muted-ar">←</span>
                  <strong>{{ userName(n.userId) }}</strong>
                </div>
                <div>{{ n.titleAr }} — <span class="text-muted-ar">{{ n.bodyAr }}</span></div>
              </div>
            } @empty {
              <p class="text-center text-muted-ar my-4">لا توجد رسائل.</p>
            }
          }
        </div>

        <a routerLink="/notifications" class="dropdown-item text-center border-top py-2" (click)="dd.close()">عرض كل الإشعارات</a>
      </div>
    </div>
  `,
  styles: `
    .bell-menu {
      inline-size: min(26rem, 92vw);
    }

    .bell-scroll {
      max-block-size: 22rem;
      overflow-y: auto;
    }
  `,
})
export class NotificationBellComponent {
  protected readonly service = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly directory = inject(Directory);

  protected readonly tab = signal<'mine' | 'log'>('mine');
  protected readonly icons = KIND_ICONS;
  protected readonly channelIcons = CHANNEL_ICONS;
  protected readonly channelLabels = CHANNEL_LABELS;
  protected readonly latest = computed(() => this.service.items().slice(0, 8));

  protected userName(id: string): string {
    return this.directory.userName(id);
  }

  protected open(n: AppNotification, dropdown: { close: () => void }): void {
    if (!n.read) this.service.markRead(n.id);
    dropdown.close();
    if (n.requestId) void this.router.navigate(['/requests', n.requestId]);
  }
}
