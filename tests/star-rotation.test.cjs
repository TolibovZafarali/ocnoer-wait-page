const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'star-rotation.js'), 'utf8');
function rotation() {
  const window = {};
  vm.runInNewContext(source, { window });
  return window.createStarRotation();
}
function point(x, y, extra = {}) {
  return { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, ...extra };
}

test('hover leaves orientation unchanged; dragging controls pitch and yaw', () => {
  const r = rotation();
  r.move(point(100, 100));
  r.move(point(300, 400));
  r.step(1);
  assert.deepEqual(Array.from(r.angles), [0, 0]);
  r.down(point(100, 100));
  assert.equal(r.dragging, true);
  r.move(point(200, 150));
  r.step(0.02);
  assert.ok(r.angles[0] > 0 && r.angles[0] < 0.25, 'vertical drag eases pitch');
  assert.ok(r.angles[1] > 0 && r.angles[1] < 0.5, 'horizontal drag eases yaw');
  r.step(2);
  assert.ok(Math.abs(r.angles[0] - 0.25) < 0.0001);
  assert.ok(Math.abs(r.angles[1] - 0.5) < 0.0001);
});

test('release returns smoothly to the original orientation and ends the drag', () => {
  const r = rotation();
  r.down(point(100, 100));
  r.move(point(200, 150));
  r.step(0.5);
  const before = Array.from(r.angles);
  r.up();
  assert.equal(r.dragging, false);
  assert.deepEqual(Array.from(r.angles), before, 'release should not snap the field');
  r.step(0.1);
  assert.ok(r.angles[0] > 0 && r.angles[0] < before[0]);
  assert.ok(r.angles[1] > 0 && r.angles[1] < before[1]);
  r.move(point(900, 600));
  r.step(3);
  assert.ok(Math.hypot(...r.angles) < 0.0001);
});

test('secondary buttons and unrelated pointers cannot rotate the field', () => {
  const r = rotation();
  r.down(point(0, 0, { button: 2 }));
  assert.equal(r.dragging, false);
  r.down(point(0, 0, { isPrimary: false }));
  assert.equal(r.dragging, false);
  r.down(point(100, 100));
  r.move(point(500, 500, { pointerId: 2 }));
  r.move(point(500, 500, { isPrimary: false }));
  r.step(1);
  assert.deepEqual(Array.from(r.angles), [0, 0]);
});

test('arrow keys rotate in predictable increments and leave other keys alone', () => {
  const r = rotation();
  assert.equal(r.key({ key: 'ArrowRight' }), true);
  assert.equal(r.key({ key: 'ArrowUp' }), true);
  assert.equal(r.key({ key: 'Space' }), false);
  assert.equal(r.key({ key: 'ArrowLeft', altKey: true }), false);
  r.step(2);
  assert.ok(Math.abs(r.angles[0] + 0.08) < 0.0001);
  assert.ok(Math.abs(r.angles[1] - 0.08) < 0.0001);
  r.key({ key: 'ArrowLeft' });
  r.key({ key: 'ArrowDown' });
  r.step(2);
  assert.ok(Math.hypot(...r.angles) < 0.0001);
});

test('reset clears orientation, pending movement, and active drag', () => {
  const r = rotation();
  r.down(point(100, 100));
  r.move(point(200, 200));
  r.step(0.2);
  r.reset();
  assert.equal(r.dragging, false);
  assert.deepEqual(Array.from(r.angles), [0, 0]);
  r.move(point(900, 600));
  r.step(1);
  assert.deepEqual(Array.from(r.angles), [0, 0]);
});

test('rotation easing remains consistent across frame rates', () => {
  function simulate(fps) {
    const r = rotation();
    r.down(point(100, 100));
    r.move(point(200, 150));
    for (let i = 0; i < fps / 2; i++) r.step(1 / fps);
    r.release();
    for (let i = 0; i < fps / 2; i++) r.step(1 / fps);
    return r.angles;
  }
  const low = simulate(30), high = simulate(120);
  assert.ok(Math.abs(low[0] - high[0]) < 0.0001);
  assert.ok(Math.abs(low[1] - high[1]) < 0.0001);
});
