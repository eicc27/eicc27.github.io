import { createAstroOverlayController } from "./astro-overlay.js";
import { astroAnnotationData } from "./stars/astro-annotations.js";

const ASTRO_SHOWCASE = [
  {
    id: "orion-field",
    tag: "Deep Sky / Orion",
    cardTitle: "猎户深空",
    cardMeta: "M42, M43, Horsehead",
    viewerKicker: "Boundless atlas / Deep sky frame",
    summary:
      "这一张更接近深空近景。进入全屏后可以单独开关恒星、星云和星座叠层，直接对应解算后的 FITS 结果。",
  },
  {
    id: "night-haze",
    tag: "Wide Field / North",
    cardTitle: "北天广角夜空",
    cardMeta: "Ursa Major, Ursa Minor, M97, M81",
    viewerKicker: "Boundless atlas / Wide field frame",
    summary:
      "这一张是广角夜空视场，适合看北极星、北斗和周边星座在同一张图里的空间关系，朝向角直接来自 FITS 头。",
  },
];

const ASTRO_MIN_ZOOM = 1;
const ASTRO_MAX_ZOOM = 4;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampIndex(index, size) {
  return ((index % size) + size) % size;
}

function formatAngle(metadata) {
  if (!metadata || typeof metadata.orientationDeg !== "number") {
    return "--";
  }
  return `${metadata.orientationDeg.toFixed(1)}° ${metadata.orientationReference || ""}`.trim();
}

function formatCenter(metadata) {
  if (!metadata) {
    return "--";
  }
  const ra = typeof metadata.centerRaDeg === "number" ? metadata.centerRaDeg.toFixed(3) : "--";
  const dec = typeof metadata.centerDecDeg === "number" ? metadata.centerDecDeg.toFixed(3) : "--";
  return `RA ${ra}° / Dec ${dec}°`;
}

function formatCapturedAt(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderHistogram(canvas, histogram) {
  if (!(canvas instanceof HTMLCanvasElement) || !histogram) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const { width, height } = canvas;
  const maxCount = histogram.maxCount || 1;
  const channels = [
    { key: "red", stroke: "rgba(255, 133, 133, 0.94)", fill: "rgba(255, 133, 133, 0.16)" },
    { key: "green", stroke: "rgba(137, 255, 184, 0.94)", fill: "rgba(137, 255, 184, 0.12)" },
    { key: "blue", stroke: "rgba(130, 190, 255, 0.96)", fill: "rgba(130, 190, 255, 0.12)" },
  ];

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(6, 10, 18, 0.86)";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(255, 255, 255, 0.06)";
  context.lineWidth = 1;
  for (let index = 1; index < 4; index += 1) {
    const y = (height / 4) * index;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  channels.forEach(({ key, stroke, fill }) => {
    const values = histogram[key] || [];
    if (!values.length) {
      return;
    }

    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - (Number(value) / maxCount) * (height - 6) - 3;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.lineTo(width, height - 2);
    context.lineTo(0, height - 2);
    context.closePath();
    context.fillStyle = fill;
    context.fill();

    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - (Number(value) / maxCount) * (height - 6) - 3;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  });
}

function buildSelectionPayload(item) {
  if (!item) {
    return null;
  }

  if (item.category === "star" || item.kind === "star") {
    return {
      eyebrow: "IAU named star",
      title: item.name,
      detail: `Magnitude ${item.vmag?.toFixed?.(2) ?? "--"} · ${item.constellation || "Unknown constellation"}`,
      meta: [
        `RA ${item.raDeg ?? "--"}°`,
        `Dec ${item.decDeg ?? "--"}°`,
        item.docSource || "CDS SIMBAD",
      ],
      docUrl: item.docUrl,
      accent: "star",
    };
  }

  if (item.category === "constellation" || item.kind === "constellation") {
    return {
      eyebrow: item.partial ? "Constellation fragment" : "Constellation guide",
      title: item.name,
      detail: item.partial ? "Partial figure visible in this frame." : "Visible constellation skeleton in this frame.",
      meta: [
        `${item.points?.length ?? 0} visible guide stars`,
        `${item.lines?.length ?? 0} visible segments`,
        item.docSource || "IAU",
      ],
      docUrl: item.docUrl,
      accent: "constellation",
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
      item.docSource || "CDS SIMBAD",
    ],
    docUrl: item.docUrl,
    accent: item.category === "galaxy" ? "galaxy" : "nebula",
  };
}

function normalizeSelectionAccent(accent) {
  if (accent === "gold") {
    return "star";
  }
  if (accent === "amber") {
    return "galaxy";
  }
  if (accent === "cyan") {
    return "constellation";
  }
  if (accent === "rust") {
    return "nebula";
  }
  return accent || "nebula";
}

export function initAstroImmersive() {
  const cards = Array.from(document.querySelectorAll("[data-astro-card]"));
  const viewer = document.querySelector("[data-astro-viewer]");
  const viewerStage = document.querySelector("[data-astro-viewer-stage]");
  const viewerViewport = document.querySelector("[data-astro-viewer-viewport]");
  const viewerImage = document.querySelector("[data-astro-viewer-image]");
  const viewerCard = document.querySelector("[data-astro-viewer-card]");
  const viewerOverlay = document.querySelector("[data-astro-viewer-overlay]");
  const viewerTitle = document.querySelector("[data-astro-viewer-title]");
  const viewerKicker = document.querySelector("[data-astro-viewer-kicker]");
  const viewerMeta = document.querySelector("[data-astro-viewer-meta]");
  const viewerSummary = document.querySelector("[data-astro-viewer-summary]");
  const viewerAngle = document.querySelector("[data-astro-viewer-angle]");
  const viewerCenter = document.querySelector("[data-astro-viewer-center]");
  const viewerCaptured = document.querySelector("[data-astro-viewer-captured]");
  const selectionEyebrow = document.querySelector("[data-astro-selection-eyebrow]");
  const selectionTitle = document.querySelector("[data-astro-selection-title]");
  const selectionDetail = document.querySelector("[data-astro-selection-detail]");
  const selectionMeta = document.querySelector("[data-astro-selection-meta]");
  const selectionLink = document.querySelector("[data-astro-selection-link]");
  const closeButtons = Array.from(document.querySelectorAll("[data-astro-viewer-close]"));
  const prevButton = document.querySelector("[data-astro-viewer-prev]");
  const nextButton = document.querySelector("[data-astro-viewer-next]");
  const toggleButtons = Array.from(document.querySelectorAll("[data-astro-toggle]"));
  const opacityInput = document.querySelector("[data-astro-opacity]");
  const zoomButtons = Array.from(document.querySelectorAll("[data-astro-zoom]"));
  const zoomRange = document.querySelector("[data-astro-zoom-range]");
  const zoomReadout = document.querySelector("[data-astro-zoom-readout]");
  const minimapImage = document.querySelector("[data-astro-minimap-image]");
  const minimapViewport = document.querySelector("[data-astro-minimap-viewport]");
  const histogramCanvas = document.querySelector("[data-astro-histogram]");
  const hoverCard = document.querySelector("[data-astro-hover]");
  const hoverEyebrow = document.querySelector("[data-astro-hover-eyebrow]");
  const hoverTitle = document.querySelector("[data-astro-hover-title]");
  const hoverDetail = document.querySelector("[data-astro-hover-detail]");
  const hoverMeta = document.querySelector("[data-astro-hover-meta]");
  const hoverLink = document.querySelector("[data-astro-hover-link]");

  if (
    !cards.length ||
    !viewer ||
    !viewerStage ||
    !viewerViewport ||
    !(viewerImage instanceof HTMLImageElement) ||
    !viewerCard ||
    !viewerOverlay
  ) {
    return;
  }

  const items = ASTRO_SHOWCASE.map((item) => {
    const annotation = astroAnnotationData.images[item.id];
    if (!annotation) {
      return null;
    }
    return {
      ...item,
      ...annotation,
    };
  }).filter(Boolean);

  if (!items.length) {
    return;
  }

  let currentIndex = 0;
  let isOpen = false;
  let activeItem = null;
  let selectedPayload = null;
  let filters = {
    stars: true,
    nebulae: true,
    constellations: true,
  };
  let transform = {
    scale: 1,
    x: 0,
    y: 0,
  };
  let dragState = null;
  let transformFrame = 0;

  function syncToggleButtons() {
    toggleButtons.forEach((button) => {
      const key = button.dataset.astroToggle;
      const active = key ? filters[key] !== false : false;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function hideHoverCard() {
    if (!hoverCard) {
      return;
    }
    hoverCard.hidden = true;
    delete hoverCard.dataset.accent;
  }

  function renderSelection(payload) {
    selectedPayload = payload || null;
    const selectionRoot = selectionEyebrow?.closest(".astro-selection");
    if (!selectionEyebrow || !selectionTitle || !selectionDetail || !selectionMeta || !(selectionLink instanceof HTMLAnchorElement)) {
      return;
    }

    if (!payload) {
      if (selectionRoot) {
        delete selectionRoot.dataset.accent;
      }
      selectionEyebrow.textContent = "No selection";
      selectionTitle.textContent = "Hover or click a label";
      selectionDetail.textContent =
        "Hover shows transient tooltip. Click any star, deep-sky object, or constellation to pin its info here.";
      selectionMeta.innerHTML = "";
      selectionLink.hidden = true;
      selectionLink.removeAttribute("href");
      return;
    }

    if (selectionRoot) {
      selectionRoot.dataset.accent = normalizeSelectionAccent(payload.accent);
    }
    selectionEyebrow.textContent = payload.eyebrow || "Selected object";
    selectionTitle.textContent = payload.title || "Unknown object";
    selectionDetail.textContent = payload.detail || "";
    selectionMeta.innerHTML = (payload.meta || []).map((item) => `<span>${item}</span>`).join("");
    if (payload.docUrl) {
      selectionLink.href = payload.docUrl;
      selectionLink.hidden = false;
      selectionLink.textContent = `Open ${payload.meta?.[payload.meta.length - 1] || "documentation"}`;
    } else {
      selectionLink.hidden = true;
      selectionLink.removeAttribute("href");
    }
  }

  function renderHoverCard(payload) {
    if (!hoverCard || !viewerStage) {
      return;
    }

    if (!payload) {
      hideHoverCard();
      return;
    }

    hoverCard.hidden = false;
    hoverCard.dataset.accent = payload.accent || "cyan";

    if (hoverEyebrow) {
      hoverEyebrow.textContent = payload.eyebrow || "";
    }
    if (hoverTitle) {
      hoverTitle.textContent = payload.title || "";
    }
    if (hoverDetail) {
      hoverDetail.textContent = payload.detail || "";
    }
    if (hoverMeta) {
      hoverMeta.innerHTML = (payload.meta || []).map((item) => `<span>${item}</span>`).join("");
    }
    if (hoverLink instanceof HTMLAnchorElement) {
      hoverLink.href = payload.docUrl || "#";
      hoverLink.hidden = !payload.docUrl;
      hoverLink.textContent = payload.docUrl ? `Open ${payload.meta?.[payload.meta.length - 1] || "documentation"}` : "";
    }

    const stageRect = viewerStage.getBoundingClientRect();
    const cardWidth = hoverCard.offsetWidth || 280;
    const cardHeight = hoverCard.offsetHeight || 160;
    const edge = 14;
    let x = payload.pointerX - stageRect.left + 18;
    let y = payload.pointerY - stageRect.top + 18;

    if (x + cardWidth + edge > stageRect.width) {
      x = payload.pointerX - stageRect.left - cardWidth - 18;
    }
    if (y + cardHeight + edge > stageRect.height) {
      y = payload.pointerY - stageRect.top - cardHeight - 18;
    }

    hoverCard.style.setProperty("--astro-hover-x", `${clamp(x, edge, Math.max(edge, stageRect.width - cardWidth - edge)).toFixed(2)}px`);
    hoverCard.style.setProperty("--astro-hover-y", `${clamp(y, edge, Math.max(edge, stageRect.height - cardHeight - edge)).toFixed(2)}px`);
  }

  const overlayController = createAstroOverlayController({
    photoCard: viewerCard,
    imageNode: viewerImage,
    layerNode: viewerOverlay,
    onHover: renderHoverCard,
    onLeave: hideHoverCard,
    onActivate: renderSelection,
  });

  function clampTransform() {
    const viewportWidth = viewerViewport.clientWidth || 1;
    const viewportHeight = viewerViewport.clientHeight || 1;
    const contentWidth = viewerOverlay.clientWidth || viewerImage.clientWidth || viewportWidth;
    const contentHeight = viewerOverlay.clientHeight || viewerImage.clientHeight || viewportHeight;
    const limitX = Math.max(0, (contentWidth * transform.scale - viewportWidth) * 0.5);
    const limitY = Math.max(0, (contentHeight * transform.scale - viewportHeight) * 0.5);
    transform.x = clamp(transform.x, -limitX, limitX);
    transform.y = clamp(transform.y, -limitY, limitY);
  }

  function syncMinimap() {
    if (!(minimapImage instanceof HTMLImageElement) || !minimapViewport || !(zoomReadout instanceof HTMLElement)) {
      return;
    }

    zoomReadout.textContent = `${transform.scale.toFixed(2)}x`;
    const contentWidth = viewerOverlay.clientWidth || viewerImage.clientWidth || viewerViewport.clientWidth || 1;
    const contentHeight = viewerOverlay.clientHeight || viewerImage.clientHeight || viewerViewport.clientHeight || 1;
    const visibleWidthPct = clamp(((viewerViewport.clientWidth || 1) / Math.max(contentWidth * transform.scale, 1)) * 100, 0, 100);
    const visibleHeightPct = clamp(((viewerViewport.clientHeight || 1) / Math.max(contentHeight * transform.scale, 1)) * 100, 0, 100);
    const left = clamp(50 - (transform.x / Math.max(contentWidth * transform.scale, 1)) * 100 - visibleWidthPct * 0.5, 0, 100 - visibleWidthPct);
    const top = clamp(50 - (transform.y / Math.max(contentHeight * transform.scale, 1)) * 100 - visibleHeightPct * 0.5, 0, 100 - visibleHeightPct);

    minimapViewport.style.left = `${left.toFixed(4)}%`;
    minimapViewport.style.top = `${top.toFixed(4)}%`;
    minimapViewport.style.width = `${visibleWidthPct.toFixed(4)}%`;
    minimapViewport.style.height = `${visibleHeightPct.toFixed(4)}%`;
  }

  function applyTransform() {
    transformFrame = 0;
    clampTransform();
    viewerImage.style.transform = `translate3d(${transform.x.toFixed(2)}px, ${transform.y.toFixed(2)}px, 0) scale(${transform.scale.toFixed(4)})`;
    overlayController.setViewTransform(transform);
    viewerViewport.dataset.dragging = dragState ? "true" : "false";
    syncMinimap();
  }

  function requestTransform() {
    if (transformFrame) {
      return;
    }
    transformFrame = window.requestAnimationFrame(applyTransform);
  }

  function resetTransform() {
    transform = { scale: ASTRO_MIN_ZOOM, x: 0, y: 0 };
    if (zoomRange instanceof HTMLInputElement) {
      zoomRange.value = "100";
    }
    requestTransform();
  }

  function setScale(nextScale, clientX, clientY) {
    const stageRect = viewerViewport.getBoundingClientRect();
    const originX = clientX ?? stageRect.left + stageRect.width * 0.5;
    const originY = clientY ?? stageRect.top + stageRect.height * 0.5;
    const localX = originX - stageRect.left - stageRect.width * 0.5;
    const localY = originY - stageRect.top - stageRect.height * 0.5;
    const previousScale = transform.scale;
    const scale = clamp(nextScale, ASTRO_MIN_ZOOM, ASTRO_MAX_ZOOM);
    const scaleRatio = scale / previousScale;

    transform.x = localX - (localX - transform.x) * scaleRatio;
    transform.y = localY - (localY - transform.y) * scaleRatio;
    transform.scale = scale;

    if (zoomRange instanceof HTMLInputElement) {
      zoomRange.value = String(Math.round(scale * 100));
    }
    requestTransform();
  }

  function moveViewportTo(normX, normY) {
    const contentWidth = viewerOverlay.clientWidth || viewerImage.clientWidth || viewerViewport.clientWidth || 1;
    const contentHeight = viewerOverlay.clientHeight || viewerImage.clientHeight || viewerViewport.clientHeight || 1;
    const targetX = (0.5 - clamp(normX, 0, 1)) * contentWidth * transform.scale;
    const targetY = (0.5 - clamp(normY, 0, 1)) * contentHeight * transform.scale;
    transform.x = targetX;
    transform.y = targetY;
    requestTransform();
  }

  function renderCards() {
    cards.forEach((card) => {
      const id = card.dataset.astroCard;
      const item = items.find((entry) => entry.id === id);
      if (!item) {
        return;
      }

      const imageNode = card.querySelector("[data-astro-card-image]");
      const tagNode = card.querySelector("[data-astro-card-tag]");
      const titleNode = card.querySelector("[data-astro-card-title]");
      const metaNode = card.querySelector("[data-astro-card-meta]");

      if (imageNode instanceof HTMLImageElement) {
        imageNode.src = item.webImage;
        imageNode.alt = `${item.title} star field`;
        imageNode.loading = "lazy";
        imageNode.decoding = "async";
      }
      if (tagNode) {
        tagNode.textContent = item.tag;
      }
      if (titleNode) {
        titleNode.textContent = item.cardTitle;
      }
      if (metaNode) {
        metaNode.textContent = item.cardMeta;
      }
    });
  }

  function applyViewerItem() {
    const item = items[currentIndex];
    if (!item) {
      return;
    }

    activeItem = item;
    viewerImage.src = item.webImage;
    viewerImage.alt = `${item.title} star field`;
    if (minimapImage instanceof HTMLImageElement) {
      minimapImage.src = item.webImage;
      minimapImage.alt = `${item.title} global view`;
    }

    if (viewerTitle) {
      viewerTitle.textContent = item.cardTitle;
    }
    if (viewerKicker) {
      viewerKicker.textContent = item.viewerKicker;
    }
    if (viewerMeta) {
      const deepSkyObjects = item.deepSkyObjects || item.nebulae || [];
      const counts = item.metadata?.deepSkyCounts || {};
      const parts = [
        item.stars?.length ? `${item.stars.length} stars` : null,
        deepSkyObjects.length ? `${deepSkyObjects.length} deep-sky objects` : null,
        counts.nebula ? `${counts.nebula} nebulae` : null,
        counts.galaxy ? `${counts.galaxy} galaxies` : null,
        item.constellations?.length ? `${item.constellations.length} constellations` : null,
      ].filter(Boolean);
      viewerMeta.textContent = parts.join(" / ");
    }
    if (viewerSummary) {
      viewerSummary.textContent = item.summary;
    }
    if (viewerAngle) {
      viewerAngle.textContent = formatAngle(item.metadata);
    }
    if (viewerCenter) {
      viewerCenter.textContent = formatCenter(item.metadata);
    }
    if (viewerCaptured) {
      viewerCaptured.textContent = formatCapturedAt(item.metadata?.capturedAt);
    }

    renderSelection(null);
    hideHoverCard();
    overlayController.setImage({ annotationKey: item.id });
    overlayController.setFilters(filters);
    overlayController.setOpacity((Number(opacityInput?.value) || 100) / 100);
    renderHistogram(histogramCanvas, item.metadata?.histogram);
    resetTransform();

    const defaultSelection = item.deepSkyObjects?.[0] ? buildSelectionPayload(item.deepSkyObjects[0]) : null;
    renderSelection(defaultSelection);
  }

  function openViewer(index) {
    currentIndex = clampIndex(index, items.length);
    isOpen = true;
    viewer.hidden = false;
    viewer.setAttribute("aria-hidden", "false");
    viewer.classList.add("is-open");
    document.body.classList.add("body--astro-viewer-open");
    applyViewerItem();
  }

  function closeViewer() {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    dragState = null;
    viewer.hidden = true;
    viewer.setAttribute("aria-hidden", "true");
    viewer.classList.remove("is-open");
    document.body.classList.remove("body--astro-viewer-open");
    hideHoverCard();
  }

  function stepViewer(delta) {
    currentIndex = clampIndex(currentIndex + delta, items.length);
    applyViewerItem();
  }

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.astroCard;
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) {
        openViewer(index);
      }
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeViewer);
  });

  prevButton?.addEventListener("click", () => stepViewer(-1));
  nextButton?.addEventListener("click", () => stepViewer(1));

  toggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.astroToggle;
      if (!key) {
        return;
      }
      filters = {
        ...filters,
        [key]: !filters[key],
      };
      syncToggleButtons();
      overlayController.setFilters(filters);
    });
  });

  opacityInput?.addEventListener("input", () => {
    overlayController.setOpacity((Number(opacityInput.value) || 100) / 100);
  });

  zoomButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.astroZoom;
      if (action === "in") {
        setScale(transform.scale + 0.25);
      } else if (action === "out") {
        setScale(transform.scale - 0.25);
      } else {
        resetTransform();
      }
    });
  });

  zoomRange?.addEventListener("input", () => {
    setScale((Number(zoomRange.value) || 100) / 100);
  });

  viewerViewport.addEventListener(
    "wheel",
    (event) => {
      if (!isOpen) {
        return;
      }
      event.preventDefault();
      const nextScale = transform.scale + (event.deltaY < 0 ? 0.2 : -0.2);
      setScale(nextScale, event.clientX, event.clientY);
    },
    { passive: false },
  );

  viewerViewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || transform.scale <= ASTRO_MIN_ZOOM) {
      return;
    }
    if (event.target instanceof Element && event.target.closest(".astro-overlay__label, .astro-overlay__hotspot, .astro-selection__link")) {
      return;
    }
    event.preventDefault();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
      pointerId: event.pointerId,
    };
    viewerViewport.setPointerCapture(event.pointerId);
    requestTransform();
  });

  viewerViewport.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    event.preventDefault();
    transform.x = dragState.originX + (event.clientX - dragState.startX);
    transform.y = dragState.originY + (event.clientY - dragState.startY);
    requestTransform();
  });

  const endDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    dragState = null;
    requestTransform();
  };

  viewerViewport.addEventListener("pointerup", endDrag);
  viewerViewport.addEventListener("pointercancel", endDrag);
  viewerViewport.addEventListener("pointerleave", () => {
    if (!dragState) {
      viewerViewport.dataset.dragging = "false";
    }
  });

  let minimapDrag = null;
  const updateFromMinimapEvent = (event) => {
    const frame = minimapImage?.closest(".astro-viewer__minimap-frame");
    if (!frame) {
      return;
    }
    const rect = frame.getBoundingClientRect();
    const normX = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const normY = (event.clientY - rect.top) / Math.max(rect.height, 1);
    moveViewportTo(normX, normY);
  };

  minimapImage?.closest(".astro-viewer__minimap-frame")?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    minimapDrag = { pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromMinimapEvent(event);
  });

  minimapImage?.closest(".astro-viewer__minimap-frame")?.addEventListener("pointermove", (event) => {
    if (!minimapDrag || event.pointerId !== minimapDrag.pointerId) {
      return;
    }
    event.preventDefault();
    updateFromMinimapEvent(event);
  });

  const endMinimapDrag = (event) => {
    if (!minimapDrag || event.pointerId !== minimapDrag.pointerId) {
      return;
    }
    minimapDrag = null;
  };

  minimapImage?.closest(".astro-viewer__minimap-frame")?.addEventListener("pointerup", endMinimapDrag);
  minimapImage?.closest(".astro-viewer__minimap-frame")?.addEventListener("pointercancel", endMinimapDrag);

  document.addEventListener("keydown", (event) => {
    if (!isOpen) {
      return;
    }

    if (event.key === "Escape") {
      closeViewer();
      return;
    }
    if (event.key === "ArrowLeft") {
      stepViewer(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      stepViewer(1);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      setScale(transform.scale + 0.25);
      return;
    }
    if (event.key === "-") {
      setScale(transform.scale - 0.25);
    }
  });

  viewerImage.addEventListener("load", () => {
    if (!activeItem) {
      return;
    }
    viewerImage.style.transform = "";
    overlayController.refresh();
    syncMinimap();
  });

  window.addEventListener("resize", () => {
    if (!isOpen) {
      return;
    }
    requestTransform();
    overlayController.refresh();
  });

  renderCards();
  syncToggleButtons();
}
