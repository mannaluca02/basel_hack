import { createPaxAvatar } from '../../../../../../avatar-prototype/pax-avatar.js';
import { connectAvatarAudio, followAvatarVoice } from './voice-avatar';

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

describe('followAvatarVoice', () => {
  /** The real renderer with a synthetic level and clock; the "stream" is the level function. */
  function realAvatar() {
    let now = 0;
    let frames: FrameRequestCallback[] = [];
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
    const avatar = createPaxAvatar(document.createElement('div'), { emotionHoldMs: 0 });
    let level = 0;
    const stop = followAvatarVoice(avatar, (() => level) as unknown as MediaStream);
    const advance = (milliseconds: number) => {
      for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) {
        now += 50;
        const scheduled = frames;
        frames = [];
        scheduled.forEach((frame) => frame(now));
        vi.advanceTimersByTime(50);
      }
    };
    return { avatar, stop, advance, speak: (value: number) => (level = value) };
  }
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the reply emotions while Paxi speaks, listening and thinking in between', () => {
    const { avatar, stop, advance, speak } = realAvatar();
    try {
      avatar.handle({ type: 'activity', state: 'thinking' });
      advance(100);
      expect(avatar.state.face).toBe('thinking');

      // GPT-Live classified the reply as curious; Paxi speaks: the face is curious, not explaining.
      avatar.handle({ type: 'emotion', emotion: 'curious' });
      speak(0.6);
      advance(300);
      expect(avatar.state.playing).toMatch(/^visual-/);
      expect(avatar.state.face).toBe('curious');
      avatar.handle({ type: 'emotion', emotion: 'empathetic' });
      advance(100);
      expect(avatar.state.face).toBe('empathetic');

      // A short breath is no end of the reply; 600 ms quiet are.
      speak(0);
      advance(300);
      expect(avatar.state.playing).not.toBeNull();
      advance(600);
      expect(avatar.state.playing).toBeNull();
      avatar.handle({ type: 'activity', state: 'listening' });
      advance(100);
      expect(avatar.state.face).toBe('listening');

      // The next reply is a segment of its own.
      avatar.handle({ type: 'emotion', emotion: 'presenting_offer' });
      speak(0.6);
      advance(200);
      expect(avatar.state.playing).toBe('visual-2');
      expect(avatar.state.face).toBe('presenting_offer');
    } finally {
      stop();
      avatar.destroy();
    }
    expect(avatar.state.playing).toBeNull();
  });
});
