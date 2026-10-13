// Erzeugt aus einem Seitentitel einen sicheren ASCII-Dateinamen (ohne Endung).

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

// Hängt bei Kollisionen " (2)", " (3)" … an. taken enthält kleingeschriebene Namen,
// weil Windows Groß- und Kleinschreibung nicht unterscheidet.
export function uniqueFilename(name, taken) {
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, MAX_FILENAME_LENGTH - suffix.length).replace(/[\s.]+$/, '') + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
