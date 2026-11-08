window.createStarWake = function createStarWake(canvas) {
  const samples = new Float32Array(16);
  // Sample recent positions in time so a faster sweep naturally has a longer tail.
  const delays = [0, 70, 165, 285];
  const weights = [0.65, 0.39, 0.24, 0.14];
  const history = [];
  let previous = null;
  let idle = Infinity;
  let velocityX = 0, velocityY = 0;

  function move(event) {
    if (event.isPrimary === false) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const time = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) * 2 / rect.width - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) * 2 / rect.height - 1));
    const point = { time, x, y, dx: 0, dy: 0 };
    if (!previous || time < previous.time || time - previous.time > 240) {
      history.length = 0;
      history.push(point);
      velocityX = velocityY = 0;
      previous = point;
      return;
    }

    const deltaX = (x - previous.x) * rect.width * 0.5;
    const deltaY = (y - previous.y) * rect.height * 0.5;
    if (deltaX === 0 && deltaY === 0) return;
    const dt = Math.max(1, time - previous.time);
    const blend = 1 - Math.exp(-dt / 32);
    velocityX += (deltaX * 1000 / dt - velocityX) * blend;
    velocityY += (deltaY * 1000 / dt - velocityY) * blend;
    const speed = Math.hypot(velocityX, velocityY);
    const sensitivity = event.pointerType === 'touch' ? 345 : 430;
    const magnitude = 7 * (1 - Math.exp(-speed / sensitivity));
    if (speed > 0) {
      point.dx = velocityX / speed * magnitude;
      point.dy = velocityY / speed * magnitude;
    }

    // Keep a short path with enough temporal resolution for high-rate mice.
    if (history.length > 1 && time - history[history.length - 2].time < 8) history.pop();
    history.push(point);
    while (history.length > 2 && time - history[1].time > 350) history.shift();
    previous = point;
    idle = 0;
  }

  function step(seconds) {
    if (!history.length) return samples;
    const dt = Math.max(0, seconds);
    idle += dt;
    if (idle >= 1.2) {
      samples.fill(0);
      return samples;
    }
    const envelope = Math.exp(-4.7 * Math.max(0, idle - 0.035));
    const blend = 1 - Math.exp(-dt / 0.033);
    const latest = history[history.length - 1];
    let index = history.length - 1;
    for (let i = 0; i < delays.length; i++) {
      const time = latest.time - delays[i];
      while (index > 0 && history[index].time > time) index--;
      const a = history[index];
      const b = history[Math.min(index + 1, history.length - 1)];
      const mix = b.time > a.time ? Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time))) : 0;
      const targetX = a.x + (b.x - a.x) * mix;
      const targetY = a.y + (b.y - a.y) * mix;
      const weight = weights[i] * envelope;
      const base = i * 4;
      const positionBlend = Math.abs(samples[base + 2]) + Math.abs(samples[base + 3]) < 0.1 ? 1 : blend;
      samples[base] += (targetX - samples[base]) * positionBlend;
      samples[base + 1] += (targetY - samples[base + 1]) * positionBlend;
      samples[base + 2] += ((a.dx + (b.dx - a.dx) * mix) * weight - samples[base + 2]) * blend;
      samples[base + 3] += ((a.dy + (b.dy - a.dy) * mix) * weight - samples[base + 3]) * blend;
    }
    return samples;
  }

  function release() { previous = null; }
  function reset() {
    release();
    history.length = 0;
    idle = Infinity;
    velocityX = velocityY = 0;
    samples.fill(0);
  }
  return { move, release, reset, step, samples };
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
