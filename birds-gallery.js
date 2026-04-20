import { birdCatalog } from "./birds-data.js";

const GALLERY_TRANSITION_MS = 280;
const IMAGE_SWAP_OUT_MS = 170;
const IMAGE_SWAP_IN_MS = 260;
const IUCN_SCALE = [
  { code: "EX", labelZh: "绝灭", labelEn: "Extinct", group: "extinct" },
  { code: "EW", labelZh: "野外绝灭", labelEn: "Extinct in the Wild", group: "extinct" },
  { code: "CR", labelZh: "极危", labelEn: "Critically Endangered", group: "threatened" },
  { code: "EN", labelZh: "濒危", labelEn: "Endangered", group: "threatened" },
  { code: "VU", labelZh: "易危", labelEn: "Vulnerable", group: "threatened" },
  { code: "NT", labelZh: "近危", labelEn: "Near Threatened", group: "least" },
  { code: "LC", labelZh: "无危", labelEn: "Least Concern", group: "least" },
];

export function initBirdsGallery({ reducedMotionQuery } = {}) {
  const birdTab = document.querySelector("[data-bird-tab]");
  const birdDeck = document.querySelector("[data-bird-tab-deck]");
  const birdCount = document.querySelector("[data-bird-count]");
  const birdStatusTrail = document.querySelector("[data-bird-status-trail]");
  const gallery = document.querySelector("[data-bird-gallery]");

  if (!birdTab || !birdDeck || !birdCount || !gallery || !birdCatalog.length) {
    return;
  }

  const closeNodes = Array.from(gallery.querySelectorAll("[data-bird-gallery-close]"));
  const backdropNode = gallery.querySelector(".bird-gallery-backdrop");
  const positionNode = gallery.querySelector("[data-bird-position]");
  const currentLabel = gallery.querySelector("[data-bird-current-label]");
  const scientificNode = gallery.querySelector("[data-bird-scientific]");
  const iucnBadge = gallery.querySelector("[data-bird-iucn-badge]");
  const mainImage = gallery.querySelector("[data-bird-main-image]");
  const viewerCard = gallery.querySelector("[data-bird-viewer-card]");
  const photoWrap = gallery.querySelector("[data-bird-photo-wrap]");
  const photoCard = gallery.querySelector("[data-bird-photo-card]");
  const photoLight = gallery.querySelector("[data-bird-photo-light]");
  const thumbsRoot = gallery.querySelector("[data-bird-thumbs]");
  const prevButton = gallery.querySelector("[data-bird-prev]");
  const nextButton = gallery.querySelector("[data-bird-next]");
  const prevImage = gallery.querySelector("[data-bird-prev-image]");
  const nextImage = gallery.querySelector("[data-bird-next-image]");
  const prevTitle = gallery.querySelector("[data-bird-prev-title]");
  const nextTitle = gallery.querySelector("[data-bird-next-title]");
  const metaNodes = {
    title: gallery.querySelector("[data-bird-meta-title]"),
    camera: gallery.querySelector("[data-bird-meta-camera]"),
    lens: gallery.querySelector("[data-bird-meta-lens]"),
    capturedAt: gallery.querySelector("[data-bird-meta-captured-at]"),
    aperture: gallery.querySelector("[data-bird-meta-aperture]"),
    shutter: gallery.querySelector("[data-bird-meta-shutter]"),
    iso: gallery.querySelector("[data-bird-meta-iso]"),
    dimensions: gallery.querySelector("[data-bird-meta-dimensions]"),
    focalLength: gallery.querySelector("[data-bird-meta-focal-length]"),
    focalLength35: gallery.querySelector("[data-bird-meta-focal-length-35]"),
  };

  let currentIndex = 0;
  let isOpen = false;
  let closeTimer = 0;
  let loadToken = 0;
  let pointerFrame = 0;
  let pendingPointer = null;
  let photoExpanded = false;

  function prefersReducedMotion() {
    return Boolean(reducedMotionQuery?.matches);
  }

  function normalizeIndex(index) {
    const size = birdCatalog.length;
    return ((index % size) + size) % size;
  }

  function detectBrand(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized.includes("panasonic")) {
      return "panasonic";
    }
    if (normalized.includes("lumix")) {
      return "lumix";
    }
    if (normalized.includes("sony") || normalized.startsWith("fe ")) {
      return "sony";
    }
    return "generic";
  }

  function applyBrand(node, value) {
    if (!node) {
      return;
    }

    node.dataset.brand = detectBrand(value);
  }

  function renderIucnMini(node, bird) {
    if (!node) {
      return;
    }

    node.dataset.tone = bird.iucn.tone;
    node.setAttribute("aria-label", `IUCN ${bird.iucn.code} ${bird.iucn.labelZh}`);
    node.innerHTML =
      `<span class="bird-deck-card__badge-key">IUCN</span>` +
      `<strong class="bird-deck-card__badge-code">${bird.iucn.code}</strong>`;
  }

  function renderIucnScale(node, activeCodes) {
    if (!node) {
      return;
    }

    const activeSet = new Set(activeCodes);
    const activePrimary = IUCN_SCALE.find((status) => activeSet.has(status.code));
    node.dataset.activeCode = activePrimary?.code || "";
    node.dataset.activeGroup = activePrimary?.group || "";
    node.innerHTML =
      `<div class="bird-iucn-scale__labels">` +
      `<span class="bird-iucn-scale__group bird-iucn-scale__group--extinct">绝灭</span>` +
      `<span class="bird-iucn-scale__group bird-iucn-scale__group--threatened">受威胁</span>` +
      `<span class="bird-iucn-scale__group bird-iucn-scale__group--least">无危</span>` +
      `</div>` +
      `<div class="bird-iucn-scale__track">` +
      IUCN_SCALE.map((status) => {
        const activeClass = activeSet.has(status.code) ? " is-active" : "";
        return (
          `<span class="bird-iucn-scale__item${activeClass}" ` +
          `data-code="${status.code}" data-group="${status.group}" tabindex="0" ` +
          `title="${status.labelZh} · ${status.labelEn}" aria-label="${status.code} ${status.labelZh}">` +
          `<span class="bird-iucn-scale__tooltip">${status.labelZh}</span>` +
          `<span class="bird-iucn-scale__dot">${status.code}</span>` +
          `</span>`
        );
      }).join("") +
      `</div>`;
  }

  function buildStatusTrail() {
    if (!birdStatusTrail) {
      return;
    }

    const statuses = [];
    const seen = new Set();
    birdCatalog.forEach((bird) => {
      if (!seen.has(bird.iucn.code)) {
        seen.add(bird.iucn.code);
        statuses.push(bird.iucn);
      }
    });

    birdStatusTrail.classList.add("bird-iucn-scale", "bird-iucn-scale--trail");
    renderIucnScale(
      birdStatusTrail,
      statuses.map((status) => status.code),
    );
  }

  function renderDeck() {
    const previewBirds = birdCatalog.slice(0, Math.min(5, birdCatalog.length));
    const middle = (previewBirds.length - 1) / 2;

    birdDeck.innerHTML = "";
    previewBirds.forEach((bird, index) => {
      const offset = index - middle;
      const distance = Math.abs(offset);
      const card = document.createElement("span");
      card.className = "bird-deck-card";
      card.style.setProperty("--bird-card-offset", offset.toFixed(3));
      card.style.setProperty("--bird-card-distance", distance.toFixed(3));
      card.style.setProperty("--bird-card-order", String(previewBirds.length - index));
      card.innerHTML =
        `<span class="bird-deck-card__media">` +
        `<img src="${bird.thumbSrc}" alt="" loading="lazy" decoding="async">` +
        `<span class="bird-deck-card__sheen"></span>` +
        `</span>` +
        `<span class="bird-deck-card__footer">` +
        `<span class="bird-deck-card__title">${bird.title}</span>` +
        `<span class="bird-deck-card__badge"></span>` +
        `</span>`;
      renderIucnMini(card.querySelector(".bird-deck-card__badge"), bird);
      birdDeck.appendChild(card);
    });
  }

  function renderThumbs() {
    if (!thumbsRoot) {
      return;
    }

    thumbsRoot.innerHTML = "";
    const middle = (birdCatalog.length - 1) / 2;

    birdCatalog.forEach((bird, index) => {
      const offset = index - middle;
      const distance = Math.abs(offset);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bird-thumb";
      button.dataset.index = String(index);
      button.style.setProperty("--bird-thumb-offset", offset.toFixed(3));
      button.style.setProperty("--bird-thumb-distance", distance.toFixed(3));
      button.innerHTML =
        `<span class="bird-thumb__media">` +
        `<img src="${bird.thumbSrc}" alt="${bird.alt}" loading="lazy" decoding="async">` +
        `</span>` +
        `<span class="bird-thumb__label">${bird.title}</span>`;
      thumbsRoot.appendChild(button);
    });
  }

  function preloadAround(index) {
    [-2, -1, 1, 2].forEach((offset) => {
      const bird = birdCatalog[normalizeIndex(index + offset)];
      const image = new Image();
      image.src = bird.displaySrc;
    });
  }

  function updateThumbState() {
    if (!thumbsRoot) {
      return;
    }

    thumbsRoot.querySelectorAll(".bird-thumb").forEach((button) => {
      const isActive = Number(button.dataset.index) === currentIndex;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-current", isActive ? "true" : "false");
    });
  }

  function updateSideCards() {
    const prevBird = birdCatalog[normalizeIndex(currentIndex - 1)];
    const nextBird = birdCatalog[normalizeIndex(currentIndex + 1)];

    if (prevImage) {
      prevImage.src = prevBird.thumbSrc;
      prevImage.alt = prevBird.alt;
    }
    if (nextImage) {
      nextImage.src = nextBird.thumbSrc;
      nextImage.alt = nextBird.alt;
    }
    if (prevTitle) {
      prevTitle.textContent = prevBird.title;
    }
    if (nextTitle) {
      nextTitle.textContent = nextBird.title;
    }
  }

  function applyMetadata(bird) {
    if (positionNode) {
      positionNode.textContent = `${currentIndex + 1} / ${birdCatalog.length}`;
    }

    if (currentLabel) {
      currentLabel.textContent = `${bird.title} · ${bird.commonName}`;
    }

    if (scientificNode) {
      scientificNode.textContent = bird.scientificName;
    }

    if (metaNodes.title) {
      metaNodes.title.textContent = bird.title;
    }

    if (metaNodes.camera) {
      metaNodes.camera.textContent = bird.capture.camera;
      applyBrand(metaNodes.camera, bird.capture.camera);
    }
    if (metaNodes.lens) {
      metaNodes.lens.textContent = bird.capture.lens;
      applyBrand(metaNodes.lens, bird.capture.lens);
    }
    if (metaNodes.capturedAt) {
      metaNodes.capturedAt.textContent = bird.capture.capturedAt;
    }
    if (metaNodes.aperture) {
      metaNodes.aperture.textContent = bird.capture.aperture;
    }
    if (metaNodes.shutter) {
      metaNodes.shutter.textContent = bird.capture.shutter;
    }
    if (metaNodes.iso) {
      metaNodes.iso.textContent = bird.capture.iso;
    }
    if (metaNodes.dimensions) {
      metaNodes.dimensions.textContent = bird.dimensions.label;
    }
    if (metaNodes.focalLength) {
      metaNodes.focalLength.textContent = bird.capture.focalLength;
    }
    if (metaNodes.focalLength35) {
      metaNodes.focalLength35.textContent = bird.capture.focalLength35;
    }

    if (viewerCard) {
      viewerCard.style.setProperty("--bird-image-ratio", `${bird.dimensions.width} / ${bird.dimensions.height}`);
    }

    renderIucnScale(iucnBadge, [bird.iucn.code]);
  }

  function resolveMotionDirection(fromIndex, toIndex) {
    if (fromIndex === toIndex) {
      return 0;
    }

    const size = birdCatalog.length;
    const forward = (toIndex - fromIndex + size) % size;
    const backward = (fromIndex - toIndex + size) % size;
    return forward <= backward ? 1 : -1;
  }

  async function animatePhotoOut(direction) {
    if (!mainImage?.animate || prefersReducedMotion()) {
      return;
    }

    mainImage.getAnimations().forEach((animation) => animation.cancel());
    const offset = direction === 0 ? 0 : direction * -34;
    const animation = mainImage.animate(
      [
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
        { opacity: 0, transform: `translate3d(${offset}px, 0, 0) scale(0.986)` },
      ],
      {
        duration: IMAGE_SWAP_OUT_MS,
        easing: "cubic-bezier(0.55, 0.06, 0.68, 0.19)",
        fill: "forwards",
      },
    );

    await animation.finished.catch(() => {});
    animation.cancel();
    mainImage.style.opacity = "0";
    mainImage.style.transform = `translate3d(${offset}px, 0, 0) scale(0.986)`;
  }

  function animatePhotoIn(direction) {
    if (!mainImage?.animate || prefersReducedMotion()) {
      if (mainImage) {
        mainImage.style.opacity = "";
        mainImage.style.transform = "";
      }
      return;
    }

    mainImage.getAnimations().forEach((animation) => animation.cancel());
    const offset = direction === 0 ? 0 : direction * 42;
    const animation = mainImage.animate(
      [
        { opacity: 0, transform: `translate3d(${offset}px, 0, 0) scale(1.018)` },
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
      ],
      {
        duration: IMAGE_SWAP_IN_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );

    animation.finished.finally(() => {
      if (!mainImage) {
        return;
      }
      mainImage.style.opacity = "";
      mainImage.style.transform = "";
    });
  }

  function resetTilt() {
    if (!photoCard || !photoLight) {
      return;
    }

    const lightX = photoCard.clientWidth * 0.5;
    const lightY = photoCard.clientHeight * 0.5;
    photoCard.style.setProperty("--bird-tilt-x", "0deg");
    photoCard.style.setProperty("--bird-tilt-y", "0deg");
    photoCard.style.setProperty("--bird-tilt-lift", "0px");
    photoCard.style.setProperty("--bird-tilt-scale", "1");
    photoLight.style.transform =
      `translate3d(${lightX.toFixed(2)}px, ${lightY.toFixed(2)}px, 0) translate3d(-50%, -50%, 0)`;
    photoLight.style.opacity = "0.14";
  }

  function setPhotoExpanded(nextExpanded) {
    if (photoExpanded === nextExpanded) {
      return;
    }

    photoExpanded = nextExpanded;
    gallery.classList.toggle("is-photo-expanded", photoExpanded);
    resetTilt();
  }

  function flushPointer() {
    pointerFrame = 0;

    if (!pendingPointer || !photoCard || !photoLight || prefersReducedMotion() || !isOpen) {
      return;
    }

    const pointer = pendingPointer;
    pendingPointer = null;
    const rotateY = (pointer.x - 0.5) * 16;
    const rotateX = (0.5 - pointer.y) * 13;
    const edgeDistance = Math.hypot(pointer.x - 0.5, pointer.y - 0.5);
    const lift = 12 + Math.max(0, 1 - edgeDistance * 1.8) * 20;
    const lightX = pointer.x * photoCard.clientWidth;
    const lightY = pointer.y * photoCard.clientHeight;
    const opacity = 0.16 + (1 - pointer.y) * 0.16;

    photoCard.style.setProperty("--bird-tilt-x", `${rotateX.toFixed(2)}deg`);
    photoCard.style.setProperty("--bird-tilt-y", `${rotateY.toFixed(2)}deg`);
    photoCard.style.setProperty("--bird-tilt-lift", `${lift.toFixed(2)}px`);
    photoCard.style.setProperty("--bird-tilt-scale", "1.018");
    photoLight.style.transform =
      `translate3d(${lightX.toFixed(2)}px, ${lightY.toFixed(2)}px, 0) translate3d(-50%, -50%, 0)`;
    photoLight.style.opacity = opacity.toFixed(3);
  }

  function requestPointerUpdate(x, y) {
    pendingPointer = { x, y };
    if (pointerFrame) {
      return;
    }
    pointerFrame = window.requestAnimationFrame(flushPointer);
  }

  async function setCurrentBird(index, { immediate = false, direction = 0 } = {}) {
    const nextIndex = normalizeIndex(index);
    if (!immediate && nextIndex === currentIndex) {
      return;
    }

    const bird = birdCatalog[nextIndex];
    const nextToken = ++loadToken;
    const motionDirection = direction || resolveMotionDirection(currentIndex, nextIndex);

    preloadAround(nextIndex);

    if (!mainImage) {
      return;
    }

    if (viewerCard) {
      viewerCard.classList.add("is-loading");
    }

    if (immediate) {
      currentIndex = nextIndex;
      applyMetadata(bird);
      updateSideCards();
      updateThumbState();
      mainImage.src = bird.displaySrc;
      mainImage.alt = bird.alt;
      viewerCard?.classList.remove("is-loading");
      resetTilt();
      return;
    }

    const loader = new Image();
    loader.src = bird.displaySrc;

    try {
      await loader.decode();
    } catch {
      // Ignore decode failures and still swap the image source.
    }

    if (nextToken !== loadToken) {
      return;
    }

    await animatePhotoOut(motionDirection);

    if (nextToken !== loadToken) {
      return;
    }

    currentIndex = nextIndex;
    applyMetadata(bird);
    updateSideCards();
    updateThumbState();
    mainImage.src = bird.displaySrc;
    mainImage.alt = bird.alt;
    viewerCard?.classList.remove("is-loading");
    resetTilt();
    animatePhotoIn(motionDirection);
  }

  function openGallery(index = 0) {
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }

    isOpen = true;
    photoExpanded = false;
    gallery.hidden = false;
    gallery.setAttribute("aria-hidden", "false");
    gallery.classList.remove("is-photo-expanded", "is-frame-hidden");
    document.body.classList.add("bird-gallery-open");
    setCurrentBird(index, { immediate: true });

    window.requestAnimationFrame(() => {
      gallery.classList.add("is-open");
    });
  }

  function closeGallery() {
    if (!isOpen) {
      return;
    }

    isOpen = false;
    photoExpanded = false;
    gallery.classList.remove("is-open");
    gallery.classList.remove("is-photo-expanded", "is-frame-hidden");
    gallery.setAttribute("aria-hidden", "true");
    document.body.classList.remove("bird-gallery-open");

    closeTimer = window.setTimeout(() => {
      gallery.hidden = true;
    }, GALLERY_TRANSITION_MS);
  }

  function resolveDeepLinkedIndex() {
    const searchParams = new URLSearchParams(window.location.search);
    const requested = searchParams.get("bird");
    if (!requested) {
      return window.location.hash === "#bird-gallery" ? 0 : -1;
    }

    if (requested === "1" || requested === "true") {
      return 0;
    }

    const normalized = requested.trim().toLowerCase();
    return birdCatalog.findIndex((bird) => {
      return (
        bird.id.toLowerCase() === normalized ||
        bird.title.toLowerCase() === normalized ||
        bird.commonName.toLowerCase() === normalized
      );
    });
  }

  birdCount.textContent = `${birdCatalog.length} birds in stack`;
  buildStatusTrail();
  renderDeck();
  renderThumbs();
  resetTilt();

  birdTab.addEventListener("click", () => {
    openGallery(0);
  });

  closeNodes.forEach((node) => {
    if (node === backdropNode) {
      return;
    }

    node.addEventListener("click", closeGallery);
  });

  backdropNode?.addEventListener("click", () => {
    if (photoExpanded) {
      setPhotoExpanded(false);
      return;
    }

    closeGallery();
  });

  thumbsRoot?.addEventListener("click", (event) => {
    const button = event.target.closest(".bird-thumb");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    event.stopPropagation();
    const nextIndex = Number(button.dataset.index);
    if (Number.isNaN(nextIndex)) {
      return;
    }
    setCurrentBird(nextIndex, { direction: resolveMotionDirection(currentIndex, nextIndex) });
  });

  prevButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    setCurrentBird(currentIndex - 1, { direction: -1 });
  });

  nextButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    setCurrentBird(currentIndex + 1, { direction: 1 });
  });

  photoWrap?.addEventListener("click", (event) => {
    event.stopPropagation();

    if (!isOpen || photoExpanded) {
      return;
    }

    setPhotoExpanded(true);
  });

  gallery.addEventListener("click", (event) => {
    if (!isOpen || !photoExpanded) {
      return;
    }

    if (
      event.target.closest("[data-bird-photo-wrap]") ||
      event.target.closest("[data-bird-prev]") ||
      event.target.closest("[data-bird-next]") ||
      event.target.closest(".bird-thumb") ||
      event.target.closest("[data-bird-gallery-close]")
    ) {
      return;
    }

    setPhotoExpanded(false);
  });

  photoCard?.addEventListener("pointermove", (event) => {
    if (!window.matchMedia("(pointer: fine)").matches || prefersReducedMotion()) {
      return;
    }

    const rect = photoCard.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    requestPointerUpdate(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
  });

  photoCard?.addEventListener("pointerleave", () => {
    pendingPointer = null;
    resetTilt();
  });

  document.addEventListener("keydown", (event) => {
    if (!isOpen) {
      return;
    }

    if (event.key === "Escape") {
      if (photoExpanded) {
        setPhotoExpanded(false);
        return;
      }

      closeGallery();
      return;
    }

    if (event.key === "ArrowLeft") {
      setCurrentBird(currentIndex - 1, { direction: -1 });
      return;
    }

    if (event.key === "ArrowRight") {
      setCurrentBird(currentIndex + 1, { direction: 1 });
    }
  });

  if (reducedMotionQuery && "addEventListener" in reducedMotionQuery) {
    reducedMotionQuery.addEventListener("change", () => {
      resetTilt();
    });
  } else if (reducedMotionQuery && "addListener" in reducedMotionQuery) {
    reducedMotionQuery.addListener(() => {
      resetTilt();
    });
  }

  const deepLinkedIndex = resolveDeepLinkedIndex();
  if (deepLinkedIndex >= 0) {
    openGallery(deepLinkedIndex);
  }
}
