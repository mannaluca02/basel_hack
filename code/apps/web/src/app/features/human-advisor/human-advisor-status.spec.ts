import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { provideAdvisorDataSource } from '../../core/advisor/provide-advisor-data-source';
import { HumanAdvisorStatus } from './human-advisor-status';

describe('HumanAdvisorStatus', () => {
  function render(placement: 'banner' | 'sheet') {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideI18nTesting(),
        provideAdvisorDataSource(),
        { provide: APP_ENVIRONMENT, useValue: { production: false, apiBaseUrl: '/api', dataSource: 'mock' } },
      ],
    });
    const fixture = TestBed.createComponent(HumanAdvisorStatus);
    fixture.componentRef.setInput('placement', placement);
    fixture.detectChanges();
    return fixture;
  }

  it('offers the request in the sheet and then shows the Pax contact and the way back', async () => {
    const fixture = render('sheet');
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    fixture.detectChanges();

    const status: HTMLElement = fixture.nativeElement.querySelector('.status');
    expect(status.querySelector('a')!.getAttribute('href')).toBe('tel:+41612776666');
    status.querySelector('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status')).toBeNull();
  });

  it('stays out of the way as a banner until help was asked for', () => {
    const fixture = render('banner');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
