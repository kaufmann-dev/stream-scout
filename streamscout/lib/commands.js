// ffmpeg commands with correct quoting per shell. They never contain cookies, tokens or
// headers other than an optional referer.

export const SHELLS = {
  powershell: 'PowerShell',
  cmd: 'CMD',
  bash: 'bash',
};

export function quote(value, shell) {
  switch (shell) {
    case 'powershell':
      // PowerShell also treats typographic apostrophes as quotes.
      return `'${value.replace(/['‘’‚‛]/g, '$&$&')}'`;
    case 'cmd':
      // Every % is moved outside the quotes and escaped with ^
      // so CMD does not expand environment variables such as %CD%.
      return `"${value.replaceAll('%', '"^%"')}"`;
    case 'bash':
      return `'${value.replaceAll("'", "'\\''")}'`;
    default:
      throw new Error(`Unknown shell: ${shell}`);
  }
}

// referer is optional; ffmpeg expects -referer before -i.
export function buildFfmpegCommand(url, filename, shell, { referer } = {}) {
  const refererArg = referer ? `-referer ${quote(referer, shell)} ` : '';
  return `ffmpeg -hide_banner ${refererArg}-i ${quote(url, shell)} -sn -c copy ${quote(`${filename}.mp4`, shell)}`;
}
