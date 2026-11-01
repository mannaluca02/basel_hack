import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProgressSnapshot } from '../../core/advisor/contracts';
import { progress } from '../../core/advisor/store/case-testing';
import { AgentActivity } from '../../core/advisor/ui-models';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { AppLanguage } from '../../core/i18n/language';
import { SummarySheet } from '../../core/layout/summary-sheet';
import { AgentDock } from './agent-dock';

@Component({
  imports: [AgentDock],
  template: `<app-agent-dock [progress]="progress()" [activity]="activity()" />`,
})
class Host {
  readonly progress = signal<ProgressSnapshot | null>(progress());
  readonly activity = signal<AgentActivity>('idle');
}

@Component({
  imports: [AgentDock],
  template: `<app-agent-dock><span class="avatar-renderer">Avatar</span></app-agent-dock>`,
})
class HostWithAvatar {}

describe('AgentDock', () => {
  let fixture: ComponentFixture<Host>;
  let root: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  const dock = () => root.querySelector('app-agent-dock') as HTMLElement;
  const button = () => root.querySelector('app-agent-dock button') as HTMLButtonElement;
  const fill = () => root.querySelector('.fill') as SVGCircleElement;
  /** Text of the element the button points to with aria-describedby. */
  const description = () =>
    root
      .querySelector(`[id="${button().getAttribute('aria-describedby')}"]`)
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();

  async function set(next: Partial<ProgressSnapshot> | null, activity?: AgentActivity) {
    fixture.componentInstance.progress.set(next === null ? null : progress(next));
    if (activity) fixture.componentInstance.activity.set(activity);
    await fixture.whenStable();
  }

  it('is a real button named after what it opens', () => {
    expect(button().type).toBe('button');
    expect(button().getAttribute('aria-haspopup')).toBe('dialog');
    expect(button().querySelector('.visually-hidden')?.textContent).toBe('Zusammenfassung öffnen');
  });

  it('describes the captured share and fills the ring to match', async () => {
    expect(description()).toBe('60% der Angaben erfasst. Assistent bereit');
    expect(fill().style.strokeDashoffset).toBe('40');

    await set({ percent: 27.5 });
    expect(description()).toContain('27% der Angaben erfasst');
    expect(fill().style.strokeDashoffset).toBe('72.5');
  });

  it('draws no fill, not even a round cap, while nothing is captured', async () => {
    expect(dock().classList).not.toContain('blank');

    await set({ percent: 0 });
    expect(dock().classList).toContain('blank');

    await set({ percent: null });
    expect(dock().classList).toContain('blank');

    await set({ percent: 2 });
    expect(dock().classList).not.toContain('blank');
  });

  it('words 100 % as information complete, never as insured', async () => {
    await set({ percent: 100 });
    expect(description()).toContain('Alle Angaben erfasst');
    expect(description()).not.toMatch(/versichert/i);
    expect(fill().style.strokeDashoffset).toBe('0');

    await set({ percent: 99.6 });
    expect(description()).toContain('99% der Angaben erfasst');
  });

  it('shows unknown progress as unknown, not as 0 %', async () => {
    await set({ percent: null });
    expect(description()).toContain('Stand der Angaben noch unbekannt');
    expect(dock().classList).toContain('unknown');
    expect(fill().style.strokeDashoffset).toBe('100');

    await set(null);
    expect(description()).toContain('Stand der Angaben noch unbekannt');
  });

  it('clamps out-of-range values and treats NaN as unknown', async () => {
    await set({ percent: -5 });
    expect(fill().style.strokeDashoffset).toBe('100');
    expect(description()).toContain('0% der Angaben erfasst');

    await set({ percent: 150 });
    expect(fill().style.strokeDashoffset).toBe('0');
    expect(description()).toContain('Alle Angaben erfasst');

    await set({ percent: NaN });
    expect(dock().classList).toContain('unknown');
    expect(description()).toContain('Stand der Angaben noch unbekannt');
  });

  it('announces an agent error to screen readers, and only an error', async () => {
    const live = () => root.querySelector('[aria-live="polite"]')?.textContent?.trim();
    expect(live()).toBe('');

    await set({}, 'speaking');
    expect(live()).toBe('');

    await set({}, 'error');
    expect(live()).toBe('Störung beim Assistenten');
  });

  it('does not mention an expert review while the information is captured', async () => {
    await set({ percent: 100, reviewOpen: true });
    expect(description()).toBe('Alle Angaben erfasst. Assistent bereit');
  });

  it.each([
    ['listening', 'Assistent hört zu'],
    ['thinking', 'Assistent denkt nach'],
    ['speaking', 'Assistent spricht'],
    ['error', 'Störung beim Assistenten'],
  ] as const)('names the %s state for screen readers', async (activity, label) => {
    await set({}, activity);
    expect(dock().getAttribute('data-activity')).toBe(activity);
    expect(description()).toContain(label);
  });

  it('opens the summary sheet and gets focus back when it closes', async () => {
    const sheet = TestBed.inject(SummarySheet);
    expect(sheet.isOpen()).toBe(false);

    button().click();
    expect(sheet.isOpen()).toBe(true);

    (document.activeElement as HTMLElement | null)?.blur();
    sheet.close();
    expect(sheet.isOpen()).toBe(false);
    expect(document.activeElement).toBe(button());
  });

  it('shows a placeholder until an avatar renderer is projected', async () => {
    expect(root.querySelector('.face .placeholder')).not.toBeNull();

    const withAvatar = TestBed.createComponent(HostWithAvatar);
    await withAvatar.whenStable();
    const face = (withAvatar.nativeElement as HTMLElement).querySelector('.face');
    expect(face?.querySelector('.avatar-renderer')?.textContent).toBe('Avatar');
    expect(face?.querySelector('.placeholder')).toBeNull();
  });

  it('translates name and description without reload', async () => {
    await TestBed.inject(AppLanguage).use('fr');
    await fixture.whenStable();

    expect(button().querySelector('.visually-hidden')?.textContent).toBe('Ouvrir le résumé');
    expect(description()).toMatch(/^60\s?% des informations saisies\. Assistant prêt$/);
  });
});
