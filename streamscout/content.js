(() => {
  // Schutz gegen doppelte Injektion (Registrierung plus Injektion beim Aktivieren).
  if (globalThis.__streamScoutLoaded) return;
  globalThis.__streamScoutLoaded = true;

  const FETCH_TIMEOUT_MS = 10000;
  const SELECTOR = 'video[src], source[src], mux-player[playback-id]';
  const seen = new Set();
  let seenHref = location.href;

  function toUrl(value) {
    try {
      const url = new URL(value, document.baseURI);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
    } catch {
      return null;
    }
  }

  function report(value) {
    const url = toUrl(value);
    // Nach einem Seitenwechsel in Single-Page-Apps leert der Background die Liste,
    // daher werden bekannte Playlists erneut gemeldet.
    if (location.href !== seenHref) {
      seenHref = location.href;
      seen.clear();
    }
    if (!url || !url.pathname.toLowerCase().endsWith('.m3u8') || seen.has(url.href)) return;
    seen.add(url.href);
    chrome.runtime.sendMessage({ type: 'stream-found', url: url.href, title: document.title }).catch(() => {});
  }

  function inspectElement(el) {
    if (el.localName === 'mux-player') {
      const id = el.getAttribute('playback-id')?.split('?')[0].trim();
      if (id) report(`https://stream.mux.com/${encodeURIComponent(id)}.m3u8`);
    } else {
      const src = el.getAttribute('src');
      if (src) report(src);
    }
  }

  function scan(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches(SELECTOR)) inspectElement(node);
    node.querySelectorAll(SELECTOR).forEach(inspectElement);
  }

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) report(entry.name);
  }).observe({ type: 'resource', buffered: true });

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') scan(m.target);
      else m.addedNodes.forEach(scan);
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'playback-id'] });

  if (document.documentElement) scan(document.documentElement);

  // Lädt Playlists im Kontext der Seite, damit dieselben CORS-Regeln gelten wie für den Player.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== 'fetch-playlist') return;
    fetch(msg.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      .then(async (res) => sendResponse({ status: res.status, text: await res.text() }))
      .catch(() => sendResponse({ error: true }));
    return true;
  });
})();
