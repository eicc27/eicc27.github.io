import { getAstroAnnotation } from "./stars/astro-annotations.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DWELL_MS = 1400;

function createSvgNode(tagName, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    node.setAttribute(name, String(value));
  });
  return node;
}

function normalizeFilterState(nextState = {}) {
  return {
    stars: nextState.stars !== false,
    nebulae: nextState.nebulae !== false,
    constellations: nextState.constellations !== false,
  };
}

function applyFilterState(layerNode, filterState) {
  const nextState = normalizeFilterState(filterState);
  layerNode.dataset.showStars = String(nextState.stars);
  layerNode.dataset.showNebulae = String(nextState.nebulae);
  layerNode.dataset.showConstellations = String(nextState.constellations);
}

function applyOverlayOpacity(layerNode, opacity) {
  const nextOpacity = Math.max(0, Math.min(1, Number(opacity) || 0));
  layerNode.style.setProperty("--astro-overlay-opacity", nextOpacity.toFixed(3));
}

function pointToPercentString(value) {
  return `${Number(value).toFixed(4)}%`;
}

function percentToPixels(value, span) {
  return (Number(value) / 100) * span;
}

function rectsOverlap(a, b, padding = 10) {
  return !(
    a.right + padding < b.left ||
    b.right + padding < a.left ||
    a.bottom + padding < b.top ||
    b.bottom + padding < a.top
  );
}

function labelCandidates(kind, x, y, width, height) {
  const horizontal = x > width * 0.7 ? -1 : 1;
  const vertical = y < height * 0.2 ? 1 : -1;
  const radii = kind === "constellation" ? [16, 22, 28, 36] : [14, 22, 30, 42, 56, 72, 88];
  const directions = [
    [horizontal, vertical],
    [horizontal, 0],
    [0, vertical],
    [-horizontal, vertical],
    [horizontal, -vertical],
    [-horizontal, 0],
    [0, -vertical],
    [-horizontal, -vertical],
  ];

  return radii.flatMap((radius) =>
    directions.map(([dx, dy]) => ({
      x: x + dx * radius,
      y: y + dy * radius,
      score: Math.abs(dx) * 1.4 + Math.abs(dy) * 1.1 + radius * 0.01,
    })),
  );
}

function clampRectPosition(x, y, width, height, boxWidth, boxHeight, padding = 8) {
  return {
    x: Math.min(Math.max(x, padding), Math.max(padding, width - boxWidth - padding)),
    y: Math.min(Math.max(y, padding), Math.max(padding, height - boxHeight - padding)),
  };
}

function buildTooltipPayload(type, item) {
  if (type === "star") {
    return {
      eyebrow: "IAU named star",
      title: item.name,
      detail: `Magnitude ${item.vmag?.toFixed?.(2) ?? "--"} · ${item.constellation || "Unknown constellation"}`,
      meta: [
        `RA ${item.raDeg ?? "--"}°`,
        `Dec ${item.decDeg ?? "--"}°`,
      ],
      docUrl: item.docUrl,
      docSource: item.docSource || "CDS SIMBAD",
      accent: "gold",
    };
  }

  if (type === "constellation") {
    return {
      eyebrow: item.partial ? "Constellation fragment" : "Constellation guide",
      title: item.name,
      detail: item.partial ? "Partial figure visible in this frame." : "Visible constellation skeleton in this frame.",
      meta: [
        `${item.points?.length ?? 0} visible guide stars`,
        `${item.lines?.length ?? 0} visible segments`,
      ],
      docUrl: item.docUrl,
      docSource: item.docSource || "IAU Constellations",
      accent: "cyan",
    };
  }

  return {
    eyebrow: `${String(item.category || "deep-sky").replaceAll("-", " ")} / ${item.kind || "object"}`,
    title: item.displayLabel || item.catalogName || item.name,
    detail: `${item.constellation || "Unknown"} · ${item.displayCommonName || item.name}`,
    meta: [
      item.mag != null ? `Mag ${Number(item.mag).toFixed(1)}` : "Mag --",
      item.sizeArcmin ? `Size ${Number(item.sizeArcmin).toFixed(1)}′` : "Size --",
      `RA ${item.raDeg ?? "--"}° / Dec ${item.decDeg ?? "--"}°`,
    ],
    docUrl: item.docUrl,
    docSource: item.docSource || "CDS SIMBAD",
    accent: item.category === "galaxy" ? "amber" : "rust",
  };
}

function bindInteractive(node, payload, callbacks) {
  if (!node || !payload) {
    return;
  }

  let dwellTimer = null;
  let dwellReady = false;

  const cancelDwell = () => {
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
    dwellReady = false;
  };

  const startDwell = () => {
    cancelDwell();
    const rect = node.getBoundingClientRect();
    callbacks.onHover?.({
      ...payload,
      labelRect: rect,
      dwellStarted: true,
    });

    dwellTimer = setTimeout(() => {
      dwellReady = true;
      dwellTimer = null;
      callbacks.onDwellComplete?.({ ...payload, labelRect: node.getBoundingClientRect() });
    }, DWELL_MS);
  };

  node.addEventListener("pointerenter", startDwell);

  node.addEventListener("pointerleave", () => {
    cancelDwell();
    callbacks.onLeave?.();
  });

  node.addEventListener("click", (event) => {
    event.stopPropagation();
    if (dwellReady && payload.docUrl) {
      window.open(payload.docUrl, "_blank", "noopener,noreferrer");
    }
  });
}

function buildInteractiveNode(className, payload, callbacks) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", payload.title || payload.name || payload.displayLabel || "Astronomical object");
  bindInteractive(button, payload, callbacks);
  return button;
}

function renderOverlay(layerNode, annotation, callbacks) {
  layerNode.innerHTML = "";
  const deepSkyObjects = annotation.deepSkyObjects || annotation.nebulae || [];
  const labelEntries = [];
  const sceneNode = document.createElement("div");
  sceneNode.className = "astro-overlay__scene";

  const svg = createSvgNode("svg", {
    class: "astro-overlay__svg",
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });

  const constellationGroup = createSvgNode("g", { class: "astro-overlay__constellations" });
  const guideGroup = createSvgNode("g", { class: "astro-overlay__guides" });
  const nebulaGroup = createSvgNode("g", { class: "astro-overlay__nebulae" });
  const leaderGroup = createSvgNode("g", { class: "astro-overlay__leaders" });

  annotation.constellations.forEach((constellation) => {
    constellation.lines.forEach((line) => {
      const start = constellation.points[line.from];
      const end = constellation.points[line.to];
      if (!start || !end) {
        return;
      }
      constellationGroup.appendChild(
        createSvgNode("line", {
          class: "astro-overlay__constellation-line",
          x1: start.xPct,
          y1: start.yPct,
          x2: end.xPct,
          y2: end.yPct,
        }),
      );
    });

    constellation.points.forEach((point) => {
      guideGroup.appendChild(
        createSvgNode("circle", {
          class: "astro-overlay__constellation-point",
          cx: point.xPct,
          cy: point.yPct,
          r: 0.42,
        }),
      );
    });

    const payload = buildTooltipPayload("constellation", constellation);
    const label = buildInteractiveNode("astro-overlay__label astro-overlay__label--constellation", payload, callbacks);
    label.textContent = constellation.partial ? `${constellation.name} (partial)` : constellation.name;
    layerNode.appendChild(label);

    const leader = createSvgNode("line", {
      class: "astro-overlay__leader astro-overlay__leader--constellation",
      x1: constellation.labelXPct,
      y1: constellation.labelYPct,
      x2: constellation.labelXPct,
      y2: constellation.labelYPct,
    });
    leaderGroup.appendChild(leader);

    labelEntries.push({
      kind: "constellation",
      anchorXPct: constellation.labelXPct,
      anchorYPct: constellation.labelYPct,
      labelNode: label,
      leaderNode: leader,
      visibilityKey: "constellations",
      priority: 2,
    });
  });

  deepSkyObjects.forEach((object) => {
    nebulaGroup.appendChild(
      createSvgNode("ellipse", {
        class: `astro-overlay__nebula-ellipse astro-overlay__nebula-ellipse--${object.category || "other"}`,
        cx: object.xPct,
        cy: object.yPct,
        rx: object.radiusXPct,
        ry: object.radiusYPct,
        transform: `rotate(${object.rotationDeg} ${object.xPct} ${object.yPct})`,
      }),
    );

    const payload = buildTooltipPayload("dso", object);
    const marker = buildInteractiveNode("astro-overlay__hotspot astro-overlay__hotspot--dso", payload, callbacks);
    marker.style.left = pointToPercentString(object.xPct);
    marker.style.top = pointToPercentString(object.yPct);
    sceneNode.appendChild(marker);

    const label = buildInteractiveNode(
      `astro-overlay__label astro-overlay__label--nebula astro-overlay__label--${object.category || "other"}`,
      payload,
      callbacks,
    );
    label.textContent = object.displayLabel || object.catalogName || object.name;
    layerNode.appendChild(label);

    const leader = createSvgNode("line", {
      class: "astro-overlay__leader astro-overlay__leader--dso",
      x1: object.xPct,
      y1: object.yPct,
      x2: object.xPct,
      y2: object.yPct,
    });
    leaderGroup.appendChild(leader);

    labelEntries.push({
      kind: "dso",
      anchorXPct: object.xPct,
      anchorYPct: object.yPct,
      labelNode: label,
      leaderNode: leader,
      visibilityKey: "nebulae",
      priority: 0,
    });
  });

  annotation.stars.forEach((star) => {
    const payload = buildTooltipPayload("star", star);
    const marker = buildInteractiveNode("astro-overlay__hotspot astro-overlay__hotspot--star", payload, callbacks);
    marker.style.left = pointToPercentString(star.xPct);
    marker.style.top = pointToPercentString(star.yPct);
    marker.innerHTML = '<span class="astro-overlay__star-dot" aria-hidden="true"></span>';
    sceneNode.appendChild(marker);

    const label = buildInteractiveNode("astro-overlay__label astro-overlay__label--star", payload, callbacks);
    label.textContent = star.name;
    layerNode.appendChild(label);

    const leader = createSvgNode("line", {
      class: "astro-overlay__leader astro-overlay__leader--star",
      x1: star.xPct,
      y1: star.yPct,
      x2: star.xPct,
      y2: star.yPct,
    });
    leaderGroup.appendChild(leader);

    labelEntries.push({
      kind: "star",
      anchorXPct: star.xPct,
      anchorYPct: star.yPct,
      labelNode: label,
      leaderNode: leader,
      visibilityKey: "stars",
      priority: 1,
    });
  });

  svg.append(constellationGroup, guideGroup, nebulaGroup);
  sceneNode.appendChild(svg);
  layerNode.append(sceneNode);
  const leaderSvg = createSvgNode("svg", {
    class: "astro-overlay__leader-svg",
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });
  leaderSvg.append(leaderGroup);
  layerNode.prepend(leaderSvg);
  return labelEntries;
}

function layoutOverlayLabels(layerNode, labelEntries, transformAnchor) {
  if (!labelEntries?.length) {
    return;
  }

  const bounds = layerNode.getBoundingClientRect();
  if (!bounds.width || !bounds.height) {
    return;
  }

  const placed = [];
  const ordered = [...labelEntries].sort((a, b) => a.priority - b.priority);

  ordered.forEach((entry) => {
    const baseAnchorX = percentToPixels(entry.anchorXPct, bounds.width);
    const baseAnchorY = percentToPixels(entry.anchorYPct, bounds.height);
    const transformedAnchor = transformAnchor(baseAnchorX, baseAnchorY, bounds.width, bounds.height);
    const anchorX = transformedAnchor.x;
    const anchorY = transformedAnchor.y;
    const labelBounds = entry.labelNode.getBoundingClientRect();
    const boxWidth = labelBounds.width || 120;
    const boxHeight = labelBounds.height || 30;
    const candidates = labelCandidates(entry.kind, anchorX, anchorY, bounds.width, bounds.height);
    let chosen = null;
    let fallback = null;

    candidates.forEach((candidate) => {
      if (chosen) {
        return;
      }
      const clamped = clampRectPosition(candidate.x, candidate.y, bounds.width, bounds.height, boxWidth, boxHeight);
      const rect = {
        left: clamped.x,
        top: clamped.y,
        right: clamped.x + boxWidth,
        bottom: clamped.y + boxHeight,
      };

      const overlaps = placed.some((other) => rectsOverlap(rect, other.rect));
      if (!fallback) {
        fallback = { rect, score: candidate.score };
      }
      if (!overlaps) {
        chosen = { rect, score: candidate.score };
      }
    });

    const result = chosen || fallback;
    if (!result) {
      return;
    }

    entry.labelNode.style.left = `${result.rect.left.toFixed(2)}px`;
    entry.labelNode.style.top = `${result.rect.top.toFixed(2)}px`;

    const labelCenterX = result.rect.left + (result.rect.right - result.rect.left) * 0.5;
    const labelCenterY = result.rect.top + (result.rect.bottom - result.rect.top) * 0.5;
    const dxPct = (labelCenterX / bounds.width) * 100;
    const dyPct = (labelCenterY / bounds.height) * 100;
    const distance = Math.hypot(labelCenterX - anchorX, labelCenterY - anchorY);

    entry.leaderNode.setAttribute("x1", ((anchorX / bounds.width) * 100).toFixed(4));
    entry.leaderNode.setAttribute("y1", ((anchorY / bounds.height) * 100).toFixed(4));
    entry.leaderNode.setAttribute("x2", dxPct.toFixed(4));
    entry.leaderNode.setAttribute("y2", dyPct.toFixed(4));
    entry.leaderNode.style.opacity = distance > 26 ? "1" : "0";

    placed.push({ rect: result.rect, key: entry.visibilityKey });
  });
}

export function createAstroOverlayController({
  photoCard,
  imageNode,
  layerNode,
  onHover,
  onDwellComplete,
  onLeave,
}) {
  if (!photoCard || !imageNode || !layerNode) {
    return {
      setImage() {},
      setFilters() {},
      setOpacity() {},
      refresh() {},
      destroy() {},
    };
  }

  let activeAnnotation = null;
  let activeFilters = normalizeFilterState();
  let activeOpacity = 1;
  let resizeObserver = null;
  let resizeFrame = 0;
  let labelEntries = [];
  let sceneNode = null;
  let currentViewTransform = {
    scale: 1,
    x: 0,
    y: 0,
  };

  function transformAnchor(xPx, yPx, width, height) {
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    return {
      x: centerX + (xPx - centerX) * currentViewTransform.scale + currentViewTransform.x,
      y: centerY + (yPx - centerY) * currentViewTransform.scale + currentViewTransform.y,
    };
  }

  function applySceneTransform() {
    if (!sceneNode) {
      return;
    }
    sceneNode.style.transform = `translate3d(${currentViewTransform.x.toFixed(2)}px, ${currentViewTransform.y.toFixed(2)}px, 0) scale(${currentViewTransform.scale.toFixed(4)})`;
  }

  function syncLayout() {
    resizeFrame = 0;

    if (!activeAnnotation || imageNode.naturalWidth <= 0 || imageNode.clientWidth <= 0 || imageNode.clientHeight <= 0) {
      return;
    }

    const cardRect = photoCard.getBoundingClientRect();
    if (!cardRect.width || !cardRect.height) {
      return;
    }

    // Position overlay using image element's layout dimensions (unaffected by CSS transforms)
    // to avoid double-applying the zoom transform.
    layerNode.style.left = "0px";
    layerNode.style.top = "0px";
    layerNode.style.width = `${imageNode.clientWidth.toFixed(2)}px`;
    layerNode.style.height = `${imageNode.clientHeight.toFixed(2)}px`;
    applySceneTransform();
    layoutOverlayLabels(layerNode, labelEntries, transformAnchor);
  }

  function requestLayout() {
    if (resizeFrame) {
      return;
    }
    resizeFrame = window.requestAnimationFrame(syncLayout);
  }

  function hide() {
    activeAnnotation = null;
    labelEntries = [];
    sceneNode = null;
    layerNode.hidden = true;
    layerNode.setAttribute("aria-hidden", "true");
    layerNode.classList.remove("is-active");
    layerNode.innerHTML = "";
    layerNode.style.left = "";
    layerNode.style.top = "";
    layerNode.style.width = "";
    layerNode.style.height = "";
  }

  function setFilters(nextFilters) {
    activeFilters = normalizeFilterState({
      ...activeFilters,
      ...nextFilters,
    });
    applyFilterState(layerNode, activeFilters);
  }

  function setOpacity(nextOpacity) {
    activeOpacity = Math.max(0, Math.min(1, Number(nextOpacity) || 0));
    applyOverlayOpacity(layerNode, activeOpacity);
  }

  function setViewTransform(nextTransform) {
    currentViewTransform = {
      scale: Math.max(1, Number(nextTransform?.scale) || 1),
      x: Number(nextTransform?.x) || 0,
      y: Number(nextTransform?.y) || 0,
    };
    applySceneTransform();
    requestLayout();
  }

  function setImage(image) {
    const imageKey = image?.annotationKey || image?.id;
    const annotation = imageKey ? getAstroAnnotation(imageKey) : null;

    if (!annotation) {
      hide();
      return;
    }

    activeAnnotation = annotation;
    labelEntries = renderOverlay(layerNode, annotation, { onHover, onDwellComplete, onLeave });
    sceneNode = layerNode.querySelector(".astro-overlay__scene");
    applyFilterState(layerNode, activeFilters);
    applyOverlayOpacity(layerNode, activeOpacity);
    layerNode.hidden = false;
    layerNode.setAttribute("aria-hidden", "true");
    layerNode.classList.add("is-active");
    requestLayout();
  }

  resizeObserver = new ResizeObserver(requestLayout);
  resizeObserver.observe(photoCard);
  resizeObserver.observe(imageNode);
  imageNode.addEventListener("load", requestLayout);
  window.addEventListener("resize", requestLayout);

  return {
    setImage,
    setViewTransform,
    setFilters,
    setOpacity,
    refresh: requestLayout,
    destroy() {
      window.removeEventListener("resize", requestLayout);
      imageNode.removeEventListener("load", requestLayout);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (resizeFrame) {
        window.cancelAnimationFrame(resizeFrame);
      }
    },
  };
}
