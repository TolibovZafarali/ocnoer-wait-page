const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(readFileSync(join(__dirname, '..', 'star-field.js'), 'utf8'), { window });
const { depth, lift, sideAmount } = window.StarField;

function standardDeviation(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

test('depth is deterministic, bounded, and leaves background stars fixed', () => {
  for (let i = 0; i < 1000; i++) {
    const radius = 0.12 + (i % 137) / 100;
    const angle = i * 0.417;
    const seed = i * 0.173;
    for (const kind of [0, 2, 3, 4]) {
      const value = depth(radius, angle, seed, kind);
      assert.equal(value, depth(radius, angle, seed, kind));
      assert.ok(Number.isFinite(value) && Math.abs(value) <= 0.7);
    }
    assert.equal(depth(radius, angle, seed, 1), 0);
  }
});

test('stars gain independent depth on both sides of the original field', () => {
  for (const radius of [0.2, 0.6, 1.2, 1.5]) {
    const samples = Array.from({ length: 1000 }, (_, i) => depth(radius, i * 0.417, i * 0.173, 0));
    assert.ok(standardDeviation(samples) > 0.04, `radius ${radius} remains too flat`);
    assert.ok(samples.some(value => value < -0.05) && samples.some(value => value > 0.05));
  }
});

test('ray lifting preserves the home-view star positions and sprite sizes', () => {
  const camera = 3.6;
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const scale = Math.min(Math.max(width * 0.6, height * 0.53), height * 0.9);
    for (let i = 0; i < 200; i++) {
      const x = Math.sin(i * 0.7) * 1.4, y = Math.cos(i * 0.31) * 0.8;
      const z = Math.sin(i * 0.41) * 0.9;
      const displacement = depth(Math.hypot(x, y), i * 0.417, i * 0.173, 0);
      const out = [0, 0, 0, 1];
      assert.equal(lift(x, y, z, displacement, camera, out), out);
      const before = camera / (camera - z), after = camera / (camera - out[2]);
      assert.ok(out.every(Number.isFinite) && out[3] > 0);
      assert.ok(Math.abs(x * scale * before - out[0] * scale * after) < 1e-6);
      assert.ok(Math.abs(y * scale * before - out[1] * scale * after) < 1e-6);
      for (const diameter of [1.5, 5, 24, 60]) {
        assert.ok(Math.abs(diameter * before - diameter * out[3] * after) < 1e-6);
      }
    }
  }
});

test('edge treatment is absent at home and strongest at true side views', () => {
  for (const [tilt, inclination] of [[-0.27, 0.52], [-1.02, 0.57]]) {
    assert.equal(sideAmount(0, 0, tilt, inclination), 0);
    const edgePitch = Math.atan(inclination / (0.49 * Math.cos(tilt)));
    assert.ok(sideAmount(edgePitch, 0, tilt, inclination) > 0.8);
    for (let pitch = -Math.PI; pitch <= Math.PI; pitch += Math.PI / 12) {
      for (const yaw of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
        const value = sideAmount(pitch, yaw, tilt, inclination);
        assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
      }
    }
  }
});
