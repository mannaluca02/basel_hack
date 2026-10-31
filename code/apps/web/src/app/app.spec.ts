import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { provideI18nTesting } from './core/i18n/i18n-testing';
import { AppLanguage } from './core/i18n/language';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideI18nTesting()],
    }).compileComponents();
  });

  it('renders one link per workspace tab', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('nav a');

    expect(Array.from(links, (a) => a.getAttribute('href'))).toEqual([
      '/graphics',
      '/risks',
      '/chat',
      '/info',
    ]);
  });

  it.each([
    ['/graphics', 'Grafiken'],
    ['/risks', 'Risiken'],
    ['/chat', 'Chat'],
    ['/info', 'Info'],
  ])('lazy-loads the tab for %s', async (url, heading) => {
    const harness = await RouterTestingHarness.create(url);

    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe(heading);
  });

  it('redirects the root and unknown paths to graphics', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Grafiken');

    await harness.navigateByUrl('/does-not-exist');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Grafiken');
  });

  it('switches shell, open tab and document title to another language without reload', async () => {
    const harness = await RouterTestingHarness.create();
    const fixture = TestBed.createComponent(App);
    await harness.navigateByUrl('/risks');
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const navLabels = () => Array.from(root.querySelectorAll('nav a'), (a) => a.textContent);

    expect(navLabels()).toEqual(['Grafiken', 'Risiken', 'Chat', 'Info']);
    expect(document.title).toBe('Risiken | Pax Digital Advisor');

    await TestBed.inject(AppLanguage).use('fr');
    await fixture.whenStable();
    await harness.fixture.whenStable();

    expect(navLabels()).toEqual(['Graphiques', 'Risques', 'Chat', 'Infos']);
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Espace de travail');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Risques');
    expect(document.title).toBe('Risques | Pax Digital Advisor');
  });
});
