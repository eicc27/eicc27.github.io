const THEME_OVERRIDE_KEY = "eicc27-theme-override-v2";
const LEGACY_STORAGE_KEYS = ["eicc27-theme-override", "eicc27-sky-location"];
const REFRESH_INTERVAL_MS = 60000;
const AUTO_DAY_START = 6.5;
const AUTO_NIGHT_START = 18.5;
const DISPLAY_POSITIONS = {
  light: {
    sun: {
      visible: true,
      x: 0.5,
      y: 0.82,
    },
    moon: {
      visible: false,
      x: 0.82,
      y: -0.18,
    },
  },
  dark: {
    sun: {
      visible: false,
      x: 0.18,
      y: -0.18,
    },
    moon: {
      visible: true,
      x: 0.68,
      y: 0.74,
    },
  },
};

export function initDayCycleTheme() {
  const widget = document.querySelector("[data-daycycle]");
  const toggleButton = document.querySelector("[data-daycycle-toggle]");
  const hasWidgetControls = Boolean(widget && toggleButton);

  clearLegacyStorage();

  const root = document.documentElement;
  const elements = {
    widget,
    toggleButton,
    mode: document.querySelector("[data-daycycle-mode]"),
    stamp: document.querySelector("[data-daycycle-stamp]"),
    sun: document.querySelector("[data-daycycle-sun]"),
    moon: document.querySelector("[data-daycycle-moon]"),
  };

  const state = {
    override: hasWidgetControls ? readThemeOverride() : "",
    refreshTimer: 0,
  };

  function applyThemeSnapshot() {
    const now = new Date();
    const snapshot = buildThemeSnapshot(now);
    const manual = state.override === "light" || state.override === "dark";
    const activeTheme = manual ? state.override : snapshot.autoTheme;
    const visualPhase = manual ? (activeTheme === "dark" ? "night" : "day") : snapshot.phase;
    const nextManualTheme = snapshot.autoTheme === "dark" ? "light" : "dark";

    root.dataset.theme = activeTheme;
    root.dataset.themeSource = manual ? "manual" : "auto";
    root.style.colorScheme = activeTheme === "dark" ? "dark" : "light";

    if (elements.widget) {
      elements.widget.dataset.theme = activeTheme;
      elements.widget.dataset.source = manual ? "manual" : "auto";
      elements.widget.dataset.phase = visualPhase;
    }

    if (elements.mode) {
      elements.mode.textContent = manual ? activeTheme.toUpperCase() : "AUTO";
    }

    if (elements.stamp) {
      elements.stamp.textContent = formatClock(now);
    }

    const positions = DISPLAY_POSITIONS[activeTheme];
    setWidgetBody(elements.sun, activeTheme === "light", positions.sun);
    setWidgetBody(elements.moon, activeTheme === "dark", positions.moon);

    const ariaLabel = manual
      ? `当前为手动${formatThemeLabel(activeTheme)}模式，点击恢复自动切换`
      : `当前为自动${formatThemeLabel(activeTheme)}模式，点击临时切换到${formatThemeLabel(nextManualTheme)}`;

    if (elements.toggleButton) {
      elements.toggleButton.setAttribute("aria-label", ariaLabel);
      elements.toggleButton.title = ariaLabel;
    }
  }

  function scheduleRefresh() {
    if (state.refreshTimer) {
      window.clearInterval(state.refreshTimer);
    }

    state.refreshTimer = window.setInterval(() => {
      applyThemeSnapshot();
    }, REFRESH_INTERVAL_MS);
  }

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      if (state.override) {
        state.override = "";
        clearThemeOverride();
        applyThemeSnapshot();
        return;
      }

      const autoTheme = buildThemeSnapshot(new Date()).autoTheme;
      state.override = autoTheme === "dark" ? "light" : "dark";
      writeThemeOverride(state.override);
      applyThemeSnapshot();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      applyThemeSnapshot();
    }
  });

  window.addEventListener("focus", applyThemeSnapshot);

  applyThemeSnapshot();
  scheduleRefresh();
}

function clearLegacyStorage() {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Ignore storage failures.
  }
}

function setWidgetBody(node, active, display) {
  if (!node || !display) {
    return;
  }

  node.dataset.active = active ? "true" : "false";
  node.dataset.visible = display.visible ? "true" : "false";
  node.style.setProperty("--daycycle-x", display.x.toFixed(4));
  node.style.setProperty("--daycycle-y", display.y.toFixed(4));
}

function buildThemeSnapshot(now) {
  const hourValue = now.getHours() + now.getMinutes() / 60;
  const autoTheme = hourValue >= AUTO_DAY_START && hourValue < AUTO_NIGHT_START ? "light" : "dark";

  if (hourValue >= AUTO_DAY_START - 0.75 && hourValue < AUTO_DAY_START + 0.75) {
    return {
      autoTheme,
      phase: "sunrise",
    };
  }

  if (hourValue >= AUTO_NIGHT_START - 0.75 && hourValue < AUTO_NIGHT_START + 0.75) {
    return {
      autoTheme,
      phase: "sunset",
    };
  }

  return {
    autoTheme,
    phase: autoTheme === "light" ? "day" : "night",
  };
}

function formatThemeLabel(theme) {
  return theme === "dark" ? "深色" : "浅色";
}

function formatClock(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function readThemeOverride() {
  try {
    const stored = window.localStorage.getItem(THEME_OVERRIDE_KEY);
    return stored === "light" || stored === "dark" ? stored : "";
  } catch {
    return "";
  }
}

function writeThemeOverride(value) {
  try {
    window.localStorage.setItem(THEME_OVERRIDE_KEY, value);
  } catch {
    // Ignore storage failures.
  }
}

function clearThemeOverride() {
  try {
    window.localStorage.removeItem(THEME_OVERRIDE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
