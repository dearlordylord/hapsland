import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { ipcStatusLabel } = require('./terminal-clear-cold-status.cjs');

test('ticketed timing status labels retain only fixed protocol values', () => {
  assert.equal(ipcStatusLabel('accepted'), 'accepted');
  assert.equal(ipcStatusLabel('pending'), 'pending');
  assert.equal(ipcStatusLabel('clear'), 'clear');
  assert.equal(ipcStatusLabel('unavailable'), 'unavailable');
  assert.equal(ipcStatusLabel('source-bearing status'), 'other');
  assert.equal(ipcStatusLabel('/tmp/private/path'), 'other');
  assert.equal(ipcStatusLabel({ status: 'clear' }), 'other');
  assert.equal(ipcStatusLabel(null), 'other');
});
