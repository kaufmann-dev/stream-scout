import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FILENAME_LENGTH, toFilename, uniqueFilename } from '../lib/filenames.js';

test('umlauts and ß are transliterated', () => {
  assert.equal(toFilename('Größe über Äpfel, Öl & Übermaß'), 'Groesse ueber Aepfel, Oel & Uebermass');
});

test('decomposed umlauts (NFD) are transliterated too', () => {
  assert.equal(toFilename('München'), 'Muenchen');
});

test('other accents are removed, the rest becomes ASCII', () => {
  assert.equal(toFilename('Café Crème – Part 1 | Channel'), 'Cafe Creme Part 1 Channel');
  assert.equal(toFilename('日本語のタイトル'), 'stream');
  assert.match(toFilename('Emoji 🎬 Test: a/b\\c*d?e"f<g>h'), /^[\x20-\x7e]+$/);
  assert.equal(toFilename('Emoji 🎬 Test: a/b\\c*d?e"f<g>h'), 'Emoji Test a b c d e f g h');
});

test('length is limited to 80 characters without trailing space or dot', () => {
  const name = toFilename(`${'a'.repeat(79)} bbbb`);
  assert.equal(name, 'a'.repeat(79));
  assert.ok(toFilename('x'.repeat(200)).length === MAX_FILENAME_LENGTH);
  assert.equal(toFilename('  ..Title..  '), 'Title');
});

test('empty titles and reserved Windows names', () => {
  assert.equal(toFilename(''), 'stream');
  assert.equal(toFilename(undefined), 'stream');
  assert.equal(toFilename('###', 'video'), 'video');
  assert.equal(toFilename('CON'), 'CON_');
  assert.equal(toFilename('nul'), 'nul_');
});

test('% is dropped, apostrophe is kept', () => {
  assert.equal(toFilename("100% Peter's Film"), "100 Peter's Film");
});

test('uniqueFilename numbers equal names case-insensitively', () => {
  assert.equal(uniqueFilename('Film', new Set()), 'Film');
  assert.equal(uniqueFilename('Film', new Set(['film'])), 'Film (2)');
  assert.equal(uniqueFilename('Film', new Set(['film', 'film (2)'])), 'Film (3)');
  const long = 'a'.repeat(MAX_FILENAME_LENGTH);
  const result = uniqueFilename(long, new Set([long]));
  assert.equal(result.length, MAX_FILENAME_LENGTH);
  assert.ok(result.endsWith(' (2)'));
});
