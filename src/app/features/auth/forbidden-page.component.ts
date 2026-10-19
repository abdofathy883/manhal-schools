import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card page-enter">
      <div class="card-body text-center py-5">
        <div class="display-1 text-danger mb-2" aria-hidden="true"><i class="bi bi-shield-lock"></i></div>
        <h1 class="h3 mb-2">ليست لديك صلاحية للوصول إلى هذه الصفحة</h1>
        <p class="text-muted-ar mb-4">
          يعتمد ما تراه في المنصة على دورك الوظيفي. إذا كنت تحتاج هذه الصلاحية فتواصل مع مدير النظام.
        </p>
        <a class="btn btn-primary" routerLink="/home">
          <i class="bi bi-house-door me-2" aria-hidden="true"></i>العودة للرئيسية
        </a>
      </div>
    </div>
  `,
})
export class ForbiddenPageComponent {}
