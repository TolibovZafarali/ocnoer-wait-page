window.StarField = (() => {
  // Depth uses an independent sequence so it never changes the original stars.
  function depth(radius, angle, seed, kind) {
    if (kind === 1) return 0;
    let state = (Math.floor(seed * 1e6) ^ Math.floor(radius * 1e5) ^ 0x9e3779b9) >>> 0;
    function random() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    }
    const spread = 0.24 + 0.34 * Math.exp(-2 * radius * radius);
    const thickness = (random() + random() + random() - 1.5) * spread;
    const ribbon = 0.30 * Math.sin(angle * 1.5 + radius * 2.1)
      + 0.10 * Math.sin(radius * 5);
    return Math.max(-0.7, Math.min(0.7, thickness + ribbon));
  }

  // Place stars along their original camera rays. Their projected centers and
  // sprite sizes stay fixed at rest, while rotation reveals the hidden volume.
  function lift(x, y, z, depth, camera = 3.6, out = [0, 0, 0, 1]) {
    const scale = (camera - z - depth) / (camera - z);
    out[0] = x * scale;
    out[1] = y * scale;
    out[2] = z + depth;
    out[3] = scale;
    return out;
  }

  function sideAmount(pitch, yaw, tilt, inclination) {
    // Original disk normal, then the same yaw/pitch rotation as the renderer.
    const nx = Math.sin(tilt) * 0.49;
    const ny = -Math.cos(tilt) * 0.49;
    const nz = inclination;
    const z = ny * Math.sin(pitch) + (-nx * Math.sin(yaw) + nz * Math.cos(yaw)) * Math.cos(pitch);
    const facing = Math.abs(z) / Math.hypot(nx, ny, nz);
    const amount = Math.max(0, Math.min(1, (0.55 - facing) / 0.43));
    return amount * amount * (3 - 2 * amount);
  }

  return { depth, lift, sideAmount };
})();
