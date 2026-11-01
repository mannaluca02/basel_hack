/** One tool call of GPT-Live's background model, as `voice-lab/turns` takes it. */
export interface ReportCall {
  name: string;
  arguments: string;
}

interface Entry {
  calls: ReportCall[] | null;
  taken: boolean;
  done: () => void;
  finished: Promise<void>;
}

/**
 * The background model's reports (api voice/lab-delegation.ts) in the order GPT-Live started them.
 * A customer turn takes every report begun since the previous turn took its own: it waits
 * `startMs` for one to begin (GPT-Live may hand the turn over just after it settled), then up to
 * `finishMs` for its calls. None: an empty report, and the backend extracts nothing for that turn.
 * A report finishing after its turn gave up waiting is lost; the conversation went on.
 */
export class ReportInbox {
  private entries = new Map<string, Entry>();
  private arrivals: (() => void)[] = [];

  constructor(
    private readonly startMs = 1500,
    private readonly finishMs = 8000,
  ) {}

  started(id: string): void {
    if (this.entries.has(id)) return;
    let done = () => {};
    const finished = new Promise<void>((resolve) => (done = resolve));
    this.entries.set(id, { calls: null, taken: false, done, finished });
    // Only the latest delegations matter; older ones were taken long ago.
    if (this.entries.size > 100) this.entries.delete(this.entries.keys().next().value!);
    this.arrivals.splice(0).forEach((arrived) => arrived());
  }

  finished(id: string, calls: ReportCall[]): void {
    this.started(id);
    const entry = this.entries.get(id)!;
    if (entry.calls !== null) return;
    entry.calls = calls;
    entry.done();
  }

  async take(): Promise<ReportCall[]> {
    if (!this.untaken().length)
      await new Promise<void>((resolve) => {
        const arrived = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          this.arrivals = this.arrivals.filter((a) => a !== arrived);
          resolve();
        }, this.startMs);
        this.arrivals.push(arrived);
      });
    const taken = this.untaken();
    if (!taken.length) return [];
    for (const entry of taken) entry.taken = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(taken.map((entry) => entry.finished)),
      new Promise<void>((resolve) => (timer = setTimeout(resolve, this.finishMs))),
    ]);
    clearTimeout(timer);
    return taken.flatMap((entry) => entry.calls ?? []);
  }

  /** A new call or a stop: nothing pending carries over; a waiting turn goes on without a report. */
  clear(): void {
    this.entries.forEach((entry) => entry.done());
    this.entries.clear();
    this.arrivals.splice(0).forEach((arrived) => arrived());
  }

  private untaken(): Entry[] {
    return [...this.entries.values()].filter((entry) => !entry.taken);
  }
}
