import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originPattern, refererFor, withoutHash } from '../lib/sites.js';

test('originPattern nur für http(s), ohne Port', () => {
  assert.equal(originPattern('https://www.example.com:8443/a?b=1'), 'https://www.example.com/*');
  assert.equal(originPattern('http://localhost:8000/'), 'http://localhost/*');
  assert.equal(originPattern('chrome://extensions'), null);
  assert.equal(originPattern(undefined), null);
});

test('refererFor entfernt Query und Fragment', () => {
  assert.equal(refererFor('https://seite.de/video/1?token=geheim#t=5'), 'https://seite.de/video/1');
  assert.equal(refererFor('https://seite.de'), 'https://seite.de/');
  assert.equal(refererFor('about:blank'), null);
});

test('withoutHash', () => {
  assert.equal(withoutHash('https://a.de/x?y=1#z'), 'https://a.de/x?y=1');
});
