import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { MOCK_LATENCY } from '../mock-db/latency';
import { MockDb } from '../mock-db/mock-db.service';
import { provideMockBackend } from '../mock-db/mock-repositories';
import { AuthService, MAX_OTP_FAILURES } from './auth.service';

describe('AuthService', () => {
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideMockBackend(), { provide: MOCK_LATENCY, useValue: [0, 0] }],
    });
    auth = TestBed.inject(AuthService);
  });

  it('rejects an unknown employee ID', async () => {
    const result = await firstValueFrom(auth.requestOtp('E9999'));
    expect(result).toEqual({ ok: false, reason: 'unknown' });
  });

  it('accepts the employee ID case-insensitively and signs in with the demo OTP', async () => {
    const request = await firstValueFrom(auth.requestOtp(' e1001 '));
    expect(request.ok).toBe(true);
    const verify = auth.verifyOtp('123456');
    expect(verify.ok).toBe(true);
    expect(auth.currentUser()?.employeeId).toBe('E1001');
  });

  it('counts down remaining attempts and locks after repeated wrong codes', async () => {
    await firstValueFrom(auth.requestOtp('E1001'));
    const first = auth.verifyOtp('000000');
    expect(first).toMatchObject({ ok: false, reason: 'wrong', remaining: MAX_OTP_FAILURES - 1 });
    auth.verifyOtp('000000');
    expect(auth.verifyOtp('000000')).toMatchObject({ ok: false, reason: 'locked' });
    // Even the right code is refused while locked.
    expect(auth.verifyOtp('123456')).toMatchObject({ ok: false, reason: 'locked' });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('refuses an OTP when no code was requested', () => {
    expect(auth.verifyOtp('123456')).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('restores the session identity and signs out', async () => {
    await firstValueFrom(auth.requestOtp('E1013'));
    auth.verifyOtp('123456');
    const restored = TestBed.runInInjectionContext(() => new AuthService());
    expect(restored.currentUser()?.employeeId).toBe('E1013');
    auth.logout();
    expect(auth.isAuthenticated()).toBe(false);
    expect(TestBed.runInInjectionContext(() => new AuthService()).isAuthenticated()).toBe(false);
  });

  it('a deactivated user is no longer authenticated', async () => {
    await firstValueFrom(auth.requestOtp('E1001'));
    auth.verifyOtp('123456');
    expect(auth.isAuthenticated()).toBe(true);
    TestBed.inject(MockDb).update((d) => {
      d.users.find((u) => u.employeeId === 'E1001')!.active = false;
    });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('refuses to send a code to an inactive account', async () => {
    TestBed.inject(MockDb).update((d) => {
      d.users.find((u) => u.employeeId === 'E1002')!.active = false;
    });
    expect(await firstValueFrom(auth.requestOtp('E1002'))).toEqual({ ok: false, reason: 'inactive' });
  });
});
