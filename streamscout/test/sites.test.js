import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originPattern, refererFor, withoutHash } from '../lib/sites.js';

test('originPattern only for http(s), without port', () => {
  assert.equal(originPattern('https://www.example.com:8443/a?b=1'), 'https://www.example.com/*');
  assert.equal(originPattern('http://localhost:8000/'), 'http://localhost/*');
  assert.equal(originPattern('chrome://extensions'), null);
  assert.equal(originPattern(undefined), null);
});

test('refererFor removes query and fragment', () => {
  assert.equal(refererFor('https://site.example/video/1?token=secret#t=5'), 'https://site.example/video/1');
  assert.equal(refererFor('https://site.example'), 'https://site.example/');
  assert.equal(refererFor('about:blank'), null);
});

test('withoutHash', () => {
  assert.equal(withoutHash('https://a.de/x?y=1#z'), 'https://a.de/x?y=1');
});
