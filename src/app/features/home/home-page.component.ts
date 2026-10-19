import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { liveResource } from '../../core/live-resource';
import { placeOf } from '../../core/demo-mode/demo-mode.service';
import { NowService } from '../../core/now.service';
import { PermissionService } from '../../core/rbac/permission.service';
import { RequestService } from '../../core/requests/request.service';
import { scopeRank } from '../../core/rbac/scope';
import { SCOPE_LABELS } from '../../domain/models/rbac';
import { isOverdue, isTerminal } from '../../domain/workflows/sla';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';

interface Widget {
  label: string;
  value: number;
  icon: string;
  tone: 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'secondary';
  link: string;
  query?: Record<string, string>;
  hint?: string;
}

/**
 * Role-aware landing page: identity, scope, live request counters for what this user can act on,
 * and the screens the role can open.
 */
@Component({
  selector: 'app-home-page',
  imports: [RouterLink, PageHeaderComponent, StatCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    @if (user(); as u) {
      <app-page-header [title]="'مرحبًا، ' + u.nameAr" [subtitle]="u.jobTitleAr + ' · ' + place()" />

      @if (widgets().length) {
        <div class="row g-3 mb-4">
          @for (w of widgets(); track w.label) {
            <div class="col-sm-6 col-xl-3">
              <a [routerLink]="w.link" [queryParams]="w.query" class="text-decoration-none text-reset d-block h-100 widget-link">
                <app-stat-card [label]="w.label" [value]="w.value" [icon]="w.icon" [tone]="w.tone" [hint]="w.hint ?? ''" />
              </a>
            </div>
          }
        </div>
      }

      <div class="row g-3 mb-4">
        <div class="col-md-6 col-xl-4">
          <div class="card h-100">
            <div class="card-body">
              <h2 class="h6 text-muted-ar">دورك في المنصة</h2>
              <div class="d-flex flex-wrap gap-2 mb-3">
                @for (r of permissions.roles(); track r.id) {
                  <span class="badge bg-primary-subtle text-primary-emphasis fs-6">{{ r.nameAr }}</span>
                }
              </div>
              <p class="small text-muted-ar mb-0">{{ roleDescription() }}</p>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-xl-4">
          <div class="card h-100">
            <div class="card-body">
              <h2 class="h6 text-muted-ar">نطاق ما تراه من الطلبات</h2>
              <div class="fs-4 fw-bold font-display">{{ viewScope() }}</div>
              <p class="small text-muted-ar mb-0">
                تُصفّى السجلات في طبقة البيانات حسب نطاقك، فلا تصلك طلبات خارج صلاحيتك.
              </p>
            </div>
          </div>
        </div>
      </div>

      <h2 class="h5 mb-3">الشاشات المتاحة لك</h2>
      <div class="row g-3">
        @for (m of screens(); track m.route) {
          <div class="col-6 col-md-4 col-xl-3">
            <a [routerLink]="m.route" class="card h-100 text-decoration-none text-reset screen-card">
              <div class="card-body d-flex align-items-center gap-3">
                <span class="d-inline-flex align-items-center justify-content-center rounded-3 bg-info-subtle text-info-emphasis flex-shrink-0" style="inline-size: 2.75rem; block-size: 2.75rem">
                  <i class="bi fs-5" [class]="m.icon" aria-hidden="true"></i>
                </span>
                <span class="fw-semibold">{{ m.label }}</span>
              </div>
            </a>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .screen-card,
    .widget-link {
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .screen-card:hover,
    .widget-link:hover {
      transform: translateY(-2px);
    }

    .screen-card:hover {
      box-shadow: var(--mnh-shadow-lg);
    }
  `,
})
export class HomePageComponent {
  private readonly auth = inject(AuthService);
  private readonly requests = inject(RequestService);
  private readonly clock = inject(NowService);
  protected readonly permissions = inject(PermissionService);

  protected readonly user = this.auth.currentUser;
  protected readonly place = computed(() => (this.user() ? placeOf(this.user()!) : ''));
  protected readonly screens = computed(() => this.permissions.visibleMenu().filter((m) => m.route !== '/home'));
  protected readonly roleDescription = computed(() => this.permissions.roles()[0]?.descriptionAr ?? '');
  protected readonly viewScope = computed(() => {
    const scope = this.permissions.scopeOf('request.view');
    return scope ? SCOPE_LABELS[scope] : 'لا يوجد وصول للطلبات';
  });

  private readonly data = liveResource(
    () => ({ user: this.user()?.id ?? null }),
    () => this.requests.list(),
  );

  protected readonly widgets = computed<Widget[]>(() => {
    const me = this.user();
    const all = this.data.value() ?? [];
    if (!me) return [];
    const now = this.clock.now();
    const mine = all.filter((r) => r.requesterId === me.id);
    const out: Widget[] = [];

    if (this.permissions.canAny(['request.create.building-maintenance', 'request.create.purchase-request', 'request.create.bus-booking', 'request.create.complaint'])) {
      out.push({ label: 'طلباتي المفتوحة', value: mine.filter((r) => !isTerminal(r.status)).length, icon: 'bi-folder2-open', tone: 'primary', link: '/requests/mine' });
      out.push({
        label: 'بانتظار تأكيدي',
        value: mine.filter((r) => r.status === 'pending_confirmation').length,
        icon: 'bi-person-check',
        tone: 'info',
        link: '/requests/mine',
        query: { status: 'pending_confirmation' },
        hint: 'أكّد استلام الخدمة وقيّمها',
      });
    }

    if (this.permissions.canAny(['request.approve.department', 'request.approve.branch', 'request.approve.finance', 'request.approve.executive'])) {
      const waiting = all.filter((r) => r.status === 'pending_approval' && this.requests.describe(r).some((a) => a.key === 'approve' && a.enabled));
      out.push({ label: 'بانتظار اعتمادي', value: waiting.length, icon: 'bi-hourglass-split', tone: 'warning', link: '/requests/all', query: { status: 'pending_approval' } });
    }

    if (this.permissions.can('request.execute')) {
      out.push({
        label: 'مسندة إليّ قيد التنفيذ',
        value: all.filter((r) => r.assigneeId === me.id && r.status === 'in_progress').length,
        icon: 'bi-gear',
        tone: 'primary',
        link: '/requests/all',
        query: { status: 'in_progress' },
      });
    }

    const scope = this.permissions.scopeOf('request.view');
    if (scope && scopeRank(scope) >= scopeRank('department')) {
      out.push({ label: 'طلبات متأخرة', value: all.filter((r) => isOverdue(r, now)).length, icon: 'bi-alarm', tone: 'danger', link: '/requests/all', query: { overdue: '1' }, hint: 'تجاوزت مدة الاستجابة' });
    }
    return out;
  });
}
