// ffmpeg-Befehle mit korrektem Quoting pro Shell. Enthalten nie Cookies, Tokens oder
// Header außer einem optionalen Referer.

export const SHELLS = {
  powershell: 'PowerShell',
  cmd: 'CMD',
  bash: 'bash',
};

export function quote(value, shell) {
  switch (shell) {
    case 'powershell':
      // PowerShell behandelt auch typografische Apostrophe als Anführungszeichen.
      return `'${value.replace(/['‘’‚‛]/g, '$&$&')}'`;
    case 'cmd':
      // Jedes % wird aus den Anführungszeichen herausgelöst und mit ^ maskiert,
      // damit CMD keine Umgebungsvariablen wie %CD% einsetzt.
      return `"${value.replaceAll('%', '"^%"')}"`;
    case 'bash':
      return `'${value.replaceAll("'", "'\\''")}'`;
    default:
      throw new Error(`Unbekannte Shell: ${shell}`);
  }
}

// referer ist optional; ffmpeg erwartet -referer vor -i.
export function buildFfmpegCommand(url, filename, shell, { referer } = {}) {
  const refererArg = referer ? `-referer ${quote(referer, shell)} ` : '';
  return `ffmpeg -hide_banner ${refererArg}-i ${quote(url, shell)} -sn -c copy ${quote(`${filename}.mp4`, shell)}`;
}
