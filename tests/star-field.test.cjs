const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(readFileSync(join(__dirname, '..', 'star-field.js'), 'utf8'), { window });
const { create, view } = window.StarField;
const stars = create(18000);

function transform(matrix, point) {
  return [0, 1, 2].map(row => matrix[row] * point[0] + matrix[row + 3] * point[1] + matrix[row + 6] * point[2]);
}

function standardDeviation(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function projectedSpread(width, height, pitch, yaw) {
  const camera = view(width, height, [pitch, yaw]);
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < stars.length; i += 8) {
    if (stars[i + 3] === 1) continue; // Background must not hide a flattened galaxy.
    const p = transform(camera.matrix, [stars[i] * Math.cos(stars[i + 1]), stars[i] * Math.sin(stars[i + 1]), stars[i + 2]]);
    const perspective = camera.camera / (camera.camera - p[2]);
    const x = p[0] * camera.scale * perspective, y = p[1] * camera.scale * perspective;
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && perspective > 0);
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const xx = sxx / n - (sx / n) ** 2, yy = syy / n - (sy / n) ** 2;
  const xy = sxy / n - sx * sy / (n * n);
  const discriminant = Math.sqrt((xx - yy) ** 2 + 4 * xy * xy);
  return { minor: Math.sqrt((xx + yy - discriminant) / 2), major: Math.sqrt((xx + yy + discriminant) / 2) };
}

test('star generation is deterministic, finite, and preserves the vertex layout', () => {
  assert.equal(stars.length, 18000 * 8);
  assert.deepEqual(stars, create(18000));
  for (let i = 0; i < stars.length; i += 8) {
    for (let channel = 0; channel < 8; channel++) assert.ok(Number.isFinite(stars[i + channel]));
    assert.ok(stars[i + 4] > 0 && stars[i + 5] >= 0);
    assert.ok(stars[i + 6] >= 0 && stars[i + 6] <= 1);
  }
});

test('arms, core, and halo have independent depth on both sides of the disk', () => {
  const groups = { arms: [], core: [], halo: [] };
  for (let i = 0; i < stars.length; i += 8) {
    const kind = stars[i + 3];
    if (kind === 1) continue;
    groups[kind === 5 ? 'core' : kind === 6 ? 'halo' : 'arms'].push(stars[i + 2]);
  }
  for (const [name, heights] of Object.entries(groups)) {
    assert.ok(heights.length > 500, `${name} population missing`);
    assert.ok(standardDeviation(heights) > 0.06, `${name} must have substantial thickness`);
    assert.ok(heights.some(h => h < -0.1) && heights.some(h => h > 0.1), `${name} must straddle the disk`);
  }
});

test('view rotation preserves orthogonal axes and lengths on desktop and mobile', () => {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    for (let pitch = 0; pitch <= Math.PI; pitch += Math.PI / 12) {
      for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
        const { matrix } = view(width, height, [pitch, yaw]);
        for (let a = 0; a < 3; a++) {
          for (let b = 0; b < 3; b++) {
            let dot = 0;
            for (let row = 0; row < 3; row++) dot += matrix[a * 3 + row] * matrix[b * 3 + row];
            assert.ok(Math.abs(dot - Number(a === b)) < 1e-6, 'camera axes must remain orthonormal');
          }
        }
        const point = [0.7, -0.4, 0.3];
        assert.ok(Math.abs(Math.hypot(...transform(matrix, point)) - Math.hypot(...point)) < 1e-6);
      }
    }
  }
});

test('the galaxy retains visible projected thickness through side and reverse views', () => {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    for (let degrees = 0; degrees <= 180; degrees += 15) {
      for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
        const { minor, major } = projectedSpread(width, height, degrees * Math.PI / 180, yaw);
        const label = `${width}x${height}, pitch ${degrees}, yaw ${yaw}`;
        assert.ok(minor > Math.min(width, height) * 0.025, `${label}: minor-axis spread ${minor}px is too thin`);
        assert.ok(minor / major > 0.08, `${label}: projected aspect ratio ${minor / major} collapses into a line`);
      }
    }
  }
});
