import { inspectStream, isM3u8Url, playlistKey, Status } from './lib/m3u8.js';
import { originPattern, refererFor, withoutHash } from './lib/sites.js';

const FETCH_TIMEOUT_MS = 10000;
const CONTENT_SCRIPT_ID = 'streamscout';
const REQUIRED_ORIGINS = chrome.runtime.getManifest().host_permissions;
const queues = new Map();

const storageKey = (tabId) => `tab:${tabId}`;
const emptyState = () => ({ pageUrl: null, items: [], children: [] });

// Serializes access per tab so parallel finds do not overwrite each other.
function enqueue(tabId, task) {
  const run = (queues.get(tabId) ?? Promise.resolve()).then(task);
  queues.set(tabId, run.catch(() => {}));
  return run;
}

// mutate(state) returns true if something changed.
function updateTab(tabId, mutate) {
  return enqueue(tabId, async () => {
    const key = storageKey(tabId);
    const { [key]: state = emptyState() } = await chrome.storage.session.get(key);
    const changed = mutate(state);
    if (changed) {
      await chrome.storage.session.set({ [key]: state });
      chrome.action.setBadgeText({ tabId, text: state.items.length ? String(state.items.length) : '' }).catch(() => {});
    }
    return changed;
  });
}

function clearTab(tabId) {
  return enqueue(tabId, async () => {
    await chrome.storage.session.remove(storageKey(tabId));
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  });
}

// Nothing is recorded unless the tab's site is activated.
async function activatedTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const pattern = originPattern(tab.url);
    return pattern && (await chrome.permissions.contains({ origins: [pattern] })) ? tab : null;
  } catch {
    return null;
  }
}

async function activatedOrigins() {
  const { origins = [] } = await chrome.permissions.getAll();
  return origins.filter((o) => !REQUIRED_ORIGINS.includes(o));
}

// Registers the content script for exactly the activated origins.
let syncRun = Promise.resolve();
function syncContentScripts() {
  syncRun = syncRun.catch(() => {}).then(registerContentScripts);
  return syncRun;
}

async function registerContentScripts() {
  const origins = await activatedOrigins();
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  if (!origins.length) return;
  await chrome.scripting.registerContentScripts([
    { id: CONTENT_SCRIPT_ID, matches: origins, js: ['content.js'], runAt: 'document_start', allFrames: true },
  ]);
}

// Injects into open tabs right away so no reload is needed after activation.
// Chrome only injects into frames with permission, including iframes.
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] }).catch(() => {}),
    ),
  );
}

async function clearDeactivatedTabs() {
  const all = await chrome.storage.session.get(null);
  for (const key of Object.keys(all)) {
    const tabId = Number(key.slice('tab:'.length));
    if (!(await activatedTab(tabId))) await clearTab(tabId);
  }
}

// Loads the playlist via the content script if possible (page context and CORS),
// otherwise directly, without cookies.
async function fetchText(tabId, frameId, url) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'fetch-playlist', url }, { frameId });
    if (res && !res.error) return res;
  } catch {
    // No content script in this frame.
  }
  const res = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  return { status: res.status, text: await res.text() };
}

async function inspect(tabId, frameId, key, url) {
  const result = await inspectStream(url, (target) => fetchText(tabId, frameId, target));
  await updateTab(tabId, (state) => {
    state.children = [...new Set([...state.children, ...result.children])];
    state.items = state.items.filter((i) => !result.children.includes(i.key));
    const item = state.items.find((i) => i.key === key && i.url === url);
    if (item) {
      item.status = result.status;
      item.httpStatus = result.httpStatus;
      item.info = result.info;
    }
    return true;
  });
}

// frameUrl is the page or iframe the request came from (used for the referer).
async function addStream({ tabId, frameId, url, frameUrl, title, httpStatus }) {
  if (tabId < 0 || !isM3u8Url(url)) return;
  const tab = await activatedTab(tabId);
  if (!tab) return;
  frameUrl ??= (await chrome.webNavigation.getFrame({ tabId, frameId }).catch(() => null))?.url;
  const key = playlistKey(url);
  const denied = httpStatus === 401 || httpStatus === 403;

  const needsCheck = await updateTab(tabId, (state) => {
    state.pageUrl = withoutHash(tab.url);
    if (state.children.includes(key)) return false;
    const existing = state.items.find((i) => i.key === key);
    if (existing) {
      // A URL with query (e.g. signed) replaces the same playlist without query.
      if (!new URL(url).search || new URL(existing.url).search) return false;
      existing.url = url;
      existing.status = Status.CHECKING;
      delete existing.httpStatus;
      delete existing.info;
      return true;
    }
    state.items.push({
      key,
      url,
      title: tab.title || title || '',
      host: new URL(url).host,
      referer: refererFor(frameUrl ?? tab.url),
      status: denied ? Status.DENIED : Status.CHECKING,
      httpStatus: denied ? httpStatus : undefined,
    });
    return true;
  });

  if (needsCheck && !denied) await inspect(tabId, frameId, key, url);
}

chrome.webRequest.onCompleted.addListener(
  (details) => {
    addStream({
      tabId: details.tabId,
      frameId: details.frameId,
      url: details.url,
      httpStatus: details.statusCode,
    });
  },
  { urls: ['*://*/*.m3u8*'] },
);

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'stream-found' || !sender.tab) return;
  addStream({ tabId: sender.tab.id, frameId: sender.frameId, url: msg.url, frameUrl: sender.url, title: msg.title });
});

// New page in the tab: clear the list.
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId }) => {
  if (frameId === 0) clearTab(tabId);
});

// Single-page-app navigation (pushState/replaceState): clear the list when the URL changes.
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  const pageUrl = withoutHash(url);
  updateTab(tabId, (state) => {
    if (!state.pageUrl || state.pageUrl === pageUrl) return false;
    Object.assign(state, emptyState(), { pageUrl });
    return true;
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTab(tabId).then(() => queues.delete(tabId));
});

chrome.permissions.onAdded.addListener(async () => {
  await syncContentScripts();
  await injectIntoOpenTabs();
});

chrome.permissions.onRemoved.addListener(async () => {
  await syncContentScripts();
  await clearDeactivatedTabs();
});

chrome.runtime.onInstalled.addListener(syncContentScripts);
chrome.runtime.onStartup.addListener(syncContentScripts);

chrome.action.setBadgeBackgroundColor({ color: '#2f6fde' });
