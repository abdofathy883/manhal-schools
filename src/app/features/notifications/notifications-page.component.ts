import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../../core/notifications/notification.service';
import { KIND_ICONS } from '../../core/notifications/notification-bell.component';
import { AppNotification, CHANNEL_ICONS, CHANNEL_LABELS } from '../../domain/models/platform';
import { ArDateTimePipe } from '../../shared/pipes/format';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';

@Component({
  selector: 'app-notifications-page',
  imports: [ArDateTimePipe, PageHeaderComponent, EmptyStateComponent, SkeletonRowsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="الإشعارات" subtitle="كل ما يصلك عند تغيّر حالة طلباتك أو عند الحاجة لإجراء منك.">
      <button type="button" class="btn btn-outline-primary" [disabled]="service.unreadCount() === 0" (click)="service.markAllRead()">
        <i class="bi bi-check2-all me-1" aria-hidden="true"></i>تعليم الكل كمقروء
      </button>
    </app-page-header>

    <div class="btn-group mb-3" role="group" aria-label="تصفية الإشعارات">
      <button type="button" class="btn" [class]="filter() === 'all' ? 'btn-primary' : 'btn-outline-primary'" (click)="filter.set('all')">الكل ({{ service.items().length }})</button>
      <button type="button" class="btn" [class]="filter() === 'unread' ? 'btn-primary' : 'btn-outline-primary'" (click)="filter.set('unread')">غير المقروء ({{ service.unreadCount() }})</button>
    </div>

    <section class="card">
      @if (service.loading() && service.items().length === 0) {
        <div class="card-body"><app-skeleton-rows [count]="5" /></div>
      } @else if (shown().length === 0) {
        <app-empty-state title="لا توجد إشعارات" message="ستظهر هنا الإشعارات عند وجود جديد." />
      } @else {
        <ul class="list-group list-group-flush">
          @for (n of shown(); track n.id) {
            <li class="list-group-item list-group-item-action d-flex gap-3 align-items-start py-3" style="cursor: pointer" tabindex="0" (click)="open(n)" (keydown.enter)="open(n)">
              <i class="bi fs-5 mt-1" [class]="icons[n.kind]" aria-hidden="true"></i>
              <div class="flex-grow-1">
                <div [class.fw-bold]="!n.read">{{ n.titleAr }}</div>
                <div class="text-muted-ar">{{ n.bodyAr }}</div>
                <div class="small text-muted-ar mt-1">
                  <span class="ltr-inline">{{ n.at | arDateTime }}</span>
                  @for (c of n.channels; track c) {
                    <span class="badge bg-body-secondary text-body ms-2"><i class="bi me-1" [class]="channelIcons[c]" aria-hidden="true"></i>{{ channelLabels[c] }}</span>
                  }
                </div>
              </div>
              @if (!n.read) {
                <span class="badge bg-primary">جديد</span>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class NotificationsPageComponent {
  protected readonly service = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly filter = signal<'all' | 'unread'>('all');
  protected readonly icons = KIND_ICONS;
  protected readonly channelIcons = CHANNEL_ICONS;
  protected readonly channelLabels = CHANNEL_LABELS;
  protected readonly shown = computed(() => (this.filter() === 'unread' ? this.service.items().filter((n) => !n.read) : this.service.items()));

  protected open(n: AppNotification): void {
    if (!n.read) this.service.markRead(n.id);
    if (n.requestId) void this.router.navigate(['/requests', n.requestId]);
  }
}
