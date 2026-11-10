window.drawStarFallback = function drawStarFallback(canvas) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const options = { passive: true, signal: listeners.signal };
  const wake = window.createStarWake(canvas);
  const rotation = window.createStarRotation();
  const control = document.querySelector('.sky-control');
  const palette = ['119,137,255', '171,157,250', '202,222,255', '239,157,116', '255,205,169', '247,236,225'];
  const tau = Math.PI * 2;
  let seed = 0;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function normal() { return random() + random() + random() + random() - 2; }
  function smooth(value) {
    const u = Math.max(0, Math.min(1, value));
    return u * u * (3 - 2 * u);
  }

  // Each cluster sprite contains a different scattering of unresolved points.
  // Grouping these very faint stars keeps the disk affordable on CPU renderers.
  const tile = 72;
  const clusterVariants = 6;
  const atlas = document.createElement('canvas');
  atlas.width = tile * palette.length;
  atlas.height = tile * (2 + clusterVariants);
  const ink = atlas.getContext('2d');
  seed = 9206;
  palette.forEach((color, index) => {
    const left = index * tile;
    const x = left + tile / 2;
    for (let row = 0; row < 2 + clusterVariants; row++) {
      const y = (row + 0.5) * tile;
      const cluster = row >= 2;
      const glow = ink.createRadialGradient(x, y, 0, x, y, tile / 2);
      if (cluster) {
        glow.addColorStop(0, `rgba(${color},.15)`);
        glow.addColorStop(0.46, `rgba(${color},.067)`);
        glow.addColorStop(1, `rgba(${color},0)`);
      } else {
        glow.addColorStop(0, '#fffaf4');
        glow.addColorStop(0.12, `rgba(${color},.97)`);
        glow.addColorStop(0.25, `rgba(${color},.56)`);
        glow.addColorStop(0.51, `rgba(${color},.13)`);
        glow.addColorStop(1, `rgba(${color},0)`);
      }
      ink.fillStyle = glow;
      ink.fillRect(left, row * tile, tile, tile);
      if (cluster) {
        for (let j = 0; j < 37; j++) {
          const dx = normal() * 19, dy = normal() * 19;
          if (dx * dx + dy * dy > 32 * 32) continue;
          const size = 0.7 + random() ** 2 * 2;
          ink.fillStyle = `rgba(${color},${0.28 + random() * 0.61})`;
          ink.fillRect(x + dx, y + dy, size, size);
        }
      } else if (row === 1) {
        ink.fillStyle = `rgba(${color},.42)`;
        ink.beginPath();
        ink.moveTo(x, y - 32); ink.lineTo(x + 1.2, y - 1.2);
        ink.lineTo(x + 23, y); ink.lineTo(x + 1.2, y + 1.2);
        ink.lineTo(x, y + 32); ink.lineTo(x - 1.2, y + 1.2);
        ink.lineTo(x - 23, y); ink.lineTo(x - 1.2, y - 1.2);
        ink.fill();
      }
    }
  });

  let width, height, stars;
  let previous = 0, frame = 0, elapsed = 0;

  const view = { matrix: new Float32Array(9) };
  function makeStars(count) {
    const data = window.StarField.create(count);
    seed = 16053;
    return Array.from({ length: count }, (_, i) => {
      const offset = i * 8, kind = data[offset + 3];
      const cluster = kind === 2 || ((kind === 0 || kind === 4) && random() < 0.45);
      const hue = data[offset + 6];
      return {
        radius: data[offset], angle: data[offset + 1], height: data[offset + 2], kind,
        phase: data[offset + 7], size: cluster ? 14 + random() * 16 : data[offset + 4] * 1.15,
        brightness: cluster ? 0.20 + data[offset + 5] * 0.28 : data[offset + 5],
        tint: hue < 0.27 ? 0 : hue < 0.48 ? 1 : hue < 0.62 ? 2 : hue < 0.78 ? 3 : hue < 0.92 ? 4 : 5,
        sprite: cluster ? 2 + Math.floor(random() * clusterVariants) : kind === 3 ? 1 : 0
      };
    });
  }

  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    if (cw !== width || ch !== height) {
      width = cw;
      height = ch;
      const dpr = Math.min(devicePixelRatio || 1, 1.6, 2600 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      stars = makeStars(Math.min(8700, Math.round(2850 + width * height / 235)));
      wake.resize(width, height);
    }
    render();
  }

  function render() {
    if (!stars) return;
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#03040a';
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'screen';
    const cx = width / 2, cy = height / 2;
    window.StarField.view(width, height, rotation.angles, view);
    const m = view.matrix;
    const clusterScale = Math.max(0.55, Math.min(1.16, Math.sqrt(width * height) / 940));
    for (const star of stars) {
      let x, y, perspective = 1;
      if (star.kind === 1) {
        x = cx + star.radius * width * 0.6 + Math.cos(elapsed * 0.045 + star.phase) * (4 + 8 * star.height);
        y = cy + star.angle * height * 0.6 + Math.sin(elapsed * 0.037 + star.phase) * (4 + 8 * star.height);
      } else {
        const flow = Math.sin(star.phase * 0.27 + elapsed * 0.19 + star.radius * 3);
        const radius = star.radius * (1 + 0.024 * flow);
        const angle = star.angle + 0.045 * elapsed + 0.08 * flow
          + (star.kind === 4 ? 0.015 : 0.043) * Math.sin(star.phase + elapsed * 0.32);
        const px = radius * Math.cos(angle), py = radius * Math.sin(angle);
        const pz = star.height + 0.008 * Math.sin(star.phase + elapsed * 0.24);
        const depth = m[2] * px + m[5] * py + m[8] * pz;
        perspective = view.camera / Math.max(1, view.camera - depth);
        x = cx + (m[0] * px + m[3] * py + m[6] * pz) * view.scale * perspective;
        y = cy + (m[1] * px + m[4] * py + m[7] * pz) * view.scale * perspective;
      }
      if (x < -32 - wake.range / 0.65 || x > width + 32 + wake.range / 0.65 ||
          y < -32 - wake.range / 0.65 || y > height + 32 + wake.range / 0.65) continue;

      const flicker = 0.93 + 0.07 * Math.sin(star.phase * 2 + elapsed * 0.9);
      context.globalAlpha = Math.min(1, star.brightness * flicker * (0.8 + 0.2 * perspective));
      const size = star.size * (star.sprite > 1 ? clusterScale : 1) * perspective;

      const drift = wake.sample(x, y);
      const response = 1 / (0.65 + 1.75 * smooth((star.size - 1) / 13));
      x += drift[0] * response;
      y += drift[1] * response;
      context.drawImage(atlas, star.tint * tile, star.sprite * tile, tile, tile,
        x - size / 2, y - size / 2, size, size);
    }
    context.globalAlpha = 1;
  }

  function tick(now) {
    if (reduced.matches || document.hidden) {
      syncPlayback();
      return;
    }
    frame = requestAnimationFrame(tick);
    const dt = previous ? Math.min(0.08, (now - previous) / 1000) : 0;
    previous = now;
    elapsed += dt;
    wake.step(dt);
    rotation.step(dt);
    render();
  }

  function follow(event) {
    if (reduced.matches || document.hidden) return;
    rotation.move(event);
    if (!rotation.dragging) wake.move(event);
  }
  function press(event) {
    if (reduced.matches || document.hidden) return;
    rotation.down(event);
    wake.release();
    control.dataset.dragging = 'true';
  }
  function leave() {
    rotation.release();
    wake.release();
    control.dataset.dragging = 'false';
  }

  function syncPlayback() {
    cancelAnimationFrame(frame);
    frame = previous = 0;
    wake.reset();
    rotation.reset();
    control.dataset.dragging = 'false';
    if (document.hidden) return;
    if (reduced.matches) render();
    else frame = requestAnimationFrame(tick);
  }
  const unbindPointer = window.bindSkyPointer({ move: follow, down: press, up: leave, leave });
  control.addEventListener('keydown', event => {
    if (!reduced.matches && rotation.key(event)) event.preventDefault();
  }, { signal: listeners.signal });
  reduced.addEventListener('change', syncPlayback, options);
  document.addEventListener('visibilitychange', syncPlayback, options);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  syncPlayback();
  return () => {
    unbindPointer();
    cancelAnimationFrame(frame);
    listeners.abort();
    observer.disconnect();
  };
};
