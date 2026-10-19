import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';
import { User } from '../../domain/models/rbac';
import { DEMO_OTP } from '../../domain/seed/users.seed';
import { UserRepository } from '../../domain/repositories';
import { Clock } from '../clock.service';
import { MockDb } from '../mock-db/mock-db.service';

const TOKEN_KEY = 'manhal:token';
export const MAX_OTP_FAILURES = 3;
export const OTP_LOCK_SECONDS = 30;
export const OTP_RESEND_SECONDS = 60;

export type OtpRequestResult =
  | { ok: true; user: User; code: string }
  | { ok: false; reason: 'unknown' | 'inactive' };

export type OtpVerifyResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'wrong'; remaining: number }
  | { ok: false; reason: 'locked' | 'expired' };

interface Pending {
  userId: string;
  failures: number;
}

/** Simulated token kept in `sessionStorage`: just enough to restore the demo identity. */
function readSession(): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { uid } = JSON.parse(atob(raw)) as { uid: string };
    return uid;
  } catch {
    return null;
  }
}

function writeSession(userId: string | null): void {
  try {
    if (userId) sessionStorage.setItem(TOKEN_KEY, btoa(JSON.stringify({ uid: userId, iat: Date.now() })));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable: the in-memory session still works for this page load.
  }
}

/**
 * Simulated authentication: employee ID + OTP (always `123456`), plus an instant
 * identity switch for Demo Mode. The current user is derived from the live mock
 * database, so role/branch edits apply immediately.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly users = inject(UserRepository);
  private readonly db = inject(MockDb);
  private readonly clock = inject(Clock);

  private readonly sessionUserId = signal<string | null>(readSession());
  private pending: Pending | null = null;
  private readonly _lockedUntil = signal<number>(0);

  readonly lockedUntil = this._lockedUntil.asReadonly();

  /** `null` when signed out, or when the stored user no longer exists / was deactivated. */
  readonly currentUser = computed<User | null>(() => {
    const id = this.sessionUserId();
    const user = id ? this.db.users().find((u) => u.id === id) : undefined;
    return user?.active ? user : null;
  });

  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  /** Step 1: validate the employee ID and "send" the SMS. */
  requestOtp(employeeId: string): Observable<OtpRequestResult> {
    return this.users.getByEmployeeId(employeeId).pipe(
      map((user): OtpRequestResult => {
        if (!user) return { ok: false, reason: 'unknown' };
        if (!user.active) return { ok: false, reason: 'inactive' };
        this.pending = { userId: user.id, failures: 0 };
        return { ok: true, user, code: DEMO_OTP };
      }),
    );
  }

  /** Step 2: check the OTP. Three wrong codes lock the form for `OTP_LOCK_SECONDS`. */
  verifyOtp(code: string): OtpVerifyResult {
    if (this.clock.now().getTime() < this._lockedUntil()) return { ok: false, reason: 'locked' };
    const pending = this.pending;
    if (!pending) return { ok: false, reason: 'expired' };

    if (code !== DEMO_OTP) {
      pending.failures++;
      if (pending.failures >= MAX_OTP_FAILURES) {
        this._lockedUntil.set(this.clock.now().getTime() + OTP_LOCK_SECONDS * 1000);
        pending.failures = 0;
        return { ok: false, reason: 'locked' };
      }
      return { ok: false, reason: 'wrong', remaining: MAX_OTP_FAILURES - pending.failures };
    }

    const user = this.db.users().find((u) => u.id === pending.userId);
    if (!user) return { ok: false, reason: 'expired' };
    this.pending = null;
    this.setSession(user.id);
    return { ok: true, user };
  }

  cancelPending(): void {
    this.pending = null;
  }

  /** Demo Mode: switch identity instantly, no OTP. */
  switchTo(userId: string): boolean {
    const user = this.db.users().find((u) => u.id === userId && u.active);
    if (!user) return false;
    this.setSession(user.id);
    return true;
  }

  logout(): void {
    this.pending = null;
    this.sessionUserId.set(null);
    writeSession(null);
  }

  private setSession(userId: string): void {
    this.sessionUserId.set(userId);
    writeSession(userId);
  }
}
