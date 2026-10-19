import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SERVICE_BY_KEY } from '../../domain/reference-data';
import { ServiceKey } from '../../domain/models/request';
import { PermissionService } from '../rbac/permission.service';
import { AuthService } from './auth.service';

/** Sends signed-out visitors to the login page, remembering where they were going. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps signed-in users away from the login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/home']) : true;
};

/**
 * Requires ANY of `data.requiresAny` permissions; otherwise shows the 403 page.
 * Usage: `{ path: 'x', canActivate: [permissionGuard], data: { requiresAny: ['reports.executive'] } }`.
 */
export const permissionGuard: CanActivateFn = (route) => {
  const permissions = inject(PermissionService);
  const router = inject(Router);
  const required = (route.data['requiresAny'] as readonly string[] | undefined) ?? [];
  return required.length === 0 || permissions.canAny(required) ? true : router.createUrlTree(['/forbidden']);
};

/** `requests/new/:service` — the service must exist and the user must hold its create permission. */
export const createServiceGuard: CanActivateFn = (route) => {
  const permissions = inject(PermissionService);
  const router = inject(Router);
  const def = SERVICE_BY_KEY[route.params['service'] as ServiceKey];
  return def && permissions.can(def.createPermission) ? true : router.createUrlTree(['/forbidden']);
};
