const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(readFileSync(join(__dirname, '..', 'star-field.js'), 'utf8'), { window });
const { halo, depthLight } = window.StarField;

test('halos are restricted to large bright stars', () => {
  for (const size of [0, 1.5, 5, 10.5, 11]) {
    for (const flux of [0.4, 0.8, 0.9, 1.5]) assert.equal(halo(size, flux), 0);
  }
  for (const size of [11.5, 13, 15, 30]) {
    for (const flux of [0, 0.4, 0.8]) assert.equal(halo(size, flux), 0);
  }
  assert.ok(halo(15, 1) > 0);
});

test('halo strength is stable, bounded, and increases smoothly above the threshold', () => {
  let previous = 0;
  for (let size = 11; size <= 20; size += 0.125) {
    const strength = halo(size, 1);
    assert.equal(strength, halo(size, 1));
    assert.ok(Number.isFinite(strength) && strength >= 0 && strength <= 1);
    assert.ok(strength >= previous - 1e-12);
    assert.ok(strength - previous < 0.25, 'halo size transition should not pop');
    previous = strength;
  }
  assert.ok(halo(11 + 1e-6, 1) < 1e-4);
  assert.ok(halo(15, 0.8 + 1e-6) < 1e-4);
  assert.ok(halo(100, 10) <= 1);
});

test('depth lighting is neutral at rest and follows near versus far motion', () => {
  const out = [0, 0];
  assert.equal(depthLight(0, out), out);
  assert.deepEqual(out, [1, 1]);
  const near = depthLight(0.7, [0, 0]);
  const far = depthLight(-0.7, [0, 0]);
  assert.ok(near[0] > 1 && near[1] > 1, 'approaching stars should brighten and enlarge slightly');
  assert.ok(far[0] < 1 && far[1] < 1, 'receding stars should dim and shrink slightly');
});

test('depth cues stay subtle and continuous across the full rotation range', () => {
  let previous = [0, 0];
  for (const delta of [-1e6, -10, -3, -1, -0.1, -1e-6, 0, 1e-6, 0.1, 1, 3, 10, 1e6]) {
    const cue = depthLight(delta, [0, 0]);
    assert.ok(cue.every(Number.isFinite));
    assert.ok(cue[0] >= 0.5 && cue[0] <= 1.5, 'brightness cue must remain restrained');
    assert.ok(cue[1] >= 0.8 && cue[1] <= 1.2, 'size cue must remain restrained');
    assert.ok(cue[0] >= previous[0] && cue[1] >= previous[1]);
    if (Math.abs(delta) <= 1e-6) {
      assert.ok(Math.abs(cue[0] - 1) < 1e-5);
      assert.ok(Math.abs(cue[1] - 1) < 1e-5);
    }
    previous = cue;
  }
});
