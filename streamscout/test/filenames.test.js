import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FILENAME_LENGTH, toFilename, uniqueFilename } from '../lib/filenames.js';

test('Umlaute und ß werden transliteriert', () => {
  assert.equal(toFilename('Größe über Äpfel, Öl & Übermaß'), 'Groesse ueber Aepfel, Oel & Uebermass');
});

test('zerlegte Umlaute (NFD) werden ebenfalls transliteriert', () => {
  assert.equal(toFilename('München'), 'Muenchen');
});

test('andere Akzente werden entfernt, Rest wird ASCII', () => {
  assert.equal(toFilename('Café Crème – Teil 1 | Sender'), 'Cafe Creme Teil 1 Sender');
  assert.equal(toFilename('日本語のタイトル'), 'stream');
  assert.match(toFilename('Emoji 🎬 Test: a/b\\c*d?e"f<g>h'), /^[\x20-\x7e]+$/);
  assert.equal(toFilename('Emoji 🎬 Test: a/b\\c*d?e"f<g>h'), 'Emoji Test a b c d e f g h');
});

test('Länge wird auf 80 Zeichen begrenzt, ohne Leerzeichen oder Punkt am Ende', () => {
  const name = toFilename(`${'a'.repeat(79)} bbbb`);
  assert.equal(name, 'a'.repeat(79));
  assert.ok(toFilename('x'.repeat(200)).length === MAX_FILENAME_LENGTH);
  assert.equal(toFilename('  ..Titel..  '), 'Titel');
});

test('leere Titel und reservierte Windows-Namen', () => {
  assert.equal(toFilename(''), 'stream');
  assert.equal(toFilename(undefined), 'stream');
  assert.equal(toFilename('###', 'video'), 'video');
  assert.equal(toFilename('CON'), 'CON_');
  assert.equal(toFilename('nul'), 'nul_');
});

test('% wird nicht übernommen, Apostroph schon', () => {
  assert.equal(toFilename("100% Peter's Film"), "100 Peter's Film");
});

test('uniqueFilename nummeriert gleiche Namen ohne Rücksicht auf Groß- und Kleinschreibung', () => {
  assert.equal(uniqueFilename('Film', new Set()), 'Film');
  assert.equal(uniqueFilename('Film', new Set(['film'])), 'Film (2)');
  assert.equal(uniqueFilename('Film', new Set(['film', 'film (2)'])), 'Film (3)');
  const long = 'a'.repeat(MAX_FILENAME_LENGTH);
  const result = uniqueFilename(long, new Set([long]));
  assert.equal(result.length, MAX_FILENAME_LENGTH);
  assert.ok(result.endsWith(' (2)'));
});
