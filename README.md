# StreamScout

Chrome extension (Manifest V3) for personal use. It finds HLS links (`.m3u8`) on sites you have activated. Copy the link with one click, or copy a ready-made ffmpeg command. Plain JavaScript/HTML/CSS, no libraries, no build step.

## Installation

1. Get the code:
   ```sh
   git clone https://github.com/kaufmann-dev/stream-scout.git
   ```
   Or download the ZIP from GitHub (**Code → Download ZIP**) and unpack it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `streamscout/` folder inside the repository.
4. After changing the code, reload the extension on `chrome://extensions`.

## Usage

1. On the page with the video, click the StreamScout icon and choose **Activate on this site**. Chrome asks for permission for this origin (e.g. `https://example.com/*`).
2. Play the video. The number on the icon shows how many streams were found.
3. The popup offers:
   - **Copy link** for a single stream,
   - **Copy all links** for all copyable links, one per line,
   - **Copy ffmpeg command** for the selected shell (PowerShell, CMD or bash). The choice is saved. The file name comes from the page title and can be edited in the popup.
   - **Referer**: adds the page URL without query as `-referer` (on by default). Some servers return 403 without it.
4. Each stream shows its status, live or VOD, the highest resolution and, for VOD, the duration.
5. If the player sits in an iframe from another site (e.g. `player.vimeo.com`), that site appears under **Embedded sites**, where you can activate it as well.
6. **Deactivate** revokes the permission, removes the content script and clears the list.

Without activation, StreamScout records nothing on a site.

## Permissions

| Permission                 | Purpose                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `storage`                  | Stream list per tab (`storage.session`), shell and referer option (`storage.local`) |
| `webRequest`               | Observe `.m3u8` requests, never block them                                          |
| `webNavigation`            | Detect navigation (including single-page apps) and list the iframes in a tab        |
| `scripting`                | Register and inject the content script for activated sites                          |
| `activeTab`                | Read the current tab's origin when you click the icon (for "Activate")              |
| `https://stream.mux.com/*` | Check Mux playlists                                                                 |
| `<all_urls>` (optional)    | Only requested per origin when you activate a site                                  |

Because of `webNavigation`, Chrome shows a "Read your browsing history" warning on install. StreamScout does not store any history.

## How it works

**Detection**

- `chrome.webRequest` observes `.m3u8` requests but only sees hosts it has permission for. This is also how 401/403 responses to the player arrive.
- The content script collects resources via a `PerformanceObserver`, so playlists from third-party CDN hosts are detected too.
- A `MutationObserver` watches `<video>`, `<source>` and `<mux-player>`. A `playback-id` becomes `https://stream.mux.com/<id>.m3u8`.
- Each tab has its own list in `chrome.storage.session`. Duplicates are detected by URL without query. If the same playlist later shows up with a query (e.g. signed), that URL replaces the old one.
- When the tab loads a new page, the list is cleared. The same happens when a single-page app changes the URL via `pushState`.
- The title is the tab title (`document.title` of the page).
- Players in iframes from another origin are only detected if that origin is activated too. Nothing is recorded unless the tab's main site is activated.

**Checks**

- The playlist is loaded in the page context, so the same CORS rules apply as for the player.
- `#EXT-X-KEY` and `#EXT-X-SESSION-KEY` with a `METHOD` other than `NONE` are looked for in the master and in the first variant playlist. A match means the status "Protected".
- Variant and audio playlists referenced by a master are hidden, so each stream appears only once.
- Live or VOD: without `#EXT-X-ENDLIST` and unless `#EXT-X-PLAYLIST-TYPE` is `VOD`, the stream counts as live. The duration is the sum of the `#EXTINF` values, the resolution is the highest `RESOLUTION` in the master. Without `-map`, ffmpeg also picks the highest resolution.

**Status**

| Status          | Meaning                                           | Actions                 |
| --------------- | ------------------------------------------------- | ----------------------- |
| Ready           | Playlist is readable and not encrypted            | Link and ffmpeg command |
| Could not check | Playlist could not be loaded (e.g. CORS, network) | Link and ffmpeg command |
| Protected       | Encryption or DRM (`METHOD` ≠ `NONE`)             | None, status only       |
| Access denied   | Server responds with 401/403                      | None, status only       |

## ffmpeg command

```
ffmpeg -hide_banner [-referer "<page URL>"] -i "<URL>" -sn -c copy "<name>.mp4"
```

`-sn` drops subtitles. The command never contains cookies or tokens. The only header is the optional referer: the page or iframe the stream came from, without query and fragment. Quoting per shell:

| Shell      | Quoting                                                                |
| ---------- | ---------------------------------------------------------------------- |
| PowerShell | `'...'`, `'` becomes `''`                                              |
| CMD        | `"..."`, every `%` is escaped as `"^%"` so e.g. `%CD%` is not expanded |
| bash       | `'...'`, `'` becomes `'\''`                                            |

File name: ASCII, German umlauts transliterated (ä → ae, ß → ss), other accents removed, at most 80 characters. Letters, digits, spaces and `.,_()'&+-` are allowed. Reserved Windows names such as `CON` get a trailing `_`. If several streams share a name, ` (2)`, ` (3)` … is appended.

## Privacy and rules

- No data sent to third parties, no analytics, no external scripts.
- Only the stream URL, title, host, referer (page URL without query) and settings are stored. Cookies, tokens and other user data are never read or stored.
- Protection is never bypassed. For encryption, DRM or 401/403, the popup only shows the status.

## Tests

```sh
cd streamscout
node --test
```

The tests cover playlist parsing (including live/VOD), encryption detection, file names, referer and quoting per shell (`'`, `%`, `&`, spaces).

## Structure

```
README.md
streamscout/
├── manifest.json
├── background.js       Per-tab storage, webRequest, checks, activation
├── content.js          Detection on the page, playlist loading
├── popup.html/js/css   User interface
├── lib/m3u8.js         Parsing and encryption detection
├── lib/commands.js     ffmpeg command and quoting
├── lib/filenames.js    File names from the title
├── lib/sites.js        Permission patterns per origin, referer
├── icons/              Extension icons
└── test/               node --test
```
