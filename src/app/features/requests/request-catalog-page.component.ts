import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PermissionService } from '../../core/rbac/permission.service';
import {
  REQUEST_TEMPLATES,
  SERVICES,
  SERVICE_BY_KEY,
  SERVICE_GROUP_LABELS,
} from '../../domain/reference-data';
import { ServiceGroup } from '../../domain/models/request';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

/** Service catalog: only services the signed-in user may create, plus recurring-request templates. */
@Component({
  selector: 'app-request-catalog-page',
  imports: [RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="طلب جديد" subtitle="اختر الخدمة المناسبة. تظهر هنا الخدمات المتاحة لدورك فقط." />

    @if (groups().length === 0) {
      <div class="card"><app-empty-state title="لا توجد خدمات متاحة لك" message="دورك الحالي لا يتيح تقديم طلبات." /></div>
    }

    @for (g of groups(); track g.group) {
      <section class="mb-4" [attr.aria-labelledby]="'grp-' + g.group">
        <h2 class="h6 text-muted-ar mb-3" [id]="'grp-' + g.group">{{ g.label }}</h2>
        <div class="row g-3">
          @for (s of g.services; track s.key) {
            <div class="col-sm-6 col-lg-4 col-xl-3">
              <a [routerLink]="['/requests/new', s.key]" class="card h-100 text-decoration-none text-reset catalog-card">
                <div class="card-body">
                  <span class="d-inline-flex align-items-center justify-content-center rounded-3 bg-primary-subtle text-primary-emphasis mb-3" style="inline-size: 3rem; block-size: 3rem">
                    <i class="bi fs-4" [class]="s.icon" aria-hidden="true"></i>
                  </span>
                  <h3 class="h6 mb-1">{{ s.nameAr }}</h3>
                  <p class="small text-muted-ar mb-0">{{ s.descriptionAr }}</p>
                </div>
              </a>
            </div>
          }
        </div>
      </section>
    }

    @if (templates().length) {
      <section class="mb-4" aria-labelledby="grp-templates">
        <h2 class="h6 text-muted-ar mb-3" id="grp-templates">قوالب الطلبات المتكررة</h2>
        <div class="row g-3">
          @for (t of templates(); track t.id) {
            <div class="col-md-6 col-xl-4">
              <a [routerLink]="['/requests/new', t.service]" [queryParams]="{ template: t.id }" class="card h-100 text-decoration-none text-reset catalog-card">
                <div class="card-body d-flex gap-3 align-items-start">
                  <span class="d-inline-flex align-items-center justify-content-center rounded-3 bg-info-subtle text-info-emphasis flex-shrink-0" style="inline-size: 2.75rem; block-size: 2.75rem">
                    <i class="bi fs-5" [class]="t.icon" aria-hidden="true"></i>
                  </span>
                  <div>
                    <h3 class="h6 mb-1">{{ t.titleAr }}</h3>
                    <p class="small text-muted-ar mb-0">{{ serviceName(t.service) }} — تعبئة تلقائية للبيانات</p>
                  </div>
                </div>
              </a>
            </div>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .catalog-card {
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .catalog-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--mnh-shadow-lg);
    }
  `,
})
export class RequestCatalogPageComponent {
  private readonly permissions = inject(PermissionService);

  protected readonly allowed = computed(() => SERVICES.filter((s) => this.permissions.can(s.createPermission)));

  protected readonly groups = computed(() =>
    (Object.keys(SERVICE_GROUP_LABELS) as ServiceGroup[])
      .map((group) => ({ group, label: SERVICE_GROUP_LABELS[group], services: this.allowed().filter((s) => s.group === group) }))
      .filter((g) => g.services.length > 0),
  );

  protected readonly templates = computed(() => REQUEST_TEMPLATES.filter((t) => this.permissions.can(SERVICE_BY_KEY[t.service].createPermission)));

  protected serviceName(key: keyof typeof SERVICE_BY_KEY): string {
    return SERVICE_BY_KEY[key].nameAr;
  }
}
