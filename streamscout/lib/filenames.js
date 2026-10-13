// Turns a page title into a safe ASCII file name (without extension).

export const MAX_FILENAME_LENGTH = 80;

const TRANSLITERATION = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss', ẞ: 'SS' };
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

export function toFilename(title, fallback = 'stream') {
  let name = (title ?? '')
    .normalize('NFC')
    .replace(/[äöüÄÖÜßẞ]/g, (c) => TRANSLITERATION[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,_()'&+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+/, '')
    .slice(0, MAX_FILENAME_LENGTH)
    .replace(/[\s.]+$/, '');
  if (WINDOWS_RESERVED.test(name)) name = `${name}_`;
  return name || fallback;
}

// Appends " (2)", " (3)" … on collisions. taken holds lowercase names
// because Windows file names are case-insensitive.
export function uniqueFilename(name, taken) {
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, MAX_FILENAME_LENGTH - suffix.length).replace(/[\s.]+$/, '') + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
