import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { interval } from 'rxjs';
import { AuthService, OTP_RESEND_SECONDS } from '../../core/auth/auth.service';
import { Clock } from '../../core/clock.service';
import { ToastService } from '../../core/notifications/toast.service';
import { User } from '../../domain/models/rbac';
import { DEMO_OTP, QUICK_LOGIN_HINTS } from '../../domain/seed/users.seed';
import { SCHOOL_TAGLINE } from '../../domain/reference-data';
import { BrandLogoComponent } from '../../shared/ui/brand-logo.component';
import { OtpInputComponent } from '../../shared/ui/otp-input.component';

type Step = 'id' | 'otp';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, BrandLogoComponent, OtpInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly clock = inject(Clock);

  /** Bound from the `returnUrl` query parameter (router input binding). */
  readonly returnUrl = input<string | undefined>();

  protected readonly otpBox = viewChild(OtpInputComponent);
  protected readonly step = signal<Step>('id');
  protected readonly employeeId = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  protected readonly otp = signal('');
  protected readonly user = signal<User | null>(null);
  protected readonly busy = signal(false);
  protected readonly idError = signal<string | null>(null);
  protected readonly otpError = signal<string | null>(null);
  protected readonly shaking = signal(false);
  protected readonly submitted = signal(false);

  protected readonly hints = QUICK_LOGIN_HINTS;
  protected readonly demoOtp = DEMO_OTP;
  protected readonly tagline = SCHOOL_TAGLINE;

  private readonly now = signal(this.clock.now().getTime());
  private readonly resendAt = signal(0);

  protected readonly resendLeft = computed(() => Math.max(0, Math.ceil((this.resendAt() - this.now()) / 1000)));
  protected readonly lockLeft = computed(() => Math.max(0, Math.ceil((this.auth.lockedUntil() - this.now()) / 1000)));
  protected readonly locked = computed(() => this.lockLeft() > 0);

  protected readonly maskedMobile = computed(() => {
    const m = this.user()?.mobile ?? '';
    return m.length >= 10 ? `${m.slice(0, 3)}•••••${m.slice(-2)}` : m;
  });

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.now.set(this.clock.now().getTime()));
  }

  protected fill(employeeId: string): void {
    this.employeeId.setValue(employeeId);
    this.idError.set(null);
  }

  protected submitId(): void {
    this.submitted.set(true);
    this.idError.set(null);
    if (this.employeeId.invalid) return;
    this.sendCode();
  }

  protected resend(): void {
    if (this.resendLeft() > 0 || this.busy()) return;
    this.sendCode(true);
  }

  protected changeId(): void {
    this.auth.cancelPending();
    this.step.set('id');
    this.otpError.set(null);
    this.otpBox()?.clear();
  }

  protected verify(code = this.otp()): void {
    if (code.length !== 6 || this.busy()) return;
    const result = this.auth.verifyOtp(code);
    if (result.ok) {
      this.toasts.success(`مرحبًا ${result.user.nameAr}`, 'تم تسجيل الدخول بنجاح.');
      void this.router.navigateByUrl(this.returnUrl() || '/home');
      return;
    }
    this.now.set(this.clock.now().getTime());
    this.shake();
    if (result.reason === 'wrong') {
      this.otpError.set(`رمز التحقق غير صحيح. المحاولات المتبقية: ${result.remaining}`);
    } else if (result.reason === 'locked') {
      this.otpError.set('تم إيقاف المحاولة مؤقتًا بسبب تكرار الخطأ.');
    } else {
      this.otpError.set('انتهت صلاحية الرمز. أعد إرسال رمز جديد.');
    }
    this.otpBox()?.clear();
  }

  private sendCode(isResend = false): void {
    this.busy.set(true);
    this.auth.requestOtp(this.employeeId.value).subscribe((result) => {
      this.busy.set(false);
      if (!result.ok) {
        this.idError.set(
          result.reason === 'unknown'
            ? 'رقم الموظف غير مسجل في النظام. تأكد من الرقم وحاول مرة أخرى.'
            : 'هذا الحساب موقوف. تواصل مع مدير النظام.',
        );
        this.shake();
        return;
      }
      this.user.set(result.user);
      this.step.set('otp');
      this.otpError.set(null);
      this.resendAt.set(this.clock.now().getTime() + OTP_RESEND_SECONDS * 1000);
      this.now.set(this.clock.now().getTime());
      this.toasts.show(
        'primary',
        'رسالة نصية (محاكاة)',
        `رمز التحقق الخاص بك: ${result.code}${isResend ? ' — تم إعادة الإرسال' : ''}`,
        12000,
      );
      queueMicrotask(() => this.otpBox()?.focusFirst());
    });
  }

  private shake(): void {
    this.shaking.set(true);
    setTimeout(() => this.shaking.set(false), 450);
  }
}
