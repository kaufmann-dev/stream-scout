function httpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

// Berechtigungsmuster für die Origin einer Seite, z. B. "https://example.com/*".
export function originPattern(url) {
  const u = httpUrl(url);
  return u ? `${u.protocol}//${u.hostname}/*` : null;
}

// Referer für ffmpeg: Seiten-URL ohne Query und Fragment, damit keine Tokens mitgehen.
export function refererFor(url) {
  const u = httpUrl(url);
  return u ? u.origin + u.pathname : null;
}

export function withoutHash(url) {
  const u = new URL(url);
  u.hash = '';
  return u.href;
}
