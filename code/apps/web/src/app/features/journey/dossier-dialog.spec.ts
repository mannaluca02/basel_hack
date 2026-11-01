import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CUSTOMER_SESSION_KEY } from '../../core/advisor/api/customer-api';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { DossierDialog } from './dossier-dialog';

describe('DossierDialog', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  });

  function render() {
    sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ caseId: 'case_d', csrfToken: 'csrf' }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api', dataSource: 'api' } },
      ],
    });
    const fixture = TestBed.createComponent(DossierDialog);
    fixture.componentRef.setInput('caseId', 'case_d');
    const closed: unknown[] = [];
    fixture.componentInstance.closed.subscribe(() => closed.push(true));
    fixture.detectChanges();
    return { fixture, closed, http: TestBed.inject(HttpTestingController), root: fixture.nativeElement as HTMLElement };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  afterEach(() => sessionStorage.clear());

  it('prints only the loaded dossier and reports closing', async () => {
    const { fixture, closed, http, root } = render();
    await settle();
    expect(root.querySelector<HTMLButtonElement>('[data-action="print"]')!.disabled).toBe(true);
    http.expectOne('/api/cases/case_d/dossier?audience=customer&format=html').flush('<h1>Dossier</h1>');
    await settle();
    fixture.detectChanges();
    const frame = root.querySelector('iframe')!;
    const print = vi.fn();
    Object.defineProperty(frame, 'contentWindow', { value: { print } });
    root.querySelector<HTMLButtonElement>('[data-action="print"]')!.click();
    expect(print).toHaveBeenCalledOnce();

    root.querySelector<HTMLButtonElement>('[data-action="close"]')!.click();
    expect(closed).toHaveLength(1);
  });

  it('says so when the dossier cannot be loaded', async () => {
    const { fixture, http, root } = render();
    await settle();
    http.expectOne('/api/cases/case_d/dossier?audience=customer&format=html').flush('nope', { status: 500, statusText: 'Error' });
    await settle();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('nicht geladen');
    expect(root.querySelector<HTMLButtonElement>('[data-action="print"]')!.disabled).toBe(true);
  });
});
