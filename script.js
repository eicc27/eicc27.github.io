import { initAstroImmersive } from "./astro-immersive.js";
import { initBirdsGallery } from "./birds-gallery.js";
import { initDayCycleTheme } from "./daycycle.js";
import { createImmersivePreviewScene } from "./immersive-preview-scene.js";
import { initPhotoDecks } from "./photo-decks.js";
import { createStudioScene } from "./studio-scene.js";
import { initTimelapseStopwatch } from "./timelapse-stopwatch.js?v=20260420i";

document.documentElement.classList.add("js-enabled");

const yearNode = document.querySelector("#year");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const revealNodes = document.querySelectorAll(".reveal");
const studioScrollShell = document.querySelector("[data-studio-scroll]");
const studioStage = document.querySelector("[data-studio-stage]");
const studioMap = document.querySelector("[data-studio-map]");
const studioMapLight = document.querySelector("[data-studio-map-light]");
const studioSpaceLight = document.querySelector("[data-studio-space-light]");
const studioViewLabel = document.querySelector("[data-studio-view-label]");
const studioCanvas = document.querySelector("#studio-canvas");
const studioHoverCard = document.querySelector("[data-studio-hover]");
const studioHoverEyebrow = document.querySelector("[data-studio-hover-eyebrow]");
const studioHoverTitle = document.querySelector("[data-studio-hover-title]");
const studioHoverDetail = document.querySelector("[data-studio-hover-detail]");
const studioHoverMeta = document.querySelector("[data-studio-hover-meta]");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const immersiveSection = document.querySelector("#immersive");
const immersiveScrollShell = document.querySelector("[data-immersive-scroll]");
const immersivePreviewStage = document.querySelector("[data-immersive-stage]");
const immersivePreviewSurface = document.querySelector("[data-immersive-surface]");
const immersivePreviewCanvas = document.querySelector("#immersive-preview-canvas");
const immersiveField = document.querySelector("[data-immersive-field]");
const immersivePhotos = Array.from(document.querySelectorAll("[data-immersive-photo]"));
let immersivePreviewScene = null;
let immersivePreviewPromise = null;
let immersivePreviewVisible = false;
let studioFrame = 0;
let immersivePreviewFrame = 0;
let studioScene = null;
let studioScenePromise = null;
let currentStudioState = {
  progress: 0,
  camera: 0,
  blackout: 0,
  glass: 0,
  configuration: 0.34,
  lift: 0,
  dissolve: 0,
  restore: 0,
};
let currentStudioPointer = {
  x: 0.5,
  y: 0.34,
};
let isStudioPointerActive = false;
let currentImmersivePreviewState = {
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
const STUDIO_STATE_EPSILON = 0.0015;
const STUDIO_POINTER_EPSILON = 0.002;
const IMMERSIVE_POINTER_EPSILON = 0.004;
const studioStyleCache = Object.create(null);
let studioPointerFrame = 0;
let pendingStudioPointer = null;
const studioLightStyleCache = Object.create(null);
const studioHoverStyleCache = Object.create(null);
let currentStudioHoverPoint = null;
let immersivePointerFrame = 0;
let pendingImmersivePointer = null;
let currentImmersivePointer = {
  x: 0.5,
  y: 0.5,
};
const IMMERSIVE_PHOTO_MOTION = [
  { appearStart: 0.42, appearSpan: 0.14, entryX: -36, entryY: 22, pointerX: -20, pointerY: -14, rotate: -7, depth: 22, scale: 0.92 },
  { appearStart: 0.49, appearSpan: 0.14, entryX: 34, entryY: 18, pointerX: 18, pointerY: 12, rotate: 5, depth: 20, scale: 0.94 },
];

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

initDayCycleTheme();

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const expanded = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!expanded));
    navLinks.classList.toggle("is-open");
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navToggle.setAttribute("aria-expanded", "false");
      navLinks.classList.remove("is-open");
    });
  });
}

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const shouldShow = entry.isIntersecting && entry.intersectionRatio > 0.12;
        entry.target.classList.toggle("is-visible", shouldShow);
      });
    },
    {
      threshold: [0, 0.12, 0.24, 0.48],
      rootMargin: "0px 0px -8% 0px",
    }
  );

  revealNodes.forEach((node) => revealObserver.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add("is-visible"));
}

async function ensureImmersivePreviewScene() {
  if (!immersivePreviewCanvas) {
    return null;
  }

  if (immersivePreviewScene) {
    return immersivePreviewScene;
  }

  if (!immersivePreviewPromise) {
    immersivePreviewPromise = createImmersivePreviewScene({
      canvas: immersivePreviewCanvas,
      prefersReducedMotion: reducedMotionQuery.matches,
    })
      .then((scene) => {
        immersivePreviewScene = scene;
        scene.setProgress?.(currentImmersivePreviewState);
        return scene;
      })
      .catch((error) => {
        console.error("Failed to initialize immersive preview scene:", error);
        immersivePreviewPromise = null;
        return null;
      });
  }

  return immersivePreviewPromise;
}

function setImmersivePreviewActive(active) {
  if (immersivePreviewVisible === active) {
    return;
  }

  immersivePreviewVisible = active;

  ensureImmersivePreviewScene().then((scene) => {
    if (!scene) {
      return;
    }

    if (active && document.visibilityState === "visible") {
      scene.start();
      return;
    }

    scene.stop();
  });
}

if (immersivePreviewCanvas && immersivePreviewSurface) {
  ensureImmersivePreviewScene();

  if ("IntersectionObserver" in window) {
    const immersivePreviewObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setImmersivePreviewActive(entry.isIntersecting && entry.intersectionRatio > 0.08);
        });
      },
      {
        threshold: [0, 0.08, 0.2, 0.4],
      }
    );

    immersivePreviewObserver.observe(immersivePreviewSurface);
  } else {
    setImmersivePreviewActive(true);
  }
}

function easeInOutCubic(value) {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function isDarkThemeActive() {
  return document.documentElement.dataset.theme === "dark";
}

function getStudioThemeBaseline() {
  if (!isDarkThemeActive()) {
    return {
      blackout: 0,
      glass: 0,
      spotlight: 0.2,
    };
  }

  return {
    blackout: 0.84,
    glass: 0.12,
    spotlight: 0.14,
  };
}

function getImmersiveThemeBaseline() {
  if (!isDarkThemeActive()) {
    return {
      darkness: 0,
      glass: 0,
    };
  }

  return {
    darkness: 0.92,
    glass: 0.08,
  };
}

function setCachedStyleValue(node, cache, name, value) {
  if (!node) {
    return false;
  }

  if (cache[name] === value) {
    return false;
  }

  cache[name] = value;
  node.style.setProperty(name, value);
  return true;
}

function setNumericStyleVar(node, cache, name, value, digits = 4, suffix = "") {
  return setCachedStyleValue(node, cache, name, `${value.toFixed(digits)}${suffix}`);
}

function setStyleProperty(node, cache, cacheKey, property, value) {
  if (!node) {
    return;
  }

  if (cache[cacheKey] === value) {
    return;
  }

  cache[cacheKey] = value;
  node.style[property] = value;
}

function hasStudioStateDelta(nextState, previousState) {
  return Object.keys(nextState).some(
    (key) => Math.abs((nextState[key] ?? 0) - (previousState[key] ?? 0)) > STUDIO_STATE_EPSILON
  );
}

function updateStudioLightElements(pointer) {
  if (studioMapLight && studioMap) {
    const mapX = pointer.x * studioMap.clientWidth;
    const mapY = pointer.y * studioMap.clientHeight;
    const mapTransform = `translate3d(${mapX.toFixed(2)}px, ${mapY.toFixed(2)}px, 0) translate3d(-50%, -50%, 0)`;
    setStyleProperty(studioMapLight, studioLightStyleCache, "mapTransform", "transform", mapTransform);
  }

  if (studioSpaceLight && studioMap) {
    const spaceX = pointer.x * studioMap.clientWidth;
    const spaceY = pointer.y * studioMap.clientHeight;
    const spaceTransform = `translate3d(${spaceX.toFixed(2)}px, ${spaceY.toFixed(2)}px, 0) translate3d(-50%, -50%, 0)`;
    setStyleProperty(studioSpaceLight, studioLightStyleCache, "spaceTransform", "transform", spaceTransform);
  }
}

function hideStudioHoverCard() {
  if (!studioHoverCard) {
    return;
  }

  studioHoverCard.hidden = true;
  delete studioHoverCard.dataset.align;
}

function renderStudioHoverCard(payload) {
  if (!studioHoverCard || !studioMap) {
    return;
  }

  if (!payload) {
    hideStudioHoverCard();
    return;
  }

  if (studioHoverEyebrow) {
    studioHoverEyebrow.textContent = payload.eyebrow ?? "";
  }

  if (studioHoverTitle) {
    studioHoverTitle.textContent = payload.title ?? "";
  }

  if (studioHoverDetail) {
    studioHoverDetail.textContent = payload.detail ?? "";
  }

  if (studioHoverMeta) {
    studioHoverMeta.innerHTML = (payload.meta ?? []).map((item) => `<span>${item}</span>`).join("");
  }

  studioHoverCard.hidden = false;

  const pointerX = currentStudioHoverPoint?.x ?? payload.x ?? studioMap.clientWidth * 0.5;
  const pointerY = currentStudioHoverPoint?.y ?? payload.y ?? studioMap.clientHeight * 0.5;
  const cardWidth = studioHoverCard.offsetWidth || 260;
  const cardHeight = studioHoverCard.offsetHeight || 160;
  const edgePadding = 12;
  const pointerOffsetX = 18;
  const pointerOffsetY = 14;
  let tooltipX = pointerX + pointerOffsetX;
  let tooltipY = pointerY + pointerOffsetY;

  if (tooltipX + cardWidth + edgePadding > studioMap.clientWidth) {
    tooltipX = pointerX - cardWidth - pointerOffsetX;
  }

  if (tooltipY + cardHeight + edgePadding > studioMap.clientHeight) {
    tooltipY = pointerY - cardHeight - pointerOffsetY;
  }

  const clampedX = Math.min(
    Math.max(tooltipX, edgePadding),
    Math.max(edgePadding, studioMap.clientWidth - cardWidth - edgePadding)
  );
  const clampedY = Math.min(
    Math.max(tooltipY, edgePadding),
    Math.max(edgePadding, studioMap.clientHeight - cardHeight - edgePadding)
  );

  setCachedStyleValue(studioHoverCard, studioHoverStyleCache, "--studio-hover-x", `${clampedX.toFixed(2)}px`);
  setCachedStyleValue(studioHoverCard, studioHoverStyleCache, "--studio-hover-y", `${clampedY.toFixed(2)}px`);
}

function setStudioPointer(x, y, active = true) {
  const nextPointer = {
    x: clamp01(x),
    y: clamp01(y),
  };

  isStudioPointerActive = active;

  if (
    Math.abs(nextPointer.x - currentStudioPointer.x) < STUDIO_POINTER_EPSILON &&
    Math.abs(nextPointer.y - currentStudioPointer.y) < STUDIO_POINTER_EPSILON
  ) {
    studioScene?.setPointer?.(currentStudioPointer, { active: isStudioPointerActive });
    return;
  }

  currentStudioPointer = nextPointer;
  updateStudioLightElements(currentStudioPointer);
  studioScene?.setPointer?.(currentStudioPointer, { active: isStudioPointerActive });
}

function flushStudioPointer() {
  studioPointerFrame = 0;

  if (!pendingStudioPointer) {
    return;
  }

  const pointer = pendingStudioPointer;
  pendingStudioPointer = null;
  setStudioPointer(pointer.x, pointer.y, pointer.active);
}

function requestStudioPointerUpdate(x, y, active = true) {
  pendingStudioPointer = {
    x,
    y,
    active,
  };

  if (studioPointerFrame) {
    return;
  }

  studioPointerFrame = window.requestAnimationFrame(flushStudioPointer);
}

async function ensureStudioScene() {
  if (!studioCanvas) {
    return null;
  }

  if (studioScene) {
    return studioScene;
  }

  if (!studioScenePromise) {
    studioScenePromise = createStudioScene({
      canvas: studioCanvas,
      prefersReducedMotion: reducedMotionQuery.matches,
      onHover: renderStudioHoverCard,
    })
      .then((scene) => {
        studioScene = scene;
        scene.setProgress(currentStudioState);
        scene.setPointer?.(currentStudioPointer, { active: isStudioPointerActive });
        return scene;
      })
      .catch((error) => {
        console.error("Failed to initialize studio scene:", error);
        studioScenePromise = null;
        return null;
      });
  }

  return studioScenePromise;
}

function setStudioProgress(progressValue) {
  if (!studioScrollShell) {
    return;
  }

  const progress = clamp01(progressValue);
  const studioThemeBaseline = getStudioThemeBaseline();
  const camera = easeInOutCubic(clamp01((progress - 0.32) / 0.32));
  const glass = clamp01(easeInOutCubic(clamp01((progress - 0.26) / 0.22)) + studioThemeBaseline.glass);
  const configuration = clamp01(
    0.34 + easeInOutCubic(clamp01((progress - 0.22) / 0.3)) * 0.66
  );
  const lift = easeInOutCubic(clamp01((progress - 0.78) / 0.11));
  const dissolve = easeInOutCubic(clamp01((progress - 0.84) / 0.1));
  const restore = easeInOutCubic(clamp01((progress - 0.92) / 0.08));
  const blackoutRamp = easeInOutCubic(clamp01((progress - 0.28) / 0.3));
  const blackout = clamp01(Math.max(blackoutRamp * 1.08 - restore * 1.02, studioThemeBaseline.blackout));
  const nextState = {
    progress,
    camera,
    blackout,
    glass,
    configuration: configuration * (1 - dissolve),
    lift: lift * (1 - restore),
    dissolve,
    restore,
  };
  const grid = clamp01(1 - glass * 0.48 - blackout * 0.14 + restore * 0.34);
  const spotlight = clamp01(studioThemeBaseline.spotlight + glass * 0.3 - restore * 0.06);
  const hasStateDelta = hasStudioStateDelta(nextState, currentStudioState);

  currentStudioState = nextState;

  if (hasStateDelta || !studioScene) {
    setNumericStyleVar(studioScrollShell, studioStyleCache, "--studio-progress", progress);
    setNumericStyleVar(studioScrollShell, studioStyleCache, "--studio-camera", camera);
    setNumericStyleVar(studioScrollShell, studioStyleCache, "--studio-blackout", blackout);
    setNumericStyleVar(studioScrollShell, studioStyleCache, "--studio-glass", glass);
    setNumericStyleVar(studioScrollShell, studioStyleCache, "--studio-config", currentStudioState.configuration);
    setNumericStyleVar(studioScrollShell, studioStyleCache, "--studio-lift", currentStudioState.lift);
    setNumericStyleVar(studioScrollShell, studioStyleCache, "--studio-dissolve", dissolve);
    setNumericStyleVar(studioScrollShell, studioStyleCache, "--studio-restore", restore);
    setNumericStyleVar(studioScrollShell, studioStyleCache, "--studio-grid", grid);
    setNumericStyleVar(studioScrollShell, studioStyleCache, "--studio-spotlight", spotlight);
    studioScene?.setProgress(currentStudioState);
  }

  if (!studioViewLabel) {
    if (!studioScene) {
      ensureStudioScene();
    }
    return;
  }

  if (restore >= 0.4) {
    studioViewLabel.textContent = "Returning to page";
    return;
  }

  if (currentStudioState.lift >= 0.16) {
    studioViewLabel.textContent = "Field drift";
    return;
  }

  if (camera >= 0.98) {
    studioViewLabel.textContent = "Top view";
    return;
  }

  if (camera >= 0.18) {
    studioViewLabel.textContent = "Lifting camera";
    return;
  }

  studioViewLabel.textContent = "Perspective view";

  if (!studioScene) {
    ensureStudioScene();
  }
}

function updateStudioCamera() {
  studioFrame = 0;

  if (!studioScrollShell || !studioStage) {
    return;
  }

  if (reducedMotionQuery.matches || window.innerWidth <= 1080) {
    setStudioProgress(0.54);
    ensureStudioScene();
    return;
  }

  const rect = studioStage.getBoundingClientRect();
  const viewportBuffer = Math.max(window.innerHeight * 0.35, 220);

  if (rect.top > window.innerHeight + viewportBuffer || rect.bottom < -viewportBuffer) {
    return;
  }

  const travel = Math.max(studioStage.offsetHeight - window.innerHeight, 1);
  const progress = Math.max(0, Math.min(1, -rect.top / travel));
  setStudioProgress(progress);
}

function requestStudioCameraUpdate() {
  if (studioFrame) {
    return;
  }

  studioFrame = window.requestAnimationFrame(updateStudioCamera);
}

function setImmersivePointer(x, y) {
  const nextPointer = {
    x: clamp01(x),
    y: clamp01(y),
  };

  if (
    Math.abs(nextPointer.x - currentImmersivePointer.x) < IMMERSIVE_POINTER_EPSILON &&
    Math.abs(nextPointer.y - currentImmersivePointer.y) < IMMERSIVE_POINTER_EPSILON
  ) {
    return;
  }

  currentImmersivePointer = nextPointer;
  immersivePreviewScene?.setPointer?.({
    x: (currentImmersivePointer.x - 0.5) * 2,
    y: (0.5 - currentImmersivePointer.y) * 2,
  });
  updateImmersivePhotoField(currentImmersivePreviewState);
}

function flushImmersivePointer() {
  immersivePointerFrame = 0;

  if (!pendingImmersivePointer) {
    return;
  }

  const pointer = pendingImmersivePointer;
  pendingImmersivePointer = null;
  setImmersivePointer(pointer.x, pointer.y);
}

function requestImmersivePointerUpdate(x, y) {
  pendingImmersivePointer = {
    x,
    y,
  };

  if (immersivePointerFrame) {
    return;
  }

  immersivePointerFrame = window.requestAnimationFrame(flushImmersivePointer);
}

function updateImmersivePhotoField(state) {
  if (!immersivePhotos.length) {
    return;
  }

  const pointerX = (currentImmersivePointer.x - 0.5) * 2;
  const pointerY = (currentImmersivePointer.y - 0.5) * 2;
  const pointerReady = easeInOutCubic(clamp01((state.reveal - 0.52) / 0.16)) * (1 - state.restore * 0.88);

  if (immersiveField) {
    immersiveField.style.opacity = clamp01(0.12 + state.carousel * 0.92).toFixed(4);
  }

  immersivePhotos.forEach((photo, index) => {
    const config = IMMERSIVE_PHOTO_MOTION[index] ?? IMMERSIVE_PHOTO_MOTION[IMMERSIVE_PHOTO_MOTION.length - 1];
    const appear = easeInOutCubic(clamp01((state.progress - config.appearStart) / config.appearSpan)) * state.carousel;
    const opacity = appear * (0.5 + state.darkness * 0.42) * (1 - state.restore * 0.92);
    const translateX = (1 - appear) * config.entryX + pointerX * config.pointerX * pointerReady;
    const translateY = (1 - appear) * config.entryY + pointerY * config.pointerY * pointerReady;
    const depth = -config.depth + appear * config.depth;
    const scale = config.scale + appear * 0.08 + pointerReady * 0.016 - state.restore * 0.05;
    const rotate = config.rotate + pointerX * 2.6 * pointerReady;

    photo.style.opacity = opacity.toFixed(4);
    photo.style.transform =
      `translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, ${depth.toFixed(2)}px) ` +
      `rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    photo.classList.toggle("is-visible", opacity > 0.08);
  });
}

function setImmersivePreviewProgress(progressValue) {
  if (!immersiveScrollShell) {
    return;
  }

  const progress = clamp01(progressValue);
  const immersiveThemeBaseline = getImmersiveThemeBaseline();
  const glass = clamp01(easeInOutCubic(clamp01((progress - 0.24) / 0.18)) + immersiveThemeBaseline.glass);
  const reveal = easeInOutCubic(clamp01((progress - 0.14) / 0.24));
  const tunnel = easeInOutCubic(clamp01((progress - 0.34) / 0.24));
  const portal = easeInOutCubic(clamp01((progress - 0.42) / 0.24));
  const restore = easeInOutCubic(clamp01((progress - 0.9) / 0.1));
  const darkness = clamp01(
    Math.max(easeInOutCubic(clamp01((progress - 0.26) / 0.32)) * 0.96 - restore * 0.98, immersiveThemeBaseline.darkness)
  );
  const carousel = clamp01(portal * (1 - restore * 0.9));
  const scale = 1;
  const slideWindow = clamp01((progress - 0.56) / 0.28);

  currentImmersivePreviewState = {
    progress,
    darkness,
    glass,
    reveal,
    tunnel,
    restore,
    carousel,
    scale,
    slideWindow,
  };

  immersiveScrollShell.style.setProperty("--immersive-progress", progress.toFixed(4));
  immersiveScrollShell.style.setProperty("--immersive-darkness", darkness.toFixed(4));
  immersiveScrollShell.style.setProperty("--immersive-glass", glass.toFixed(4));
  immersiveScrollShell.style.setProperty("--immersive-reveal", reveal.toFixed(4));
  immersiveScrollShell.style.setProperty("--immersive-tunnel", tunnel.toFixed(4));
  immersiveScrollShell.style.setProperty("--immersive-restore", restore.toFixed(4));
  immersiveScrollShell.style.setProperty("--immersive-carousel", carousel.toFixed(4));
  immersiveScrollShell.style.setProperty("--immersive-square-scale", scale.toFixed(4));

  updateImmersivePhotoField(currentImmersivePreviewState);
  immersivePreviewScene?.setProgress?.(currentImmersivePreviewState);
}

function updateImmersivePreviewProgress() {
  immersivePreviewFrame = 0;

  if (!immersiveScrollShell || !immersivePreviewStage) {
    return;
  }

  if (reducedMotionQuery.matches || window.innerWidth <= 1080) {
    setImmersivePreviewProgress(0.5);
    ensureImmersivePreviewScene();
    return;
  }

  const rect = immersivePreviewStage.getBoundingClientRect();
  const travel = Math.max(immersivePreviewStage.offsetHeight - window.innerHeight, 1);
  const progress = clamp01(-rect.top / travel);
  setImmersivePreviewProgress(progress);
  ensureImmersivePreviewScene();
}

function requestImmersivePreviewUpdate() {
  if (immersivePreviewFrame) {
    return;
  }

  immersivePreviewFrame = window.requestAnimationFrame(updateImmersivePreviewProgress);
}

const themeObserver = new MutationObserver((mutations) => {
  if (!mutations.some((mutation) => mutation.attributeName === "data-theme")) {
    return;
  }

  requestStudioCameraUpdate();
  requestImmersivePreviewUpdate();
});

themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

if (studioScrollShell && studioStage && studioCanvas) {
  ensureStudioScene();
  setStudioProgress(0.12);
  setStudioPointer(currentStudioPointer.x, currentStudioPointer.y, false);
  requestStudioCameraUpdate();

  window.addEventListener("scroll", requestStudioCameraUpdate, { passive: true });
  window.addEventListener("resize", requestStudioCameraUpdate);
  window.addEventListener("resize", () => {
    updateStudioLightElements(currentStudioPointer);
  });

  if ("addEventListener" in reducedMotionQuery) {
    reducedMotionQuery.addEventListener("change", requestStudioCameraUpdate);
  } else {
    reducedMotionQuery.addListener(requestStudioCameraUpdate);
  }
}

if (studioMap) {
  studioMap.addEventListener("pointermove", (event) => {
    const rect = studioMap.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    currentStudioHoverPoint = {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
    updateStudioLightElements({
      x: clamp01(x),
      y: clamp01(y),
    });
    requestStudioPointerUpdate(x, y, true);
    ensureStudioScene();
  });

  studioMap.addEventListener("pointerleave", () => {
    currentStudioHoverPoint = null;
    updateStudioLightElements({
      x: 0.5,
      y: 0.34,
    });
    requestStudioPointerUpdate(0.5, 0.34, false);
    hideStudioHoverCard();
  });
}

if (immersiveScrollShell && immersivePreviewStage && immersivePreviewCanvas) {
  ensureImmersivePreviewScene();
  requestImmersivePreviewUpdate();

  window.addEventListener("scroll", requestImmersivePreviewUpdate, { passive: true });
  window.addEventListener("resize", requestImmersivePreviewUpdate);

  if ("addEventListener" in reducedMotionQuery) {
    reducedMotionQuery.addEventListener("change", requestImmersivePreviewUpdate);
  } else {
    reducedMotionQuery.addListener(requestImmersivePreviewUpdate);
  }
}

if (immersivePreviewSurface) {
  immersivePreviewSurface.addEventListener("pointermove", (event) => {
    const rect = immersivePreviewSurface.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    requestImmersivePointerUpdate(x, y);
  });

  immersivePreviewSurface.addEventListener("pointerleave", () => {
    requestImmersivePointerUpdate(0.5, 0.5);
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    immersivePreviewScene?.stop();
  } else if (immersivePreviewVisible) {
    immersivePreviewScene?.start();
  }
});

initPhotoDecks({ reducedMotionQuery });
initAstroImmersive();
initBirdsGallery({ reducedMotionQuery });
initTimelapseStopwatch({ reducedMotionQuery });
