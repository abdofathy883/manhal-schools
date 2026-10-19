/** Scope of a scoped permission; each level includes the ones before it. */
export type Scope = 'own' | 'department' | 'branch' | 'all';

export const SCOPE_ORDER: readonly Scope[] = ['own', 'department', 'branch', 'all'];

export const SCOPE_LABELS: Record<Scope, string> = {
  own: 'طلباته فقط',
  department: 'القسم',
  branch: 'الفرع',
  all: 'جميع الفروع',
};

export interface PermissionDef {
  /** Stable key, `module.action`. */
  key: string;
  label: string;
  /** Arabic module name used to group the permission matrix. */
  module: string;
  description: string;
  scoped: boolean;
}

export interface PermissionGrant {
  key: string;
  /** Only meaningful for scoped permissions; defaults to `own`. */
  scope?: Scope;
  /** Limits the grant to specific services (e.g. workshop sees `all` only for vehicle services). */
  services?: string[];
}

export interface Role {
  id: string;
  nameAr: string;
  descriptionAr: string;
  isSystem: boolean;
  permissions: PermissionGrant[];
}

export interface User {
  id: string;
  employeeId: string;
  nameAr: string;
  mobile: string;
  email: string;
  avatarColor: string;
  /** `null` for central staff (مركزي). */
  branchId: string | null;
  departmentId: string | null;
  roleIds: string[];
  jobTitleAr: string;
  active: boolean;
}

/** Attributes of a record that scope rules are evaluated against. */
export interface ScopedResource {
  branchId?: string | null;
  departmentId?: string | null;
  createdBy?: string | null;
  assigneeId?: string | null;
  /** Service key; lets service-limited grants (`PermissionGrant.services`) be matched. */
  service?: string;
}

/** Who is asking; the part of a user that scope rules need. */
export interface ActorContext {
  userId: string;
  branchId: string | null;
  departmentId: string | null;
}
