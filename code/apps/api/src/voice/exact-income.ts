type Language = 'en' | 'de' | 'fr' | 'it';
export interface ExactIncome {
  /** Verbatim substring of the source transcript, never the normalized number spelling. */
  readonly quote: string;
  /** Exact CHF decimal string; the existing portfolio boundary converts it to integer cents. */
  readonly value: string;
}

const statements: readonly (readonly [Language, RegExp])[] = [
  ['en', /^(?:(?:Korrektur|Correction|Correzione)\s*[:.]\s*)?My annual gross income is\s+(.+?)\s+(?:CHF|Swiss francs?)\.?$/iu],
  ['de', /^(?:(?:Korrektur|Correction|Correzione)\s*[:.]\s*)?Mein (?:Bruttojahreseinkommen|jährliches Bruttoeinkommen) (?:beträgt|ist)\s+(.+?)\s+(?:CHF|Schweizer\s+Franken|Franken)\.?$/iu],
  ['fr', /^(?:(?:Korrektur|Correction|Correzione)\s*[:.]\s*)?Mon revenu annuel brut est de\s+(.+?)\s+CHF\.?$/iu],
  ['it', /^(?:(?:Korrektur|Correction|Correzione)\s*[:.]\s*)?Il mio reddito annuo lordo è\s+(.+?)\s+CHF\.?$/iu],
];

/** Deliberately a closed sentence/number grammar, not general extraction or fuzzy matching.
 * Language comes from the explicit sentence form (speech may differ from the selected UI locale).
 * An unsupported token invalidates the whole statement; no partial amount, person or basis inference.
 */
export function parseExactAnnualGrossIncome(text: string): ExactIncome | null {
  if (text.length > 1000) return null;
  for (const [language, pattern] of statements) {
    const match = pattern.exec(text.trim());
    if (!match) continue;
    const quote = match[1]!;
    if (quote.length > 500) return null;
    const digits = decimalAmount(quote, language);
    if (digits !== null) return { quote, value: digits };
    const words = quote.toLowerCase().replace(/\s+/gu, ' ').trim();
    const whole = language === 'en' ? englishNumber(words) : language === 'de' ? germanNumber(words) : null;
    return whole === null ? null : { quote, value: String(whole) };
  }
  return null;
}

/** Existing Swiss digit forms in every language, plus English comma grouping. A period is
 * decimal-only (1–2 places); a comma is grouping-only and EN-only. Mixed/malformed groups,
 * leading zeros and ambiguous decimal/grouping conventions are rejected, not reinterpreted.
 */
function decimalAmount(text: string, language: Language): string | null {
  let whole: string, fraction: string;
  const plain = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text);
  if (plain) {
    whole = plain[1]!; fraction = plain[2] ?? '';
  } else {
    const grouped = /^([1-9]\d{0,2})([,'’])(\d{3}(?:\2\d{3})*)(?:\.(\d{1,2}))?$/.exec(text);
    if (!grouped || grouped[2] === ',' && language !== 'en') return null;
    whole = grouped[1]! + grouped[3]!.replace(/[,'’]/g, ''); fraction = grouped[4] ?? '';
  }
  // Preserve the existing portfolio limit (10 billion CHF), without float rounding.
  if (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) > 1000000000000n) return null;
  return whole + (fraction ? `.${fraction}` : '');
}

const enSmall = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const enTens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function englishBelow100(text: string): number | null {
  const small = enSmall.indexOf(text);
  if (small > 0) return small;
  for (let tens = 2; tens <= 9; tens++) {
    if (text === enTens[tens]) return tens * 10;
    for (let unit = 1; unit <= 9; unit++) {
      if (text === `${enTens[tens]} ${enSmall[unit]}` || text === `${enTens[tens]}-${enSmall[unit]}`) return tens * 10 + unit;
    }
  }
  return null;
}

function englishTriad(text: string): number | null {
  const hundred = /^(one|two|three|four|five|six|seven|eight|nine) hundred(?: (?:and )?(.+))?$/.exec(text);
  if (!hundred) return englishBelow100(text);
  const rest = hundred[2] === undefined ? 0 : englishBelow100(hundred[2]);
  return rest === null ? null : enSmall.indexOf(hundred[1]!) * 100 + rest;
}

/** Whole-word grammar 0..999,999. Scales occur once, in descending order; not a token sum. */
function englishNumber(text: string): number | null {
  if (text === 'zero') return 0;
  const thousand = /^(.+?) thousand(?: (and )?(.+))?$/.exec(text);
  if (!thousand) return englishTriad(text);
  const head = englishTriad(thousand[1]!);
  const rest = thousand[3] === undefined ? 0 : englishTriad(thousand[3]);
  if (head === null || rest === null || thousand[2] && rest >= 100) return null;
  return head * 1000 + rest;
}

const deSmall = ['', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun',
  'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const deUnits = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
const deTens = ['', '', 'zwanzig', 'dreissig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

function germanBelow100(text: string): number | null {
  if (text === 'ein') return 1;
  const small = deSmall.indexOf(text);
  if (small > 0) return small;
  for (let tens = 2; tens <= 9; tens++) {
    if (text === deTens[tens]) return tens * 10;
    for (let unit = 1; unit <= 9; unit++) {
      if (text === `${deUnits[unit]}und${deTens[tens]}`) return tens * 10 + unit;
    }
  }
  return null;
}

/** Optional spaces only at hundred/thousand boundaries, never arbitrary character joining. */
function germanTriad(text: string): number | null {
  const hundred = /^(?:(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun) ?)?hundert(?: ?(.+))?$/.exec(text);
  if (!hundred) return germanBelow100(text);
  const head = hundred[1] === undefined ? 1 : deUnits.indexOf(hundred[1]);
  const rest = hundred[2] === undefined ? 0 : germanBelow100(hundred[2]);
  return rest === null ? null : head * 100 + rest;
}

function germanNumber(raw: string): number | null {
  const text = raw.replace(/ß/g, 'ss'); // Standard German and Swiss spellings of thirty.
  if (text === 'null') return 0;
  const thousand = /^(.*?) ?tausend(?: ?(.+))?$/.exec(text);
  if (!thousand) return germanTriad(text);
  if (thousand[1] === 'eins') return null; // The scale prefix is ein-, not eins-.
  const head = thousand[1] === '' ? 1 : germanTriad(thousand[1]!);
  const rest = thousand[2] === undefined ? 0 : germanTriad(thousand[2]);
  return head === null || rest === null ? null : head * 1000 + rest;
}
