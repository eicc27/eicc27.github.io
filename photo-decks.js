import { createAstroOverlayController } from "./astro-overlay.js";
import { photoDecks, photoHighlights, photoSummary } from "./photo-data.js";

const GALLERY_TRANSITION_MS = 260;
const IMAGE_SWAP_OUT_MS = 150;
const IMAGE_SWAP_IN_MS = 240;

export function initPhotoDecks({ reducedMotionQuery } = {}) {
  if (!photoDecks.length) {
    return;
  }

  const decksRoot = document.querySelector("[data-photo-decks]");
  const wallRoot = document.querySelector("[data-photo-wall]");
  const gallery = document.querySelector("[data-photo-gallery]");
  const heroCards = Array.from(document.querySelectorAll("[data-photo-hero-card]"));
  const aboutFrame = document.querySelector("[data-about-photo-frame]");
  const aboutFigure = document.querySelector("[data-about-photo-figure]");
  const aboutWatermark = document.querySelector("[data-about-photo-watermark]");
  const aboutTitle = document.querySelector("[data-about-photo-title]");
  const heroMarqueeNode = document.querySelector("[data-photo-hero-marquee]");
  const heroPortraitCountNode = document.querySelector("[data-photo-hero-tag-portraits]");
  const heroSceneryCountNode = document.querySelector("[data-photo-hero-tag-scenery]");
  const totalCountNode = document.querySelector("[data-photo-total-count]");
  const totalSummaryNode = document.querySelector("[data-photo-total-summary]");
  const deckMap = new Map(photoDecks.map((deck) => [deck.id, deck]));

  function resolveHighlight(key) {
    const highlight = photoHighlights[key];
    if (!highlight) {
      return null;
    }

    const deck = deckMap.get(highlight.deckId);
    if (!deck?.images?.length) {
      return null;
    }

    const image = deck.images[Math.min(highlight.index, deck.images.length - 1)] || deck.images[0];
    if (!image) {
      return null;
    }

    return {
      deck,
      image,
    };
  }

  function applyHeroCards() {
    heroCards.forEach((card) => {
      const key = card.dataset.photoHeroCard;
      const resolved = resolveHighlight(key);
      if (!resolved) {
        return;
      }

      const { deck, image } = resolved;
      const artNode = card.querySelector("[data-photo-hero-art]");
      const badgeNode = card.querySelector("[data-photo-hero-badge]");
      const tagNode = card.querySelector("[data-photo-hero-tag]");
      const titleNode = card.querySelector("[data-photo-hero-title]");
      const bodyNode = card.querySelector("[data-photo-hero-body]");
      const linkNode = card.querySelector("[data-photo-hero-link]");

      artNode?.style.setProperty("--hero-card-image", `url("${image.src}")`);
      artNode?.style.setProperty("--hero-card-position", image.heroPosition || "center center");

      if (badgeNode) {
        badgeNode.textContent = `${deck.id === "portraits" ? "Portrait" : "Scenery"} / ${image.subject || image.title}`;
      }
      if (tagNode) {
        tagNode.textContent = image.location || deck.title;
      }
      if (titleNode) {
        titleNode.textContent = image.title;
      }
      if (bodyNode) {
        bodyNode.textContent = image.caption;
      }
      if (linkNode) {
        linkNode.textContent = deck.id === "portraits" ? "浏览人像组" : "浏览风景组";
        linkNode.setAttribute("href", "#frames");
      }
    });
  }

  function applyAboutPortrait() {
    const resolved = resolveHighlight("aboutPortrait");
    if (!resolved || !aboutFrame || !aboutFigure) {
      return;
    }

    aboutFrame.classList.add("is-photo-ready");
    aboutFigure.style.setProperty("--about-portrait-image", `url("${resolved.image.src}")`);
    aboutFigure.style.setProperty("--about-portrait-position", resolved.image.heroPosition || "center 24%");

    if (aboutWatermark) {
      aboutWatermark.textContent = `${resolved.image.title} / ${resolved.deck.title}`;
    }

    if (aboutTitle) {
      aboutTitle.textContent = resolved.image.title;
    }
  }

  function applyPhotoSummary() {
    const portraitsCount = photoSummary.deckCounts?.portraits || 0;
    const sceneryCount = photoSummary.deckCounts?.scenery || 0;
    const sceneryDeck = deckMap.get("scenery");
    const marqueeLocations = (sceneryDeck?.tags || []).slice(0, 3).join(" · ");

    if (heroMarqueeNode) {
      heroMarqueeNode.textContent =
        `${portraitsCount} portraits · ${sceneryCount} scenery · ${marqueeLocations || "current archive"} · ` +
        `${portraitsCount} portraits · ${sceneryCount} scenery · ${marqueeLocations || "current archive"} ·`;
    }

    if (heroPortraitCountNode) {
      heroPortraitCountNode.textContent = `${portraitsCount} portraits`;
    }

    if (heroSceneryCountNode) {
      heroSceneryCountNode.textContent = `${sceneryCount} scenery`;
    }

    if (totalCountNode) {
      totalCountNode.textContent = `All Frames / ${String(photoSummary.totalPhotos || 0).padStart(2, "0")}`;
    }

    if (totalSummaryNode) {
      totalSummaryNode.textContent =
        `目前收录 ${portraitsCount} 张人像和 ${sceneryCount} 张风景；点任意一张都能进入浏览器，沿当前照片继续前后浏览。`;
    }
  }

  applyHeroCards();
  applyAboutPortrait();
  applyPhotoSummary();

  if (!decksRoot || !wallRoot || !gallery) {
    return;
  }

  const closeNodes = Array.from(gallery.querySelectorAll("[data-photo-gallery-close]"));
  const backdropNode = gallery.querySelector(".photo-gallery__backdrop");
  const kickerNode = gallery.querySelector("[data-photo-gallery-kicker]");
  const positionNode = gallery.querySelector("[data-photo-gallery-position]");
  const currentNode = gallery.querySelector("[data-photo-gallery-current]");
  const metaKickerNode = gallery.querySelector("[data-photo-gallery-meta-kicker]");
  const titleNode = gallery.querySelector("[data-photo-gallery-title]");
  const captionNode = gallery.querySelector("[data-photo-gallery-caption]");
  const deckCountNode = gallery.querySelector("[data-photo-gallery-count]");
  const deckTitleNode = gallery.querySelector("[data-photo-gallery-deck-title]");
  const frameTitleNode = gallery.querySelector("[data-photo-gallery-frame-title]");
  const exifNode = gallery.querySelector("[data-photo-gallery-exif]");
  const exifCamera = gallery.querySelector("[data-photo-gallery-camera]");
  const exifLens = gallery.querySelector("[data-photo-gallery-lens]");
  const exifCapturedAt = gallery.querySelector("[data-photo-gallery-captured-at]");
  const exifAperture = gallery.querySelector("[data-photo-gallery-aperture]");
  const exifShutter = gallery.querySelector("[data-photo-gallery-shutter]");
  const exifIso = gallery.querySelector("[data-photo-gallery-iso]");
  const exifFocalLength = gallery.querySelector("[data-photo-gallery-focal-length]");
  const exifFocalLength35 = gallery.querySelector("[data-photo-gallery-focal-length-35]");
  const imageNode = gallery.querySelector("[data-photo-gallery-image]");
  const prevButton = gallery.querySelector("[data-photo-gallery-prev]");
  const nextButton = gallery.querySelector("[data-photo-gallery-next]");
  const prevImage = gallery.querySelector("[data-photo-gallery-prev-image]");
  const nextImage = gallery.querySelector("[data-photo-gallery-next-image]");
  const prevLabel = gallery.querySelector("[data-photo-gallery-prev-label]");
  const nextLabel = gallery.querySelector("[data-photo-gallery-next-label]");
  const thumbsRoot = gallery.querySelector("[data-photo-gallery-thumbs]");
  const viewerCard = gallery.querySelector("[data-photo-gallery-viewer-card]");
  const photoWrap = gallery.querySelector("[data-photo-gallery-photo-wrap]");
  const photoCard = gallery.querySelector("[data-photo-gallery-photo-card]");
  const photoLight = gallery.querySelector("[data-photo-gallery-photo-light]");
  const annotationLayer = gallery.querySelector("[data-photo-gallery-annotation-layer]");
  const astroOverlay = createAstroOverlayController({
    photoCard,
    imageNode,
    layerNode: annotationLayer,
  });

  let activeDeck = photoDecks[0];
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
    const size = activeDeck.images.length;
    return ((index % size) + size) % size;
  }

  function resolveMotionDirection(fromIndex, toIndex) {
    if (fromIndex === toIndex) {
      return 0;
    }

    const size = activeDeck.images.length;
    const forward = (toIndex - fromIndex + size) % size;
    const backward = (fromIndex - toIndex + size) % size;
    return forward <= backward ? 1 : -1;
  }

  function preloadAround(index) {
    [-2, -1, 1, 2].forEach((offset) => {
      const image = activeDeck.images[normalizeIndex(index + offset)];
      if (!image) {
        return;
      }

      const loader = new Image();
      loader.src = image.src;
    });
  }

  function setDeckPreview(node, deck) {
    const previewIndices = deck.previewIndices?.length
      ? deck.previewIndices
      : deck.images.map((_, index) => index).slice(0, Math.min(4, deck.images.length));
    const previewImages = previewIndices
      .map((index) => deck.images[index])
      .filter(Boolean);
    const middle = (previewImages.length - 1) / 2;

    node.innerHTML = "";
    previewImages.forEach((image, index) => {
      const offset = index - middle;
      const distance = Math.abs(offset);
      const card = document.createElement("span");
      card.className = "bird-deck-card photo-deck-card";
      card.style.setProperty("--bird-card-offset", offset.toFixed(3));
      card.style.setProperty("--bird-card-distance", distance.toFixed(3));
      card.style.setProperty("--bird-card-order", String(previewImages.length - index));
      card.innerHTML =
        `<span class="bird-deck-card__media">` +
        `<img src="${image.thumbSrc}" alt="" loading="lazy" decoding="async" fetchpriority="low">` +
        `<span class="bird-deck-card__sheen"></span>` +
        `</span>` +
        `<span class="bird-deck-card__footer">` +
        `<span class="bird-deck-card__title">${image.title}</span>` +
        `<span class="photo-deck-card__index">${String(index + 1).padStart(2, "0")}</span>` +
        `</span>`;
      node.appendChild(card);
    });
  }

  function renderDecks() {
    decksRoot.innerHTML = "";

    photoDecks.forEach((deck) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bird-tab photo-deck";
      button.dataset.deckTone = deck.id;
      button.innerHTML =
        `<span class="bird-tab-deck photo-deck-preview" aria-hidden="true"></span>` +
        `<span class="bird-tab-copy photo-deck-copy">` +
        `<span class="bird-tab-kicker">${deck.kicker}</span>` +
        `<strong class="bird-tab-title">${deck.title}</strong>` +
        `<span class="bird-tab-text">${deck.description}</span>` +
        `<span class="bird-tab-footer">` +
        `<span class="bird-tab-count">${deck.images.length} photos in stack</span>` +
        `<span class="photo-deck-tags">${deck.tags.map((tag) => `<span>${tag}</span>`).join("")}</span>` +
        `</span>` +
        `</span>`;
      button.addEventListener("click", () => {
        openGallery(deck.id, 0);
      });
      setDeckPreview(button.querySelector(".photo-deck-preview"), deck);
      decksRoot.appendChild(button);
    });
  }

  function renderWall() {
    wallRoot.innerHTML = "";

    photoDecks.forEach((deck) => {
      deck.images.forEach((image, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "photo-wall-card";
        button.dataset.deckId = deck.id;
        button.dataset.index = String(index);
        button.innerHTML =
          `<img class="photo-wall-card__image" src="${image.thumbSrc}" alt="${image.alt}" loading="lazy" decoding="async" fetchpriority="low">` +
          `<span class="photo-wall-card__overlay">` +
          `<span class="photo-wall-card__deck">${deck.kicker}</span>` +
          `<strong class="photo-wall-card__title">${image.title}</strong>` +
          `<span class="photo-wall-card__caption">${image.caption}</span>` +
          `</span>`;
        button.addEventListener("click", () => {
          openGallery(deck.id, index);
        });
        wallRoot.appendChild(button);
      });
    });
  }

  function renderThumbs() {
    if (!thumbsRoot) {
      return;
    }

    thumbsRoot.innerHTML = "";
    const middle = (activeDeck.images.length - 1) / 2;
    activeDeck.images.forEach((image, index) => {
      const offset = index - middle;
      const distance = Math.abs(offset);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "photo-gallery__thumb bird-thumb";
      button.dataset.index = String(index);
      button.style.setProperty("--bird-thumb-offset", offset.toFixed(3));
      button.style.setProperty("--bird-thumb-distance", distance.toFixed(3));
      button.setAttribute("aria-label", `${activeDeck.title} ${index + 1} ${image.title}`);
      button.innerHTML =
        `<span class="photo-gallery__thumb-media bird-thumb__media">` +
        `<img src="${image.thumbSrc}" alt="${image.alt}" loading="lazy" decoding="async" fetchpriority="low">` +
        `</span>` +
        `<span class="photo-gallery__thumb-label bird-thumb__label">${image.title}</span>`;
      thumbsRoot.appendChild(button);
    });
  }

  function updateThumbState() {
    thumbsRoot?.querySelectorAll(".photo-gallery__thumb").forEach((node) => {
      const isActive = Number(node.dataset.index) === currentIndex;
      node.classList.toggle("is-active", isActive);
      node.setAttribute("aria-current", isActive ? "true" : "false");
    });
  }

  function updateNavState() {
    const prevItem = activeDeck.images[normalizeIndex(currentIndex - 1)];
    const nextItem = activeDeck.images[normalizeIndex(currentIndex + 1)];

    if (prevImage) {
      prevImage.src = prevItem.thumbSrc;
      prevImage.alt = prevItem.alt;
    }

    if (nextImage) {
      nextImage.src = nextItem.thumbSrc;
      nextImage.alt = nextItem.alt;
    }

    if (prevLabel) {
      prevLabel.textContent = prevItem.title;
    }

    if (nextLabel) {
      nextLabel.textContent = nextItem.title;
    }
  }

  function applyMetadata(image) {
    if (kickerNode) {
      kickerNode.textContent = activeDeck.kicker;
    }

    if (positionNode) {
      positionNode.textContent = `${currentIndex + 1} / ${activeDeck.images.length}`;
    }

    if (currentNode) {
      currentNode.textContent = `${image.title} · ${activeDeck.title}`;
    }

    if (metaKickerNode) {
      metaKickerNode.textContent = activeDeck.title;
    }

    if (titleNode) {
      titleNode.textContent = image.title;
    }

    if (captionNode) {
      captionNode.textContent = image.caption;
    }

    if (deckCountNode) {
      const count = activeDeck.images.length;
      deckCountNode.textContent = `${count} photo${count === 1 ? "" : "s"} in stack`;
    }

    if (deckTitleNode) {
      deckTitleNode.textContent = activeDeck.title;
    }

    if (frameTitleNode) {
      frameTitleNode.textContent = image.title;
    }

    const capture = image.capture || null;
    if (exifNode) {
      exifNode.style.display = capture ? "" : "none";
      if (capture) {
        if (exifCamera) exifCamera.textContent = capture.camera || "--";
        if (exifLens) exifLens.textContent = capture.lens || "--";
        if (exifCapturedAt) exifCapturedAt.textContent = capture.capturedAt || "--";
        if (exifAperture) exifAperture.textContent = capture.aperture || "--";
        if (exifShutter) exifShutter.textContent = capture.shutter || "--";
        if (exifIso) exifIso.textContent = capture.iso || "--";
        if (exifFocalLength) exifFocalLength.textContent = capture.focalLength || "--";
        if (exifFocalLength35) exifFocalLength35.textContent = capture.focalLength35 || "--";
      }
    }

    astroOverlay.setImage(image);
    updateNavState();
    updateThumbState();
  }

  async function animatePhotoOut(direction) {
    if (!imageNode?.animate || prefersReducedMotion()) {
      return;
    }

    imageNode.getAnimations().forEach((animation) => animation.cancel());
    const offset = direction === 0 ? 0 : direction * -34;
    const animation = imageNode.animate(
      [
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
        { opacity: 0, transform: `translate3d(${offset}px, 0, 0) scale(0.988)` },
      ],
      {
        duration: IMAGE_SWAP_OUT_MS,
        easing: "cubic-bezier(0.55, 0.06, 0.68, 0.19)",
        fill: "forwards",
      },
    );

    await animation.finished.catch(() => {});
    animation.cancel();
    imageNode.style.opacity = "0";
    imageNode.style.transform = `translate3d(${offset}px, 0, 0) scale(0.988)`;
  }

  function animatePhotoIn(direction) {
    if (!imageNode?.animate || prefersReducedMotion()) {
      if (imageNode) {
        imageNode.style.opacity = "";
        imageNode.style.transform = "";
      }
      return;
    }

    imageNode.getAnimations().forEach((animation) => animation.cancel());
    const offset = direction === 0 ? 0 : direction * 42;
    const animation = imageNode.animate(
      [
        { opacity: 0, transform: `translate3d(${offset}px, 0, 0) scale(1.016)` },
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
      ],
      {
        duration: IMAGE_SWAP_IN_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );

    animation.finished.finally(() => {
      if (!imageNode) {
        return;
      }
      imageNode.style.opacity = "";
      imageNode.style.transform = "";
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

  async function setCurrentImage(index, { immediate = false, direction = 0 } = {}) {
    const nextIndex = normalizeIndex(index);
    if (!immediate && nextIndex === currentIndex) {
      return;
    }

    const nextImage = activeDeck.images[nextIndex];
    const motionDirection = direction || resolveMotionDirection(currentIndex, nextIndex);
    const nextToken = ++loadToken;

    preloadAround(nextIndex);

    if (viewerCard) {
      viewerCard.classList.add("is-loading");
    }

    if (immediate) {
      currentIndex = nextIndex;
      applyMetadata(nextImage);
      if (imageNode) {
        imageNode.src = nextImage.thumbSrc || nextImage.src;
        imageNode.alt = nextImage.alt;

        if (nextImage.thumbSrc && nextImage.thumbSrc !== nextImage.src) {
          const immediateToken = loadToken;
          const immediateLoader = new Image();
          immediateLoader.src = nextImage.src;
          immediateLoader
            .decode()
            .catch(() => {})
            .finally(() => {
              if (!imageNode || immediateToken !== loadToken) {
                return;
              }

              imageNode.src = nextImage.src;
              viewerCard?.classList.remove("is-loading");
              resetTilt();
              astroOverlay.refresh();
            });
          return;
        }
      }

      viewerCard?.classList.remove("is-loading");
      resetTilt();
      astroOverlay.refresh();
      return;
    }

    const loader = new Image();
    loader.src = nextImage.src;

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
    applyMetadata(nextImage);
    if (imageNode) {
      imageNode.src = nextImage.src;
      imageNode.alt = nextImage.alt;
    }
    viewerCard?.classList.remove("is-loading");
    resetTilt();
    astroOverlay.refresh();
    animatePhotoIn(motionDirection);
  }

  function openGallery(deckId, index = 0) {
    const nextDeck = photoDecks.find((deck) => deck.id === deckId) || photoDecks[0];
    activeDeck = nextDeck;

    renderThumbs();
    gallery.dataset.deck = activeDeck.id;

    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }

    isOpen = true;
    photoExpanded = false;
    gallery.classList.remove("is-photo-expanded", "is-frame-hidden");
    gallery.hidden = false;
    gallery.setAttribute("aria-hidden", "false");
    document.body.classList.add("photo-gallery-open");
    setCurrentImage(index, { immediate: true });

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
    document.body.classList.remove("photo-gallery-open");

    closeTimer = window.setTimeout(() => {
      gallery.hidden = true;
    }, GALLERY_TRANSITION_MS);
  }

  thumbsRoot?.addEventListener("click", (event) => {
    const button = event.target.closest(".photo-gallery__thumb");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const nextIndex = Number(button.dataset.index);
    if (Number.isNaN(nextIndex)) {
      return;
    }

    setCurrentImage(nextIndex, {
      direction: resolveMotionDirection(currentIndex, nextIndex),
    });
  });

  prevButton?.addEventListener("click", () => {
    setCurrentImage(currentIndex - 1, { direction: -1 });
  });

  nextButton?.addEventListener("click", () => {
    setCurrentImage(currentIndex + 1, { direction: 1 });
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
      event.target.closest("[data-photo-gallery-photo-wrap]") ||
      event.target.closest("[data-photo-gallery-prev]") ||
      event.target.closest("[data-photo-gallery-next]") ||
      event.target.closest(".photo-gallery__thumb") ||
      event.target.closest("[data-photo-gallery-close]")
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
      setCurrentImage(currentIndex - 1, { direction: -1 });
      return;
    }

    if (event.key === "ArrowRight") {
      setCurrentImage(currentIndex + 1, { direction: 1 });
    }
  });

  renderDecks();
  renderWall();

  if (reducedMotionQuery && "addEventListener" in reducedMotionQuery) {
    reducedMotionQuery.addEventListener("change", () => {
      resetTilt();
    });
  } else if (reducedMotionQuery && "addListener" in reducedMotionQuery) {
    reducedMotionQuery.addListener(() => {
      resetTilt();
    });
  }
}
