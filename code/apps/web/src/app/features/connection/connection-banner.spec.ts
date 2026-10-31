import { TestBed } from '@angular/core/testing';
import { AdvisorDataSource } from '../../core/advisor/advisor-data-source';
import { FakeDataSource } from '../../core/advisor/store/case-testing';
import { Consent } from '../../core/consent/consent';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { ConnectionBanner } from './connection-banner';

describe('ConnectionBanner', () => {
  let source: FakeDataSource;

  function render() {
    const fixture = TestBed.createComponent(ConnectionBanner);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    source = new FakeDataSource();
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), { provide: AdvisorDataSource, useValue: source }],
    });
    sessionStorage.clear();
    TestBed.inject(Consent).grant();
  });

  it('stays hidden before the first connection', () => {
    const fixture = render();
    expect(fixture.nativeElement.querySelector('.banner')).toBeNull();
  });

  it('shows a drop with a reconnect action and hides again once the stream is back', () => {
    const fixture = render();
    source.connectionState.next('connected');
    fixture.detectChanges();
    source.connectionState.next('disconnected');
    fixture.detectChanges();

    const banner: HTMLElement = fixture.nativeElement.querySelector('.banner');
    expect(banner.getAttribute('role')).toBe('status');
    banner.querySelector<HTMLButtonElement>('.retry')!.click();
    fixture.detectChanges();

    expect(source.connectionState.value).toBe('connected');
    expect(fixture.nativeElement.querySelector('.banner')).toBeNull();
  });

  it('says it is reconnecting while the browser retries', () => {
    const fixture = render();
    source.connectionState.next('connected');
    fixture.detectChanges();
    source.connectionState.next('connecting');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.banner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.retry')).toBeNull();
  });
});
