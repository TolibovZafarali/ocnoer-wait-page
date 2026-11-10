window.createStarRotation = function createStarRotation() {
  const angles = new Float32Array(2);
  const target = [0, 0];
  const limit = Math.PI * 4;
  let previous = null;
  let returning = false;

  function usable(event) {
    return event.isPrimary !== false && Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
  }

  function add(pitch, yaw) {
    target[0] = Math.max(-limit, Math.min(limit, target[0] + pitch));
    target[1] = Math.max(-limit, Math.min(limit, target[1] + yaw));
    returning = false;
  }

  function down(event) {
    if (previous || !usable(event) || event.button > 0) return;
    previous = { x: event.clientX, y: event.clientY, id: event.pointerId };
    returning = false;
  }

  function move(event) {
    if (!previous || !usable(event)) return;
    if (previous.id !== undefined && event.pointerId !== undefined && previous.id !== event.pointerId) return;
    add((event.clientY - previous.y) * 0.005, (event.clientX - previous.x) * 0.005);
    previous.x = event.clientX;
    previous.y = event.clientY;
  }

  function release() {
    previous = null;
    target[0] = target[1] = 0;
    returning = true;
  }

  function reset() {
    release();
    angles.fill(0);
    returning = false;
  }

  function step(seconds) {
    const dt = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const blend = 1 - Math.exp(-(returning ? 5.5 : 14) * dt);
    for (let i = 0; i < angles.length; i++) {
      angles[i] += (target[i] - angles[i]) * blend;
      if (Math.abs(target[i] - angles[i]) < 0.00001) angles[i] = target[i];
    }
    return angles;
  }

  function key(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    switch (event.key) {
      case 'ArrowDown': add(0.08, 0); break;
      case 'ArrowUp': add(-0.08, 0); break;
      case 'ArrowRight': add(0, 0.08); break;
      case 'ArrowLeft': add(0, -0.08); break;
      default: return false;
    }
    return true;
  }

  return { angles, get dragging() { return previous !== null; },
    move, down, up: release, release, reset, step, key };
};
