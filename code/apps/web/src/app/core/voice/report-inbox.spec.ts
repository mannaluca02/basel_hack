import { ReportInbox } from './report-inbox';

const intake = { name: 'submit_intake_observations', arguments: '{"observations":[]}' };

it('a turn takes the report GPT-Live began for it, waiting for its calls', async () => {
  const inbox = new ReportInbox(50, 1000);
  inbox.started('del_1');
  const taken = inbox.take();
  inbox.finished('del_1', [intake]);
  expect(await taken).toEqual([intake]);
  // Taken once: the next turn waits for its own.
  expect(await inbox.take()).toEqual([]);
});

it('a delegation starting just after the turn settled still counts; none is an empty report', async () => {
  vi.useFakeTimers();
  try {
    const inbox = new ReportInbox(1500, 8000);
    const late = inbox.take();
    await vi.advanceTimersByTimeAsync(400);
    inbox.started('del_2');
    inbox.finished('del_2', [intake]);
    expect(await late).toEqual([intake]);
    const none = inbox.take();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await none).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

it('a stalled report ends the wait, and a late one does not land on the next turn', async () => {
  vi.useFakeTimers();
  try {
    const inbox = new ReportInbox(1500, 8000);
    inbox.started('slow');
    const stalled = inbox.take();
    await vi.advanceTimersByTimeAsync(8000);
    expect(await stalled).toEqual([]);
    inbox.finished('slow', [intake]);
    const next = inbox.take();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await next).toEqual([]);
    // A stop lets a waiting turn go on.
    inbox.started('cut');
    const cut = inbox.take();
    inbox.clear();
    expect(await cut).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});
