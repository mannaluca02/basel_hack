import { createPaxAvatar } from '../../../../../../avatar-prototype/pax-avatar.js';
import { connectAvatarAudio } from './voice-avatar';

/** Exercise the real renderer, not a face-event spy: only the audio clock/source are synthetic. */
it('remote amplitude drives the actual speaking pose and geometry; silence and Stop clear it without playback evidence', () => {
  let now = 0;
  let frames: FrameRequestCallback[] = [];
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  const quietHost = document.createElement('div');
  const loudHost = document.createElement('div');
  const quiet = createPaxAvatar(quietHost);
  const loud = createPaxAvatar(loudHost);
  let quietLevel = 0;
  let loudLevel = 0;
  const advance = (milliseconds: number) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) {
      now += 50;
      const scheduled = frames;
      frames = [];
      scheduled.forEach(frame => frame(now));
    }
  };
  try {
    connectAvatarAudio(quiet, () => quietLevel);
    connectAvatarAudio(loud, () => loudLevel);
    loud.handle({ type: 'activity', state: 'thinking' });
    advance(100);
    expect(loud.state.face).toBe('listening');
    quietLevel = 0.2;
    loudLevel = 0.8;
    advance(1000);
    expect(quiet.state.face).toBe('explaining');
    expect(loud.state.face).toBe('explaining');
    expect(loud.state.level).toBeGreaterThan(quiet.state.level);
    const eyeHeight = (host: HTMLElement) => Number(host.querySelector('[data-part="eyeL"]')!.getAttribute('height'));
    expect(eyeHeight(loudHost)).toBeGreaterThan(eyeHeight(quietHost));
    expect(loud.state.playing).toBeNull(); // Local energy never invents a playbackId or completion.
    loudLevel = 0;
    advance(700);
    expect(loud.state.face).toBe('listening');
    expect(loud.state.localAudioActive).toBe(false);
    loudLevel = 0.8;
    advance(200);
    expect(loud.state.face).toBe('explaining');
    connectAvatarAudio(loud, null);
    loud.handle({ type: 'activity', state: 'idle' });
    expect(loud.state.localAudioActive).toBe(false);
    expect(loud.state.level).toBe(0);
    expect(loud.state.face).toBe('neutral');
    expect(loud.state.playing).toBeNull();
  } finally {
    quiet.destroy(); loud.destroy();
    vi.unstubAllGlobals(); vi.restoreAllMocks();
  }
});
