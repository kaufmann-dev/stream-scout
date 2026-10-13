# StreamScout

Chrome-Extension (Manifest V3) für den privaten Gebrauch. Sie findet HLS-Links (`.m3u8`) auf Seiten, die du freigeschaltet hast. Den Link kopierst du mit einem Klick, auf Wunsch auch einen fertigen ffmpeg-Befehl. Reines JavaScript/HTML/CSS, ohne Bibliotheken und ohne Build-Schritt.

## Installation

1. `chrome://extensions` öffnen und den **Entwicklermodus** einschalten.
2. **Entpackte Erweiterung laden** und den Ordner `streamscout/` auswählen.
3. Nach Änderungen am Code die Extension auf `chrome://extensions` neu laden.

## Bedienung

1. Auf der Seite mit dem Video das StreamScout-Icon anklicken und **Auf dieser Seite aktivieren** wählen. Chrome fragt nach der Berechtigung für diese Origin (z. B. `https://example.com/*`).
2. Video abspielen. Die Zahl am Icon zeigt die gefundenen Streams.
3. Im Popup gibt es:
   - **Link kopieren** für den einzelnen Stream,
   - **Alle Links kopieren** für alle kopierbaren Links, einen pro Zeile,
   - **ffmpeg-Befehl kopieren** für die gewählte Shell (PowerShell, CMD oder bash). Die Auswahl wird gespeichert. Der Dateiname kommt aus dem Seitentitel und lässt sich im Popup ändern.
   - **Referer**: schickt die Seiten-URL ohne Query als `-referer` mit (Standard: an). Manche Server liefern sonst 403.
4. Unter jedem Stream stehen Status, Live oder VOD, die höchste Auflösung und bei VOD die Dauer.
5. Liegt der Player in einem iframe einer anderen Seite (z. B. `player.vimeo.com`), erscheint diese unter **Eingebettete Seiten**. Dort lässt sie sich zusätzlich aktivieren.
6. **Deaktivieren** entzieht die Berechtigung, entfernt das Content Script und leert die Liste.

Ohne Aktivierung erfasst StreamScout auf einer Seite nichts.

## Berechtigungen

| Berechtigung               | Zweck                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `storage`                  | Streamliste pro Tab (`storage.session`), Shell und Referer-Option (`storage.local`) |
| `webRequest`               | `.m3u8`-Anfragen beobachten, nie blockieren                                         |
| `webNavigation`            | Seitenwechsel erkennen (auch in Single-Page-Apps) und iframes im Tab auflisten      |
| `scripting`                | Content Script für freigeschaltete Seiten registrieren und injizieren               |
| `activeTab`                | Beim Klick aufs Icon die Origin des aktuellen Tabs lesen (für „Aktivieren“)         |
| `https://stream.mux.com/*` | Mux-Playlists prüfen                                                                |
| `<all_urls>` (optional)    | Wird nur pro Origin angefragt, wenn du eine Seite aktivierst                        |

## Funktionsweise

**Erkennung**

- `chrome.webRequest` beobachtet `.m3u8`-Anfragen, sieht aber nur Hosts mit Berechtigung. Über diesen Weg kommen auch 401/403-Antworten des Players an.
- Das Content Script sammelt Ressourcen über einen `PerformanceObserver`. Damit werden auch Playlists von fremden CDN-Hosts erkannt.
- Ein `MutationObserver` überwacht `<video>`, `<source>` und `<mux-player>`. Aus `playback-id` wird `https://stream.mux.com/<id>.m3u8`.
- Pro Tab gibt es eine Liste in `chrome.storage.session`. Duplikate werden über die URL ohne Query erkannt. Taucht dieselbe Playlist später mit Query auf (z. B. signiert), ersetzt diese URL die alte.
- Lädt der Tab eine neue Seite, wird die Liste geleert. Das gilt auch, wenn eine Single-Page-App per `pushState` die URL wechselt.
- Als Titel dient der Titel des Tabs (`document.title` der Seite).
- Player in iframes einer anderen Origin werden nur erkannt, wenn diese Origin ebenfalls aktiviert ist. Erfasst wird außerdem nur, wenn die Hauptseite im Tab aktiviert ist.

**Prüfung**

- Die Playlist wird im Kontext der Seite geladen, also mit denselben CORS-Regeln wie der Player.
- `#EXT-X-KEY` und `#EXT-X-SESSION-KEY` mit `METHOD` ungleich `NONE` werden im Master und in der ersten Varianten-Playlist gesucht. Ein Treffer ergibt den Status „Geschützt“.
- Varianten- und Audio-Playlists, die ein Master referenziert, werden ausgeblendet. So erscheint jeder Stream nur einmal.
- Live oder VOD: Fehlt `#EXT-X-ENDLIST` und ist `#EXT-X-PLAYLIST-TYPE` nicht `VOD`, gilt der Stream als live. Die Dauer ist die Summe der `#EXTINF`-Werte, die Auflösung das höchste `RESOLUTION` im Master. ffmpeg wählt ohne `-map` ebenfalls die höchste Auflösung.

**Status**

| Status             | Bedeutung                                                   | Aktionen                 |
| ------------------ | ----------------------------------------------------------- | ------------------------ |
| Bereit             | Playlist ist lesbar und nicht verschlüsselt                 | Link und ffmpeg-Befehl   |
| Nicht prüfbar      | Playlist konnte nicht geladen werden (z. B. CORS, Netzwerk) | Link und ffmpeg-Befehl   |
| Geschützt          | Verschlüsselung oder DRM (`METHOD` ≠ `NONE`)                | keine, nur Statusmeldung |
| Zugriff verweigert | Server antwortet mit 401/403                                | keine, nur Statusmeldung |

## ffmpeg-Befehl

```
ffmpeg -hide_banner [-referer "<Seiten-URL>"] -i "<URL>" -sn -c copy "<Name>.mp4"
```

`-sn` lässt Untertitel weg. Der Befehl enthält nie Cookies oder Tokens. Der einzige Header ist der optionale Referer, also die Seite oder das iframe, aus dem der Stream kam, ohne Query und Fragment. Quoting pro Shell:

| Shell      | Quoting                                                                          |
| ---------- | -------------------------------------------------------------------------------- |
| PowerShell | `'...'`, `'` wird zu `''`                                                        |
| CMD        | `"..."`, jedes `%` wird als `"^%"` maskiert, damit z. B. `%CD%` nicht expandiert |
| bash       | `'...'`, `'` wird zu `'\''`                                                      |

Dateiname: ASCII, Umlaute transliteriert (ä → ae, ß → ss), andere Akzente entfernt, höchstens 80 Zeichen. Erlaubt sind Buchstaben, Ziffern, Leerzeichen und `.,_()'&+-`. Reservierte Windows-Namen wie `CON` bekommen ein `_` angehängt. Haben mehrere Streams denselben Namen, wird ` (2)`, ` (3)` … angehängt.

## Datenschutz und Regeln

- Keine Daten an Dritte, keine Analytics, keine externen Skripte.
- Gespeichert werden nur Stream-URL, Titel, Host, Referer (Seiten-URL ohne Query) und die Einstellungen. Cookies, Tokens oder andere Nutzerdaten werden weder gelesen noch gespeichert.
- Schutzmechanismen werden nicht umgangen. Bei Verschlüsselung, DRM oder 401/403 zeigt das Popup nur den Status an.

## Tests

```sh
cd streamscout
node --test
```

Getestet werden Playlist-Parsing (inklusive Live/VOD), Verschlüsselungserkennung, Dateinamen, Referer und das Quoting pro Shell (`'`, `%`, `&`, Leerzeichen).

## Struktur

```
streamscout/
├── manifest.json
├── background.js       Speicher pro Tab, webRequest, Prüfung, Freischaltung
├── content.js          Erkennung auf der Seite, Laden der Playlist
├── popup.html/js/css   Oberfläche
├── lib/m3u8.js         Parsing und Verschlüsselungserkennung
├── lib/commands.js     ffmpeg-Befehl und Quoting
├── lib/filenames.js    Dateinamen aus dem Titel
├── lib/sites.js        Berechtigungsmuster pro Origin, Referer
├── icons/              Extension-Icons
└── test/               node --test
```
