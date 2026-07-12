export const DEFAULT_LOAD_UI_CONFIG = {
  background: {
    color: "#ffffff",
  },
  logo: {
    image: "data/Assets/logo.png",
    fadeInMs: 2000,
    minVisibleMs: 3000,
    fit: "contain",
    widthVw: 100,
    heightVh: 100,
    responsive: {
      designWidthPx: 900,
      designHeightPx: 520,
      shrinkSpeed: 0.42,
      minWidthVw: 78,
      minHeightVh: 72,
      compactReservedBottomPx: 52,
    },
  },
  wave: {
    enabled: true,
    delayMs: 2000,
    durationMs: 1400,
    widthPct: 28,
    opacity: 0.72,
    repeat: false,
  },
  progress: {
    enabled: true,
    widthVw: 72,
    heightPx: 12,
    bottomPx: 48,
    trackColor: "rgba(0, 0, 0, 0.14)",
    fillColor: "#111111",
    radiusPx: 999,
    showPercent: false,
  },
  caption: {
    enabled: true,
    textKey: "loading.title",
    fallback: "Loading",
    bottomPx: 22,
    fontSizePx: 18,
    color: "rgba(0, 0, 0, 0.62)",
  },
  details: {
    showCurrentFile: false,
    showStatusText: false,
  },
};

export function createMapLoadingUiController(deps) {
  const {
    state,
    elements,
    loadJsonc,
    loadUiConfigUrl,
    resolveAssetPath,
    getMapViewportSize,
  } = deps;

  let loadingOverlayVisibleSince = 0;
  let loadingOverlayHideTimerId = 0;
  let loadingOverlayRunId = 0;
  let loadingLogoResizeHandler = null;

  async function loadLoadUiConfig() {
    try {
      const config = await loadJsonc(loadUiConfigUrl);
      return normalizeLoadUiConfig(config);
    } catch (error) {
      console.warn("Failed to load load UI config, using fallback", error);
      return normalizeLoadUiConfig(DEFAULT_LOAD_UI_CONFIG);
    }
  }

  function normalizeLoadUiConfig(config = {}) {
    const source = config && typeof config === "object" ? config : {};
    const fallback = DEFAULT_LOAD_UI_CONFIG;
    const background = source.background || {};
    const logo = source.logo || {};
    const logoResponsive = logo.responsive || {};
    const wave = source.wave || {};
    const progress = source.progress || {};
    const caption = source.caption || {};
    const details = source.details || {};

    return {
      background: {
        color: typeof background.color === "string" ? background.color : fallback.background.color,
      },
      logo: {
        image: typeof logo.image === "string" ? logo.image : fallback.logo.image,
        fadeInMs: Math.max(0, getFiniteNumber(logo.fadeInMs, fallback.logo.fadeInMs)),
        minVisibleMs: Math.max(0, getFiniteNumber(logo.minVisibleMs, fallback.logo.minVisibleMs)),
        fit: typeof logo.fit === "string" ? logo.fit : fallback.logo.fit,
        widthVw: Math.max(1, getFiniteNumber(logo.widthVw, fallback.logo.widthVw)),
        heightVh: Math.max(1, getFiniteNumber(logo.heightVh, fallback.logo.heightVh)),
        responsive: {
          designWidthPx: Math.max(1, getFiniteNumber(logoResponsive.designWidthPx, fallback.logo.responsive.designWidthPx)),
          designHeightPx: Math.max(1, getFiniteNumber(logoResponsive.designHeightPx, fallback.logo.responsive.designHeightPx)),
          shrinkSpeed: clampNumber(getFiniteNumber(logoResponsive.shrinkSpeed, fallback.logo.responsive.shrinkSpeed), 0, 1),
          minWidthVw: clampNumber(getFiniteNumber(logoResponsive.minWidthVw, fallback.logo.responsive.minWidthVw), 1, 100),
          minHeightVh: clampNumber(getFiniteNumber(logoResponsive.minHeightVh, fallback.logo.responsive.minHeightVh), 1, 100),
          compactReservedBottomPx: Math.max(
            0,
            getFiniteNumber(logoResponsive.compactReservedBottomPx, fallback.logo.responsive.compactReservedBottomPx),
          ),
        },
      },
      wave: {
        enabled: wave.enabled !== false,
        delayMs: Math.max(0, getFiniteNumber(wave.delayMs, getFiniteNumber(logo.fadeInMs, fallback.logo.fadeInMs))),
        durationMs: Math.max(1, getFiniteNumber(wave.durationMs, fallback.wave.durationMs)),
        widthPct: Math.max(1, getFiniteNumber(wave.widthPct, fallback.wave.widthPct)),
        opacity: clampNumber(getFiniteNumber(wave.opacity, fallback.wave.opacity), 0, 1),
        repeat: wave.repeat === true,
      },
      progress: {
        enabled: progress.enabled !== false,
        widthVw: Math.max(1, getFiniteNumber(progress.widthVw, fallback.progress.widthVw)),
        heightPx: Math.max(1, getFiniteNumber(progress.heightPx, fallback.progress.heightPx)),
        bottomPx: Math.max(0, getFiniteNumber(progress.bottomPx, fallback.progress.bottomPx)),
        trackColor: typeof progress.trackColor === "string" ? progress.trackColor : fallback.progress.trackColor,
        fillColor: typeof progress.fillColor === "string" ? progress.fillColor : fallback.progress.fillColor,
        radiusPx: Math.max(0, getFiniteNumber(progress.radiusPx, fallback.progress.radiusPx)),
        showPercent: progress.showPercent === true,
      },
      caption: {
        enabled: caption.enabled !== false,
        textKey: typeof caption.textKey === "string" ? caption.textKey : fallback.caption.textKey,
        fallback: typeof caption.fallback === "string" ? caption.fallback : fallback.caption.fallback,
        bottomPx: Math.max(0, getFiniteNumber(caption.bottomPx, fallback.caption.bottomPx)),
        fontSizePx: Math.max(1, getFiniteNumber(caption.fontSizePx, fallback.caption.fontSizePx)),
        color: typeof caption.color === "string" ? caption.color : fallback.caption.color,
      },
      details: {
        showCurrentFile: details.showCurrentFile === true,
        showStatusText: details.showStatusText === true,
      },
    };
  }

  function applyLoadingOverlayConfig() {
    const config = state.loadConfig || DEFAULT_LOAD_UI_CONFIG;
    const overlay = elements.loadingOverlay;
    if (!overlay) {
      return;
    }

    overlay.style.setProperty("--loading-background", config.background.color);
    overlay.style.setProperty("--loading-logo-fade-ms", `${config.logo.fadeInMs}ms`);
    overlay.style.setProperty("--loading-logo-width", `${config.logo.widthVw}vw`);
    overlay.style.setProperty("--loading-logo-height", `${config.logo.heightVh}vh`);
    overlay.style.setProperty("--loading-logo-fit", config.logo.fit);
    overlay.style.setProperty("--loading-compact-reserved-bottom", `${config.logo.responsive.compactReservedBottomPx}px`);
    overlay.style.setProperty("--loading-wave-delay-ms", `${config.wave.delayMs}ms`);
    overlay.style.setProperty("--loading-wave-ms", `${config.wave.durationMs}ms`);
    overlay.style.setProperty("--loading-wave-width", `${config.wave.widthPct}vw`);
    overlay.style.setProperty("--loading-wave-opacity", String(config.wave.opacity));
    overlay.style.setProperty("--loading-progress-width", `${config.progress.widthVw}vw`);
    overlay.style.setProperty("--loading-progress-height", `${config.progress.heightPx}px`);
    overlay.style.setProperty("--loading-progress-bottom", `${config.progress.bottomPx}px`);
    overlay.style.setProperty("--loading-progress-track", config.progress.trackColor);
    overlay.style.setProperty("--loading-progress-fill", config.progress.fillColor);
    overlay.style.setProperty("--loading-progress-radius", `${config.progress.radiusPx}px`);
    overlay.style.setProperty("--loading-caption-bottom", `${config.caption.bottomPx}px`);
    overlay.style.setProperty("--loading-caption-font-size", `${config.caption.fontSizePx}px`);
    overlay.style.setProperty("--loading-caption-color", config.caption.color);
    const progressTopPx = config.progress.enabled ? config.progress.bottomPx + config.progress.heightPx : 0;
    const captionTopPx = config.caption.enabled ? config.caption.bottomPx + config.caption.fontSizePx : 0;
    const statusTopPx = config.details.showStatusText
      ? config.progress.bottomPx + config.progress.heightPx + config.caption.fontSizePx + 18
      : 0;
    const reservedBottomPx = Math.max(progressTopPx, captionTopPx, statusTopPx, 72) + 28;
    overlay.style.setProperty("--loading-reserved-bottom", `${Math.round(reservedBottomPx)}px`);
    updateLoadingLogoResponsiveSize();
    attachLoadingLogoResizeHandler();
    overlay.classList.toggle("is-progress-visible", config.progress.enabled);
    overlay.classList.toggle("is-percent-visible", config.progress.enabled && config.progress.showPercent);
    overlay.classList.toggle("is-caption-hidden", !config.caption.enabled);
    overlay.classList.toggle("is-status-visible", config.details.showStatusText);

    if (elements.loadingLogo) {
      elements.loadingLogo.src = resolveAssetPath(config.logo.image);
    }
    if (elements.loadingWave) {
      elements.loadingWave.classList.toggle("hidden", !config.wave.enabled);
      elements.loadingWave.classList.toggle("is-repeating", config.wave.repeat);
    }
  }

  function attachLoadingLogoResizeHandler() {
    if (loadingLogoResizeHandler) {
      return;
    }
    loadingLogoResizeHandler = () => updateLoadingLogoResponsiveSize();
    window.addEventListener("resize", loadingLogoResizeHandler);
  }

  function updateLoadingLogoResponsiveSize() {
    const config = state.loadConfig || DEFAULT_LOAD_UI_CONFIG;
    const overlay = elements.loadingOverlay;
    if (!overlay) {
      return;
    }

    const responsive = config.logo.responsive || DEFAULT_LOAD_UI_CONFIG.logo.responsive;
    const viewport = getMapViewportSize();
    const viewportWidth = Math.max(1, viewport.width || responsive.designWidthPx);
    const viewportHeight = Math.max(1, viewport.height || responsive.designHeightPx);
    const fitScale = Math.min(viewportWidth / responsive.designWidthPx, viewportHeight / responsive.designHeightPx);
    const logoScale = fitScale >= 1 ? 1 : 1 - (1 - fitScale) * responsive.shrinkSpeed;
    const targetWidthPx = Math.max(
      viewportWidth * (config.logo.widthVw / 100) * logoScale,
      viewportWidth * (responsive.minWidthVw / 100),
    );
    const targetHeightPx = Math.max(
      viewportHeight * (config.logo.heightVh / 100) * logoScale,
      viewportHeight * (responsive.minHeightVh / 100),
    );

    overlay.style.setProperty("--loading-logo-target-width", `${Math.round(targetWidthPx)}px`);
    overlay.style.setProperty("--loading-logo-target-height", `${Math.round(targetHeightPx)}px`);
  }

  function showLoadingOverlay({ title, status } = {}) {
    if (!elements.loadingOverlay) {
      return;
    }
    const wasVisible = loadingOverlayVisibleSince > 0
      && !elements.loadingOverlay.classList.contains("hidden");
    if (loadingOverlayHideTimerId) {
      window.clearTimeout(loadingOverlayHideTimerId);
      loadingOverlayHideTimerId = 0;
    }
    loadingOverlayRunId += 1;
    if (!loadingOverlayVisibleSince) {
      loadingOverlayVisibleSince = Date.now();
    }
    elements.loadingOverlay.classList.remove("hidden");
    elements.loadingOverlay.setAttribute("aria-busy", "true");
    if (!wasVisible) {
      restartLoadingLogoAnimations();
    }
    if (elements.loadingTitle) {
      elements.loadingTitle.textContent = getLoadingCaptionText(title);
    }
    if (wasVisible) {
      if (elements.loadingStatus) {
        elements.loadingStatus.textContent = getLoadingStatusText(status);
      }
      return;
    }
    updateLoadingOverlay({ status: status || loadingText("loading.assets", "Loading assets") });
  }

  function hideLoadingOverlay() {
    if (!elements.loadingOverlay) {
      return;
    }
    const runId = loadingOverlayRunId;
    const minVisibleMs = getLoadingMinimumVisibleMs();
    const elapsed = loadingOverlayVisibleSince ? Date.now() - loadingOverlayVisibleSince : minVisibleMs;
    const remainingMs = Math.max(0, minVisibleMs - elapsed);
    const finishHide = () => {
      if (runId !== loadingOverlayRunId) {
        return;
      }
      elements.loadingOverlay.classList.add("hidden");
      elements.loadingOverlay.classList.remove("is-loading-animated");
      elements.loadingOverlay.setAttribute("aria-busy", "false");
      loadingOverlayVisibleSince = 0;
      loadingOverlayHideTimerId = 0;
    };

    if (remainingMs > 0) {
      loadingOverlayHideTimerId = window.setTimeout(finishHide, remainingMs);
      return;
    }
    finishHide();
  }

  function restartLoadingLogoAnimations() {
    if (!elements.loadingOverlay) {
      return;
    }
    elements.loadingOverlay.classList.remove("is-loading-animated");
    void elements.loadingOverlay.offsetWidth;
    elements.loadingOverlay.classList.add("is-loading-animated");
  }

  function showLoadingError(error) {
    const title = loadingText("loading.error", "Loading error");
    const status = error?.message || String(error);
    showLoadingOverlay({
      title,
      status,
    });
    if (elements.loadingOverlay) {
      elements.loadingOverlay.classList.add("is-status-visible");
      elements.loadingOverlay.classList.remove("is-caption-hidden");
    }
    if (elements.loadingTitle) {
      elements.loadingTitle.textContent = title;
    }
    updateLoadingOverlay({
      loaded: 0,
      total: 1,
      status,
    });
    if (elements.loadingStatus) {
      elements.loadingStatus.textContent = status;
    }
  }

  function updateLoadingOverlay({ loaded = 0, total = 1, status = "" } = {}) {
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeLoaded = Math.max(0, Math.min(Number(loaded) || 0, safeTotal));
    const percent = Math.round((safeLoaded / safeTotal) * 100);
    if (elements.loadingProgressBar) {
      elements.loadingProgressBar.style.width = `${percent}%`;
    }
    if (elements.loadingProgressText) {
      elements.loadingProgressText.textContent = `${percent}%`;
    }
    if (elements.loadingStatus && status) {
      elements.loadingStatus.textContent = getLoadingStatusText(status);
    }
  }

  function getAssetPreloadStatus(baseStatus, current, failed) {
    if (failed?.length) {
      return formatTextWithFallback(
        "loading.failed",
        "Failed assets: {count}",
        { count: failed.length },
      );
    }
    if (!current) {
      return baseStatus || loadingText("loading.assets", "Loading assets");
    }
    if (!shouldShowLoadingCurrentFile()) {
      return baseStatus || loadingText("loading.assets", "Loading assets");
    }
    return `${baseStatus || loadingText("loading.assets", "Loading assets")}: ${getAssetFileName(current)}`;
  }

  function getLoadingCaptionText(explicitTitle) {
    const caption = state.loadConfig?.caption || DEFAULT_LOAD_UI_CONFIG.caption;
    if (explicitTitle && !state.locale?.[caption.textKey]) {
      return explicitTitle;
    }
    return state.locale?.[caption.textKey] || caption.fallback || explicitTitle || "Loading";
  }

  function getLoadingStatusText(status) {
    if (state.loadConfig?.details?.showStatusText) {
      return status || getLoadingCaptionText();
    }
    return getLoadingCaptionText();
  }

  function shouldShowLoadingCurrentFile() {
    return state.loadConfig?.details?.showCurrentFile === true;
  }

  function getLoadingMinimumVisibleMs() {
    return Math.max(0, getFiniteNumber(
      state.loadConfig?.logo?.minVisibleMs,
      DEFAULT_LOAD_UI_CONFIG.logo.minVisibleMs,
    ));
  }

  function getAssetFileName(assetPath) {
    const normalized = String(assetPath || "").replaceAll("\\", "/");
    return normalized.split("/").pop() || normalized;
  }

  function loadingText(key, fallback) {
    return state.locale?.[key] || fallback;
  }

  function formatTextWithFallback(key, fallback, values) {
    return Object.entries(values).reduce((text, [name, value]) => {
      return text.replaceAll(`{${name}}`, String(value));
    }, state.locale?.[key] || fallback);
  }

  return {
    loadLoadUiConfig,
    normalizeLoadUiConfig,
    applyLoadingOverlayConfig,
    updateLoadingLogoResponsiveSize,
    showLoadingOverlay,
    hideLoadingOverlay,
    showLoadingError,
    updateLoadingOverlay,
    getAssetPreloadStatus,
    loadingText,
    formatTextWithFallback,
  };
}

function getFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
