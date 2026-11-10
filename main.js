(() => {
  const canvas = document.querySelector('#sky');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');

  function useCanvasFallback() {
    const replacement = canvas.cloneNode(false);
    canvas.replaceWith(replacement);
    const script = document.createElement('script');
    script.src = './star-fallback.js';
    script.onload = () => window.drawStarFallback(replacement);
    document.head.append(script);
  }

  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power'
  });
  if (!gl || gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) === 0) {
    useCanvasFallback();
    return;
  }

  const vertexSource = `
    precision highp float;
    attribute vec4 orbit;
    attribute vec4 light;
    uniform float time;
    uniform float pixelRatio;
    uniform vec2 viewport;
    uniform mat3 worldToView;
    uniform float viewScale;
    uniform float cameraDistance;
    uniform highp sampler2D motionField;
    uniform vec2 fieldSize;
    uniform float fieldRange;
    varying vec3 tint;
    varying float brightness;
    varying float kind;

    void main() {
      kind = orbit.w;
      float seed = light.w;
      vec2 position;
      float perspective = 1.0;
      if (kind == 1.0) {
        vec2 drift = vec2(cos(time * 0.045 + seed), sin(time * 0.037 + seed));
        position = orbit.xy * viewport * 0.6 + drift * (4.0 + 8.0 * orbit.z);
      } else {
        float flow = sin(seed * 0.27 + time * 0.19 + orbit.x * 3.0);
        float radius = orbit.x * (1.0 + 0.024 * flow);
        float angle = orbit.y + 0.045 * time + 0.08 * flow
                    + (kind == 4.0 ? 0.015 : 0.043) * sin(seed + time * 0.32);
        float height = orbit.z + 0.008 * sin(seed + time * 0.24);
        vec3 world = vec3(cos(angle) * radius, sin(angle) * radius, height);
        vec3 rotated = worldToView * world;
        perspective = cameraDistance / max(1.0, cameraDistance - rotated.z);
        position = rotated.xy * viewScale * perspective;
      }

      vec2 uv = clamp(position / viewport + 0.5, 0.0, 1.0);
      // Sample texel centers so the GPU and canvas use the same interpolation.
      uv = (uv * (fieldSize - 1.0) + 0.5) / fieldSize;
      vec4 motion = texture2D(motionField, uv);
      vec2 drift = (vec2(dot(motion.rg, vec2(65280.0, 255.0)),
                         dot(motion.ba, vec2(65280.0, 255.0))) - 32768.0) / 32767.0;
      float mass = mix(0.65, 2.4, smoothstep(1.0, 14.0, light.x));
      float response = 1.0 / mass;
      position += drift * fieldRange * response;
      gl_Position = vec4(position / viewport * vec2(2.0, -2.0), 0.0, 1.0);
      gl_PointSize = light.x * pixelRatio * perspective;

      vec3 sapphire = vec3(0.30, 0.47, 1.00);
      vec3 lilac = vec3(0.68, 0.62, 1.00);
      vec3 rose = vec3(1.00, 0.70, 0.75);
      vec3 amber = vec3(1.00, 0.66, 0.37);
      tint = mix(sapphire, lilac, smoothstep(0.04, 0.44, light.z));
      tint = mix(tint, rose, smoothstep(0.43, 0.72, light.z));
      tint = mix(tint, amber, smoothstep(0.70, 0.97, light.z));
      float shimmer = 0.93 + 0.07 * sin(seed * 2.0 + time * (0.7 + light.z));
      brightness = light.y * shimmer * clamp(0.8 + 0.2 * perspective, 0.65, 1.15);
    }`;

  const fragmentSource = `
    precision mediump float;
    varying vec3 tint;
    varying float brightness;
    varying float kind;
    void main() {
      vec2 p = 2.0 * gl_PointCoord - 1.0;
      float r2 = dot(p, p);
      float fade = 1.0 - smoothstep(0.60, 1.0, r2);
      vec3 emission;
      if (kind == 2.0) {
        // Unresolved clusters contribute a little light behind the individual stars.
        emission = tint * exp(-3.8 * r2);
      } else if (kind == 3.0) {
        vec2 axis = abs(p);
        float rays = exp(-36.0 * min(axis.x, axis.y) - 4.5 * max(axis.x, axis.y));
        float core = exp(-85.0 * r2);
        emission = tint * (0.23 * exp(-4.7 * r2) + 0.65 * rays);
        emission += mix(tint, vec3(1.0), 0.85) * core;
      } else {
        emission = mix(tint, vec3(1.0, 0.98, 0.94), 0.46) * exp(-12.0 * r2);
        emission += 0.17 * tint * exp(-3.4 * r2);
      }
      gl_FragColor = vec4(emission * fade * brightness, 1.0);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    useCanvasFallback();
    return;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    useCanvasFallback();
    return;
  }
  gl.useProgram(program);

  const locations = {};
  for (const name of ['time', 'pixelRatio', 'viewport', 'worldToView', 'viewScale', 'cameraDistance', 'fieldSize', 'fieldRange', 'motionField']) {
    locations[name] = gl.getUniformLocation(program, name);
  }
  const wake = window.createStarWake(canvas);
  const rotation = window.createStarRotation();
  const control = document.querySelector('.sky-control');
  const motionTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, motionTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(locations.motionField, 0);
  gl.uniform1f(locations.fieldRange, wake.range);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [offset, name] of ['orbit', 'light'].entries()) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 32, offset * 16);
  }

  const maxStars = 104000;
  const stars = window.StarField.create(maxStars);
  const view = { matrix: new Float32Array(9) };
  gl.bufferData(gl.ARRAY_BUFFER, stars, gl.STATIC_DRAW);
  gl.enable(gl.BLEND);
  // Screen blending preserves the glow without clipping dense side views to white.
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
  gl.clearColor(3 / 255, 4 / 255, 10 / 255, 1);

  let width = 0, height = 0, count = 0;
  let frame = 0, previousTime = 0, elapsed = 0;
  const listeners = new AbortController();
  const options = { passive: true, signal: listeners.signal };

  function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(locations.time, elapsed);
    window.StarField.view(width, height, rotation.angles, view);
    gl.uniformMatrix3fv(locations.worldToView, false, view.matrix);
    gl.uniform1f(locations.viewScale, view.scale);
    gl.uniform1f(locations.cameraDistance, view.camera);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, wake.width, wake.height, gl.RGBA, gl.UNSIGNED_BYTE, wake.pixels);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2, 3600 / Math.max(width, height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(locations.pixelRatio, ratio);
    gl.uniform2f(locations.viewport, width, height);
    wake.resize(width, height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, wake.width, wake.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, wake.pixels);
    gl.uniform2f(locations.fieldSize, wake.width, wake.height);
    count = Math.min(maxStars, Math.round(25500 + width * height / 19));
    draw();
  }

  function animate(now) {
    const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.065) : 0;
    previousTime = now;
    elapsed += dt;
    wake.step(dt);
    rotation.step(dt);
    draw();
    frame = requestAnimationFrame(animate);
  }

  function updateMotion() {
    cancelAnimationFrame(frame);
    previousTime = 0;
    wake.reset();
    rotation.reset();
    control.dataset.dragging = 'false';
    if (document.hidden) return;
    if (motionPreference.matches) {
      draw();
    } else {
      frame = requestAnimationFrame(animate);
    }
  }

  function follow(event) {
    if (motionPreference.matches || document.hidden) return;
    rotation.move(event);
    if (!rotation.dragging) wake.move(event);
  }
  function press(event) {
    if (motionPreference.matches || document.hidden) return;
    rotation.down(event);
    wake.release();
    control.dataset.dragging = 'true';
  }
  function leave() {
    rotation.release();
    wake.release();
    control.dataset.dragging = 'false';
  }

  const unbind = window.bindSkyPointer({ move: follow, down: press, up: leave, leave });
  control.addEventListener('keydown', event => {
    if (!motionPreference.matches && rotation.key(event)) event.preventDefault();
  }, { signal: listeners.signal });
  motionPreference.addEventListener('change', updateMotion, options);
  document.addEventListener('visibilitychange', updateMotion, options);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  canvas.addEventListener('webglcontextlost', () => {
    cancelAnimationFrame(frame);
    listeners.abort();
    unbind();
    observer.disconnect();
    useCanvasFallback();
  }, { once: true });
  resize();
  updateMotion();
})();
