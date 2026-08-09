// Run: node src/utils/albumColor.test.ts   (Node strips the types natively)
//
// hueFor seeds the whole v2 "colour wash" identity — art blocks, header
// gradients and accent rings all derive from it — so the properties that
// matter are that it is stable, bounded and integral. It is also the only
// non-trivial pure function in the design layer, hence the only one tested.
import assert from 'node:assert/strict';
import { getInitial, hueFor, ringColor, tintColor, washColor } from './albumColor.ts';

const keys = ['a1', 'Ordinary Weather', 'The Longshore', '', '🎧 Held Note', 'x'.repeat(500)];

for (const key of keys) {
  const hue = hueFor(key);
  assert.equal(hue, hueFor(key), `hueFor must be stable for ${JSON.stringify(key.slice(0, 20))}`);
  assert.ok(Number.isInteger(hue), `hue must be an integer, got ${hue}`);
  // The `>>> 0` in the accumulator is what keeps this true: without it a long
  // key drifts past 2^53 and the hash stops being an exact integer.
  assert.ok(hue >= 0 && hue < 360, `hue must be in [0,360), got ${hue}`);
}

// Distinct records must not collapse onto one hue, or every header washes the
// same colour and the device looks broken rather than themed.
assert.ok(new Set(keys.map(hueFor)).size > 1, 'distinct keys should spread across hues');

// Locked to the design's ringC/tint/wash values — these three are the palette.
assert.equal(ringColor(18), 'hsl(18, 44%, 54%)');
assert.equal(tintColor(18), 'hsl(18, 28%, 11%)');
assert.equal(washColor(18), 'hsl(18, 38%, 20%)');

assert.equal(getInitial('  ordinary weather'), 'O');
assert.equal(getInitial(''), '?');
assert.equal(getInitial('   '), '?');

console.log('albumColor: ok');
