// Erkennung, Parsing und Schutzprüfung von HLS-Playlists (.m3u8).

export const Status = {
  CHECKING: 'checking',
  READY: 'ready',
  PROTECTED: 'protected',
  DENIED: 'denied',
  UNKNOWN: 'unknown',
};

export function isM3u8Url(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return false;
  }
}

// Schlüssel zum Entfernen von Duplikaten: URL ohne Query und Fragment.
export function playlistKey(url) {
  const u = new URL(url);
  return u.origin + u.pathname;
}

export function parseAttributes(value) {
  const attrs = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m;
  while ((m = re.exec(value))) {
    const raw = m[2];
    attrs[m[1]] = raw.startsWith('"') ? raw.slice(1, -1) : raw;
  }
  return attrs;
}

export function parsePlaylist(text, baseUrl) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== '#EXTM3U') throw new Error('Keine HLS-Playlist');

  const playlist = {
    isMaster: false,
    variants: [],
    renditions: [],
    keys: [],
    endList: false,
    playlistType: '',
    duration: 0,
  };
  let pendingStreamInf = null;

  for (const line of lines) {
    if (!line) continue;
    if (!line.startsWith('#')) {
      if (pendingStreamInf) {
        const height = Number(pendingStreamInf.RESOLUTION?.split('x')[1]) || 0;
        playlist.variants.push({ url: new URL(line, baseUrl).href, height });
      }
      pendingStreamInf = null;
      continue;
    }
    const colon = line.indexOf(':');
    const tag = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1);
    switch (tag) {
      case '#EXT-X-STREAM-INF':
        playlist.isMaster = true;
        pendingStreamInf = parseAttributes(value);
        break;
      case '#EXTINF':
        playlist.duration += Number.parseFloat(value) || 0;
        break;
      case '#EXT-X-ENDLIST':
        playlist.endList = true;
        break;
      case '#EXT-X-PLAYLIST-TYPE':
        playlist.playlistType = value.toUpperCase();
        break;
      case '#EXT-X-MEDIA':
      case '#EXT-X-I-FRAME-STREAM-INF': {
        playlist.isMaster = true;
        const { URI } = parseAttributes(value);
        if (URI) playlist.renditions.push(new URL(URI, baseUrl).href);
        break;
      }
      case '#EXT-X-KEY':
      case '#EXT-X-SESSION-KEY': {
        const attrs = parseAttributes(value);
        playlist.keys.push({ tag: tag.slice(1), method: attrs.METHOD ?? '', keyformat: attrs.KEYFORMAT ?? '' });
        break;
      }
    }
  }
  return playlist;
}

export function isLive(playlist) {
  return !playlist.endList && playlist.playlistType !== 'VOD';
}

// Kennzahlen für die Anzeige: Live/VOD, Dauer (nur VOD) und höchste Auflösung.
function describe(master, media) {
  const heights = master ? master.variants.map((v) => v.height).filter(Boolean) : [];
  const info = { height: heights.length ? Math.max(...heights) : null };
  if (media) {
    info.live = isLive(media);
    if (!info.live) info.duration = Math.round(media.duration);
  }
  return info;
}

export function isEncrypted(playlist) {
  return playlist.keys.some((k) => k.method.toUpperCase() !== 'NONE');
}

async function load(url, fetchText) {
  const res = await fetchText(url);
  if (res.status === 401 || res.status === 403) return { denied: res.status };
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
  return { playlist: parsePlaylist(res.text, url) };
}

// fetchText(url) liefert { status, text } oder wirft bei Netzwerkfehlern.
// Ergebnis: { status, httpStatus?, children, info? } – children sind die Schlüssel der
// vom Master referenzierten Playlists, die nicht als eigene Streams gelten.
export async function inspectStream(url, fetchText) {
  let master;
  try {
    master = await load(url, fetchText);
  } catch {
    return { status: Status.UNKNOWN, children: [] };
  }
  if (master.denied) return { status: Status.DENIED, httpStatus: master.denied, children: [] };

  const { playlist } = master;
  const children = [...playlist.variants.map((v) => v.url), ...playlist.renditions].map(playlistKey);
  if (isEncrypted(playlist)) return { status: Status.PROTECTED, children };
  if (!playlist.isMaster) return { status: Status.READY, children, info: describe(null, playlist) };
  if (playlist.variants.length === 0) return { status: Status.READY, children, info: describe(playlist, null) };

  try {
    const variant = await load(playlist.variants[0].url, fetchText);
    if (variant.denied) return { status: Status.DENIED, httpStatus: variant.denied, children };
    if (isEncrypted(variant.playlist)) return { status: Status.PROTECTED, children };
    return { status: Status.READY, children, info: describe(playlist, variant.playlist) };
  } catch {
    return { status: Status.UNKNOWN, children, info: describe(playlist, null) };
  }
}
