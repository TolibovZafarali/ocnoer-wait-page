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

  function makeStars(count) {
    seed = 16053;
    const knots = Array.from({ length: 90 }, (_, i) => ({
      arm: i % 2, radius: 0.23 + random() ** 0.84 * 1.18,
      width: 0.015 + random() * 0.065, angle: normal() * 0.12
    }));
    return Array.from({ length: count }, () => {
      const field = random() < 0.14;
      const knot = random() < 0.36 ? knots[Math.floor(random() * knots.length)] : null;
      const arm = knot ? knot.arm : Math.floor(random() * 2);
      const radius = knot ? knot.radius + normal() * knot.width : 0.14 + random() ** 0.77 * 1.43;
      const lane = Math.floor(random() * 4);
      const scatter = random() < 0.19 ? 0.52 : knot ? 0.072 : 0.14;
      const bend = 0.059 * Math.sin(radius * (6.4 + lane * 1.3) + 0.9 * lane + arm);
      const angle = arm * Math.PI + 0.28 + 2.57 * Math.log(radius + 0.08)
        + (lane - 1.5) * 0.135 + bend + (knot ? knot.angle : 0) + normal() * scatter;
      const color = random();
      const tint = (arm ? 3 : 0) + (color < 0.49 ? 0 : color < 0.79 ? 1 : 2);
      const cluster = !field && random() < 0.61;
      const flare = !cluster && random() < (field ? 0.013 : 0.015);
      const size = cluster ? 19 + random() ** 1.6 * 25 : flare ? 9 + random() * 6 : 2.0 + random() ** 2.2 * 4.9;
      return {
        radius, angle, height: normal() * (0.018 + radius * 0.035),
        rate: 0.016 + 0.009 / (0.33 + radius), field,
        x: random() * 1.08 - 0.04, y: random() * 1.08 - 0.04,
        depth: random(), phase: random() * tau,
        tint: field ? Math.floor(random() * palette.length) : tint,
        sprite: cluster ? 2 + Math.floor(random() * clusterVariants) : flare ? 1 : 0,
        size, brightness: cluster ? 0.26 + random() * 0.53 : 0.48 + random() * 0.50
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
      for (const star of stars) {
        star.volumeDepth = window.StarField.depth(star.radius, star.angle, star.phase, star.field ? 1 : 0);
      }
      wake.resize(width, height);
    }
    render();
  }

  const lifted = [0, 0, 0, 1];
  function render() {
    if (!stars) return;
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#03040a';
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';
    const cx = width / 2, cy = height / 2;
    const landscape = smooth((width / height - 0.55) / 1.05);
    const tilt = -0.88 + landscape * 0.56;
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    const span = Math.min(width * 0.61, height * 0.93);
    const vertical = Math.max(1, (height / width) * 0.89);
    const inclination = 0.56;
    const yawC = Math.cos(rotation.angles[1]), yawS = Math.sin(rotation.angles[1]);
    const pitchC = Math.cos(rotation.angles[0]), pitchS = Math.sin(rotation.angles[0]);
    const rotated = Math.hypot(...rotation.angles) > 0.00001;
    const sideView = window.StarField.sideAmount(rotation.angles[0], rotation.angles[1], tilt, inclination);
    const clusterScale = Math.max(0.55, Math.min(1.16, Math.sqrt(width * height) / 940));
    for (const star of stars) {
      let x, y, sizeScale = 1;
      if (star.field) {
        x = star.x * width + Math.sin(elapsed * 0.03 + star.phase) * 5;
        y = star.y * height + Math.cos(elapsed * 0.04 + star.phase) * 5;
      } else {
        const angle = star.angle + elapsed * star.rate;
        const u = star.radius * Math.cos(angle);
        const v = star.radius * Math.sin(angle) * inclination + star.height;
        const localX = span * (u * cos - v * sin);
        const localY = span * vertical * (u * sin + v * cos);
        const localZ = span * (star.radius * Math.sin(angle) * 0.49 + star.height);
        if (rotated) {
          // The old canvas view is orthographic. Put it on a camera plane,
          // then lift along that plane's rays to retain its exact home image.
          const z = localZ / span + star.volumeDepth;
          window.StarField.lift(localX / span, localY / span, 0, z, 3.6, lifted);
          const rotatedZ = -lifted[0] * yawS + lifted[2] * yawC;
          const viewZ = lifted[1] * pitchS + rotatedZ * pitchC;
          const perspective = 3.6 / Math.max(1, 3.6 - viewZ);
          x = cx + (lifted[0] * yawC + lifted[2] * yawS) * span * perspective;
          y = cy + (lifted[1] * pitchC - rotatedZ * pitchS) * span * perspective;
          sizeScale = lifted[3] * perspective;
        } else {
          x = cx + localX;
          y = cy + localY;
        }
      }
      const margin = 32 * Math.max(1, sizeScale) + wake.range / 0.65;
      if (x < -margin || x > width + margin || y < -margin || y > height + margin) continue;

      const flicker = 0.92 + 0.08 * Math.sin(star.phase + elapsed * (0.43 + star.depth));
      context.globalAlpha = star.brightness * flicker * (star.field ? 1 : 1 - sideView * (star.sprite > 1 ? 0.58 : 0.18));
      const size = star.size * (star.sprite > 1 ? clusterScale : 1) * sizeScale;

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
