/**
 * Legal-form and ornament tokens that providers add or drop freely
 * ("Bayer 04 Leverkusen" vs "Bayer Leverkusen"). Never includes words that
 * distinguish clubs (United, City, Real, Athletic...).
 */
const CLUB_NOISE_TOKENS: ReadonlySet<string> = new Set([
  'fc', 'cf', 'afc', 'ac', 'sc', 'as', 'ss', 'ssc', 'us', 'rc', 'rcd', 'cd',
  'ud', 'sd', 'fk', 'sk', 'nk', 'sv', 'vfl', 'vfb', 'tsg', 'bsc', 'fsv', 'bv',
  'club', 'de', 'calcio',
]);

/**
 * Normalized club name with legal forms and founding years removed. Used as a
 * last-resort comparison key; returns '' when nothing distinctive remains.
 */
export function normalizeClubName(value: string): string {
  return normalizeEntityText(value)
    .split(' ')
    .filter((token) => !CLUB_NOISE_TOKENS.has(token) && !/^\d+$/.test(token))
    .join(' ');
}

/** Letters NFKD leaves intact but providers transliterate (Bodø → Bodo). */
const TRANSLITERATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ø/g, 'o'], [/Ø/g, 'O'], [/æ/g, 'ae'], [/Æ/g, 'AE'], [/œ/g, 'oe'],
  [/ł/g, 'l'], [/Ł/g, 'L'], [/đ/g, 'd'], [/Đ/g, 'D'], [/ß/g, 'ss'],
];

export function normalizeEntityText(value: string): string {
  return TRANSLITERATIONS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  )
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
