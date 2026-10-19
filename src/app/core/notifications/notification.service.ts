import { Injectable, computed, inject } from '@angular/core';
import { AppNotification } from '../../domain/models/platform';
import { NotificationRepository } from '../../domain/repositories';
import { AuthService } from '../auth/auth.service';
import { DataVersion } from '../data-version';
import { liveResource } from '../live-resource';

/** The signed-in user's in-app notifications (bell + page) and the demo channel log. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly repo = inject(NotificationRepository);
  private readonly auth = inject(AuthService);
  private readonly version = inject(DataVersion);

  private readonly mine = liveResource(
    () => ({ user: this.auth.currentUser()?.id ?? null }),
    () => this.repo.listMine(),
    [] as AppNotification[],
  );

  private readonly log = liveResource(
    () => ({ user: this.auth.currentUser()?.id ?? null }),
    () => this.repo.channelLog(25),
    [] as AppNotification[],
  );

  readonly items = computed(() => (this.auth.currentUser() ? this.mine.value() : []));
  readonly unreadCount = computed(() => this.items().filter((n) => !n.read).length);
  readonly loading = computed(() => this.mine.isLoading());
  readonly channelLog = computed(() => (this.auth.currentUser() ? this.log.value() : []));

  markRead(id: string): void {
    this.repo.markRead([id]).subscribe(() => this.version.bump());
  }

  markAllRead(): void {
    this.repo.markAllRead().subscribe(() => this.version.bump());
  }
}
