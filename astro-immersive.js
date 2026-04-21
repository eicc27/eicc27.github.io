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

  channels.forEach(({ key, stroke, fill }) => {
    const values = histogram[key] || [];
    if (!values.length) {
      return;
    }

    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - (Number(value) / maxCount) * (height - 4) - 2;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.lineTo(width, height - 1);
    context.lineTo(0, height - 1);
    context.closePath();
    context.fillStyle = fill;
    context.fill();

    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - (Number(value) / maxCount) * (height - 4) - 2;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.strokeStyle = stroke;
    context.lineWidth = 1.5;
    context.stroke();
  });
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
  const closeButtons = Array.from(document.querySelectorAll("[data-astro-viewer-close]"));
  const prevButton = document.querySelector("[data-astro-viewer-prev]");
  const nextButton = document.querySelector("[data-astro-viewer-next]");
  const toggleButtons = Array.from(document.querySelectorAll("[data-astro-toggle]"));
  const zoomButtons = Array.from(document.querySelectorAll("[data-astro-zoom]"));
  const zoomReadout = document.querySelector("[data-astro-zoom-readout]");
  const minimapImage = document.querySelector("[data-astro-minimap-image]");
  const minimapViewport = document.querySelector("[data-astro-minimap-viewport]");
  const histogramCanvas = document.querySelector("[data-astro-histogram]");
  const hoverCard = document.querySelector("[data-astro-hover]");
  const hoverEyebrow = document.querySelector("[data-astro-hover-eyebrow]");
  const hoverTitle = document.querySelector("[data-astro-hover-title]");
  const hoverDetail = document.querySelector("[data-astro-hover-detail]");
  const hoverMeta = document.querySelector("[data-astro-hover-meta]");
  const dwellBar = document.querySelector("[data-astro-dwell-bar]");
  const dwellCta = document.querySelector("[data-astro-dwell-cta]");

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
  let dwellAnimFrame = null;
  let activeDwellPayload = null;

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
    hoverCard.classList.remove("astro-hovercard--dwelling", "astro-hovercard--ready");
    delete hoverCard.dataset.accent;
    activeDwellPayload = null;
    if (dwellBar) {
      dwellBar.style.animation = "none";
    }
    if (dwellCta) {
      dwellCta.textContent = "";
      dwellCta.hidden = true;
    }
  }

  function positionHoverCard(labelRect) {
    if (!hoverCard || !viewerStage) {
      return;
    }
    const stageRect = viewerStage.getBoundingClientRect();
    const cardWidth = hoverCard.offsetWidth || 280;
    const cardHeight = hoverCard.offsetHeight || 160;
    const edge = 14;

    let x = labelRect.right - stageRect.left + 10;
    let y = labelRect.top - stageRect.top - cardHeight * 0.5 + labelRect.height * 0.5;

    if (x + cardWidth + edge > stageRect.width) {
      x = labelRect.left - stageRect.left - cardWidth - 10;
    }
    if (y + cardHeight + edge > stageRect.height) {
      y = stageRect.height - cardHeight - edge;
    }
    if (y < edge) {
      y = edge;
    }

    hoverCard.style.setProperty("--astro-hover-x", `${clamp(x, edge, Math.max(edge, stageRect.width - cardWidth - edge)).toFixed(2)}px`);
    hoverCard.style.setProperty("--astro-hover-y", `${y.toFixed(2)}px`);
  }

  function renderHoverCard(payload) {
    if (!hoverCard || !viewerStage) {
      return;
    }

    if (!payload) {
      hideHoverCard();
      return;
    }

    activeDwellPayload = payload;
    hoverCard.hidden = false;
    hoverCard.dataset.accent = payload.accent || "cyan";
    hoverCard.classList.remove("astro-hovercard--ready");
    hoverCard.classList.add("astro-hovercard--dwelling");

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
    if (dwellCta) {
      dwellCta.textContent = "";
      dwellCta.hidden = true;
    }
    if (dwellBar) {
      dwellBar.style.animation = "none";
      // Force reflow to restart animation
      void dwellBar.offsetWidth;
      dwellBar.style.animation = "";
    }

    if (payload.labelRect) {
      positionHoverCard(payload.labelRect);
    }
  }

  function onDwellComplete(payload) {
    if (!hoverCard || !activeDwellPayload) {
      return;
    }
    hoverCard.classList.remove("astro-hovercard--dwelling");
    hoverCard.classList.add("astro-hovercard--ready");

    if (dwellCta && payload.docUrl) {
      const source = payload.docSource || "documentation";
      dwellCta.textContent = `Open ${source} →`;
      dwellCta.hidden = false;
    }

    if (payload.labelRect) {
      positionHoverCard(payload.labelRect);
    }
  }

  const overlayController = createAstroOverlayController({
    photoCard: viewerCard,
    imageNode: viewerImage,
    layerNode: viewerOverlay,
    onHover: renderHoverCard,
    onDwellComplete,
    onLeave: hideHoverCard,
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

    zoomReadout.textContent = `${transform.scale.toFixed(2)}×`;
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

    hideHoverCard();
    overlayController.setImage({ annotationKey: item.id });
    overlayController.setFilters(filters);
    renderHistogram(histogramCanvas, item.metadata?.histogram);
    resetTransform();
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
    if (event.target instanceof Element && event.target.closest(".astro-overlay__label, .astro-overlay__hotspot")) {
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
