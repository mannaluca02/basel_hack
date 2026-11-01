import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { CallState, VoiceCall } from '../../core/voice/voice-call';
import { CallControls } from './call-controls';

/** The call bar only talks to VoiceCall; a stand-in records what it was asked to do. */
class FakeVoiceCall {
  readonly state = signal<CallState>('idle');
  readonly muted = signal(false);
  readonly notice = signal<{ text: string } | null>(null);
  viaPaxi = false;
  readonly calls: string[] = [];
  start() {
    this.calls.push('start');
  }
  confirm() {
    this.calls.push('confirm');
  }
  cancel() {
    this.calls.push('cancel');
  }
  end() {
    this.calls.push('end');
  }
  toggleMute() {
    this.calls.push('toggleMute');
    this.muted.update((m) => !m);
  }
  stopSpeaking() {
    this.calls.push('stopSpeaking');
  }
}

describe('CallControls', () => {
  let fixture: ComponentFixture<CallControls>;
  let call: FakeVoiceCall;
  const root = () => fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(root().querySelectorAll<HTMLButtonElement>('button'));
  const button = (text: string) => buttons().find((b) => b.textContent?.includes(text))!;

  function render(viaPaxi: boolean) {
    call = new FakeVoiceCall();
    call.viaPaxi = viaPaxi;
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), { provide: VoiceCall, useValue: call }],
    });
    fixture = TestBed.createComponent(CallControls);
    fixture.detectChanges();
  }

  it('starts the scripted call in the mock and offers mute and end while it runs', () => {
    render(false);
    expect(root().querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Gespräch');
    button('Gespräch starten').click();
    expect(call.calls).toEqual(['start']);

    call.state.set('active');
    fixture.detectChanges();
    expect(root().textContent).toContain('Gespräch läuft');
    expect(buttons().some((b) => b.textContent?.includes('Paxi unterbrechen'))).toBe(false);

    button('Stumm').click();
    fixture.detectChanges();
    expect(button('Ton an').getAttribute('aria-pressed')).toBe('true');
    button('Gespräch beenden').click();
    expect(call.calls).toEqual(['start', 'toggleMute', 'end']);
  });

  it('shows the voice notice before Paxi opens, and lets the person cancel', () => {
    render(true);
    button('Mit Paxi sprechen').click();
    call.state.set('notice');
    call.notice.set({ text: 'Synthetic voice notice' });
    fixture.detectChanges();
    expect(root().textContent).toContain('Synthetic voice notice');

    button('Abbrechen').click();
    button('Verstanden, Paxi öffnen').click();
    expect(call.calls).toEqual(['start', 'cancel', 'confirm']);
  });

  it('steers the call in Paxi\'s window: interrupt, mute and end', () => {
    render(true);
    call.state.set('active');
    fixture.detectChanges();
    expect(root().textContent).toContain('Paxi ist in einem eigenen Fenster offen');

    button('Paxi unterbrechen').click();
    button('Stumm').click();
    button('Gespräch beenden').click();
    expect(call.calls).toEqual(['stopSpeaking', 'toggleMute', 'end']);
  });
});
