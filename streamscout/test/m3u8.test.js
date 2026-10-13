import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectStream, isEncrypted, isLive, isM3u8Url, parsePlaylist, playlistKey, Status } from '../lib/m3u8.js';

const MASTER = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="German",URI="audio/de.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",AUDIO="aud"
720p/index.m3u8?token=abc
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
https://cdn.example.com/1080p/index.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg0.ts
#EXT-X-ENDLIST
`;

const ENCRYPTED_MEDIA = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/k",IV=0x1
#EXTINF:6.0,
seg0.ts
`;

function fakeFetch(responses) {
  return async (url) => {
    const res = responses[url];
    if (!res) throw new TypeError('Failed to fetch');
    return typeof res === 'number' ? { status: res, text: '' } : { status: 200, text: res };
  };
}

test('isM3u8Url only accepts http(s) URLs with a .m3u8 path', () => {
  assert.equal(isM3u8Url('https://a.com/x/master.m3u8?t=1'), true);
  assert.equal(isM3u8Url('http://a.com/X.M3U8'), true);
  assert.equal(isM3u8Url('https://a.com/x.mp4?f=a.m3u8'), false);
  assert.equal(isM3u8Url('blob:https://a.com/123'), false);
  assert.equal(isM3u8Url('not a url'), false);
});

test('playlistKey ignores query and fragment', () => {
  assert.equal(playlistKey('https://a.com/p.m3u8?token=1#x'), 'https://a.com/p.m3u8');
  assert.equal(playlistKey('https://a.com/p.m3u8'), playlistKey('https://a.com/p.m3u8?token=2'));
});

test('parsePlaylist resolves variants and renditions against the base URL', () => {
  const p = parsePlaylist(MASTER, 'https://media.example.com/v/master.m3u8');
  assert.equal(p.isMaster, true);
  assert.deepEqual(p.variants, [
    { url: 'https://media.example.com/v/720p/index.m3u8?token=abc', height: 720 },
    { url: 'https://cdn.example.com/1080p/index.m3u8', height: 1080 },
  ]);
  assert.deepEqual(p.renditions, ['https://media.example.com/v/audio/de.m3u8']);
  assert.equal(isEncrypted(p), false);
});

test('parsePlaylist handles media playlists and CRLF', () => {
  const p = parsePlaylist(MEDIA.replace(/\n/g, '\r\n'), 'https://a.com/x.m3u8');
  assert.equal(p.isMaster, false);
  assert.deepEqual(p.variants, []);
  assert.equal(p.endList, true);
  assert.equal(p.duration, 6);
});

test('isLive: live without ENDLIST unless PLAYLIST-TYPE:VOD', () => {
  const base = 'https://a.com/x.m3u8';
  assert.equal(isLive(parsePlaylist(MEDIA, base)), false);
  assert.equal(isLive(parsePlaylist('#EXTM3U\n#EXTINF:6,\ns.ts\n', base)), true);
  assert.equal(isLive(parsePlaylist('#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:6,\ns.ts\n', base)), false);
  assert.equal(isLive(parsePlaylist('#EXTM3U\n#EXT-X-PLAYLIST-TYPE:EVENT\n#EXTINF:6,\ns.ts\n', base)), true);
});

test('parsePlaylist rejects non-playlists', () => {
  assert.throws(() => parsePlaylist('<html></html>', 'https://a.com/x.m3u8'));
});

test('isEncrypted: METHOD other than NONE counts as protected', () => {
  const base = 'https://a.com/x.m3u8';
  assert.equal(isEncrypted(parsePlaylist(ENCRYPTED_MEDIA, base)), true);
  assert.equal(isEncrypted(parsePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n', base)), false);
  assert.equal(isEncrypted(parsePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.apple.streamingkeydelivery"\n', base)), true);
  assert.equal(
    isEncrypted(parsePlaylist('#EXTM3U\n#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES-CTR,KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"\n', base)),
    true,
  );
});

test('inspectStream: unencrypted master with variant is ready', async () => {
  const url = 'https://media.example.com/v/master.m3u8';
  const result = await inspectStream(url, fakeFetch({
    [url]: MASTER,
    'https://media.example.com/v/720p/index.m3u8?token=abc': MEDIA,
  }));
  assert.equal(result.status, Status.READY);
  assert.deepEqual(result.info, { height: 1080, live: false, duration: 6 });
  assert.deepEqual(result.children, [
    'https://media.example.com/v/720p/index.m3u8',
    'https://cdn.example.com/1080p/index.m3u8',
    'https://media.example.com/v/audio/de.m3u8',
  ]);
});

test('inspectStream: key in the first variant means protected', async () => {
  const url = 'https://a.com/master.m3u8';
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n';
  const result = await inspectStream(url, fakeFetch({ [url]: master, 'https://a.com/v.m3u8': ENCRYPTED_MEDIA }));
  assert.equal(result.status, Status.PROTECTED);
});

test('inspectStream: SESSION-KEY in the master means protected without loading a variant', async () => {
  const url = 'https://a.com/master.m3u8';
  const master = '#EXTM3U\n#EXT-X-SESSION-KEY:METHOD=AES-128,URI="k"\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n';
  const result = await inspectStream(url, fakeFetch({ [url]: master }));
  assert.equal(result.status, Status.PROTECTED);
});

test('inspectStream: 401/403 means denied with HTTP status', async () => {
  const url = 'https://a.com/master.m3u8';
  assert.deepEqual(await inspectStream(url, fakeFetch({ [url]: 403 })), {
    status: Status.DENIED,
    httpStatus: 403,
    children: [],
  });
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n';
  const result = await inspectStream(url, fakeFetch({ [url]: master, 'https://a.com/v.m3u8': 401 }));
  assert.equal(result.status, Status.DENIED);
  assert.equal(result.httpStatus, 401);
});

test('inspectStream: network errors and other HTTP errors mean unknown', async () => {
  const url = 'https://a.com/master.m3u8';
  assert.equal((await inspectStream(url, fakeFetch({}))).status, Status.UNKNOWN);
  assert.equal((await inspectStream(url, fakeFetch({ [url]: 500 }))).status, Status.UNKNOWN);
});

test('inspectStream: media playlist without master is ready', async () => {
  const url = 'https://a.com/index.m3u8';
  const result = await inspectStream(url, fakeFetch({ [url]: MEDIA }));
  assert.deepEqual(result, { status: Status.READY, children: [], info: { height: null, live: false, duration: 6 } });
});
