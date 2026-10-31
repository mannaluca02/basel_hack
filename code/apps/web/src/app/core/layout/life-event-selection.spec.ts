import { TestBed } from '@angular/core/testing';
import { LifeEventSelection } from './life-event-selection';

describe('LifeEventSelection', () => {
  it('selects an event and clears it when the same one is picked again', () => {
    const selection = TestBed.inject(LifeEventSelection);
    const home = { eventId: 'event_home', kind: 'home_purchase', year: 2031, label: 'Eigenheim' } as const;

    selection.toggle(home);
    expect(selection.selected()).toEqual(home);
    selection.toggle({ ...home, eventId: 'event_retirement', kind: 'retirement', year: 2049 });
    expect(selection.selected()?.eventId).toBe('event_retirement');
    selection.toggle({ ...home, eventId: 'event_retirement', kind: 'retirement', year: 2049 });
    expect(selection.selected()).toBeNull();
  });
});
