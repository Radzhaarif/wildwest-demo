const DEFAULT_MAP_UI_LAYOUT = {
  designWidthPx: 1500,
  designHeightPx: 860,
  viewportPaddingPx: 8,
  allowUpscale: true,
  upscaleFactor: 0.5,
  minScale: 0.1,
  hudScaleReductionDivisor: 1.5,
  topButtonsScaleReductionDivisor: 1.5,
  mainMenuScaleReductionDivisor: 1.5,
  mainMenuScaleMultiplier: 1.2,
  settingsMenuScaleReductionDivisor: 1.5,
  settingsMenuScaleMultiplier: 1.2,
  settingsMenuFontScale: 1.5,
};

const DEFAULT_MAP_ORIENTATION = {
  forceLandscapeOnPhones: true,
  requireTouch: true,
  maxPhoneShortSidePx: 620,
  maxPhoneLongSidePx: 980,
  rotateDegrees: 90,
};

export function createMapUiScaleController(deps) {
  const {
    state,
    elements,
    getMapUiOverlayFrames,
    onViewportChange,
  } = deps;

  function setupMapUiViewportScale() {
    const resizeTarget = window.visualViewport || window;
    const handleViewportChange = () => {
      applyForcedLandscapeMode();
      applyMapUiScale();
      onViewportChange?.();
    };
    resizeTarget.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    handleViewportChange();
  }

  function applyMapUiScale() {
    applyForcedLandscapeMode();
    const layout = getMapUiLayoutConfig();
    const viewport = getMapViewportSize();
    const availableWidth = Math.max(1, viewport.width - layout.viewportPaddingPx * 2);
    const availableHeight = Math.max(1, viewport.height - layout.viewportPaddingPx * 2);
    const fitScale = Math.min(
      availableWidth / layout.designWidthPx,
      availableHeight / layout.designHeightPx,
    );
    const scale = fitScale > 1
      ? (layout.allowUpscale ? 1 + (fitScale - 1) * layout.upscaleFactor : 1)
      : Math.max(fitScale, layout.minScale);
    const settingsMenuScale = getReducedMapUiScale(scale, layout.settingsMenuScaleReductionDivisor)
      * layout.settingsMenuScaleMultiplier;
    const settingsMenuLocalScale = settingsMenuScale / Math.max(0.001, scale);

    document.documentElement.style.setProperty("--map-ui-current-scale", String(scale));
    document.documentElement.style.setProperty("--map-hud-scale", String(getReducedMapUiScale(scale, layout.hudScaleReductionDivisor)));
    document.documentElement.style.setProperty("--map-top-buttons-scale", String(getReducedMapUiScale(scale, layout.topButtonsScaleReductionDivisor)));
    document.documentElement.style.setProperty(
      "--main-menu-scale",
      String(getReducedMapUiScale(scale, layout.mainMenuScaleReductionDivisor) * layout.mainMenuScaleMultiplier),
    );
    document.documentElement.style.setProperty("--settings-menu-local-scale", String(settingsMenuLocalScale));
    document.documentElement.style.setProperty("--settings-menu-font-scale", String(layout.settingsMenuFontScale));
    document.documentElement.style.setProperty("--map-ui-design-width", `${layout.designWidthPx}px`);
    document.documentElement.style.setProperty("--map-ui-design-height", `${layout.designHeightPx}px`);
    document.documentElement.style.setProperty("--map-ui-viewport-padding", `${layout.viewportPaddingPx}px`);
    applyMapPermanentUiScale(elements.mapUiFrame, layout, scale);
    for (const frame of getMapUiOverlayFrames()) {
      applyMapUiFrameScale(frame, layout, scale);
    }
  }

  function applyMapPermanentUiScale(frame, layout, scale) {
    if (!frame) {
      return;
    }
    frame.style.width = "";
    frame.style.height = "";
    frame.style.setProperty("--map-ui-design-width", `${layout.designWidthPx}px`);
    frame.style.setProperty("--map-ui-design-height", `${layout.designHeightPx}px`);
    frame.style.setProperty("--map-ui-scale", String(scale));

    const panel = frame.firstElementChild;
    if (!panel) {
      return;
    }
    panel.style.setProperty("--map-ui-design-width", `${layout.designWidthPx}px`);
    panel.style.setProperty("--map-ui-design-height", `${layout.designHeightPx}px`);
    panel.style.setProperty("--map-ui-scale", String(scale));
  }

  function applyMapUiFrameScale(frame, layout, scale) {
    frame.style.width = `${layout.designWidthPx * scale}px`;
    frame.style.height = `${layout.designHeightPx * scale}px`;
    frame.style.setProperty("--map-ui-design-width", `${layout.designWidthPx}px`);
    frame.style.setProperty("--map-ui-design-height", `${layout.designHeightPx}px`);
    frame.style.setProperty("--map-ui-scale", String(scale));

    const panel = frame.firstElementChild;
    if (!panel) {
      return;
    }
    panel.style.setProperty("--map-ui-design-width", `${layout.designWidthPx}px`);
    panel.style.setProperty("--map-ui-design-height", `${layout.designHeightPx}px`);
    panel.style.setProperty("--map-ui-scale", String(scale));
  }

  function getMapViewportSize() {
    const viewport = getRawViewportSize();
    if (document.documentElement.classList.contains("is-forced-landscape")) {
      return {
        width: viewport.height,
        height: viewport.width,
      };
    }
    return viewport;
  }

  function getRawViewportSize() {
    const visualViewport = window.visualViewport;
    return {
      width: Number(visualViewport?.width) || window.innerWidth || document.documentElement.clientWidth || DEFAULT_MAP_UI_LAYOUT.designWidthPx,
      height: Number(visualViewport?.height) || window.innerHeight || document.documentElement.clientHeight || DEFAULT_MAP_UI_LAYOUT.designHeightPx,
    };
  }

  function applyForcedLandscapeMode() {
    const config = getMapOrientationConfig();
    const viewport = getRawViewportSize();
    const shouldForce = shouldForceLandscapeMode(config, viewport);
    document.documentElement.classList.toggle("is-forced-landscape", shouldForce);
    document.body?.classList.toggle("is-forced-landscape", shouldForce);
    document.documentElement.style.setProperty("--forced-landscape-rotation", `${config.rotateDegrees}deg`);
  }

  function shouldForceLandscapeMode(config, viewport) {
    if (!config.forceLandscapeOnPhones || viewport.width >= viewport.height) {
      return false;
    }

    const shortSide = Math.min(viewport.width, viewport.height);
    const longSide = Math.max(viewport.width, viewport.height);
    if (shortSide > config.maxPhoneShortSidePx || longSide > config.maxPhoneLongSidePx) {
      return false;
    }

    if (!config.requireTouch) {
      return true;
    }
    const hasTouch = Number(navigator.maxTouchPoints) > 0
      || window.matchMedia?.("(pointer: coarse)")?.matches === true;
    return hasTouch;
  }

  function getMapOrientationConfig() {
    const source = state.mapUiConfig?.orientation || {};
    return {
      forceLandscapeOnPhones: typeof source.forceLandscapeOnPhones === "boolean"
        ? source.forceLandscapeOnPhones
        : DEFAULT_MAP_ORIENTATION.forceLandscapeOnPhones,
      requireTouch: typeof source.requireTouch === "boolean"
        ? source.requireTouch
        : DEFAULT_MAP_ORIENTATION.requireTouch,
      maxPhoneShortSidePx: Math.max(
        1,
        getFiniteNumber(source.maxPhoneShortSidePx, DEFAULT_MAP_ORIENTATION.maxPhoneShortSidePx),
      ),
      maxPhoneLongSidePx: Math.max(
        1,
        getFiniteNumber(source.maxPhoneLongSidePx, DEFAULT_MAP_ORIENTATION.maxPhoneLongSidePx),
      ),
      rotateDegrees: clampNumber(
        getFiniteNumber(source.rotateDegrees, DEFAULT_MAP_ORIENTATION.rotateDegrees),
        -270,
        270,
      ),
    };
  }

  function getMapUiLayoutConfig() {
    const layout = state.mapUiConfig?.layout || {};
    const designWidthPx = getPositiveNumber(layout.designWidthPx, DEFAULT_MAP_UI_LAYOUT.designWidthPx);
    const designHeightPx = getPositiveNumber(layout.designHeightPx, DEFAULT_MAP_UI_LAYOUT.designHeightPx);
    const viewportPaddingPx = Math.max(0, getFiniteNumber(layout.viewportPaddingPx, DEFAULT_MAP_UI_LAYOUT.viewportPaddingPx));
    const upscaleFactor = clampNumber(
      getFiniteNumber(layout.upscaleFactor, DEFAULT_MAP_UI_LAYOUT.upscaleFactor),
      0,
      1,
    );
    const minScale = clampNumber(
      getFiniteNumber(layout.minScale, DEFAULT_MAP_UI_LAYOUT.minScale),
      0.1,
      2,
    );
    const hudScaleReductionDivisor = Math.max(1, getFiniteNumber(
      layout.hudScaleReductionDivisor,
      DEFAULT_MAP_UI_LAYOUT.hudScaleReductionDivisor,
    ));
    const topButtonsScaleReductionDivisor = Math.max(1, getFiniteNumber(
      layout.topButtonsScaleReductionDivisor,
      DEFAULT_MAP_UI_LAYOUT.topButtonsScaleReductionDivisor,
    ));
    const mainMenuScaleReductionDivisor = Math.max(1, getFiniteNumber(
      layout.mainMenuScaleReductionDivisor,
      DEFAULT_MAP_UI_LAYOUT.mainMenuScaleReductionDivisor,
    ));
    const mainMenuScaleMultiplier = Math.max(0.1, getFiniteNumber(
      layout.mainMenuScaleMultiplier,
      DEFAULT_MAP_UI_LAYOUT.mainMenuScaleMultiplier,
    ));
    const settingsMenuScaleReductionDivisor = Math.max(1, getFiniteNumber(
      layout.settingsMenuScaleReductionDivisor,
      DEFAULT_MAP_UI_LAYOUT.settingsMenuScaleReductionDivisor,
    ));
    const settingsMenuScaleMultiplier = Math.max(0.1, getFiniteNumber(
      layout.settingsMenuScaleMultiplier,
      DEFAULT_MAP_UI_LAYOUT.settingsMenuScaleMultiplier,
    ));
    const settingsMenuFontScale = Math.max(0.1, getFiniteNumber(
      layout.settingsMenuFontScale,
      DEFAULT_MAP_UI_LAYOUT.settingsMenuFontScale,
    ));
    return {
      designWidthPx,
      designHeightPx,
      viewportPaddingPx,
      allowUpscale: typeof layout.allowUpscale === "boolean"
        ? layout.allowUpscale
        : DEFAULT_MAP_UI_LAYOUT.allowUpscale,
      upscaleFactor,
      minScale,
      hudScaleReductionDivisor,
      topButtonsScaleReductionDivisor,
      mainMenuScaleReductionDivisor,
      mainMenuScaleMultiplier,
      settingsMenuScaleReductionDivisor,
      settingsMenuScaleMultiplier,
      settingsMenuFontScale,
    };
  }

  return {
    setupMapUiViewportScale,
    applyMapUiScale,
    getMapViewportSize,
    getRawViewportSize,
  };
}

function getReducedMapUiScale(scale, reductionDivisor) {
  if (scale >= 1) {
    return scale;
  }
  return 1 - (1 - scale) / Math.max(1, reductionDivisor);
}

function getFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getPositiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
