import { getAstroAnnotation } from "./stars/astro-annotations.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgNode(tagName, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    node.setAttribute(name, String(value));
  });
  return node;
}

function resolveAnchorClasses(xPct, yPct, { preferBottom = false } = {}) {
  const classes = [];

  if (xPct > 70) {
    classes.push("is-left");
  } else {
    classes.push("is-right");
  }

  if (preferBottom) {
    classes.push(yPct > 80 ? "is-above" : "is-below");
  } else {
    classes.push(yPct < 18 ? "is-below" : "is-above");
  }

  return classes.join(" ");
}

function pointToPercentString(value) {
  return `${Number(value).toFixed(4)}%`;
}

function renderOverlay(layerNode, annotation) {
  layerNode.innerHTML = "";

  const svg = createSvgNode("svg", {
    class: "astro-overlay__svg",
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });

  const constellationGroup = createSvgNode("g", { class: "astro-overlay__constellations" });
  const nebulaGroup = createSvgNode("g", { class: "astro-overlay__nebulae" });
  const guideGroup = createSvgNode("g", { class: "astro-overlay__guides" });

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
  });

  annotation.nebulae.forEach((nebula) => {
    nebulaGroup.appendChild(
      createSvgNode("ellipse", {
        class: "astro-overlay__nebula-ellipse",
        cx: nebula.xPct,
        cy: nebula.yPct,
        rx: nebula.radiusXPct,
        ry: nebula.radiusYPct,
        transform: `rotate(${nebula.rotationDeg} ${nebula.xPct} ${nebula.yPct})`,
      }),
    );
  });

  svg.append(constellationGroup, guideGroup, nebulaGroup);
  layerNode.appendChild(svg);

  annotation.constellations.forEach((constellation) => {
    const label = document.createElement("span");
    label.className =
      `astro-overlay__label astro-overlay__label--constellation ${resolveAnchorClasses(
        constellation.labelXPct,
        constellation.labelYPct,
        { preferBottom: true },
      )}`;
    label.style.left = pointToPercentString(constellation.labelXPct);
    label.style.top = pointToPercentString(constellation.labelYPct);
    label.textContent = constellation.name;
    layerNode.appendChild(label);
  });

  annotation.nebulae.forEach((nebula) => {
    const label = document.createElement("span");
    label.className =
      `astro-overlay__label astro-overlay__label--nebula ${resolveAnchorClasses(nebula.xPct, nebula.yPct)}`;
    label.style.left = pointToPercentString(nebula.xPct);
    label.style.top = pointToPercentString(nebula.yPct);
    label.textContent = nebula.catalogName ? `${nebula.name} · ${nebula.catalogName}` : nebula.name;
    layerNode.appendChild(label);
  });

  annotation.stars.forEach((star) => {
    const marker = document.createElement("span");
    marker.className = "astro-overlay__star";
    marker.style.left = pointToPercentString(star.xPct);
    marker.style.top = pointToPercentString(star.yPct);

    const dot = document.createElement("span");
    dot.className = "astro-overlay__star-dot";

    const label = document.createElement("span");
    label.className = `astro-overlay__label astro-overlay__label--star ${resolveAnchorClasses(star.xPct, star.yPct)}`;
    label.textContent = star.name;

    marker.append(dot, label);
    layerNode.appendChild(marker);
  });
}

export function createAstroOverlayController({ photoCard, imageNode, layerNode }) {
  if (!photoCard || !imageNode || !layerNode) {
    return {
      setImage() {},
      refresh() {},
      destroy() {},
    };
  }

  let activeAnnotation = null;
  let resizeObserver = null;
  let resizeFrame = 0;

  function syncLayout() {
    resizeFrame = 0;

    if (!activeAnnotation || imageNode.naturalWidth <= 0 || imageNode.clientWidth <= 0 || imageNode.clientHeight <= 0) {
      return;
    }

    const cardRect = photoCard.getBoundingClientRect();
    const imageRect = imageNode.getBoundingClientRect();
    if (!cardRect.width || !cardRect.height || !imageRect.width || !imageRect.height) {
      return;
    }

    const left = imageRect.left - cardRect.left;
    const top = imageRect.top - cardRect.top;
    layerNode.style.left = `${left.toFixed(2)}px`;
    layerNode.style.top = `${top.toFixed(2)}px`;
    layerNode.style.width = `${imageRect.width.toFixed(2)}px`;
    layerNode.style.height = `${imageRect.height.toFixed(2)}px`;
  }

  function requestLayout() {
    if (resizeFrame) {
      return;
    }
    resizeFrame = window.requestAnimationFrame(syncLayout);
  }

  function hide() {
    activeAnnotation = null;
    layerNode.hidden = true;
    layerNode.setAttribute("aria-hidden", "true");
    layerNode.classList.remove("is-active");
    layerNode.innerHTML = "";
    layerNode.style.left = "";
    layerNode.style.top = "";
    layerNode.style.width = "";
    layerNode.style.height = "";
  }

  function setImage(image) {
    const imageKey = image?.annotationKey || image?.id;
    const annotation = imageKey ? getAstroAnnotation(imageKey) : null;

    if (!annotation) {
      hide();
      return;
    }

    activeAnnotation = annotation;
    renderOverlay(layerNode, annotation);
    layerNode.hidden = false;
    layerNode.setAttribute("aria-hidden", "true");
    layerNode.classList.add("is-active");
    requestLayout();
  }

  imageNode.addEventListener("load", requestLayout);
  window.addEventListener("resize", requestLayout);

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => {
      requestLayout();
    });
    resizeObserver.observe(photoCard);
    resizeObserver.observe(imageNode);
  }

  return {
    setImage,
    refresh: requestLayout,
    destroy() {
      window.removeEventListener("resize", requestLayout);
      imageNode.removeEventListener("load", requestLayout);
      resizeObserver?.disconnect();
      if (resizeFrame) {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = 0;
      }
    },
  };
}
