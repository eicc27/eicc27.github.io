const CLIP_DURATION = 15;
const SAFE_END_TIME = CLIP_DURATION - 1 / 24;
const REWIND_SPEED = 6.4;
const LIGHTBOX_TRANSITION_MS = 280;
const DETAIL_UPDATE_INTERVAL_MS = 1000 / 24;
const PRELOAD_SCROLL_THRESHOLD = 0.14;
const UI_ARM_SCROLL_THRESHOLD = 0.9;
const VIDEO_SYNC_TOLERANCE = 1 / 30;
const CLOCK_SYNC_TOLERANCE = 0.08;
const VIDEO_META = {
  title: "重庆",
  subtitle: "mountain dusk",
  alt: "重庆日落延时摄影定格帧",
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function mix(start, end, amount) {
  return start + (end - start) * amount;
}

function rangeProgress(value, start, end) {
  if (end === start) {
    return value >= end ? 1 : 0;
  }

  return clamp01((value - start) / (end - start));
}

function easeInOutCubic(value) {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function setCachedStyleValue(node, cache, name, value) {
  if (cache[name] === value) {
    return;
  }

  cache[name] = value;
  node.style.setProperty(name, value);
}

function setNumericStyleVar(node, cache, name, value, digits = 4, suffix = "") {
  setCachedStyleValue(node, cache, name, `${value.toFixed(digits)}${suffix}`);
}

export function initTimelapseStopwatch({ reducedMotionQuery } = {}) {
  const root = document.querySelector("[data-timelapse-root]");
  if (!root) {
    return;
  }

  const scrollShell = root.querySelector("[data-timelapse-scroll]");
  const stage = root.querySelector("[data-timelapse-stage]");
  const segment = root.querySelector("[data-timelapse-segment]");
  const video = root.querySelector("[data-timelapse-video]");
  const freezePreview = root.querySelector("[data-timelapse-freeze-preview]");
  const secondsNode = root.querySelector("[data-timelapse-seconds]");
  const secondsGhostNode = root.querySelector("[data-timelapse-seconds-ghost]");
  const timeNode = root.querySelector("[data-timelapse-time]");
  const statusNode = root.querySelector("[data-timelapse-status]");
  const captionNode = root.querySelector("[data-timelapse-caption]");
  const invertWash = root.querySelector("[data-timelapse-invert]");
  const lightbox = root.querySelector("[data-timelapse-lightbox]");
  const lightboxSheet = root.querySelector("[data-timelapse-lightbox-sheet]");
  const lightboxCard = root.querySelector("[data-timelapse-lightbox-card]");
  const lightboxLight = root.querySelector("[data-timelapse-lightbox-light]");
  const lightboxImage = root.querySelector("[data-timelapse-lightbox-image]");
  const lightboxTitle = root.querySelector("[data-timelapse-lightbox-title]");
  const lightboxTime = root.querySelector("[data-timelapse-lightbox-time]");
  const lightboxCloseNodes = Array.from(root.querySelectorAll("[data-timelapse-lightbox-close]"));
  const ringNode = root.querySelector(".timelapse-ring");

  if (
    !scrollShell ||
    !stage ||
    !segment ||
    !video ||
    !freezePreview ||
    !secondsNode ||
    !secondsGhostNode ||
    !timeNode ||
    !invertWash ||
    !lightbox ||
    !lightboxSheet ||
    !lightboxCard ||
    !lightboxLight ||
    !lightboxImage ||
    !lightboxTitle ||
    !lightboxTime ||
    !ringNode
  ) {
    return;
  }

  const styleCache = Object.create(null);
  const captureCanvas = document.createElement("canvas");
  const captureContext = captureCanvas.getContext("2d", { alpha: false, desynchronized: true });

  let state = "idle";
  let currentTime = 0;
  let scrollProgress = 0;
  let sectionVisible = false;
  let videoLoaded = false;
  let loadPromise = null;
  let visibilityPaused = false;
  let displayLoopId = 0;
  let rewindFrameId = 0;
  let scrollFrameId = 0;
  let lightboxTimer = 0;
  let lightboxPointerFrame = 0;
  let playRequestToken = 0;
  let playbackClockStartedAt = 0;
  let playbackOriginTime = 0;
  let lastStatusState = "";
  let lastDetailPaintAt = 0;
  let lastRenderedCounterValue = CLIP_DURATION;
  let lastRenderedRemaining = CLIP_DURATION;
  let frozenFrame = null;
  let frozenFramePromise = null;
  let frozenFramePromiseTime = NaN;
  let frozenFrameRequestToken = 0;
  let lightboxActive = false;
  let invertActive = false;
  let invertRefreshPending = false;
  let invertRefreshFrameId = 0;
  let invertGuardFrameId = 0;
  let pendingLightboxPointer = null;
  let lightboxCardRect = null;

  root.setAttribute("data-timelapse-quality", "1080p");
  segment.dataset.showcase = "active";

  function prefersReducedMotion() {
    return Boolean(reducedMotionQuery?.matches);
  }

  function getSeekTime(value) {
    return clamp(value, 0, SAFE_END_TIME);
  }

  function formatCountdown(seconds) {
    const totalHundredths = Math.max(0, Math.round(seconds * 100));
    const minutes = Math.floor(totalHundredths / 6000);
    const wholeSeconds = Math.floor(totalHundredths / 100) % 60;
    const hundredths = totalHundredths % 100;
    return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }

  function resetRenderedCountdown(nextTime) {
    const clampedTime = clamp(nextTime, 0, CLIP_DURATION);
    const remaining = Math.max(0, CLIP_DURATION - clampedTime);
    lastRenderedRemaining = remaining;
    lastRenderedCounterValue = Math.max(0, Math.ceil(remaining - 0.0001));
  }

  function canUseControls() {
    return scrollProgress >= UI_ARM_SCROLL_THRESHOLD || isActivePlaybackState();
  }

  function isEditableTargetNode(target) {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT")
    );
  }

  function shouldSuppressSpaceScroll(event) {
    if (event.code !== "Space" || isEditableTargetNode(event.target)) {
      return false;
    }

    return !lightbox.hidden || sectionVisible || isActivePlaybackState() || scrollProgress >= UI_ARM_SCROLL_THRESHOLD;
  }

  function isFrozenState(value = state) {
    return value === "paused" || value === "ended";
  }

  function isActivePlaybackState(value = state) {
    return value === "playing" || value === "paused" || value === "ended" || value === "rewinding";
  }

  function shouldFreezeSceneProgress(value = state) {
    return value === "rewinding";
  }

  function shouldHoldFinalComposition(value = state) {
    return shouldFreezeSceneProgress(value);
  }

  function resetPlaybackClock(originTime, timestamp = performance.now()) {
    playbackOriginTime = clamp(originTime, 0, CLIP_DURATION);
    playbackClockStartedAt = timestamp;
  }

  function stopPlaybackClock(anchorTime = currentTime) {
    playbackOriginTime = clamp(anchorTime, 0, CLIP_DURATION);
    playbackClockStartedAt = 0;
  }

  function getVideoAnchorTime() {
    if (
      videoLoaded &&
      video.readyState >= 2 &&
      Number.isFinite(video.currentTime)
    ) {
      return clamp(video.currentTime, 0, CLIP_DURATION);
    }

    return clamp(currentTime, 0, CLIP_DURATION);
  }

  function getPlaybackAnchorTime(timestamp = performance.now()) {
    if (state === "playing" && playbackClockStartedAt > 0) {
      const elapsedSeconds = Math.max(0, (timestamp - playbackClockStartedAt) / 1000);
      return clamp(playbackOriginTime + elapsedSeconds, 0, CLIP_DURATION);
    }

    return getVideoAnchorTime();
  }

  function updateScrollbarCompensation() {
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.documentElement.style.setProperty("--timelapse-scrollbar-comp", `${scrollbarWidth}px`);
  }

  function getStageStickyBounds() {
    const stageTop = stage.getBoundingClientRect().top + window.scrollY;
    const travel = Math.max(stage.offsetHeight - window.innerHeight, 0);
    return {
      min: stageTop,
      max: stageTop + travel,
    };
  }

  function stabilizeSceneScroll() {
    const { min, max } = getStageStickyBounds();
    const target = clamp(window.scrollY, min, max);

    if (Math.abs(target - window.scrollY) > 1) {
      window.scrollTo({
        top: target,
        behavior: "instant",
      });
    }
  }

  function setScrollLock(locked) {
    document.body.classList.toggle("timelapse-scroll-lock", locked);
  }

  function syncSceneLock() {
    const shouldLockScene = state === "rewinding";
    const shouldLockScroll = state === "rewinding" || lightboxActive;
    root.classList.toggle("is-scene-locked", shouldLockScene);
    document.body.classList.toggle("timelapse-focus", sectionVisible || lightboxActive);
    setScrollLock(shouldLockScroll);

    if (!shouldLockScene) {
      return;
    }

    stabilizeSceneScroll();
    window.requestAnimationFrame(() => {
      requestScrollSceneUpdate();
    });
  }

  function setState(nextState) {
    state = nextState;
    root.dataset.timelapseState = nextState;
    root.classList.toggle("is-freeze-ready", isFrozenState(nextState));
    root.classList.toggle("is-holding-final", shouldHoldFinalComposition(nextState));
    root.classList.toggle("is-controls-armed", canUseControls());
    syncSceneLock();
    syncInvertGuard();
    updateStatus();
  }

  function updateStatus(force = false) {
    if (!force && lastStatusState === state) {
      return;
    }

    lastStatusState = state;

    if (state === "loading") {
      if (statusNode) {
        statusNode.textContent = "重庆日落正在准备";
      }
      if (captionNode) {
        captionNode.textContent = "正在载入视频与定格预览。";
      }
      return;
    }

    if (state === "playing") {
      if (statusNode) {
        statusNode.textContent = "日落正在向夜色计时";
      }
      if (captionNode) {
        captionNode.textContent = "按空格定格这一秒，按 R 倒带。";
      }
      return;
    }

    if (state === "paused") {
      if (statusNode) {
        statusNode.textContent = "这一秒已经被定格";
      }
      if (captionNode) {
        captionNode.textContent = "按空格继续，按 R 倒带；点击画面放大查看。";
      }
      return;
    }

    if (state === "rewinding") {
      if (statusNode) {
        statusNode.textContent = `正在以 x${REWIND_SPEED.toFixed(1)} 倒回`;
      }
      if (captionNode) {
        captionNode.textContent = "视频、指针和读秒一起回到起点。";
      }
      return;
    }

    if (state === "ended") {
      if (statusNode) {
        statusNode.textContent = "秒表已经在蓝调时刻停住";
      }
      if (captionNode) {
        captionNode.textContent = "按空格重播，按 R 倒带，或点击画面查看终帧。";
      }
      return;
    }

    if (statusNode) {
      statusNode.textContent = "秒表就绪，等待重庆日落";
    }
    if (captionNode) {
      captionNode.textContent = "继续滚动到秒表完全出现，再按空格开始。";
    }
  }

  function setPanelState(opacity) {
    segment.style.setProperty("--timelapse-panel-top", "0px");
    segment.style.setProperty("--timelapse-panel-bottom", "0px");
    segment.style.setProperty("--timelapse-panel-side", "0px");
    segment.style.setProperty("--timelapse-panel-scale", "1");
    segment.style.setProperty("--timelapse-panel-shift", "0px");
    segment.style.setProperty("--timelapse-panel-opacity", opacity.toFixed(4));
    segment.style.setProperty("--timelapse-panel-radius", "0px");
  }

  function paintProgress(nextTime, { forceText = false } = {}) {
    currentTime = clamp(nextTime, 0, CLIP_DURATION);
    const rawRemaining = Math.max(0, CLIP_DURATION - currentTime);
    const shouldClampDown = state === "playing";
    const remaining = shouldClampDown ? Math.min(rawRemaining, lastRenderedRemaining) : rawRemaining;
    let counterValue = Math.max(0, Math.ceil(remaining - 0.0001));

    if (shouldClampDown) {
      counterValue = Math.min(counterValue, lastRenderedCounterValue);
    }

    lastRenderedCounterValue = counterValue;
    lastRenderedRemaining = remaining;

    const secondsText = String(counterValue).padStart(2, "0");
    const detailText = formatCountdown(remaining);
    const playbackProgress = currentTime / CLIP_DURATION;
    const handAngle = mix(-132, 22, playbackProgress);
    const now = performance.now();

    setNumericStyleVar(root, styleCache, "--timelapse-playback-progress", playbackProgress);
    setCachedStyleValue(root, styleCache, "--timelapse-hand-angle", `${handAngle.toFixed(2)}deg`);

    if (forceText || secondsNode.textContent !== secondsText) {
      secondsNode.textContent = secondsText;
      secondsGhostNode.textContent = secondsText;
    }

    const shouldUpdateDetail =
      forceText || state !== "playing" || now - lastDetailPaintAt >= DETAIL_UPDATE_INTERVAL_MS;

    if (shouldUpdateDetail && timeNode.textContent !== detailText) {
      timeNode.textContent = detailText;
      lastDetailPaintAt = now;
    } else if (forceText) {
      lastDetailPaintAt = now;
    }

    root.classList.toggle("is-controls-armed", canUseControls());
  }

  function applyScrollScene(progressValue) {
    scrollProgress = clamp01(progressValue);
    const holdFinalComposition = shouldHoldFinalComposition();
    const storyFade = easeInOutCubic(rangeProgress(scrollProgress, 0.12, 0.34));
    const videoReveal = easeInOutCubic(rangeProgress(scrollProgress, 0.08, 0.32));
    const pullback = easeInOutCubic(rangeProgress(scrollProgress, 0.14, 0.54));
    const finalStage = easeInOutCubic(rangeProgress(scrollProgress, 0.62, 0.86));
    const counterGhost = easeInOutCubic(rangeProgress(scrollProgress, 0.5, 0.68));
    const counterFill = easeInOutCubic(rangeProgress(scrollProgress, 0.68, 0.84));
    const handReveal = easeInOutCubic(rangeProgress(scrollProgress, 0.42, 0.58));
    const hudReveal = easeInOutCubic(rangeProgress(scrollProgress, 0.74, 0.88));
    const outro = holdFinalComposition ? 1 : 1 - easeInOutCubic(rangeProgress(scrollProgress, 0.985, 1));
    const viewScale = scrollProgress < 0.22
      ? mix(1.54, 1, easeInOutCubic(rangeProgress(scrollProgress, 0.02, 0.22)))
      : 1;
    const viewY = scrollProgress < 0.22
      ? mix(42, 16, easeInOutCubic(rangeProgress(scrollProgress, 0.02, 0.22)))
      : 16;
    const ringDash = mix(0.82, 0.03, easeOutCubic(rangeProgress(scrollProgress, 0.06, 0.88)));
    const ticksOpacity = mix(0.22, 1, easeInOutCubic(rangeProgress(scrollProgress, 0.06, 0.6)));
    const videoOpacity = clamp01(videoReveal * (1 - 0.06 * easeInOutCubic(rangeProgress(scrollProgress, 0.94, 1))));
    const videoScale = mix(1.16, 1.01, pullback);
    const videoShift = mix(104, 0, pullback);
    const counterScale = mix(1.16, 1, finalStage);
    const counterShift = mix(112, 0, pullback);
    const labelOpacity = clamp01(videoReveal) * outro;
    const vignetteOpacity = mix(0.78, 0.48, finalStage);
    const phase =
      scrollProgress < 0.46 ? "arc" : scrollProgress < 0.72 ? "pullback" : "final";

    root.dataset.timelapsePhase = phase;

    setNumericStyleVar(root, styleCache, "--timelapse-scroll-progress", scrollProgress);
    setNumericStyleVar(root, styleCache, "--timelapse-ring-dash", ringDash);
    setNumericStyleVar(root, styleCache, "--timelapse-view-scale", viewScale);
    setCachedStyleValue(root, styleCache, "--timelapse-view-x", "0px");
    setCachedStyleValue(root, styleCache, "--timelapse-view-y", `${viewY.toFixed(2)}vh`);
    setNumericStyleVar(root, styleCache, "--timelapse-story-opacity", 1 - storyFade * 0.92);
    setCachedStyleValue(root, styleCache, "--timelapse-story-shift", `${mix(0, -36, storyFade).toFixed(2)}px`);
    setNumericStyleVar(root, styleCache, "--timelapse-video-opacity", videoOpacity);
    setNumericStyleVar(root, styleCache, "--timelapse-video-scale", videoScale);
    setCachedStyleValue(root, styleCache, "--timelapse-video-shift", `${videoShift.toFixed(2)}px`);
    setNumericStyleVar(root, styleCache, "--timelapse-vignette-opacity", vignetteOpacity);
    setNumericStyleVar(root, styleCache, "--timelapse-ticks-opacity", ticksOpacity);
    setNumericStyleVar(root, styleCache, "--timelapse-counter-ghost-opacity", counterGhost * outro);
    setNumericStyleVar(root, styleCache, "--timelapse-counter-fill-opacity", counterFill * outro);
    setNumericStyleVar(root, styleCache, "--timelapse-counter-scale", counterScale);
    setCachedStyleValue(root, styleCache, "--timelapse-counter-shift", `${counterShift.toFixed(2)}px`);
    setNumericStyleVar(root, styleCache, "--timelapse-detail-opacity", hudReveal * outro);
    setNumericStyleVar(root, styleCache, "--timelapse-hand-opacity", handReveal * outro);
    setNumericStyleVar(root, styleCache, "--timelapse-case-opacity", 0);
    setNumericStyleVar(root, styleCache, "--timelapse-button-opacity", 0);
    setNumericStyleVar(root, styleCache, "--timelapse-hud-opacity", hudReveal * outro);
    setNumericStyleVar(root, styleCache, "--timelapse-label-opacity", labelOpacity);
    setNumericStyleVar(root, styleCache, "--timelapse-divider-opacity", 0);

    setPanelState(videoOpacity);
    root.classList.toggle("is-controls-armed", canUseControls());
  }

  function setInvertOrigin() {
    const rect = ringNode.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const radius =
      Math.hypot(
        Math.max(centerX, window.innerWidth - centerX),
        Math.max(centerY, window.innerHeight - centerY),
      ) + 24;

    invertWash.style.setProperty("--timelapse-invert-x", `${centerX.toFixed(2)}px`);
    invertWash.style.setProperty("--timelapse-invert-y", `${centerY.toFixed(2)}px`);
    invertWash.style.setProperty("--timelapse-invert-radius", `${radius.toFixed(2)}px`);
  }

  function paintInvertState() {
    invertWash.classList.toggle("is-active", invertActive);
    invertWash.classList.toggle("is-reduced", invertActive && prefersReducedMotion());
    invertWash.style.opacity = invertActive ? "0.98" : "0";
    invertWash.style.clipPath = invertActive
      ? "circle(var(--timelapse-invert-radius, 0px) at var(--timelapse-invert-x, 50vw) var(--timelapse-invert-y, 50vh))"
      : "circle(0px at var(--timelapse-invert-x, 50vw) var(--timelapse-invert-y, 50vh))";
    invertWash.style.transition = prefersReducedMotion()
      ? "opacity 180ms ease"
      : "opacity 220ms ease, clip-path 760ms cubic-bezier(0.22, 1, 0.36, 1)";
  }

  function stopInvertGuard() {
    if (!invertGuardFrameId) {
      return;
    }

    window.cancelAnimationFrame(invertGuardFrameId);
    invertGuardFrameId = 0;
  }

  function refreshPausedInvert() {
    invertGuardFrameId = 0;

    if (state !== "paused" || lightboxActive) {
      return;
    }

    invertActive = true;
    setInvertOrigin();
    paintInvertState();
    invertGuardFrameId = window.requestAnimationFrame(refreshPausedInvert);
  }

  function syncInvertGuard() {
    if (state === "paused" && !lightboxActive) {
      if (!invertGuardFrameId) {
        invertGuardFrameId = window.requestAnimationFrame(refreshPausedInvert);
      }
      return;
    }

    stopInvertGuard();
  }

  function activateInvert() {
    setInvertOrigin();
    invertActive = true;
    paintInvertState();
    syncInvertGuard();
  }

  function deactivateInvert({ force = false } = {}) {
    if (!force && state === "paused" && !lightboxActive) {
      return;
    }

    invertActive = false;
    paintInvertState();
    syncInvertGuard();
  }

  function schedulePausedInvertRefresh() {
    if (invertRefreshPending) {
      return;
    }

    const refreshInvert = () => {
      if (state !== "paused" || lightboxActive) {
        return;
      }

      if (!invertActive) {
        activateInvert();
        return;
      }

      setInvertOrigin();
      paintInvertState();
    };

    invertRefreshPending = true;
    queueMicrotask(() => {
      invertRefreshPending = false;
      refreshInvert();
    });

    if (invertRefreshFrameId) {
      return;
    }

    invertRefreshFrameId = window.requestAnimationFrame(() => {
      invertRefreshFrameId = 0;
      refreshInvert();
    });
  }

  function primeFrozenFrame(frameTime, expectedState) {
    if (state !== expectedState) {
      return;
    }

    const immediateFrame = captureFrameDataUrl(frameTime);
    if (immediateFrame) {
      frozenFrameRequestToken += 1;
      frozenFramePromise = null;
      frozenFramePromiseTime = NaN;
      replaceFrozenFrame(immediateFrame);
      return;
    }

    void ensureFrozenFrame(frameTime, { expectedState });
  }

  function releaseFrame(frame) {
    if (typeof frame?.revoke === "function") {
      frame.revoke();
    }
  }

  function renderFrozenPanel() {
    const hasFrame = Boolean(frozenFrame?.src);
    root.classList.toggle("is-frozen", hasFrame);

    if (!hasFrame) {
      freezePreview.removeAttribute("src");
      freezePreview.alt = "";
      return;
    }

    if (freezePreview.src !== frozenFrame.src) {
      freezePreview.src = frozenFrame.src;
    }

    freezePreview.alt = frozenFrame.alt;
  }

  function replaceFrozenFrame(nextFrame) {
    if (frozenFrame && frozenFrame !== nextFrame) {
      releaseFrame(frozenFrame);
    }

    frozenFrame = nextFrame;
    renderFrozenPanel();
  }

  function clearFrozenFrame() {
    frozenFrameRequestToken += 1;
    frozenFramePromise = null;
    frozenFramePromiseTime = NaN;
    replaceFrozenFrame(null);
  }

  function drawFrameToCanvas() {
    if (
      !captureContext ||
      !videoLoaded ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return false;
    }

    if (captureCanvas.width !== video.videoWidth) {
      captureCanvas.width = video.videoWidth;
    }

    if (captureCanvas.height !== video.videoHeight) {
      captureCanvas.height = video.videoHeight;
    }

    captureContext.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    return true;
  }

  async function captureFrameBlob(frameTime = currentTime) {
    if (!drawFrameToCanvas()) {
      return null;
    }

    const blob = await new Promise((resolve) => {
      captureCanvas.toBlob(resolve, "image/jpeg", 0.88);
    });

    if (!blob) {
      return null;
    }

    const objectUrl = URL.createObjectURL(blob);
    return {
      src: objectUrl,
      time: frameTime,
      title: VIDEO_META.title,
      alt: VIDEO_META.alt,
      revoke: () => {
        URL.revokeObjectURL(objectUrl);
      },
    };
  }

  function captureFrameDataUrl(frameTime = currentTime) {
    if (!drawFrameToCanvas()) {
      return null;
    }

    let dataUrl = "";
    try {
      dataUrl = captureCanvas.toDataURL("image/jpeg", 0.84);
    } catch {
      return null;
    }

    if (!dataUrl) {
      return null;
    }

    return {
      src: dataUrl,
      time: frameTime,
      title: VIDEO_META.title,
      alt: VIDEO_META.alt,
      revoke: () => {},
    };
  }

  async function ensureFrozenFrame(frameTime = currentTime, { expectedState = state } = {}) {
    if (frozenFrame && Math.abs(frozenFrame.time - frameTime) <= VIDEO_SYNC_TOLERANCE) {
      return frozenFrame;
    }

    if (
      frozenFramePromise &&
      Number.isFinite(frozenFramePromiseTime) &&
      Math.abs(frozenFramePromiseTime - frameTime) <= VIDEO_SYNC_TOLERANCE
    ) {
      return frozenFramePromise;
    }

    const requestToken = frozenFrameRequestToken + 1;
    frozenFrameRequestToken = requestToken;
    frozenFramePromiseTime = frameTime;

    const pendingFrame = captureFrameBlob(frameTime)
      .then((nextFrame) => {
        if (!nextFrame) {
          return null;
        }

        if (
          requestToken !== frozenFrameRequestToken ||
          (expectedState && state !== expectedState && !lightboxActive)
        ) {
          releaseFrame(nextFrame);
          return null;
        }

        replaceFrozenFrame(nextFrame);
        return nextFrame;
      })
      .finally(() => {
        if (frozenFramePromise === pendingFrame) {
          frozenFramePromise = null;
          frozenFramePromiseTime = NaN;
        }
      });

    frozenFramePromise = pendingFrame;
    return pendingFrame;
  }

  function setFreezeOrigin() {
    lightbox.style.setProperty("--timelapse-freeze-origin-x", "50%");
    lightbox.style.setProperty("--timelapse-freeze-origin-y", "50%");
  }

  function stopLightboxPointerLoop() {
    if (!lightboxPointerFrame) {
      return;
    }

    window.cancelAnimationFrame(lightboxPointerFrame);
    lightboxPointerFrame = 0;
  }

  function updateLightboxCardRect() {
    const rect = lightboxCard.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      lightboxCardRect = null;
      return null;
    }

    lightboxCardRect = rect;
    return rect;
  }

  function resetLightboxTilt() {
    stopLightboxPointerLoop();
    pendingLightboxPointer = null;
    lightboxCardRect = null;

    const width = lightboxCard.clientWidth;
    const height = lightboxCard.clientHeight;
    if (!width || !height) {
      return;
    }

    lightboxCard.style.setProperty("--timelapse-freeze-tilt-x", "0deg");
    lightboxCard.style.setProperty("--timelapse-freeze-tilt-y", "0deg");
    lightboxCard.style.setProperty("--timelapse-freeze-tilt-lift", "0px");
    lightboxCard.style.setProperty("--timelapse-freeze-tilt-scale", "1");
    lightboxLight.style.transform =
      `translate3d(${(width * 0.5).toFixed(2)}px, ${(height * 0.38).toFixed(2)}px, 0) translate3d(-50%, -50%, 0)`;
    lightboxLight.style.opacity = "0.18";
  }

  function flushLightboxPointer() {
    lightboxPointerFrame = 0;

    if (!pendingLightboxPointer || !lightboxActive || prefersReducedMotion()) {
      return;
    }

    const pointer = pendingLightboxPointer;
    pendingLightboxPointer = null;
    const rotateY = (pointer.x - 0.5) * 12;
    const rotateX = (0.5 - pointer.y) * 10;
    const edgeDistance = Math.hypot(pointer.x - 0.5, pointer.y - 0.5);
    const lift = 12 + Math.max(0, 1 - edgeDistance * 1.9) * 18;
    const lightX = pointer.x * lightboxCard.clientWidth;
    const lightY = pointer.y * lightboxCard.clientHeight;
    const opacity = 0.16 + Math.max(0, 1 - edgeDistance * 1.7) * 0.18;

    lightboxCard.style.setProperty("--timelapse-freeze-tilt-x", `${rotateX.toFixed(2)}deg`);
    lightboxCard.style.setProperty("--timelapse-freeze-tilt-y", `${rotateY.toFixed(2)}deg`);
    lightboxCard.style.setProperty("--timelapse-freeze-tilt-lift", `${lift.toFixed(2)}px`);
    lightboxCard.style.setProperty("--timelapse-freeze-tilt-scale", "1.012");
    lightboxLight.style.transform =
      `translate3d(${lightX.toFixed(2)}px, ${lightY.toFixed(2)}px, 0) translate3d(-50%, -50%, 0)`;
    lightboxLight.style.opacity = opacity.toFixed(3);
  }

  function requestLightboxPointerUpdate(x, y) {
    pendingLightboxPointer = {
      x: clamp01(x),
      y: clamp01(y),
    };

    if (lightboxPointerFrame) {
      return;
    }

    lightboxPointerFrame = window.requestAnimationFrame(flushLightboxPointer);
  }

  function setLightboxActive(nextActive) {
    if (lightboxActive === nextActive) {
      return;
    }

    lightboxActive = nextActive;
    root.classList.toggle("is-lightbox-open", nextActive);
    syncSceneLock();
    syncInvertGuard();
  }

  function closeLightbox({ immediate = false } = {}) {
    if (lightboxTimer) {
      window.clearTimeout(lightboxTimer);
      lightboxTimer = 0;
    }

    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    resetLightboxTilt();

    if (immediate) {
      lightbox.hidden = true;
      lightboxImage.removeAttribute("src");
      setLightboxActive(false);
      return;
    }

    lightboxTimer = window.setTimeout(() => {
      lightbox.hidden = true;
      lightboxImage.removeAttribute("src");
      setLightboxActive(false);
    }, LIGHTBOX_TRANSITION_MS);
  }

  async function openLightbox() {
    if (state !== "paused" && state !== "ended") {
      return;
    }

    const frameTime = getVideoAnchorTime();
    let frame =
      frozenFrame && Math.abs(frozenFrame.time - frameTime) <= VIDEO_SYNC_TOLERANCE
        ? frozenFrame
        : null;

    if (!frame?.src) {
      frame = await ensureFrozenFrame(frameTime, { expectedState: state });
    }

    if (!frame?.src) {
      return;
    }

    if (lightboxTimer) {
      window.clearTimeout(lightboxTimer);
      lightboxTimer = 0;
    }

    deactivateInvert({ force: true });
    lightbox.hidden = false;
    lightbox.setAttribute("aria-hidden", "false");
    setFreezeOrigin();
    setLightboxActive(true);
    lightboxImage.src = frame.src;
    lightboxImage.alt = frame.alt;
    lightboxTitle.textContent = `${frame.title} · 定格帧`;
    lightboxTime.textContent = formatCountdown(CLIP_DURATION - frame.time);
    resetLightboxTilt();

    window.requestAnimationFrame(() => {
      lightbox.classList.add("is-open");
      updateLightboxCardRect();
      resetLightboxTilt();
    });
  }

  function stopDisplayLoop() {
    if (!displayLoopId) {
      return;
    }

    window.cancelAnimationFrame(displayLoopId);
    displayLoopId = 0;
  }

  function stopRewindLoop() {
    if (!rewindFrameId) {
      return;
    }

    window.cancelAnimationFrame(rewindFrameId);
    rewindFrameId = 0;
  }

  function pauseVideoElement() {
    playRequestToken += 1;
    video.playbackRate = 1;
    if (!video.paused) {
      video.pause();
    }
  }

  function syncVideo(targetTime, force = false) {
    if (!videoLoaded || video.readyState < 1) {
      return;
    }

    const seekTime = getSeekTime(targetTime);
    if (force || !Number.isFinite(video.currentTime) || Math.abs(video.currentTime - seekTime) > VIDEO_SYNC_TOLERANCE) {
      try {
        video.currentTime = seekTime;
      } catch {
        // Ignore transient seek failures while the decoder catches up.
      }
    }
  }

  async function seekVideo(targetTime) {
    if (!videoLoaded || video.readyState < 1) {
      return;
    }

    const seekTime = getSeekTime(targetTime);
    if (
      Number.isFinite(video.currentTime) &&
      Math.abs(video.currentTime - seekTime) <= VIDEO_SYNC_TOLERANCE &&
      !video.seeking
    ) {
      return;
    }

    await new Promise((resolve, reject) => {
      let settled = false;
      let fallbackTimer = 0;

      const cleanup = () => {
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("error", handleError);
        if (fallbackTimer) {
          window.clearTimeout(fallbackTimer);
        }
      };

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };

      const handleSeeked = () => {
        finish();
      };

      const handleError = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error("Failed while seeking timelapse video"));
      };

      video.addEventListener("seeked", handleSeeked, { once: true });
      video.addEventListener("error", handleError, { once: true });

      fallbackTimer = window.setTimeout(() => {
        finish();
      }, 1200);

      try {
        video.currentTime = seekTime;
      } catch (error) {
        settled = true;
        cleanup();
        reject(error);
      }
    });
  }

  async function playVideoFromCurrentTime() {
    if (!videoLoaded) {
      return false;
    }

    const requestToken = ++playRequestToken;
    video.playbackRate = 1;

    try {
      await video.play();
    } catch (error) {
      if (requestToken === playRequestToken) {
        console.error("Failed to start timelapse video:", error);
      }
      return false;
    }

    return requestToken === playRequestToken;
  }

  async function alignPlaybackClock() {
    if (!videoLoaded) {
      resetPlaybackClock(currentTime);
      return currentTime;
    }

    if (typeof video.requestVideoFrameCallback === "function" && !video.paused) {
      await new Promise((resolve) => {
        let settled = false;
        let fallbackTimer = 0;

        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          if (fallbackTimer) {
            window.clearTimeout(fallbackTimer);
          }
          resolve();
        };

        video.requestVideoFrameCallback(() => {
          finish();
        });

        fallbackTimer = window.setTimeout(() => {
          finish();
        }, 120);
      });
    } else {
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          resolve();
        });
      });
    }

    const anchorTime = getVideoAnchorTime();
    resetPlaybackClock(anchorTime);
    paintProgress(anchorTime, { forceText: true });
    return anchorTime;
  }

  function startDisplayLoop() {
    stopDisplayLoop();

    const step = (timestamp) => {
      if (state !== "playing" || visibilityPaused) {
        displayLoopId = 0;
        return;
      }

      let playbackTime = getPlaybackAnchorTime(timestamp);

      if (
        videoLoaded &&
        video.readyState >= 2 &&
        Number.isFinite(video.currentTime) &&
        !video.paused &&
        !video.seeking
      ) {
        const mediaTime = getVideoAnchorTime();
        const drift = mediaTime - playbackTime;
        if (Math.abs(drift) > CLOCK_SYNC_TOLERANCE) {
          resetPlaybackClock(mediaTime, timestamp);
        }
        playbackTime = mediaTime;
      }

      paintProgress(playbackTime);

      if (playbackTime >= SAFE_END_TIME || video.ended) {
        displayLoopId = 0;
        handlePlaybackEnd();
        return;
      }

      displayLoopId = window.requestAnimationFrame(step);
    };

    displayLoopId = window.requestAnimationFrame(step);
  }

  function freezePlayback(nextState, frameTime, { withInvert = false } = {}) {
    visibilityPaused = false;
    pauseVideoElement();
    stopDisplayLoop();
    stopRewindLoop();
    const frozenTime = clamp(frameTime, 0, CLIP_DURATION);
    stopPlaybackClock(frozenTime);
    paintProgress(frozenTime, { forceText: true });
    setState(nextState);
    closeLightbox({ immediate: true });
    clearFrozenFrame();

    if (withInvert) {
      activateInvert();
    } else {
      deactivateInvert({ force: true });
    }

    if (nextState === "paused" || nextState === "ended") {
      primeFrozenFrame(frozenTime, nextState);
    }

    applyScrollScene(scrollProgress);
  }

  function handlePlaybackEnd() {
    if (state !== "playing") {
      return;
    }

    freezePlayback("ended", Math.max(getPlaybackAnchorTime(), SAFE_END_TIME));
  }

  async function loadVideo() {
    if (video.dataset.loaded === "true" && video.readyState >= 2) {
      return;
    }

    if (!video.src) {
      video.src = video.dataset.src || "";
    }

    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;

    await new Promise((resolve, reject) => {
      const handleReady = () => {
        video.dataset.loaded = "true";
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error(`Failed to load ${video.currentSrc || video.dataset.src || "timelapse video"}`));
      };
      const cleanup = () => {
        video.removeEventListener("loadeddata", handleReady);
        video.removeEventListener("canplay", handleReady);
        video.removeEventListener("error", handleError);
      };

      video.addEventListener("loadeddata", handleReady, { once: true });
      video.addEventListener("canplay", handleReady, { once: true });
      video.addEventListener("error", handleError, { once: true });
      video.load();
    });
  }

  async function ensureVideoLoaded() {
    if (videoLoaded) {
      return;
    }

    if (loadPromise) {
      return loadPromise;
    }

    setState("loading");

    loadPromise = loadVideo()
      .then(() => {
        videoLoaded = true;
        root.classList.add("is-loaded");
        syncVideo(0, true);
        paintProgress(0, { forceText: true });
        setState("ready");
      })
      .catch((error) => {
        console.error("Failed to load timelapse assets:", error);
        loadPromise = null;
        setState("ready");
      });

    return loadPromise;
  }

  async function resumeVisiblePlayback() {
    if (!videoLoaded || !sectionVisible || state !== "playing") {
      return;
    }

    visibilityPaused = false;
    const resumeTime = getVideoAnchorTime();
    resetRenderedCountdown(resumeTime);
    try {
      await seekVideo(resumeTime);
    } catch {
      syncVideo(resumeTime, true);
    }
    paintProgress(resumeTime, { forceText: true });
    stopPlaybackClock(resumeTime);

    const started = await playVideoFromCurrentTime();
    if (!started || state !== "playing" || visibilityPaused) {
      return;
    }

    await alignPlaybackClock();
    startDisplayLoop();
  }

  async function startPlayback() {
    if (!canUseControls()) {
      return;
    }

    await ensureVideoLoaded();

    if (!videoLoaded || state === "loading" || state === "rewinding") {
      return;
    }

    closeLightbox({ immediate: true });
    deactivateInvert({ force: true });
    clearFrozenFrame();
    stabilizeSceneScroll();

    const nextStartTime =
      state === "ended" || currentTime >= SAFE_END_TIME ? 0 : getPlaybackAnchorTime();
    const shouldPauseForVisibility = document.visibilityState !== "visible";

    visibilityPaused = shouldPauseForVisibility;
    resetRenderedCountdown(nextStartTime);
    try {
      await seekVideo(nextStartTime);
    } catch {
      syncVideo(nextStartTime, true);
    }
    paintProgress(nextStartTime, { forceText: true });
    setState("playing");
    stopPlaybackClock(nextStartTime);

    window.requestAnimationFrame(() => {
      stabilizeSceneScroll();
      requestScrollSceneUpdate();
    });

    if (shouldPauseForVisibility) {
      return;
    }

    const started = await playVideoFromCurrentTime();
    if (!started || state !== "playing" || visibilityPaused) {
      return;
    }

    await alignPlaybackClock();
    startDisplayLoop();
  }

  function pausePlayback() {
    if (state !== "playing") {
      return;
    }

    pauseVideoElement();
    stopDisplayLoop();
    stopRewindLoop();
    const pausedTime = getVideoAnchorTime();
    stopPlaybackClock(pausedTime);
    paintProgress(pausedTime, { forceText: true });
    setState("paused");
    closeLightbox({ immediate: true });
    clearFrozenFrame();
    activateInvert();
    primeFrozenFrame(pausedTime, "paused");
    applyScrollScene(scrollProgress);
  }

  function startRewind() {
    if (state === "loading" || state === "rewinding" || currentTime <= 0.01) {
      return;
    }

    closeLightbox({ immediate: true });
    deactivateInvert({ force: true });
    clearFrozenFrame();
    visibilityPaused = false;
    pauseVideoElement();
    stopDisplayLoop();
    stopRewindLoop();
    setState("rewinding");

    let rewindTime = getVideoAnchorTime();
    stopPlaybackClock(rewindTime);
    let lastTimestamp = 0;

    const step = (timestamp) => {
      if (!lastTimestamp) {
        lastTimestamp = timestamp;
      }

      const deltaSeconds = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      rewindTime = Math.max(0, rewindTime - deltaSeconds * REWIND_SPEED);

      syncVideo(rewindTime, true);
      paintProgress(rewindTime, { forceText: true });

      if (rewindTime > 0.001) {
        rewindFrameId = window.requestAnimationFrame(step);
        return;
      }

      rewindFrameId = 0;
      syncVideo(0, true);
      paintProgress(0, { forceText: true });
      setState("ready");
      requestScrollSceneUpdate();
    };

    rewindFrameId = window.requestAnimationFrame(step);
  }

  async function syncSectionVisibility(isVisible) {
    if (sectionVisible === isVisible) {
      return;
    }

    sectionVisible = isVisible;
    document.body.classList.toggle("timelapse-focus", isVisible || lightboxActive);
  }

  function updateScrollScene() {
    scrollFrameId = 0;

    const rect = stage.getBoundingClientRect();
    const travel = Math.max(stage.offsetHeight - window.innerHeight, 1);
    const computedProgress = prefersReducedMotion() ? 0.9 : clamp01(-rect.top / travel);
    const nextProgress = shouldFreezeSceneProgress() || lightboxActive ? scrollProgress : computedProgress;
    const nextVisible = rect.top < window.innerHeight * 0.92 && rect.bottom > window.innerHeight * 0.08;

    applyScrollScene(nextProgress);

    if (state === "paused" && !lightboxActive) {
      schedulePausedInvertRefresh();
    }

    if (state === "rewinding") {
      setInvertOrigin();
    }

    void syncSectionVisibility(nextVisible);

    if (nextVisible && nextProgress >= PRELOAD_SCROLL_THRESHOLD) {
      void ensureVideoLoaded();
    }
  }

  function requestScrollSceneUpdate() {
    if (scrollFrameId) {
      return;
    }

    scrollFrameId = window.requestAnimationFrame(updateScrollScene);
  }

  function handleWindowScroll() {
    if (state === "paused" && !lightboxActive) {
      const rect = stage.getBoundingClientRect();
      const nextVisible = rect.top < window.innerHeight * 0.92 && rect.bottom > window.innerHeight * 0.08;

      setInvertOrigin();
      paintInvertState();
      void syncSectionVisibility(nextVisible);
      return;
    }

    requestScrollSceneUpdate();
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (shouldSuppressSpaceScroll(event)) {
        event.preventDefault();
      }
    },
    { capture: true },
  );

  document.addEventListener(
    "keyup",
    (event) => {
      if (shouldSuppressSpaceScroll(event)) {
        event.preventDefault();
      }
    },
    { capture: true },
  );

  segment.addEventListener("click", (event) => {
    if (state !== "paused" && state !== "ended") {
      return;
    }

    event.preventDefault();
    void openLightbox();
  });

  lightboxCloseNodes.forEach((node) => {
    node.addEventListener("click", () => {
      closeLightbox();
    });
  });

  lightboxImage.addEventListener("load", () => {
    if (!lightboxActive) {
      return;
    }

    updateLightboxCardRect();
    resetLightboxTilt();
  });

  lightboxCard.addEventListener("pointerenter", () => {
    if (!lightboxActive || prefersReducedMotion()) {
      return;
    }

    updateLightboxCardRect();
  });

  lightboxCard.addEventListener("pointermove", (event) => {
    if (!lightboxActive || prefersReducedMotion()) {
      return;
    }

    const rect = lightboxCardRect || updateLightboxCardRect();
    if (!rect) {
      return;
    }

    requestLightboxPointerUpdate(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
  });

  lightboxCard.addEventListener("pointerleave", () => {
    resetLightboxTilt();
  });

  lightboxCard.addEventListener("pointercancel", () => {
    resetLightboxTilt();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      if (state === "playing") {
        visibilityPaused = true;
        pauseVideoElement();
        stopDisplayLoop();
      }
      return;
    }

    if (sectionVisible && state === "playing" && visibilityPaused) {
      void resumeVisiblePlayback();
    }
  });

  document.addEventListener("keydown", (event) => {
    const keyboardArmed = sectionVisible || isActivePlaybackState() || scrollProgress >= UI_ARM_SCROLL_THRESHOLD;

    if (isEditableTargetNode(event.target)) {
      return;
    }

    if (event.key === "Escape") {
      if (!lightbox.hidden) {
        closeLightbox();
        return;
      }

      if (state === "paused") {
        deactivateInvert({ force: true });
        void startPlayback();
      }
      return;
    }

    if (!keyboardArmed || !lightbox.hidden) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();

      if (state === "loading" || state === "rewinding") {
        return;
      }

      if (state === "playing") {
        pausePlayback();
        return;
      }

      void startPlayback();
      return;
    }

    if (event.code === "KeyR") {
      event.preventDefault();

      if (state === "loading" || state === "rewinding") {
        return;
      }

      startRewind();
    }
  });

  video.addEventListener("ended", () => {
    handlePlaybackEnd();
  });

  window.addEventListener("scroll", handleWindowScroll, { passive: true });
  window.addEventListener("resize", () => {
    updateScrollbarCompensation();
    if (lightboxActive) {
      resetLightboxTilt();
    }
    if (state === "paused" && invertActive) {
      setInvertOrigin();
      paintInvertState();
    }
    requestScrollSceneUpdate();
  });

  if (reducedMotionQuery && "addEventListener" in reducedMotionQuery) {
    reducedMotionQuery.addEventListener("change", () => {
      if (prefersReducedMotion()) {
        deactivateInvert({ force: true });
      }
      requestScrollSceneUpdate();
    });
  } else if (reducedMotionQuery && "addListener" in reducedMotionQuery) {
    reducedMotionQuery.addListener(() => {
      if (prefersReducedMotion()) {
        deactivateInvert({ force: true });
      }
      requestScrollSceneUpdate();
    });
  }

  updateScrollbarCompensation();
  paintInvertState();
  paintProgress(0, { forceText: true });
  applyScrollScene(prefersReducedMotion() ? 0.82 : 0);
  setFreezeOrigin();
  setState("idle");
  requestScrollSceneUpdate();
}
