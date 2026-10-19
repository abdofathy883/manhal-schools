import { Route, Routes } from '@angular/router';
import { authGuard, createServiceGuard, guestGuard, permissionGuard } from './core/auth/guards';
import { ShellComponent } from './core/layout/shell.component';
import { MENU } from './core/layout/menu.config';

const placeholder = () =>
  import('./shared/ui/placeholder-page.component').then((m) => m.PlaceholderPageComponent);

const requires = (route: string) => MENU.find((m) => m.route === route)?.requiresAny;

/** Route to a later-phase screen; replaced by the real feature when it is built. */
const stub = (path: string, title: string, breadcrumb = title): Route => {
  const requiresAny = MENU.find((m) => m.route.endsWith(`/${path}`))?.requiresAny;
  return {
    path,
    loadComponent: placeholder,
    ...(requiresAny ? { canActivate: [permissionGuard] } : {}),
    data: { title, breadcrumb, ...(requiresAny ? { requiresAny } : {}) },
  };
};

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        loadComponent: () => import('./features/home/home-page.component').then((m) => m.HomePageComponent),
        data: { breadcrumb: 'الرئيسية' },
      },
      {
        path: 'forbidden',
        loadComponent: () => import('./features/auth/forbidden-page.component').then((m) => m.ForbiddenPageComponent),
        data: { breadcrumb: 'غير مصرّح' },
      },
      {
        path: 'requests',
        data: { breadcrumb: 'الطلبات' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'mine' },
          {
            path: 'new',
            data: { breadcrumb: 'طلب جديد' },
            children: [
              {
                path: '',
                canActivate: [permissionGuard],
                data: { requiresAny: MENU.find((m) => m.route === '/requests/new')?.requiresAny },
                loadComponent: () => import('./features/requests/request-catalog-page.component').then((m) => m.RequestCatalogPageComponent),
              },
              {
                path: ':service',
                canActivate: [createServiceGuard],
                data: { breadcrumb: 'نموذج الطلب' },
                loadComponent: () => import('./features/requests/request-form-page.component').then((m) => m.RequestFormPageComponent),
              },
            ],
          },
          {
            path: 'mine',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'طلباتي', mode: 'mine', requiresAny: ['request.view'] },
            loadComponent: () => import('./features/requests/requests-list-page.component').then((m) => m.RequestsListPageComponent),
          },
          {
            path: 'all',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'طلبات ضمن نطاقي', mode: 'scope', requiresAny: ['request.view'] },
            loadComponent: () => import('./features/requests/requests-list-page.component').then((m) => m.RequestsListPageComponent),
          },
          {
            path: ':id',
            data: { breadcrumb: 'تفاصيل الطلب' },
            loadComponent: () => import('./features/requests/request-detail-page.component').then((m) => m.RequestDetailPageComponent),
          },
        ],
      },
      {
        path: 'notifications',
        data: { breadcrumb: 'الإشعارات' },
        loadComponent: () => import('./features/notifications/notifications-page.component').then((m) => m.NotificationsPageComponent),
      },
      {
        path: 'approvals',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'صندوق الاعتمادات', requiresAny: requires('/approvals') },
        loadComponent: () => import('./features/approvals/approvals-page.component').then((m) => m.ApprovalsPageComponent),
      },
      {
        path: 'workbench',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'شاشة المنفّذ', requiresAny: requires('/workbench') },
        loadComponent: () => import('./features/workbench/workbench-page.component').then((m) => m.WorkbenchPageComponent),
      },
      {
        path: 'fleet',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'الورشة المركزية', requiresAny: requires('/fleet') },
        loadComponent: () => import('./features/fleet/fleet-page.component').then((m) => m.FleetPageComponent),
      },
      {
        path: 'fleet/vehicles/:id',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'ملف المركبة', requiresAny: ['fleet.vehicle.view'] },
        loadComponent: () => import('./features/fleet/vehicle-file-page.component').then((m) => m.VehicleFilePageComponent),
      },
      {
        path: 'fleet/drivers/:id',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'ملف السائق', requiresAny: ['fleet.driver.view'] },
        loadComponent: () => import('./features/fleet/driver-file-page.component').then((m) => m.DriverFilePageComponent),
      },
      {
        path: 'warehouse',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'المستودع', requiresAny: requires('/warehouse') },
        loadComponent: () => import('./features/warehouse/warehouse-page.component').then((m) => m.WarehousePageComponent),
      },
      {
        path: 'purchasing',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'المشتريات', requiresAny: requires('/purchasing') },
        loadComponent: () => import('./features/purchasing/purchasing-page.component').then((m) => m.PurchasingPageComponent),
      },
      {
        path: 'transport',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'النقل وتقويم الباصات', requiresAny: requires('/transport') },
        loadComponent: () => import('./features/transport/transport-page.component').then((m) => m.TransportPageComponent),
      },
      {
        path: 'complaints',
        canActivate: [permissionGuard],
        data: { breadcrumb: 'صندوق الشكاوى', mode: 'scope', service: 'complaint', heading: 'صندوق الشكاوى', requiresAny: requires('/complaints') },
        loadComponent: () => import('./features/requests/requests-list-page.component').then((m) => m.RequestsListPageComponent),
      },
      stub('reports', 'التقارير واللوحات'),
      {
        path: 'admin',
        data: { breadcrumb: 'الإدارة' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'users' },
          {
            path: 'users',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'المستخدمون', requiresAny: requires('/admin/users') },
            loadComponent: () => import('./features/admin/users/users-page.component').then((m) => m.UsersPageComponent),
          },
          {
            path: 'rbac',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'الأدوار والصلاحيات', requiresAny: requires('/admin/rbac') },
            loadComponent: () => import('./features/admin/rbac/rbac-page.component').then((m) => m.RbacPageComponent),
          },
          {
            path: 'reference',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'البيانات المرجعية', requiresAny: requires('/admin/reference') },
            loadComponent: () => import('./features/admin/reference/reference-page.component').then((m) => m.ReferencePageComponent),
          },
          {
            path: 'sla',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'مدد الاستجابة', requiresAny: requires('/admin/sla') },
            loadComponent: () => import('./features/admin/settings/sla-page.component').then((m) => m.SlaPageComponent),
          },
          {
            path: 'limits',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'الحدود المالية', requiresAny: requires('/admin/limits') },
            loadComponent: () => import('./features/admin/settings/limits-page.component').then((m) => m.LimitsPageComponent),
          },
          {
            path: 'audit',
            canActivate: [permissionGuard],
            data: { breadcrumb: 'سجل التدقيق', requiresAny: requires('/admin/audit') },
            loadComponent: () => import('./features/admin/audit/audit-page.component').then((m) => m.AuditPageComponent),
          },
        ],
      },
      {
        path: 'dev/kit',
        loadComponent: () => import('./features/dev/ui-kit-page.component').then((m) => m.UiKitPageComponent),
        data: { breadcrumb: 'معرض المكونات' },
      },
    ],
  },
  { path: '**', redirectTo: 'home' },
];
