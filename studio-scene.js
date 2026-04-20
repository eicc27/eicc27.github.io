const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";
const GRID_SIZE = 1.24;
const STUDIO_LABEL_FONT = `'Oxanium', 'Space Grotesk', sans-serif`;
const STUDIO_DETAIL_FONT = `'Space Grotesk', 'Noto Sans SC', sans-serif`;

const CAMERA_START = {
  position: [0, 6.4, 13.4],
  lookAt: [0, 0.2, 1.2],
};

const CAMERA_TOP = {
  position: [0.001, 16.8, 0.001],
  lookAt: [0, 0, 0],
};

const MARKERS = [
  {
    key: "speaker-left",
    type: "speaker",
    color: 0xa94722,
    q: -2,
    r: 0,
    label: "8330A L",
    detail: "-10.4 dB",
    hoverEyebrow: "Genelec monitor / Left",
    hoverTitle: "Genelec 8330A / Left",
    hoverDetail: "Trim -10.4 dB",
    hoverMeta: ["ToF +0.2 ms", "Low cut 45.1 Hz", "ORR 89%"],
    labelWidth: 1.1,
    labelHeight: 0.38,
    iconOffset: 0.18,
    labelOffset: 0.02,
    iconPlanarZ: -0.15,
    labelPlanarZ: 0.18,
    lift: 1.9,
    exitScale: 1.54,
    fillOpacity: 0.4,
  },
  {
    key: "speaker-right",
    type: "speaker",
    color: 0xa94722,
    q: 2,
    r: -2,
    label: "8330A R",
    detail: "-10.1 dB",
    hoverEyebrow: "Genelec monitor / Right",
    hoverTitle: "Genelec 8330A / Right",
    hoverDetail: "Trim -10.1 dB",
    hoverMeta: ["ToF 0.0 ms", "Low cut 54.5 Hz", "ORR 97%"],
    labelWidth: 1.1,
    labelHeight: 0.38,
    iconOffset: 0.18,
    labelOffset: 0.02,
    iconPlanarZ: -0.15,
    labelPlanarZ: 0.18,
    lift: 1.9,
    exitScale: 1.54,
    fillOpacity: 0.4,
  },
  {
    key: "focus",
    type: "focus",
    color: 0x406891,
    q: 0,
    r: 2,
    label: "Listening",
    detail: "ORR 89 / 97%",
    hoverEyebrow: "Sweet spot / Reference",
    hoverTitle: "Listening Spot",
    hoverDetail: "Listening position",
    hoverMeta: ["Between left / right pair", "ORR 89 / 97%", "GLM reference point"],
    labelWidth: 1.18,
    labelHeight: 0.42,
    iconOffset: 0.14,
    labelOffset: 0.02,
    iconPlanarZ: -0.14,
    labelPlanarZ: 0.18,
    lift: 1.56,
    exitScale: 1.46,
    fillOpacity: 0.34,
  },
  {
    key: "sub",
    type: "sub",
    color: 0x2c8f4c,
    q: -2,
    r: 2,
    label: "7350A",
    detail: "18.9 Hz / 27.6 Hz",
    hoverEyebrow: "Subwoofer / Left side",
    hoverTitle: "Genelec 7350A",
    hoverDetail: "7350A low-end support",
    hoverMeta: ["Low cut 18.9 Hz", "Mode 27.6 Hz", "Trim 0.0 dB"],
    labelWidth: 1.18,
    labelHeight: 0.42,
    iconOffset: 0.14,
    labelOffset: 0.02,
    iconPlanarZ: -0.14,
    labelPlanarZ: 0.18,
    lift: 1.74,
    exitScale: 1.52,
    fillOpacity: 0.4,
  },
  {
    key: "piano-left",
    type: "tile",
    color: 0xc18b3f,
    q: -1,
    r: 1,
    hoverEyebrow: "Keyboard / Left span",
    hoverTitle: "SL GRAND 88",
    hoverDetail: "Centered on the main axis",
    hoverMeta: ["Three-hex keyboard span", "Performance position"],
    lift: 1.46,
    exitScale: 1.4,
    fillOpacity: 0.28,
  },
  {
    key: "piano-center",
    type: "tile",
    color: 0xc98a3e,
    q: 0,
    r: 0,
    label: "SL GRAND 88",
    alwaysLabel: true,
    hoverEyebrow: "Keyboard / Center line",
    hoverTitle: "SL GRAND 88",
    hoverDetail: "Centered on the main axis",
    hoverMeta: ["Three-hex keyboard span", "Between left / right pair"],
    labelWidth: 2.08,
    labelHeight: 0.3,
    labelOffset: 0.02,
    lift: 1.52,
    exitScale: 1.46,
    fillOpacity: 0.36,
  },
  {
    key: "piano-right",
    type: "tile",
    color: 0xb97634,
    q: 1,
    r: 0,
    hoverEyebrow: "Keyboard / Right span",
    hoverTitle: "SL GRAND 88",
    hoverDetail: "Centered on the main axis",
    hoverMeta: ["Three-hex keyboard span", "Performance position"],
    lift: 1.42,
    exitScale: 1.38,
    fillOpacity: 0.28,
  },
];

export async function createStudioScene({
  canvas,
  prefersReducedMotion = false,
  onHover = null,
}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Studio scene requires a valid canvas element.");
  }

  const THREE = await import(THREE_URL);
  await ensureStudioFonts();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  scene.add(camera);

  const world = new THREE.Group();
  scene.add(world);

  const stagePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 30),
    new THREE.MeshBasicMaterial({
      color: 0x0b1016,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
    })
  );
  stagePlane.rotation.x = -Math.PI / 2;
  stagePlane.position.y = -0.06;
  world.add(stagePlane);

  const gridLines = createHexGrid(THREE, {
    radius: 8,
    size: GRID_SIZE,
  });
  world.add(gridLines);

  const gridBloom = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture(THREE, "rgba(198, 221, 255, 0.24)", "rgba(107, 150, 214, 0.12)"),
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    })
  );
  gridBloom.scale.set(16.2, 16.2, 1);
  gridBloom.position.set(0, 0.32, 0);
  world.add(gridBloom);

  const markerGroups = [];
  MARKERS.forEach((marker) => {
    const markerGroup = createMarker(THREE, marker);
    const { x, z } = resolveMarkerWorldPosition(marker, GRID_SIZE);
    markerGroup.position.set(x, 0.08, z);
    markerGroup.userData.basePosition = new THREE.Vector3(x, 0.08, z);
    markerGroups.push(markerGroup);
    world.add(markerGroup);
  });

  const currentCameraPosition = new THREE.Vector3();
  const currentLookAt = new THREE.Vector3();
  const targetCameraPosition = new THREE.Vector3();
  const targetLookAt = new THREE.Vector3();
  const pointerTarget = new THREE.Vector2(0.5, 0.34);
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const projectedPoint = new THREE.Vector3();
  const hoverWorldPoint = new THREE.Vector3();
  let currentPixelRatio = 0;
  let pointerActive = false;
  let hoveredMarkerGroup = null;
  let currentState = {
    progress: 0,
    camera: 0,
    blackout: 0,
    glass: 0,
    configuration: 0,
    lift: 0,
    dissolve: 0,
    restore: 0,
  };

  function updateSize() {
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
    const viewportArea = width * height;
    let maxDpr = 1;

    if (!prefersReducedMotion) {
      if (viewportArea > 1500000) {
        maxDpr = 1;
      } else if (viewportArea > 1200000) {
        maxDpr = 1.04;
      } else if (viewportArea > 900000) {
        maxDpr = 1.1;
      } else {
        maxDpr = 1.18;
      }
    }

    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

    if (Math.abs(dpr - currentPixelRatio) > 0.01) {
      currentPixelRatio = dpr;
      renderer.setPixelRatio(dpr);
    }

    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  function emitHover(group) {
    if (!onHover) {
      return;
    }

    if (!group) {
      onHover(null);
      return;
    }

    const marker = group.userData.marker;
    const anchor = group.userData.hoverAnchor;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;

    hoverWorldPoint.copy(anchor);
    group.localToWorld(hoverWorldPoint);
    projectedPoint.copy(hoverWorldPoint).project(camera);

    if (projectedPoint.z < -1 || projectedPoint.z > 1) {
      onHover(null);
      return;
    }

    const x = (projectedPoint.x * 0.5 + 0.5) * width;
    const y = (-projectedPoint.y * 0.5 + 0.5) * height;
    const color = `#${marker.color.toString(16).padStart(6, "0")}`;

    onHover({
      key: marker.key,
      eyebrow: marker.hoverEyebrow ?? marker.label ?? "",
      title: marker.hoverTitle ?? marker.label ?? "",
      detail: marker.hoverDetail ?? marker.detail ?? "",
      meta: marker.hoverMeta ?? [],
      color,
      x,
      y,
      align: x > width * 0.58 ? "left" : "right",
    });
  }

  function syncHover(pointer) {
    if (!pointerActive || !markerGroups.length) {
      if (hoveredMarkerGroup) {
        hoveredMarkerGroup = null;
        emitHover(null);
      }
      return;
    }

    pointerNdc.set(pointer.x * 2 - 1, 1 - pointer.y * 2);
    raycaster.setFromCamera(pointerNdc, camera);

    const intersections = raycaster.intersectObjects(
      markerGroups.map((group) => group.userData.hitTarget).filter(Boolean),
      false,
    );

    const nextGroup = intersections[0]?.object?.userData?.markerGroup ?? null;
    hoveredMarkerGroup = nextGroup;
    emitHover(nextGroup);
  }

  function applyState(state) {
    currentState = state;

    const cameraProgress = prefersReducedMotion ? 1 : state.camera;
    targetCameraPosition.set(
      THREE.MathUtils.lerp(CAMERA_START.position[0], CAMERA_TOP.position[0], cameraProgress),
      THREE.MathUtils.lerp(CAMERA_START.position[1], CAMERA_TOP.position[1], cameraProgress),
      THREE.MathUtils.lerp(CAMERA_START.position[2], CAMERA_TOP.position[2], cameraProgress)
    );

    targetLookAt.set(
      THREE.MathUtils.lerp(CAMERA_START.lookAt[0], CAMERA_TOP.lookAt[0], cameraProgress),
      THREE.MathUtils.lerp(CAMERA_START.lookAt[1], CAMERA_TOP.lookAt[1], cameraProgress),
      THREE.MathUtils.lerp(CAMERA_START.lookAt[2], CAMERA_TOP.lookAt[2], cameraProgress)
    );

    currentCameraPosition.copy(targetCameraPosition);
    currentLookAt.copy(targetLookAt);

    camera.position.copy(currentCameraPosition);
    camera.up.set(0, 1 - cameraProgress, -cameraProgress).normalize();
    camera.lookAt(currentLookAt);

    stagePlane.material.opacity = THREE.MathUtils.lerp(0.02, 0.44, state.blackout * 0.8 + state.glass * 0.2);
    gridLines.material.opacity = THREE.MathUtils.lerp(0.18, 0.94, state.blackout * 0.82 + 0.18);
    gridBloom.material.opacity = THREE.MathUtils.lerp(0.02, 0.11, state.glass * 0.8 + state.blackout * 0.2);

    world.rotation.y = THREE.MathUtils.lerp(-0.11, 0, cameraProgress) + state.lift * 0.04;
    world.position.z = THREE.MathUtils.lerp(1.3, 0, cameraProgress) - state.lift * 0.18;
    world.position.y = state.lift * 0.08;

    markerGroups.forEach((group, index) => {
      const {
        fill,
        outline,
        icon,
        iconBaseY,
        iconBaseX,
        iconBaseZ,
        labelSprite,
        labelBaseY,
        labelBaseX,
        labelBaseZ,
        baseLabelScale,
        basePosition,
        baseFillOpacity,
        baseOutlineOpacity,
        exitHeight,
        exitScale,
      } =
        group.userData;
      const appear = state.configuration;
      const lift = state.lift * (1 + index * 0.035);
      const fade = appear * (1 - state.dissolve);
      const scale = THREE.MathUtils.lerp(0.76, 1, appear) * THREE.MathUtils.lerp(1, exitScale, lift);

      group.position.set(basePosition.x, basePosition.y + THREE.MathUtils.lerp(-0.2, 0, appear) + exitHeight * lift, basePosition.z);
      group.scale.set(scale, scale, scale);

      fill.material.opacity = baseFillOpacity * fade;
      outline.material.opacity = baseOutlineOpacity * fade;

      if (icon) {
        const iconSize = THREE.MathUtils.lerp(0.42, 0.5 - cameraProgress * 0.04, appear) * THREE.MathUtils.lerp(1, 1.06, lift);
        icon.position.set(
          iconBaseX,
          THREE.MathUtils.lerp(iconBaseY - 0.08, iconBaseY, appear) + lift * 0.1,
          iconBaseZ
        );
        icon.scale.set(iconSize, iconSize, 1);
        icon.material.opacity = THREE.MathUtils.lerp(0, 0.94, appear) * (1 - state.dissolve * 0.92);
      }

      if (labelSprite && baseLabelScale) {
        const labelScale = THREE.MathUtils.lerp(0.88, 0.94, appear) * THREE.MathUtils.lerp(1, 1.02, lift);
        labelSprite.position.set(
          labelBaseX,
          THREE.MathUtils.lerp(labelBaseY - 0.05, labelBaseY, appear) + lift * 0.04,
          labelBaseZ
        );
        labelSprite.scale.copy(baseLabelScale).multiplyScalar(labelScale);
        labelSprite.material.opacity =
          THREE.MathUtils.lerp(0, 0.94, appear) *
          THREE.MathUtils.lerp(0.46, 1, cameraProgress * 0.88 + 0.12) *
          (1 - state.dissolve * 0.92);
      }
    });

    syncHover(pointerTarget);
    updatePointerEffects();

    render();
  }

  function updatePointerEffects() {
    const pointerX = (pointerTarget.x - 0.5) * 7.2;
    const pointerZ = (0.5 - pointerTarget.y) * 8.6;
    const bloomSize = THREE.MathUtils.lerp(11.8, 16.4, currentState.glass * 0.72 + currentState.blackout * 0.28);
    gridBloom.position.set(pointerX, 0.34 + currentState.glass * 0.14, pointerZ);
    gridBloom.scale.set(bloomSize, bloomSize, 1);
  }

  function render() {
    renderer.render(scene, camera);
  }

  function resize() {
    updateSize();
    render();
  }

  window.addEventListener("resize", resize);
  updateSize();
  applyState(currentState);

  return {
    setProgress(state) {
      applyState(state);
    },
    setPointer(pointer, options = {}) {
      const nextX = clamp01(pointer?.x ?? pointerTarget.x);
      const nextY = clamp01(pointer?.y ?? pointerTarget.y);
      const nextActive = options.active ?? true;
      const pointerChanged =
        Math.abs(nextX - pointerTarget.x) >= 0.003 || Math.abs(nextY - pointerTarget.y) >= 0.003;
      const activeChanged = nextActive !== pointerActive;

      pointerActive = nextActive;

      if (!pointerChanged && !activeChanged) {
        syncHover(pointerTarget);
        return;
      }

      pointerTarget.set(nextX, nextY);
      syncHover(pointerTarget);
      updatePointerEffects();
      render();
    },
    clearHover() {
      pointerActive = false;
      hoveredMarkerGroup = null;
      emitHover(null);
    },
    resize,
    destroy() {
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}

function createHexGrid(THREE, { radius, size }) {
  const positions = [];
  const colors = [];
  const maxDistance = radius * size * 1.95;
  const white = new THREE.Color(0xf5f7fb);

  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);

    for (let r = rMin; r <= rMax; r += 1) {
      const { x, z } = axialToWorld(q, r, size);
      const distance = Math.hypot(x, z);
      const radialFade = clamp01(1 - distance / maxDistance);
      const horizonFade = clamp01(1 - (Math.abs(z) / (radius * size * 2.2)) * 0.55);
      const intensity = Math.max(0.1, Math.min(1, radialFade * horizonFade + 0.1));
      const color = white.clone().multiplyScalar(intensity);
      const corners = getHexCorners(x, z, size);

      for (let index = 0; index < 6; index += 1) {
        const current = corners[index];
        const next = corners[(index + 1) % 6];

        positions.push(current[0], 0, current[1], next[0], 0, next[1]);
        colors.push(
          color.r,
          color.g,
          color.b,
          color.r,
          color.g,
          color.b
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
    })
  );
}

function createMarker(THREE, marker) {
  const group = new THREE.Group();
  const fillColor = new THREE.Color(marker.color);
  const baseFillOpacity =
    marker.fillOpacity ?? (marker.type === "focus" ? 0.34 : marker.type === "tile" ? 0.28 : 0.4);
  const baseOutlineOpacity = marker.type === "tile" ? 0.78 : 0.96;

  const hexShape = new THREE.Shape();
  getHexShapePoints(0.94).forEach((point, index) => {
    if (index === 0) {
      hexShape.moveTo(point.x, point.y);
      return;
    }

    hexShape.lineTo(point.x, point.y);
  });
  hexShape.closePath();

  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(hexShape),
    new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: baseFillOpacity,
      side: THREE.DoubleSide,
    })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.renderOrder = 1;
  group.add(fill);

  const outlinePoints = getHexShapePoints(0.94).map((point) => new THREE.Vector3(point.x, 0, point.y));
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(outlinePoints),
    new THREE.LineBasicMaterial({
      color: marker.type === "focus" ? 0x8ab8ff : marker.color,
      transparent: true,
      opacity: baseOutlineOpacity,
    })
  );
  outline.rotation.x = -Math.PI / 2;
  outline.renderOrder = 2;
  group.add(outline);

  let icon = null;
  const iconBaseY = marker.iconOffset ?? 0.16;
  const iconBaseX = marker.iconPlanarX ?? 0;
  const iconBaseZ = marker.iconPlanarZ ?? 0;
  if (marker.type !== "tile") {
    icon = createMarkerSprite(THREE, marker.type);
    icon.position.set(iconBaseX, iconBaseY, iconBaseZ);
    icon.renderOrder = 3;
    group.add(icon);
  }

  let labelSprite = null;
  const labelBaseY = marker.labelOffset ?? (marker.type === "tile" ? 0 : -0.22);
  const labelBaseX = marker.labelPlanarX ?? 0;
  const labelBaseZ = marker.labelPlanarZ ?? 0;
  if (marker.alwaysLabel && marker.label) {
    labelSprite = createMarkerLabelSprite(THREE, marker.label, marker.detail, marker.type);
    labelSprite.position.set(labelBaseX, labelBaseY, labelBaseZ);
    labelSprite.scale.set(marker.labelWidth ?? 1.02, marker.labelHeight ?? 0.22, 1);
    labelSprite.renderOrder = 4;
    group.add(labelSprite);
  }

  group.userData = {
    marker,
    fill,
    outline,
    hitTarget: fill,
    icon,
    iconBaseY,
    iconBaseX,
    iconBaseZ,
    labelSprite,
    labelBaseY,
    labelBaseX,
    labelBaseZ,
    baseLabelScale: labelSprite ? labelSprite.scale.clone() : null,
    baseFillOpacity,
    baseOutlineOpacity,
    exitHeight: marker.lift ?? 1.42,
    exitScale: marker.exitScale ?? 1.42,
    hoverAnchor: new THREE.Vector3(
      marker.hoverAnchorX ?? 0,
      marker.hoverAnchorY ?? 0.12,
      marker.hoverAnchorZ ?? 0,
    ),
  };

  fill.userData.markerGroup = group;

  return group;
}

function createMarkerSprite(THREE, type) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 384;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create studio marker texture.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(246, 248, 251, 0.96)";
  context.fillStyle = "rgba(246, 248, 251, 0.96)";
  context.lineWidth = 10;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.shadowColor = "rgba(168, 205, 255, 0.12)";
  context.shadowBlur = 12;

  drawRoundedRectPath(context, 104, 78, 176, 222, 30);
  context.stroke();

  if (type === "speaker") {
    drawCirclePath(context, 192, 192, 38);
    context.stroke();
    drawCirclePath(context, 192, 192, 72);
    context.stroke();
  } else if (type === "sub") {
    drawCirclePath(context, 192, 198, 60);
    context.stroke();
    context.beginPath();
    context.arc(192, 198, 12, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.arc(192, 194, 56, Math.PI * 0.12, Math.PI * 0.88);
    context.stroke();
    context.beginPath();
    context.arc(192, 228, 14, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.44, 0.44, 1);
  return sprite;
}

function createMarkerLabelSprite(THREE, title, detail, type) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 440;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create studio label texture.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const titleSize = type === "tile" ? 78 : 48;
  const detailSize = 28;
  const titleFont =
    type === "tile"
      ? STUDIO_LABEL_FONT
      : `'Barlow Condensed', 'Space Grotesk', 'Noto Sans SC', sans-serif`;
  context.font = `700 ${titleSize}px ${titleFont}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 12;
  context.strokeStyle = "rgba(7, 10, 14, 0.9)";
  context.strokeText(title, canvas.width / 2, detail ? 164 : 220);
  context.fillStyle = "rgba(247, 247, 247, 0.96)";
  context.fillText(title, canvas.width / 2, detail ? 164 : 220);

  if (detail) {
    context.font = `600 ${detailSize}px ${STUDIO_DETAIL_FONT}`;
    context.lineWidth = 10;
    context.strokeStyle = "rgba(7, 10, 14, 0.8)";
    context.strokeText(detail, canvas.width / 2, 246);
    context.fillStyle = "rgba(225, 230, 238, 0.8)";
    context.fillText(detail, canvas.width / 2, 246);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1, 1, 1);
  return sprite;
}

function createGlowTexture(THREE, innerColor, outerColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create glow texture.");
  }

  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.34, outerColor);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function axialToWorld(q, r, size) {
  return {
    x: size * 1.5 * q,
    z: size * Math.sqrt(3) * (r + q / 2),
  };
}

function getHexCorners(centerX, centerZ, size) {
  const corners = [];

  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index);
    corners.push([
      centerX + size * Math.cos(angle),
      centerZ + size * Math.sin(angle),
    ]);
  }

  return corners;
}

function getHexShapePoints(size) {
  const points = [];

  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index);
    points.push({
      x: size * Math.cos(angle),
      y: size * Math.sin(angle),
    });
  }

  return points;
}

function roundedRectPoints(width, height, radius) {
  const steps = 8;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const points = [];
  const corners = [
    { x: halfWidth - radius, y: halfHeight - radius, start: 0, end: Math.PI / 2 },
    { x: -halfWidth + radius, y: halfHeight - radius, start: Math.PI / 2, end: Math.PI },
    { x: -halfWidth + radius, y: -halfHeight + radius, start: Math.PI, end: Math.PI * 1.5 },
    { x: halfWidth - radius, y: -halfHeight + radius, start: Math.PI * 1.5, end: Math.PI * 2 },
  ];

  corners.forEach((corner) => {
    for (let step = 0; step <= steps; step += 1) {
      const angle = corner.start + ((corner.end - corner.start) * step) / steps;
      points.push({
        x: corner.x + radius * Math.cos(angle),
        y: corner.y + radius * Math.sin(angle),
      });
    }
  });

  return points;
}

function drawRoundedRectPath(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
}

function drawCirclePath(context, x, y, radius) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
}

function resolveMarkerWorldPosition(marker, size) {
  if (marker.position) {
    return marker.position;
  }

  return axialToWorld(marker.q, marker.r, size);
}

async function ensureStudioFonts() {
  if (!document.fonts?.load) {
    return;
  }

  await Promise.allSettled([
    document.fonts.load(`700 78px ${STUDIO_LABEL_FONT}`),
    document.fonts.load(`600 28px ${STUDIO_DETAIL_FONT}`),
  ]);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
