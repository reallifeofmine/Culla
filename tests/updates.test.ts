import { test } from 'node:test';
import assert from 'node:assert/strict';

// bullets() is pure; import it without pulling in React Native.
const { bullets } = await import('../src/lib/updates-notes.ts');

test('release notes become dot points', () => {
  assert.deepEqual(bullets('- First\n* Second\n• Third\nNot a bullet\n\nFirst install: tap culla.apk'), ['First', 'Second', 'Third']);
});
