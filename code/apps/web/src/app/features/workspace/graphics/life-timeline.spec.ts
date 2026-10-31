import { TestBed } from '@angular/core/testing';
import { LifeEventSelection } from '../../../core/layout/life-event-selection';
import { provideI18nTesting } from '../../../core/i18n/i18n-testing';
import { TimelineEntry } from './chart-options';
import { LifeTimeline } from './life-timeline';

const entry = (id: string, year: string, today = false): TimelineEntry => ({
  id,
  year,
  label: id,
  certainty: today ? 'confirmed' : 'planned',
  certaintyLabel: 'geplant',
  token: '--text-muted',
  today,
  kind: today ? 'today' : 'retirement',
});

describe('LifeTimeline', () => {
  it('lets the reader pick an event, but not today, and shows which one is picked', () => {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    const fixture = TestBed.createComponent(LifeTimeline);
    fixture.componentRef.setInput('entries', [entry('today', '2026', true), entry('retirement', '2049')]);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button.pick'));
    expect(buttons).toHaveLength(1);
    buttons[0]!.click();
    fixture.detectChanges();

    expect(TestBed.inject(LifeEventSelection).selected()).toEqual({
      eventId: 'retirement',
      kind: 'retirement',
      year: 2049,
      label: 'retirement',
    });
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
  });
});
