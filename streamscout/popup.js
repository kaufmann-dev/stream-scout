import { buildFfmpegCommand, SHELLS } from './lib/commands.js';
import { toFilename, uniqueFilename } from './lib/filenames.js';
import { Status } from './lib/m3u8.js';
import { originPattern } from './lib/sites.js';

const STATUS_LABELS = {
  [Status.CHECKING]: 'Checking …',
  [Status.READY]: 'Ready',
  [Status.PROTECTED]: 'Protected (encrypted or DRM)',
  [Status.DENIED]: 'Access denied',
  [Status.UNKNOWN]: 'Could not check',
};

const $ = (id) => document.getElementById(id);
const list = $('list');
const toast = $('toast');
const template = $('item-template');
const frameTemplate = $('frame-template');
const shellSelect = $('shell');
const refererCheckbox = $('referer');

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const pattern = originPattern(tab?.url);
const storageKey = `tab:${tab?.id}`;
const filenames = new Map();
const rows = new Map();
let copyable = [];

const isCopyable = (item) => item.status === Status.READY || item.status === Status.UNKNOWN;

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function statusText(item) {
  const parts = [STATUS_LABELS[item.status] ?? item.status];
  if (item.status === Status.DENIED && item.httpStatus) parts[0] += ` (HTTP ${item.httpStatus})`;
  const info = item.info ?? {};
  if (info.live !== undefined) parts.push(info.live ? 'Live' : 'VOD');
  if (info.height) parts.push(`${info.height}p`);
  if (info.duration) parts.push(formatDuration(info.duration));
  return parts.join(' · ');
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.textContent = ''), 2500);
}

async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    showToast('Copy failed.');
  }
}

function defaultFilename(item) {
  const taken = new Set([...filenames.values()].map((name) => name.toLowerCase()));
  return uniqueFilename(toFilename(item.title), taken);
}

function createRow(item) {
  const li = template.content.firstElementChild.cloneNode(true);
  const input = li.querySelector('input');
  input.value = defaultFilename(item);
  filenames.set(item.key, input.value);
  input.addEventListener('input', () => filenames.set(item.key, input.value));
  input.addEventListener('change', () => {
    input.value = toFilename(input.value, toFilename(li.item.title));
    filenames.set(item.key, input.value);
  });
  li.querySelector('.copy-link').addEventListener('click', () => copy(li.item.url, 'Link copied.'));
  li.querySelector('.copy-command').addEventListener('click', () => {
    const name = toFilename(input.value, toFilename(li.item.title));
    const shell = shellSelect.value;
    const referer = refererCheckbox.checked ? li.item.referer : undefined;
    copy(buildFfmpegCommand(li.item.url, name, shell, { referer }), `ffmpeg command for ${SHELLS[shell]} copied.`);
  });
  return li;
}

function updateRow(li, item) {
  li.item = item;
  li.dataset.status = item.status;
  const title = item.title || item.host;
  li.querySelector('.title').textContent = title;
  li.querySelector('.title').title = title;
  li.querySelector('.host').textContent = item.host;
  li.querySelector('.status').textContent = statusText(item);
  li.querySelector('.tools').hidden = !isCopyable(item);
}

// Updates rows in place so edits to file names are kept.
function renderStreams(state) {
  const items = state?.items ?? [];
  copyable = items.filter(isCopyable);
  $('empty').hidden = items.length > 0;
  $('copy-all').disabled = copyable.length === 0;

  const keys = new Set(items.map((i) => i.key));
  for (const [key, li] of rows) {
    if (!keys.has(key)) {
      li.remove();
      rows.delete(key);
      filenames.delete(key);
    }
  }
  items.forEach((item, index) => {
    let li = rows.get(item.key);
    if (!li) {
      li = createRow(item);
      rows.set(item.key, li);
    }
    updateRow(li, item);
    if (list.children[index] !== li) list.insertBefore(li, list.children[index] ?? null);
  });
}

async function toggleOrigin(origin, active) {
  if (active) {
    if (!(await chrome.permissions.remove({ origins: [origin] }))) {
      showToast('Could not deactivate. Check site access at chrome://extensions.');
    }
  } else if (!(await chrome.permissions.request({ origins: [origin] }))) {
    showToast('Permission not granted.');
  }
  // The background registers and injects the content script via permissions.onAdded/onRemoved.
  await renderSite();
}

// Origins of the iframes in the tab, e.g. embedded players.
async function renderFrames() {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) ?? [];
  const origins = [...new Set(frames.map((f) => originPattern(f.url)))].filter((o) => o && o !== pattern);
  const states = await Promise.all(origins.map((o) => chrome.permissions.contains({ origins: [o] })));
  $('frames').hidden = origins.length === 0;
  $('frame-list').replaceChildren(
    ...origins.map((origin, i) => {
      const li = frameTemplate.content.firstElementChild.cloneNode(true);
      const host = new URL(origin.replace('/*', '/')).hostname;
      li.querySelector('.frame-host').textContent = host;
      li.querySelector('.frame-host').title = host;
      const button = li.querySelector('button');
      button.textContent = states[i] ? 'Deactivate' : 'Activate';
      button.setAttribute('aria-label', `${host} ${button.textContent.toLowerCase()}`);
      button.addEventListener('click', () => toggleOrigin(origin, states[i]));
      return li;
    }),
  );
}

async function renderSite() {
  $('site-host').textContent = pattern ? new URL(tab.url).hostname : '';
  const active = Boolean(pattern) && (await chrome.permissions.contains({ origins: [pattern] }));
  $('unsupported').hidden = Boolean(pattern);
  $('inactive').hidden = !pattern || active;
  $('active').hidden = !active;
  $('deactivate').hidden = !active;
  if (active) {
    const { [storageKey]: state } = await chrome.storage.session.get(storageKey);
    renderStreams(state);
    await renderFrames();
  }
}

async function setupSettings() {
  for (const [value, label] of Object.entries(SHELLS)) shellSelect.add(new Option(label, value));
  const fallback = navigator.userAgentData?.platform === 'Windows' ? 'powershell' : 'bash';
  const { shell, referer = true } = await chrome.storage.local.get(['shell', 'referer']);
  shellSelect.value = shell in SHELLS ? shell : fallback;
  refererCheckbox.checked = referer;
  shellSelect.addEventListener('change', () => chrome.storage.local.set({ shell: shellSelect.value }));
  refererCheckbox.addEventListener('change', () => chrome.storage.local.set({ referer: refererCheckbox.checked }));
}

$('activate').addEventListener('click', () => toggleOrigin(pattern, false));
$('deactivate').addEventListener('click', () => toggleOrigin(pattern, true));

$('copy-all').addEventListener('click', () => {
  const n = copyable.length;
  copy(copyable.map((i) => i.url).join('\n'), n === 1 ? '1 link copied.' : `${n} links copied.`);
});

chrome.storage.session.onChanged.addListener((changes) => {
  if (storageKey in changes && !$('active').hidden) renderStreams(changes[storageKey].newValue);
});

await setupSettings();
await renderSite();
