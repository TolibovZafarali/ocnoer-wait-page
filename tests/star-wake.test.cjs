const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'star-wake.js'), 'utf8');

function fixture(width = 1000, height = 700) {
  const window = {};
  let bounds = { left: 0, top: 0, width, height };
  vm.runInNewContext(source, { window, performance: { now: () => 0 } });
  const wake = window.createStarWake({ getBoundingClientRect: () => bounds });
  wake.resize(width, height);
  return {
    wake,
    resize(nextWidth, nextHeight) {
      bounds = { ...bounds, width: nextWidth, height: nextHeight };
      wake.resize(nextWidth, nextHeight);
    },
    move(x, y, milliseconds, extra = {}) {
      wake.move({ clientX: x, clientY: y, timeStamp: milliseconds,
        pointerType: 'mouse', isPrimary: true, ...extra });
    }
  };
}

function advance(wake, seconds, fps = 120) {
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) wake.step(seconds / frames);
}

function field(wake) {
  const result = [];
  const out = [0, 0];
  for (let y = 0; y <= 700; y += 25) {
    for (let x = 0; x <= 1000; x += 25) {
      wake.sample(x, y, out);
      result.push(out[0], out[1]);
    }
  }
  return result;
}

function peak(wake) {
  return Math.max(...field(wake).map(Math.abs));
}

function sweep(f, duration = 0.3, fps = 120) {
  const frames = Math.round(duration * fps);
  f.move(300, 350, 100);
  let maximum = 0;
  for (let i = 1; i <= frames; i++) {
    f.move(300 + 300 * i / frames, 350, 100 + duration * 1000 * i / frames);
    f.wake.step(duration / frames);
    maximum = Math.max(maximum, peak(f.wake));
  }
  return maximum;
}

test('entering and remaining stationary does not disturb stars', () => {
  const f = fixture();
  f.move(500, 350, 100);
  advance(f.wake, 0.5);
  f.move(500, 350, 600);
  advance(f.wake, 0.5);
  assert.ok(peak(f.wake) < 0.01);
});

test('movement carries nearby stars in its direction and responds to speed', () => {
  function gesture(distance) {
    const f = fixture();
    f.move(500, 350, 100);
    f.move(500 + distance, 350, 116);
    f.wake.step(0.016);
    advance(f.wake, 0.1);
    return f;
  }
  // Compare equal elapsed time below the velocity cap; a longer sweep also
  // changes how long the pointer acts on each star, which is a separate effect.
  const fast = gesture(12), slow = gesture(4);
  const fastPeak = peak(fast.wake), slowPeak = peak(slow.wake);
  const displacement = [0, 0];
  fast.wake.sample(506, 350, displacement);
  assert.ok(displacement[0] > 0, 'stars should follow a rightward sweep');
  assert.ok(fastPeak > slowPeak, `fast ${fastPeak} should exceed slow ${slowPeak}`);
  assert.ok(fastPeak > 1, 'the interaction should visibly displace stars');
});

test('rapid repeated changes remain finite and within the displacement range', () => {
  const f = fixture();
  f.move(350, 350, 100);
  for (let i = 1; i <= 240; i++) {
    f.move(i % 2 ? 650 : 350, 350 + Math.sin(i) * 100, 100 + i * 8);
    f.wake.step(0.008);
  }
  for (const value of field(f.wake)) {
    assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(value) <= f.wake.range, `displacement ${value} exceeds range`);
  }
  assert.equal(f.wake.pixels.length, f.wake.width * f.wake.height * 4);
});

test('a released wake keeps moving briefly, then settles', () => {
  const f = fixture();
  sweep(f);
  f.wake.release();
  const atRelease = field(f.wake);
  advance(f.wake, 0.1);
  assert.ok(peak(f.wake) > 0.1, 'release should preserve the wake');
  assert.notDeepEqual(field(f.wake), atRelease, 'the released wake should continue evolving');
  advance(f.wake, 12);
  assert.ok(peak(f.wake) < 0.1, 'the wake should settle without further input');
});

test('reentering elsewhere does not generate a streak across the viewport', () => {
  const control = fixture();
  const reentered = fixture();
  sweep(control);
  sweep(reentered);
  control.wake.release();
  reentered.wake.release();
  reentered.move(950, 50, 450);
  advance(control.wake, 0.1);
  advance(reentered.wake, 0.1);
  assert.deepEqual(field(reentered.wake), field(control.wake));
});

test('reset and resizing clear displacement and pending pointer movement', () => {
  const f = fixture();
  sweep(f);
  f.wake.reset();
  assert.ok(peak(f.wake) < 0.01);
  f.move(900, 100, 450);
  advance(f.wake, 0.1);
  assert.ok(peak(f.wake) < 0.01, 'reset must also clear the previous pointer position');
  sweep(f);
  f.resize(600, 900);
  assert.ok(peak(f.wake) < 0.01);
  f.move(50, 800, 500);
  advance(f.wake, 0.1);
  assert.ok(peak(f.wake) < 0.01, 'resizing must not turn the old position into an impulse');
});

test('motion is approximately consistent across animation frame rates', () => {
  function replay(fps) {
    const f = fixture();
    f.move(300, 350, 100);
    // Feed the same 120 Hz pointer stream regardless of animation frame rate.
    const interval = 120 / fps;
    for (let i = 1; i <= 60; i++) {
      f.move(300 + i * 5, 350, 100 + i * 1000 / 120);
      if (i % interval === 0) f.wake.step(1 / fps);
    }
    advance(f.wake, 0.2, fps);
    return field(f.wake);
  }
  const low = replay(30), high = replay(120);
  const error = Math.sqrt(low.reduce((sum, value, i) => sum + (value - high[i]) ** 2, 0));
  const magnitude = Math.sqrt(high.reduce((sum, value) => sum + value * value, 0));
  assert.ok(magnitude > 0);
  assert.ok(error / magnitude < 0.25, `relative frame-rate deviation was ${error / magnitude}`);
});
