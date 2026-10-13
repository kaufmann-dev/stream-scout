import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFfmpegCommand, quote } from '../lib/commands.js';

const URL_ = 'https://cdn.example.com/v/master.m3u8?a=1&b=%2Fx%CD%';

test('PowerShell: einfache Anführungszeichen, \' wird verdoppelt', () => {
  assert.equal(quote("Peter's Film", 'powershell'), "'Peter''s Film'");
  assert.equal(quote('a & b % c', 'powershell'), "'a & b % c'");
  assert.equal(quote('it’s', 'powershell'), "'it’’s'");
});

test('CMD: doppelte Anführungszeichen, % wird maskiert', () => {
  assert.equal(quote("Peter's Film & Co", 'cmd'), '"Peter\'s Film & Co"');
  assert.equal(quote('a%CD%b', 'cmd'), '"a"^%"CD"^%"b"');
  assert.equal(quote('ohne Prozent', 'cmd'), '"ohne Prozent"');
});

test('bash: einfache Anführungszeichen, \' wird zu \'\\\'\'', () => {
  assert.equal(quote("Peter's Film", 'bash'), "'Peter'\\''s Film'");
  assert.equal(quote('a & b % c $HOME', 'bash'), "'a & b % c $HOME'");
});

test('unbekannte Shell wirft einen Fehler', () => {
  assert.throws(() => quote('x', 'fish'));
});

test('ffmpeg-Befehl pro Shell', () => {
  assert.equal(
    buildFfmpegCommand(URL_, "Peter's Film", 'powershell'),
    "ffmpeg -hide_banner -i 'https://cdn.example.com/v/master.m3u8?a=1&b=%2Fx%CD%' -sn -c copy 'Peter''s Film.mp4'",
  );
  assert.equal(
    buildFfmpegCommand(URL_, "Peter's Film", 'cmd'),
    'ffmpeg -hide_banner -i "https://cdn.example.com/v/master.m3u8?a=1&b="^%"2Fx"^%"CD"^%"" -sn -c copy "Peter\'s Film.mp4"',
  );
  assert.equal(
    buildFfmpegCommand(URL_, "Peter's Film", 'bash'),
    "ffmpeg -hide_banner -i 'https://cdn.example.com/v/master.m3u8?a=1&b=%2Fx%CD%' -sn -c copy 'Peter'\\''s Film.mp4'",
  );
});

test('Referer steht vor -i und wird gequotet', () => {
  assert.equal(
    buildFfmpegCommand('https://a.com/m.m3u8', 'Film', 'bash', { referer: "https://seite.de/peter's" }),
    "ffmpeg -hide_banner -referer 'https://seite.de/peter'\\''s' -i 'https://a.com/m.m3u8' -sn -c copy 'Film.mp4'",
  );
  assert.equal(
    buildFfmpegCommand('https://a.com/m.m3u8', 'Film', 'cmd', { referer: 'https://seite.de/a%20b' }),
    'ffmpeg -hide_banner -referer "https://seite.de/a"^%"20b" -i "https://a.com/m.m3u8" -sn -c copy "Film.mp4"',
  );
  assert.equal(
    buildFfmpegCommand('https://a.com/m.m3u8', 'Film', 'powershell', { referer: undefined }),
    "ffmpeg -hide_banner -i 'https://a.com/m.m3u8' -sn -c copy 'Film.mp4'",
  );
});

test('bash-Quoting übersteht eine echte Shell', async (t) => {
  const { execFileSync } = await import('node:child_process');
  let ok = true;
  try {
    execFileSync('bash', ['-c', 'true']);
  } catch {
    ok = false;
  }
  if (!ok) return t.skip('bash nicht verfügbar');
  for (const value of ["Peter's Film", 'a & b % c', "''", 'x y\'z\'"$HOME"`id`']) {
    const out = execFileSync('bash', ['-c', `printf %s ${quote(value, 'bash')}`], { encoding: 'utf8' });
    assert.equal(out, value);
  }
});
