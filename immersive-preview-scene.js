const LABELS = [
  { text: "ORION", color: "rgba(232, 240, 255, 0.22)", x: -9.2, y: 4.1, z: -28, scale: 9.4 },
  { text: "PORTRAITS", color: "rgba(205, 223, 255, 0.18)", x: 10.8, y: -2.2, z: -46, scale: 12.6 },
  { text: "SUNSETS", color: "rgba(255, 206, 173, 0.16)", x: -11.8, y: -4.8, z: -68, scale: 14.8 },
  { text: "STUDIO", color: "rgba(185, 214, 255, 0.15)", x: 12.2, y: 4.9, z: -92, scale: 16.8 },
];

export async function createImmersivePreviewScene({
  canvas,
  prefersReducedMotion = false,
}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Immersive preview scene requires a valid canvas element.");
  }

  const THREE = await import("three");

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 240);
  camera.position.set(0, 0, 11.8);

  const container = new THREE.Group();
  scene.add(container);

  const starField = createStarField(THREE, {
    count: prefersReducedMotion ? 1300 : 2200,
    width: 36,
    height: 20,
    depth: 150,
    near: 12,
    color: 0xf4f8ff,
    size: 0.06,
    opacity: 0.86,
  });
  container.add(starField.points);

  const deepField = createStarField(THREE, {
    count: prefersReducedMotion ? 700 : 1200,
    width: 48,
    height: 28,
    depth: 210,
    near: 24,
    color: 0x8fb7ef,
    size: 0.045,
    opacity: 0.3,
  });
  container.add(deepField.points);

  const tunnelLines = createTunnelLines(THREE, 180);
  container.add(tunnelLines);

  const depthFrames = createDepthFrames(THREE);
  container.add(depthFrames);

  const labels = LABELS.map((config) => {
    const sprite = createWordSprite(THREE, config.text, config.color);
    sprite.position.set(config.x, config.y, config.z);
    sprite.scale.set(config.scale, config.scale * 0.22, 1);
    container.add(sprite);
    return {
      sprite,
      startZ: config.z,
      scale: config.scale,
    };
  });

  const centerGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture(THREE, "rgba(162, 198, 255, 0.18)", "rgba(48, 76, 120, 0.02)"),
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    })
  );
  centerGlow.scale.set(44, 44, 1);
  centerGlow.position.set(0, 0, -34);
  container.add(centerGlow);

  const pointerTarget = new THREE.Vector2();
  const pointerCurrent = new THREE.Vector2();
  const lookAtTarget = new THREE.Vector3(0, 0, -30);
  const clock = new THREE.Clock();
  let animationId = null;
  let running = false;
  let currentState = {
    progress: 0,
    darkness: 0,
    glass: 0,
    reveal: 0,
    tunnel: 0,
    restore: 0,
    carousel: 0,
    scale: 0.72,
    slideWindow: 0,
  };

  function updateSize() {
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, prefersReducedMotion ? 1 : 1.35);

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  function render() {
    renderer.render(scene, camera);
  }

  function applyState(state) {
    currentState = {
      ...currentState,
      ...state,
    };

    const reveal = prefersReducedMotion ? 1 : currentState.reveal;
    const tunnelReveal = prefersReducedMotion ? 1 : Math.max(currentState.tunnel, reveal * 0.38);
    const restore = currentState.restore;

    starField.points.material.opacity = THREE.MathUtils.lerp(0.08, 0.92, reveal);
    deepField.points.material.opacity = THREE.MathUtils.lerp(0.03, 0.34, reveal);
    tunnelLines.material.opacity = THREE.MathUtils.lerp(0.03, 0.16, tunnelReveal);

    depthFrames.children.forEach((frame, index) => {
      frame.material.opacity = Math.max(0, (0.002 + reveal * 0.01 - index * 0.0016) * (1 - restore * 0.82));
    });

    labels.forEach((entry, index) => {
      entry.sprite.material.opacity = Math.max(0, (0.03 + reveal * 0.14 - index * 0.009) * (1 - restore * 0.84));
    });

    centerGlow.material.opacity = (0.02 + reveal * 0.08) * (1 - restore * 0.76);
    container.position.z = THREE.MathUtils.lerp(8.4, 0, reveal);
    container.rotation.x = THREE.MathUtils.lerp(0.08, 0, reveal);
    camera.position.z = THREE.MathUtils.lerp(17.4, 11.8, reveal);

    if (!running) {
      render();
    }
  }

  function renderFrame() {
    animationId = window.requestAnimationFrame(renderFrame);

    const elapsed = clock.getElapsedTime();
    const reveal = prefersReducedMotion ? 1 : currentState.reveal;
    const tunnelReveal = prefersReducedMotion ? 1 : currentState.tunnel;
    const pointerReveal = prefersReducedMotion ? 0 : clamp01((reveal - 0.58) / 0.16) * (1 - currentState.restore * 0.9);
    const starSpeed = (prefersReducedMotion ? 0.11 : 0.28) * (0.2 + reveal * 0.95);
    const labelSpeed = (prefersReducedMotion ? 0.04 : 0.1) * (0.16 + tunnelReveal * 1.12);

    updateStarField(starField, starSpeed, -150, 16);
    updateStarField(deepField, starSpeed * 0.65, -210, 28);

    depthFrames.children.forEach((frame, index) => {
      frame.position.z += labelSpeed * (1 + index * 0.04);
      if (frame.position.z > 18) {
        frame.position.z = -120 - index * 22;
      }
    });

    labels.forEach((entry, index) => {
      entry.sprite.position.z += labelSpeed * (2.2 + index * 0.12);
      if (entry.sprite.position.z > -8) {
        entry.sprite.position.z = entry.startZ - 90;
      }
    });

    pointerCurrent.lerp(pointerTarget, prefersReducedMotion ? 0.08 : 0.03 + pointerReveal * 0.02);

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointerCurrent.x * (0.08 + pointerReveal * 0.28), 0.05);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, pointerCurrent.y * (0.06 + pointerReveal * 0.18), 0.05);
    lookAtTarget.set(pointerCurrent.x * 0.2 * pointerReveal, pointerCurrent.y * 0.12 * pointerReveal, -30);
    camera.lookAt(lookAtTarget);

    tunnelLines.rotation.z = Math.sin(elapsed * 0.08) * 0.018 * (0.24 + tunnelReveal * 0.76);
    container.rotation.z = Math.sin(elapsed * 0.05) * 0.008 * (0.4 + reveal * 0.6) + pointerCurrent.x * 0.008 * pointerReveal;
    container.rotation.y = pointerCurrent.x * 0.028 * pointerReveal;
    container.rotation.x = THREE.MathUtils.lerp(container.rotation.x, Math.sin(elapsed * 0.04) * 0.01 + pointerCurrent.y * 0.018 * pointerReveal, 0.04);
    centerGlow.material.opacity =
      (0.02 + reveal * 0.1) * (1 - currentState.restore * 0.76) +
      Math.sin(elapsed * 0.42) * 0.01 * (0.3 + reveal * 0.7);

    render();
  }

  function start() {
    if (running) {
      return;
    }

    running = true;
    updateSize();
    clock.start();
    renderFrame();
  }

  function stop() {
    running = false;
    if (animationId) {
      window.cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  window.addEventListener("resize", updateSize);
  updateSize();
  applyState(currentState);

  return {
    start,
    stop,
    setProgress(state) {
      applyState(state);
    },
    setPointer(pointer) {
      pointerTarget.set(pointer.x, pointer.y);

      if (!running) {
        render();
      }
    },
    destroy() {
      stop();
      window.removeEventListener("resize", updateSize);
      renderer.dispose();
    },
  };
}

function createStarField(THREE, { count, width, height, depth, near, color, size, opacity }) {
  const positions = new Float32Array(count * 3);
  const meta = new Float32Array(count * 4);

  for (let index = 0; index < count; index += 1) {
    const star = respawnStar(index, positions, meta, width, height, depth, near);
    meta[index * 4 + 3] = star.speed;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity,
      depthWrite: false,
    })
  );

  return {
    points,
    positions,
    meta,
    width,
    height,
    depth,
    near,
  };
}

function updateStarField(field, drift, resetDepth, resetNear) {
  for (let index = 0; index < field.meta.length / 4; index += 1) {
    const positionIndex = index * 3;
    const metaIndex = index * 4;
    field.positions[positionIndex + 2] += drift * field.meta[metaIndex + 3];

    if (field.positions[positionIndex + 2] > resetNear) {
      respawnStar(index, field.positions, field.meta, field.width, field.height, field.depth, field.near);
      field.positions[positionIndex + 2] -= resetDepth;
    }
  }

  field.points.geometry.attributes.position.needsUpdate = true;
}

function respawnStar(index, positions, meta, width, height, depth, near) {
  const positionIndex = index * 3;
  const metaIndex = index * 4;
  const z = -Math.random() * depth;
  const perspective = 0.28 + Math.random() * 0.72;

  positions[positionIndex] = (Math.random() - 0.5) * width * perspective;
  positions[positionIndex + 1] = (Math.random() - 0.5) * height * perspective;
  positions[positionIndex + 2] = z - near;

  meta[metaIndex] = positions[positionIndex];
  meta[metaIndex + 1] = positions[positionIndex + 1];
  meta[metaIndex + 2] = positions[positionIndex + 2];
  meta[metaIndex + 3] = 0.5 + Math.random() * 1.45;

  return {
    speed: meta[metaIndex + 3],
  };
}

function createTunnelLines(THREE, count) {
  const positions = [];

  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 14 + Math.random() * 22;
    const farX = Math.cos(angle) * radius;
    const farY = Math.sin(angle) * radius * 0.66;
    const nearX = farX * 0.08;
    const nearY = farY * 0.08;

    positions.push(farX, farY, -150, nearX, nearY, 20);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
    })
  );
}

function createDepthFrames(THREE) {
  const group = new THREE.Group();

  for (let index = 0; index < 7; index += 1) {
    const width = 16 + index * 4.8;
    const height = 9 + index * 2.8;
    const shape = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-width / 2, -height / 2, 0),
      new THREE.Vector3(width / 2, -height / 2, 0),
      new THREE.Vector3(width / 2, height / 2, 0),
      new THREE.Vector3(-width / 2, height / 2, 0),
      new THREE.Vector3(-width / 2, -height / 2, 0),
    ]);
    const line = new THREE.Line(
      shape,
      new THREE.LineBasicMaterial({
        color: 0xeef4ff,
        transparent: true,
        opacity: Math.max(0.03, 0.1 - index * 0.01),
        depthWrite: false,
      })
    );
    line.position.z = -18 - index * 18;
    group.add(line);
  }

  return group;
}

function createWordSprite(THREE, text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create immersive preview text texture.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = color;
  context.lineWidth = 8;
  context.font = "700 248px 'Space Grotesk', 'Noto Sans SC', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.strokeText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
  );
}

function createGlowTexture(THREE, innerColor, outerColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create immersive preview glow texture.");
  }

  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.48, outerColor);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
