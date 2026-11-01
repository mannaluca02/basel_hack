import { PaxiCaseVoice, VoiceBrowser } from './paxi-case-voice';
import type { VoiceSessionStartResponse } from '@pax/contracts';

it('Stop wins over late microphone permission and never starts a provider request',async()=>{
  let permission!:(stream:MediaStream)=>void;
  const track={stop:vi.fn()},open=vi.fn();
  const browser={microphone:()=>new Promise<MediaStream>(resolve=>permission=resolve)} as VoiceBrowser;
  const transport=new PaxiCaseVoice({open,close:vi.fn(),opening:()=>'',onStatus:vi.fn(),onTurn:vi.fn(),onAudio:vi.fn(),onEvent:vi.fn(),onTrace:vi.fn()},browser);
  const start=transport.start();
  transport.stop();
  permission({getTracks:()=>[track]} as unknown as MediaStream);
  await start;
  expect(track.stop).toHaveBeenCalledOnce();expect(open).not.toHaveBeenCalled();
});

function connectedBrowser() {
  const track={stop:vi.fn()};
  const channel={readyState:'open',send:vi.fn(),close:vi.fn(),onmessage:null as ((event:{data:string})=>void)|null,onclose:null as (()=>void)|null};
  const peer={iceGatheringState:'complete',localDescription:{sdp:'v=offer'},addTrack:vi.fn(),createDataChannel:()=>channel,
    createOffer:async()=>({sdp:'v=offer'}),setLocalDescription:async()=>{},setRemoteDescription:vi.fn(async()=>{}),close:vi.fn(),
    ontrack:null,onconnectionstatechange:null};
  const audio={pause:vi.fn(),play:vi.fn(async()=>{}),srcObject:null,autoplay:false};
  const browser:VoiceBrowser={microphone:async()=>({getTracks:()=>[track]} as unknown as MediaStream),
    peer:()=>peer as unknown as RTCPeerConnection,audio:()=>audio as unknown as HTMLAudioElement};
  return {browser,track,channel,peer,audio,emit:(event:unknown)=>channel.onmessage?.({data:JSON.stringify(event)})};
}
function connection(expiresAt=new Date(Date.now()+60000).toISOString()):VoiceSessionStartResponse {
  return {voiceSession:{id:'session_live',expiresAt},connection:{provider:'gpt-live',transport:{type:'webrtc',sdp:'v=answer'}}} as VoiceSessionStartResponse;
}
function callbacks() {return {open:vi.fn(async()=>connection()),close:vi.fn(async()=>{}),opening:vi.fn(()=>'OPENING'),onStatus:vi.fn(),onTurn:vi.fn(),onAudio:vi.fn(),onEvent:vi.fn(),onTrace:vi.fn()};}

it('stops local tracks, audio, channel and peer before a delayed signaling response, then closes that orphan session',async()=>{
  const f=connectedBrowser(),options=callbacks();let release!:(result:VoiceSessionStartResponse)=>void;
  options.open.mockImplementation(()=>new Promise(resolve=>release=resolve));
  const transport=new PaxiCaseVoice(options,f.browser),start=transport.start();
  await vi.waitFor(()=>expect(options.open).toHaveBeenCalledOnce());
  transport.stop();
  expect(f.track.stop).toHaveBeenCalledOnce();expect(f.audio.pause).toHaveBeenCalledOnce();
  expect(f.channel.close).toHaveBeenCalledOnce();expect(f.peer.close).toHaveBeenCalledOnce();
  expect(options.close).not.toHaveBeenCalled();
  release(connection());await start;
  expect(options.close).toHaveBeenCalledWith('session_live');expect(f.peer.setRemoteDescription).not.toHaveBeenCalled();
});

it('keeps dialogue alive across turns, deduplicates provider events and sends value corrections even when field counts stay equal',async()=>{
  vi.useFakeTimers();
  try {
    const f=connectedBrowser(),options=callbacks(),transport=new PaxiCaseVoice(options,f.browser);await transport.start();
    f.emit({type:'session.started'});
    const delta={type:'session.input_transcript.delta',event_id:'one',delta:'My annual gross income is 119000 CHF.'};
    f.emit(delta);f.emit(delta);await vi.advanceTimersByTimeAsync(1500);
    f.emit({type:'session.output_transcript.delta',event_id:'reply',delta:'Please review the proposal.'});await vi.advanceTimersByTimeAsync(1500);
    f.emit({...delta,event_id:'correction',delta:'Correction: My annual gross income is 118000 CHF.'});await vi.advanceTimersByTimeAsync(1500);
    expect(options.onTurn.mock.calls).toEqual([
      ['customer','My annual gross income is 119000 CHF.','client-settled'],
      ['agent','Please review the proposal.','client-settled'],
      ['customer','Correction: My annual gross income is 118000 CHF.','client-settled'],
    ]);
    transport.updateContext({gross:11900000,status:'proposed'});transport.updateContext({gross:11900000,status:'proposed'});
    transport.updateContext({gross:11800000,status:'proposed'});
    expect(f.channel.send).toHaveBeenCalledTimes(3); // opening plus two distinct value/status projections
    transport.stop();f.emit({...delta,event_id:'late'});await vi.advanceTimersByTimeAsync(1500);
    expect(options.onTurn).toHaveBeenCalledTimes(3);
  } finally {vi.useRealTimers();}
});

it('expires locally even when remote close fails and discards interrupted transcript fragments',async()=>{
  vi.useFakeTimers();
  try {
    const f=connectedBrowser(),options=callbacks();options.open.mockResolvedValue(connection(new Date(Date.now()+1000).toISOString()));
    options.close.mockRejectedValue(new Error('offline'));
    const transport=new PaxiCaseVoice(options,f.browser);await transport.start();
    f.emit({type:'session.input_transcript.delta',delta:'interrupted'});
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.track.stop).toHaveBeenCalledOnce();expect(options.onTurn).not.toHaveBeenCalled();
    expect(options.onStatus).toHaveBeenLastCalledWith('error','VOICE_SESSION_EXPIRED');
    expect(options.onTrace).toHaveBeenCalledWith('local',{code:'REMOTE_CLOSE_FAILED',localMediaStopped:true});
  } finally {vi.useRealTimers();}
});

it('session-ended Stop remains synchronous and safe when authentication disappears before remote close can be requested',async()=>{
  const f=connectedBrowser(),options=callbacks(),transport=new PaxiCaseVoice(options,f.browser);
  options.close.mockImplementation(()=>{throw new Error('no customer session');});
  await transport.start();
  expect(()=>transport.stop()).not.toThrow();
  expect(f.track.stop).toHaveBeenCalledOnce();
  expect(f.peer.close).toHaveBeenCalledOnce();
  expect(options.onTrace).toHaveBeenCalledWith('local',{code:'REMOTE_CLOSE_FAILED',localMediaStopped:true});
});

it('opens from the current plan and tells the agent to follow the next question without a fixed income script',async()=>{
  const f=connectedBrowser(),options=callbacks(),transport=new PaxiCaseVoice(options,f.browser);await transport.start();
  f.emit({type:'session.started'});
  const opening=JSON.parse(f.channel.send.mock.calls[0]![0] as string);
  expect(options.opening).toHaveBeenCalledOnce();
  expect(opening.content).toContain('OPENING');
  expect(opening.content).not.toMatch(/gross income/i);
  transport.updateContext({nextQuestion:'Arbeitest du Vollzeit?',neverAskAgain:['annual_gross_income_chf'],done:false});
  const update=JSON.parse(f.channel.send.mock.calls[1]![0] as string);
  expect(update.content).toContain('Arbeitest du Vollzeit?');
  expect(update.content).toMatch(/nextQuestion/);
  expect(update.content).toMatch(/never/i);
  expect(update.content).toContain('conversational');
  expect(update.content).not.toContain('ask only that one question');
  transport.stop();
});

it('logs a question before its short answer even when their caption quiet timers overlap',async()=>{
  vi.useFakeTimers();
  try {
    const f=connectedBrowser(),options=callbacks(),transport=new PaxiCaseVoice(options,f.browser);await transport.start();
    f.emit({type:'session.output_transcript.delta',event_id:'question',delta:'Hast du eine Pensionskasse?'});
    await vi.advanceTimersByTimeAsync(400);
    f.emit({type:'session.input_transcript.delta',event_id:'answer',delta:'Ja.'});
    expect(options.onTurn).toHaveBeenCalledWith('agent','Hast du eine Pensionskasse?','client-settled');
    await vi.advanceTimersByTimeAsync(400);
    f.emit({type:'session.output_transcript.delta',event_id:'next',delta:'Wie hoch sind deine Wohnkosten?'});
    await vi.advanceTimersByTimeAsync(1500);
    expect(options.onTurn.mock.calls).toEqual([
      ['agent','Hast du eine Pensionskasse?','client-settled'],
      ['customer','Ja.','client-settled'],
      ['agent','Wie hoch sind deine Wohnkosten?','client-settled'],
    ]);
    transport.stop();
  } finally {vi.useRealTimers();}
});

describe('PaxiCaseVoice connection events', () => {
  interface Peer {
    ontrack: ((event: unknown) => void) | null;
    onconnectionstatechange: (() => void) | null;
    connectionState?: string;
  }
  async function connected() {
    const f = connectedBrowser(), cb = callbacks();
    const voice = new PaxiCaseVoice(cb, f.browser);
    await voice.start();
    return { f, cb, voice, peer: f.peer as unknown as Peer };
  }

  it('plays the remote voice and hands it to the avatar', async () => {
    const { f, cb, peer } = await connected();
    const remote = { getTracks: () => [] };
    peer.ontrack!({ streams: [remote], track: { stop: vi.fn() } });
    expect(f.audio.srcObject).toBe(remote);
    expect(cb.onAudio).toHaveBeenCalledWith(remote);
    expect(f.audio.play).toHaveBeenCalled();
  });

  it('fails readably when the browser blocks the audio playback', async () => {
    const { f, cb, peer } = await connected();
    f.audio.play.mockRejectedValueOnce(new Error('blocked'));
    peer.ontrack!({ streams: [{ getTracks: () => [] }], track: { stop: vi.fn() } });
    await new Promise((resolve) => setTimeout(resolve));
    expect(cb.onStatus).toHaveBeenLastCalledWith('error', 'AUDIO_PLAYBACK_BLOCKED');
  });

  it('ends on a lost connection or closed data channel, and ignores events after the end', async () => {
    const lost = await connected();
    lost.peer.connectionState = 'connected';
    lost.peer.onconnectionstatechange!();
    expect(lost.cb.onStatus).not.toHaveBeenCalledWith('error', expect.anything());
    lost.peer.connectionState = 'failed';
    lost.peer.onconnectionstatechange!();
    expect(lost.cb.onStatus).toHaveBeenLastCalledWith('error', 'VOICE_DISCONNECTED');
    const late = { stop: vi.fn() };
    lost.peer.ontrack!({ streams: [], track: late });
    expect(late.stop).toHaveBeenCalled();

    const closed = await connected();
    closed.f.channel.onclose!();
    expect(closed.cb.onStatus).toHaveBeenLastCalledWith('error', 'VOICE_CHANNEL_CLOSED');
  });

  it('refuses an expired session, an unknown provider and a provider error event', async () => {
    const expired = connectedBrowser(), cbExpired = callbacks();
    cbExpired.open.mockResolvedValueOnce(connection(new Date(Date.now() - 1000).toISOString()));
    await new PaxiCaseVoice(cbExpired, expired.browser).start();
    expect(cbExpired.onStatus).toHaveBeenLastCalledWith('error', 'VOICE_CONNECT_FAILED');

    const other = connectedBrowser(), cbOther = callbacks();
    cbOther.open.mockResolvedValueOnce({ ...connection(), connection: { provider: 'elevenlabs' } } as never);
    await new PaxiCaseVoice(cbOther, other.browser).start();
    expect(cbOther.onStatus).toHaveBeenLastCalledWith('error', 'VOICE_CONNECT_FAILED');

    const { f, cb } = await connected();
    f.emit({ type: 'error', error: { message: 'provider says no' } });
    expect(cb.onStatus).toHaveBeenLastCalledWith('error', 'VOICE_PROVIDER_ERROR');
    f.emit('not json');
  });

  it('waits for the ICE candidates, at most two seconds', async () => {
    vi.useFakeTimers();
    try {
      const f = connectedBrowser(), cb = callbacks();
      const listeners: (() => void)[] = [];
      Object.assign(f.peer, {
        iceGatheringState: 'gathering',
        addEventListener: (_: string, listener: () => void) => listeners.push(listener),
        removeEventListener: vi.fn(),
      });
      const started = new PaxiCaseVoice(cb, f.browser).start();
      await vi.advanceTimersByTimeAsync(0);
      expect(cb.open).not.toHaveBeenCalled();
      (f.peer as { iceGatheringState: string }).iceGatheringState = 'complete';
      listeners.forEach((listener) => listener());
      await vi.advanceTimersByTimeAsync(0);
      expect(cb.open).toHaveBeenCalledOnce();
      await started;

      const slow = connectedBrowser(), cbSlow = callbacks();
      Object.assign(slow.peer, { iceGatheringState: 'gathering', addEventListener: vi.fn(), removeEventListener: vi.fn() });
      const waiting = new PaxiCaseVoice(cbSlow, slow.browser).start();
      await vi.advanceTimersByTimeAsync(1999);
      expect(cbSlow.open).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(cbSlow.open).toHaveBeenCalledOnce();
      await waiting;
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out when the data channel never opens', async () => {
    vi.useFakeTimers();
    try {
      const f = connectedBrowser(), cb = callbacks();
      f.channel.readyState = 'connecting';
      await new PaxiCaseVoice(cb, f.browser).start();
      await vi.advanceTimersByTimeAsync(20000);
      expect(cb.onStatus).toHaveBeenLastCalledWith('error', 'VOICE_CONNECT_TIMEOUT');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PaxiCaseVoice reply emotions', () => {
  const decision = (sourceType: string, sourceId: string, name: string, choice: unknown, extra: Record<string, unknown> = {}) => ({
    type: 'decision.event', delegation_id: null, trigger_id: 'trigger', source_event_type: sourceType, source_event_id: sourceId,
    event: { type: 'decision.completed', decision: { answers: [{ type: 'choice', name, choice }] } }, ...extra,
  });
  async function connected() {
    vi.useFakeTimers();
    const f = connectedBrowser(), cb = callbacks();
    await new PaxiCaseVoice(cb, f.browser).start();
    f.emit({ type: 'session.started' });
    const emotions = () => cb.onEvent.mock.calls.map(([event]) => event).filter((event) => event.type === 'emotion').map((event) => event.emotion);
    return { f, emotions };
  }
  afterEach(() => vi.useRealTimers());

  it('shows the emotion GPT-Live chose for the customer\'s words and for Paxi\'s own', async () => {
    const { f, emotions } = await connected();
    f.emit({ type: 'session.input_transcript.delta', event_id: 'in_1', delta: 'Mein Vater ist gestorben.' });
    f.emit(decision('session.input_transcript.delta', 'in_1', 'reply_emotion', 'empathetic'));
    f.emit({ type: 'session.output_transcript.delta', event_id: 'out_1', delta: 'Das tut mir leid.' });
    f.emit(decision('session.output_transcript.delta', 'out_1', 'emotion', 'acknowledging'));
    expect(emotions()).toEqual(['empathetic', 'acknowledging']);
  });

  it('ignores late results for older fragments, unknown fragments and invalid or failed answers', async () => {
    const { f, emotions } = await connected();
    f.emit({ type: 'session.input_transcript.delta', event_id: 'in_1', delta: 'Hallo' });
    f.emit({ type: 'session.input_transcript.delta', event_id: 'in_2', delta: ' zusammen' });
    f.emit(decision('session.input_transcript.delta', 'in_2', 'reply_emotion', 'pleased'));
    f.emit(decision('session.input_transcript.delta', 'in_1', 'reply_emotion', 'shocked'));
    f.emit(decision('session.input_transcript.delta', 'in_unknown', 'reply_emotion', 'curious'));
    f.emit({ type: 'session.input_transcript.delta', event_id: 'in_3', delta: '!' });
    f.emit(decision('session.input_transcript.delta', 'in_3', 'reply_emotion', 'furious'));
    f.emit(decision('session.input_transcript.delta', 'in_3', 'emotion', 'curious'));
    f.emit(decision('session.input_transcript.delta', 'in_3', 'reply_emotion', 'curious', { delegation_id: 'delegation' }));
    f.emit({ ...decision('session.input_transcript.delta', 'in_3', 'reply_emotion', 'curious'), event: { type: 'decision.failed' } });
    f.emit(decision('session.other', 'in_3', 'reply_emotion', 'curious'));
    expect(emotions()).toEqual(['pleased']);
  });
});


describe('PaxiCaseVoice turns around backchannels', () => {
  it('keeps the customer\'s sentence whole when Paxi says "Oh," in between (live test 01.11.2026)', async () => {
    vi.useFakeTimers();
    try {
      const f = connectedBrowser(), cb = callbacks();
      await new PaxiCaseVoice(cb, f.browser).start();
      f.emit({ type: 'session.started' });
      const said = (speaker: 'input' | 'output', delta: string, id: string) =>
        f.emit({ type: `session.${speaker}_transcript.delta`, event_id: id, delta });
      said('input', 'Also ähm ich gehe zwei Tage in die Fachhoch', 'i1');
      said('output', 'Oh,', 'o1');
      said('input', 'schule', 'i2');
      said('output', ' schön.', 'o2');
      said('input', ' und drei Tage in der Woche arbeiten', 'i3');
      await vi.advanceTimersByTimeAsync(500);
      said('output', ' Das ist ja spannend. Wie alt bist du?', 'o3');
      await vi.advanceTimersByTimeAsync(3000);
      expect(cb.onTurn.mock.calls.map(([speaker, text]) => [speaker, text])).toEqual([
        ['customer', 'Also ähm ich gehe zwei Tage in die Fachhochschule und drei Tage in der Woche arbeiten'],
        ['agent', 'Oh, schön. Das ist ja spannend. Wie alt bist du?'],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
