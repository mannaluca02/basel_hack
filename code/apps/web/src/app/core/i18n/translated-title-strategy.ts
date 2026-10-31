import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject, EMPTY, catchError, switchMap } from 'rxjs';

const APP_NAME_KEY = 'app.name';

/**
 * Route `title`s are translation keys. The document title follows both navigation and
 * language switches, e.g. `Graphiques | Pax Digital Advisor`.
 */
@Injectable()
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly pageKey = new BehaviorSubject<string | undefined>(undefined);

  constructor() {
    super();
    const transloco = inject(TranslocoService);
    const title = inject(Title);
    this.pageKey
      .pipe(
        switchMap((key) =>
          transloco
            .selectTranslate<string[]>(key ? [key, APP_NAME_KEY] : [APP_NAME_KEY])
            // A failed lookup keeps the current title but must not end the stream for good.
            .pipe(catchError(() => EMPTY)),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((parts) => title.setTitle(parts.join(' | ')));
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.pageKey.next(this.buildTitle(snapshot));
  }
}
