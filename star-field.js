window.StarField = (() => {
  const tau = Math.PI * 2;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

  function create(count) {
    let sequence = 19383;
    function random() {
      sequence = (Math.imul(sequence, 1664525) + 1013904223) >>> 0;
      return sequence / 4294967296;
    }
    const scatter = () => random() + random() + random() - 1.5;
    const knots = Array.from({ length: 88 }, (_, index) => ({
      radius: 0.32 + random() * 1.15, arm: index % 2,
      width: 0.016 + random() * 0.052, offset: scatter() * 0.116,
      height: scatter() * 0.12
    }));
    const stars = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) {
      const population = random();
      let radius, angle, height, kind, hue, diameter, flux;
      if (population < 0.03) {
        // Distant background stars remain independent of the galaxy's rotation.
        radius = random() * 2 - 1;
        angle = random() * 2 - 1;
        height = random();
        kind = 1;
        hue = random();
        diameter = 1.9 + random() ** 4 * 7.6;
        flux = 0.18 + random() * 0.48;
      } else if (population < 0.17) {
        // An oblate stellar bulge fills the center in every viewing direction.
        const shell = 0.56 * random() ** 0.65;
        const vertical = random() * 2 - 1;
        radius = shell * Math.sqrt(1 - vertical * vertical);
        angle = random() * tau;
        height = shell * vertical * 0.78;
        kind = 5;
        hue = 0.66 + random() * 0.32;
        diameter = 1.55 + random() ** 3 * 3.8;
        flux = 0.22 + random() * 0.38;
      } else if (population < 0.27) {
        // A sparse halo provides depth beyond the denser spiral-arm tubes.
        const shell = 0.25 + 1.4 * random() ** 0.65;
        const vertical = random() * 2 - 1;
        radius = shell * Math.sqrt(1 - vertical * vertical);
        angle = random() * tau;
        height = shell * vertical * 0.42;
        kind = 6;
        hue = 0.22 + random() * 0.55;
        diameter = 1.3 + random() ** 3 * 3.0;
        flux = 0.08 + random() * 0.21;
      } else {
        const knot = random() < 0.47 ? knots[Math.floor(random() * knots.length)] : null;
        const filament = !knot && random() < 0.42;
        const arm = knot ? knot.arm : Math.floor(random() * 2);
        radius = knot ? knot.radius + scatter() * knot.width : 0.11 + 1.47 * random() ** 0.68;
        const phase = arm * Math.PI;
        const strand = Math.floor(random() * 3) - 1;
        const spine = phase + 0.55 + 3.18 * Math.log(radius + 0.08) + 0.105 * Math.sin(radius * 7.8 + phase);
        const fork = strand * (0.13 + 0.12 * Math.sin(radius * 5.7 + phase));
        angle = spine + fork + scatter() * (knot ? 0.11 : 0.32);
        if (knot) angle += knot.offset;
        if (filament) {
          angle = spine + fork * 1.48 + 0.037 * Math.sin(13 * radius + strand + phase) + scatter() * 0.048;
        } else if (random() < 0.15) {
          angle += scatter() * 1.36;
        }
        const thickness = (filament ? 0.09 : 0.16) + 0.055 * radius;
        height = scatter() * thickness + (knot ? knot.height : 0)
          + 0.065 * radius * Math.sin(angle * 2 + radius * 3);
        hue = (arm ? 0.78 : 0.18) + scatter() * 0.31 + (0.82 - radius) * 0.24
          + 0.10 * Math.sin(radius * 6 + phase);
        kind = filament ? 4 : 0;
        diameter = 1.55 + random() ** 3.4 * 4.1;
        flux = 0.20 + random() ** 1.4 * 0.85;
        if (filament) flux *= 0.55 + 0.96 * Math.sin(radius * 8 + phase + strand) ** 2;
        const accent = random();
        if (accent > 0.982) {
          kind = 2;
          diameter = 19 + random() * 44;
          flux = knot || filament ? 0.035 + random() * 0.045 : 0.018;
        } else if (accent > 0.979) {
          kind = 3;
          diameter = 10 + random() ** 1.65 * 19;
          flux = 0.55 + random() * 0.38;
        }
      }
      stars.set([radius, angle, height, kind, diameter, flux, clamp(hue), random() * tau], i * 8);
    }
    return stars;
  }

  function view(width, height, angles, out = { matrix: new Float32Array(9) }) {
    const portrait = 1 - smooth((width / height - 0.65) / 0.85);
    const tilt = -0.27 + (-1.02 + 0.27) * portrait;
    const inclination = 0.52 + 0.05 * portrait;
    const depth = Math.sqrt(1 - inclination * inclination);
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const m = out.matrix;
    // Three orthogonal world axes: height must point out of the disk plane.
    m.set([c, s, 0, -s * inclination, c * inclination, depth,
      s * depth, -c * depth, inclination]);
    const yawC = Math.cos(angles[1]), yawS = Math.sin(angles[1]);
    const pitchC = Math.cos(angles[0]), pitchS = Math.sin(angles[0]);
    for (let i = 0; i < 9; i += 3) {
      const x = m[i], y = m[i + 1], z = m[i + 2];
      const rotatedZ = -x * yawS + z * yawC;
      m[i] = x * yawC + z * yawS;
      m[i + 1] = y * pitchC - rotatedZ * pitchS;
      m[i + 2] = y * pitchS + rotatedZ * pitchC;
    }
    out.scale = Math.min(Math.max(width * 0.60, height * 0.53), height * 0.90);
    out.camera = 4.8;
    return out;
  }

  return { create, view };
})();
