export interface NoticeSection {
  readonly id: string;
  /** Translation keys. */
  readonly title: string;
  readonly body: string;
}

/** The privacy notice (DSG/FADP, project rule 7), behind "Details" on the consent banner. */
export const NOTICE_SECTIONS: readonly NoticeSection[] = [
  { id: 'recorded', title: 'consent.recorded.title', body: 'consent.recorded.body' },
  { id: 'ai', title: 'consent.ai.title', body: 'consent.ai.body' },
  { id: 'extraction', title: 'consent.extraction.title', body: 'consent.extraction.body' },
  { id: 'calculator', title: 'consent.calculator.title', body: 'consent.calculator.body' },
  { id: 'demo', title: 'consent.demo.title', body: 'consent.demo.body' },
  { id: 'human', title: 'consent.human.title', body: 'consent.human.body' },
];
