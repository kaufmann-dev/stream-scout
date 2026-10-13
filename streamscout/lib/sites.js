function httpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

// Permission pattern for a page's origin, e.g. "https://example.com/*".
export function originPattern(url) {
  const u = httpUrl(url);
  return u ? `${u.protocol}//${u.hostname}/*` : null;
}

// Referer for ffmpeg: page URL without query and fragment so no tokens leak.
export function refererFor(url) {
  const u = httpUrl(url);
  return u ? u.origin + u.pathname : null;
}

export function withoutHash(url) {
  const u = new URL(url);
  u.hash = '';
  return u.href;
}
