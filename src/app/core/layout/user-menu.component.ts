import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap/dropdown';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../notifications/toast.service';
import { PermissionService } from '../rbac/permission.service';
import { SettingsService } from '../settings.service';

/** Top-bar user chip: avatar, name, role badge, Hijri toggle and sign-out. */
@Component({
  selector: 'app-user-menu',
  imports: [NgbDropdownModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.currentUser(); as u) {
      <div ngbDropdown placement="bottom-end" class="d-inline-block">
        <button type="button" class="btn btn-light border-0 d-flex align-items-center gap-2" ngbDropdownToggle id="user-menu-toggle">
          <span
            class="rounded-circle d-inline-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0"
            style="inline-size: 2.2rem; block-size: 2.2rem"
            [style.background]="u.avatarColor"
            aria-hidden="true"
            >{{ u.nameAr.charAt(0) }}</span
          >
          <span class="text-start d-none d-md-block lh-sm">
            <span class="d-block fw-semibold small">{{ u.nameAr }}</span>
            <span class="badge bg-primary-subtle text-primary-emphasis">{{ roleLabel() }}</span>
          </span>
        </button>
        <div ngbDropdownMenu aria-labelledby="user-menu-toggle" class="p-2" style="min-inline-size: 15rem">
          <div class="px-2 pb-2 border-bottom mb-2">
            <div class="fw-bold">{{ u.nameAr }}</div>
            <div class="small text-muted-ar">{{ u.jobTitleAr }}</div>
            <div class="small text-muted-ar ltr-inline">{{ u.email }}</div>
          </div>
          <div class="form-check form-switch px-2 ps-5 mb-2">
            <input
              class="form-check-input"
              type="checkbox"
              role="switch"
              id="hijri-toggle"
              [checked]="settings.hijri()"
              (change)="settings.hijri.set(!settings.hijri())"
            />
            <label class="form-check-label" for="hijri-toggle">عرض التاريخ الهجري</label>
          </div>
          <button ngbDropdownItem type="button" class="text-danger rounded-2" (click)="logout()">
            <i class="bi bi-box-arrow-left me-2" aria-hidden="true"></i>تسجيل الخروج
          </button>
        </div>
      </div>
    }
  `,
})
export class UserMenuComponent {
  protected readonly auth = inject(AuthService);
  protected readonly settings = inject(SettingsService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly roleLabel = computed(() => this.permissions.roles().map((r) => r.nameAr)[0] ?? '');

  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login').then(() => this.toasts.info('تم تسجيل الخروج'));
  }
}
