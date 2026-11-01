import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VoiceActivity } from '../../core/voice/voice-activity';
import { PAX_AVATAR_MODULE, PaxiAvatar } from './paxi-avatar';
import { FakePaxAvatar, provideFakePaxAvatar } from './paxi-testing';

describe('PaxiAvatar', () => {
  let created: FakePaxAvatar[];

  beforeEach(() => {
    created = [];
  });

  async function render(loader = provideFakePaxAvatar(created)) {
    TestBed.configureTestingModule({ providers: [loader] });
    const fixture = TestBed.createComponent(PaxiAvatar);
    await settle(fixture);
    return fixture;
  }

  // The renderer arrives by promise after the first render; one more round draws with it.
  async function settle(fixture: ComponentFixture<PaxiAvatar>) {
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();
  }

  const activities = (avatar: FakePaxAvatar) =>
    avatar.events.filter((event) => event.type === 'activity').map((event) => event.state);
  const visuals = (avatar: FakePaxAvatar) =>
    avatar.events.filter((event) => event.type === 'local-audio-visual').map((event) => event.enabled);

  it('draws one Paxi into its canvas, hidden from screen readers, and destroys him with the component', async () => {
    const fixture = await render();

    expect(created).toHaveLength(1);
    expect(created[0].host?.classList).toContain('canvas');
    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');

    fixture.destroy();
    expect(created[0].destroyed).toBe(true);
  });

  it('passes listening and thinking on; speaking and an error leave the face idle', async () => {
    const fixture = await render();
    const set = async (activity: 'listening' | 'thinking' | 'speaking' | 'error') => {
      fixture.componentRef.setInput('activity', activity);
      await settle(fixture);
    };

    await set('listening');
    await set('thinking');
    await set('speaking');
    await set('error');

    expect(activities(created[0])).toEqual(['idle', 'listening', 'thinking', 'idle', 'idle']);
  });

  it('draws no Paxi when the component is gone before the renderer arrives', async () => {
    let arrive!: (module: { createPaxAvatar: () => FakePaxAvatar }) => void;
    const create = vi.fn(() => new FakePaxAvatar());
    TestBed.configureTestingModule({
      providers: [{ provide: PAX_AVATAR_MODULE, useValue: () => new Promise((r) => (arrive = r)) }],
    });
    const fixture = TestBed.createComponent(PaxiAvatar);
    await fixture.whenStable();

    fixture.destroy();
    arrive({ createPaxAvatar: create });
    await Promise.resolve();

    expect(create).not.toHaveBeenCalled();
  });

  it('lets the voice of the call drive the mouth, and lets go when the call ends', async () => {
    const fixture = await render();
    const voice = {} as MediaStream;

    fixture.componentRef.setInput('audio', voice);
    fixture.componentRef.setInput('activity', 'listening');
    await settle(fixture);
    // A new activity does not attach the same voice again.
    fixture.componentRef.setInput('activity', 'thinking');
    await settle(fixture);
    fixture.componentRef.setInput('audio', null);
    await settle(fixture);

    expect(created[0].audio).toEqual([voice, null]);
    // Reply segments instead of the local audio visual, so the reply emotions can show.
    expect(visuals(created[0])).toEqual([false, false]);
  });

  it('moves the mouth with a generated level while the advisor speaks without audio here', async () => {
    const fixture = await render();

    fixture.componentRef.setInput('activity', 'speaking');
    await settle(fixture);
    const level = created[0].audio[0] as () => number;
    fixture.componentRef.setInput('activity', 'listening');
    await settle(fixture);

    expect(typeof level).toBe('function');
    expect(level()).toBeGreaterThanOrEqual(0);
    expect(level()).toBeLessThanOrEqual(1);
    expect(created[0].audio[1]).toBeNull();
    expect(visuals(created[0])).toEqual([true, false]);
  });

  it.each([
    ['cannot be loaded', () => Promise.reject(new Error('offline'))],
    [
      'cannot draw here',
      () =>
        Promise.resolve({
          createPaxAvatar: () => {
            throw new TypeError('matchMedia is not a function');
          },
        }),
    ],
  ])('shows a placeholder when the renderer %s', async (_, load) => {
    const fixture = await render({ provide: PAX_AVATAR_MODULE, useValue: load });

    expect(fixture.nativeElement.querySelector('.placeholder')).not.toBeNull();
    expect(fixture.nativeElement.classList).toContain('failed');
  });

  it('shows every reply emotion of the live call, also the same one again', async () => {
    const fixture = await render();
    const voice = TestBed.inject(VoiceActivity);
    const emotions = () => created[0].events.filter((event) => event.type === 'emotion').map((event) => event.emotion);

    voice.emotion.set({ emotion: 'curious', seq: 1 });
    await settle(fixture);
    voice.emotion.set({ emotion: 'curious', seq: 2 });
    await settle(fixture);
    voice.emotion.set({ emotion: 'empathetic', seq: 3 });
    await settle(fixture);
    voice.emotion.set(null);
    await settle(fixture);

    expect(emotions()).toEqual(['curious', 'curious', 'empathetic']);
  });
});

