window.createStarWake = function createStarWake(canvas) {
  // A small screen-space motion field retains momentum along the mouse path.
  // Both renderers sample this field, in CSS pixels, independent of pixel ratio.
  const range = 96;
  let width = 2, height = 2, viewWidth = 1, viewHeight = 1;
  let displacementX, displacementY, velocityX, velocityY, pixels;
  let previous = null;
  let idle = Infinity;
  const result = [0, 0];

  function encode() {
    for (let i = 0; i < displacementX.length; i++) {
      const x = Math.round(32768 + displacementX[i] / range * 32767);
      const y = Math.round(32768 + displacementY[i] / range * 32767);
      pixels[i * 4] = x >> 8;
      pixels[i * 4 + 1] = x & 255;
      pixels[i * 4 + 2] = y >> 8;
      pixels[i * 4 + 3] = y & 255;
    }
  }

  function reset() {
    previous = null;
    idle = Infinity;
    displacementX.fill(0);
    displacementY.fill(0);
    velocityX.fill(0);
    velocityY.fill(0);
    encode();
  }

  function resize(w, h) {
    if (!(w > 0 && h > 0)) return;
    if (w === viewWidth && h === viewHeight && pixels) return;
    viewWidth = w;
    viewHeight = h;
    width = Math.max(2, Math.min(128, Math.ceil(w / 20) + 1));
    height = Math.max(2, Math.min(128, Math.ceil(h / 20) + 1));
    displacementX = new Float32Array(width * height);
    displacementY = new Float32Array(width * height);
    velocityX = new Float32Array(width * height);
    velocityY = new Float32Array(width * height);
    pixels = new Uint8Array(width * height * 4);
    reset();
  }

  function stir(x, y, dx, dy, radius) {
    const cellX = viewWidth / (width - 1), cellY = viewHeight / (height - 1);
    const left = Math.max(0, Math.floor((x - radius) / cellX));
    const right = Math.min(width - 1, Math.ceil((x + radius) / cellX));
    const top = Math.max(0, Math.floor((y - radius) / cellY));
    const bottom = Math.min(height - 1, Math.ceil((y + radius) / cellY));
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        const nx = (col * cellX - x) / radius;
        const ny = (row * cellY - y) / radius;
        const distance = Math.min(1, Math.hypot(nx, ny));
        const falloff = (1 - distance * distance * (3 - 2 * distance)) ** 2;
        const index = row * width + col;
        velocityX[index] += dx * falloff * 5.4;
        velocityY[index] += dy * falloff * 5.4;
        const speed = Math.hypot(velocityX[index], velocityY[index]);
        const limit = viewHeight * 0.25;
        if (speed > limit) {
          velocityX[index] *= limit / speed;
          velocityY[index] *= limit / speed;
        }
      }
    }
  }

  function move(event) {
    if (event.isPrimary === false) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) * viewWidth / rect.width;
    const y = (event.clientY - rect.top) * viewHeight / rect.height;
    const time = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    const point = { x, y, time };
    if (!previous || time < previous.time || time - previous.time > 240) {
      previous = point;
      return;
    }
    const dx = x - previous.x, dy = y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.01) return;
    const radius = Math.min(88, viewWidth * 0.23);
    // Fill between events, including a quick sweep on a low-rate input device.
    const steps = Math.min(128, Math.max(1, Math.ceil(distance / 12)));
    const sensitivity = event.pointerType === 'touch' ? 0.8 : 1;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      stir(previous.x + dx * t, previous.y + dy * t,
        dx / steps * sensitivity, dy / steps * sensitivity, radius);
    }
    previous = point;
    idle = 0;
  }

  function step(seconds) {
    const dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    if (idle === Infinity) return;
    idle += dt;
    if (idle >= 6) { reset(); return; }
    // Integrate coasting velocity and orbit relaxation separately. This gives
    // the long, soft return of the reference without a bouncing spring.
    const drag = 2.3;
    const velocityDecay = Math.exp(-drag * dt), returnDecay = Math.exp(-dt);
    const travel = (returnDecay - velocityDecay) / (drag - 1);
    for (let i = 0; i < displacementX.length; i++) {
      displacementX[i] = displacementX[i] * returnDecay + velocityX[i] * travel;
      displacementY[i] = displacementY[i] * returnDecay + velocityY[i] * travel;
      velocityX[i] *= velocityDecay;
      velocityY[i] *= velocityDecay;
      const length = Math.hypot(displacementX[i], displacementY[i]);
      if (length > range) {
        displacementX[i] *= range / length;
        displacementY[i] *= range / length;
      }
    }
    encode();
  }

  function sample(x, y, out = result) {
    const gx = Math.max(0, Math.min(width - 1, x / viewWidth * (width - 1)));
    const gy = Math.max(0, Math.min(height - 1, y / viewHeight * (height - 1)));
    const col = Math.min(width - 2, Math.floor(gx));
    const row = Math.min(height - 2, Math.floor(gy));
    const tx = gx - col, ty = gy - row, i = row * width + col;
    const a = (1 - tx) * (1 - ty), b = tx * (1 - ty), c = (1 - tx) * ty, d = tx * ty;
    out[0] = displacementX[i] * a + displacementX[i + 1] * b +
      displacementX[i + width] * c + displacementX[i + width + 1] * d;
    out[1] = displacementY[i] * a + displacementY[i + 1] * b +
      displacementY[i + width] * c + displacementY[i + width + 1] * d;
    return out;
  }

  const rect = canvas.getBoundingClientRect();
  resize(rect.width || 1, rect.height || 1);
  return { move, release() { previous = null; }, reset, step, resize, sample, range,
    get pixels() { return pixels; }, get width() { return width; }, get height() { return height; } };
};

// Embedded browsers sometimes forward mouse events without their matching
// pointer events. Listen for both, and discard only the compatibility copy.
window.bindSkyPointer = function bindSkyPointer({ move, down, up, leave }) {
  const controller = new AbortController();
  const options = { passive: true, capture: true, signal: controller.signal };
  const lastPointer = new Map();
  let ignoreMouseUntil = 0;
  let inside = false;

  function exit() {
    if (!inside) return;
    inside = false;
    lastPointer.clear();
    leave?.();
  }

  function deliver(name, event) {
    if (event.isPrimary === false && (event.pointerType === 'touch' || event.pointerType === 'pen')) return;
    if (name !== 'move' && event.button > 0) return;
    if (event.clientX < 0 || event.clientX >= window.innerWidth ||
        event.clientY < 0 || event.clientY >= window.innerHeight) {
      exit();
      return;
    }
    inside = true;
    actions[name]?.(event);
    if (name === 'up' && (event.pointerType === 'touch' || event.pointerType === 'pen')) exit();
  }

  const actions = { move, down, up };
  for (const name of ['move', 'down', 'up', 'over']) {
    window.addEventListener('pointer' + name, event => {
      if (name === 'over' && event.relatedTarget) return;
      if (event.pointerType === 'touch') ignoreMouseUntil = performance.now() + 750;
      lastPointer.set(name, { x: event.clientX, y: event.clientY, at: performance.now() });
      deliver(name === 'over' ? 'move' : name, event);
    }, options);

    window.addEventListener('mouse' + name, event => {
      if (name === 'over' && event.relatedTarget) return;
      const now = performance.now();
      if (event.sourceCapabilities?.firesTouchEvents || now < ignoreMouseUntil) return;
      const last = lastPointer.get(name);
      if (last && now - last.at < 80 && last.x === event.clientX && last.y === event.clientY) return;
      deliver(name === 'over' ? 'move' : name, {
        clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp,
        pointerType: 'mouse', isPrimary: true, button: event.button, buttons: event.buttons
      });
    }, options);
  }

  if (!('PointerEvent' in window)) {
    for (const [type, name] of [['touchstart', 'down'], ['touchmove', 'move'], ['touchend', 'up']]) {
      window.addEventListener(type, event => {
        if (event.touches.length > 1) { exit(); return; }
        const point = event.changedTouches[0];
        if (!point) return;
        ignoreMouseUntil = performance.now() + 750;
        deliver(name, {
          clientX: point.clientX, clientY: point.clientY, timeStamp: event.timeStamp,
          pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'touchend' ? 0 : 1
        });
      }, options);
    }
  }

  window.addEventListener('pointercancel', exit, options);
  window.addEventListener('touchcancel', exit, options);
  for (const type of ['pointerout', 'mouseout']) {
    window.addEventListener(type, event => { if (!event.relatedTarget) exit(); }, options);
  }
  window.addEventListener('blur', exit, options);
  window.addEventListener('pagehide', exit, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) exit(); }, options);
  return () => { controller.abort(); exit(); };
};
