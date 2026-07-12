import {
  requireIntegerInRange,
  requireNumberInRange,
  requireString,
  validateCatalogAssetPath,
  validateNumberRangeConfig,
} from "./common.js";

export function validateMapUiConfigObject(config, source, issues, requiredTextKeys) {
  if (!config || typeof config !== "object") {
    issues.push(`${source}: map UI config must be an object`);
    return;
  }

  validateMapUiLayout(config.layout, `${source}.layout`, issues);
  validateMapUiOrientation(config.orientation, `${source}.orientation`, issues);
  validateMapUiTopButtons(config.topButtons, `${source}.topButtons`, issues, requiredTextKeys);
  validateMapUiNodes(config.nodes, `${source}.nodes`, issues);
  validateMapUiDialog(config.dialog, `${source}.dialog`, issues);
  validateMapAnimationConfig(config.animation, `${source}.animation`, issues);
}

function validateMapUiLayout(layout, path, issues) {
  if (layout === undefined) {
    return;
  }
  if (!layout || typeof layout !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }
  requireIntegerInRange(layout.designWidthPx, `${path}.designWidthPx`, 1, Infinity, issues);
  requireIntegerInRange(layout.designHeightPx, `${path}.designHeightPx`, 1, Infinity, issues);
  requireNumberInRange(layout.viewportPaddingPx, `${path}.viewportPaddingPx`, 0, Infinity, issues);
  if (typeof layout.allowUpscale !== "boolean") {
    issues.push(`${path}.allowUpscale: must be a boolean`);
  }
  requireNumberInRange(layout.upscaleFactor, `${path}.upscaleFactor`, 0, 1, issues);
  requireNumberInRange(layout.minScale, `${path}.minScale`, 0.1, 2, issues);
  if (layout.hudScaleReductionDivisor !== undefined) {
    requireNumberInRange(layout.hudScaleReductionDivisor, `${path}.hudScaleReductionDivisor`, 1, Infinity, issues);
  }
  if (layout.topButtonsScaleReductionDivisor !== undefined) {
    requireNumberInRange(layout.topButtonsScaleReductionDivisor, `${path}.topButtonsScaleReductionDivisor`, 1, Infinity, issues);
  }
  if (layout.mainMenuScaleReductionDivisor !== undefined) {
    requireNumberInRange(layout.mainMenuScaleReductionDivisor, `${path}.mainMenuScaleReductionDivisor`, 1, Infinity, issues);
  }
  if (layout.mainMenuScaleMultiplier !== undefined) {
    requireNumberInRange(layout.mainMenuScaleMultiplier, `${path}.mainMenuScaleMultiplier`, 0.1, Infinity, issues);
  }
  if (layout.settingsMenuScaleReductionDivisor !== undefined) {
    requireNumberInRange(layout.settingsMenuScaleReductionDivisor, `${path}.settingsMenuScaleReductionDivisor`, 1, Infinity, issues);
  }
  if (layout.settingsMenuScaleMultiplier !== undefined) {
    requireNumberInRange(layout.settingsMenuScaleMultiplier, `${path}.settingsMenuScaleMultiplier`, 0.1, Infinity, issues);
  }
  if (layout.settingsMenuFontScale !== undefined) {
    requireNumberInRange(layout.settingsMenuFontScale, `${path}.settingsMenuFontScale`, 0.1, Infinity, issues);
  }
}

function validateMapUiOrientation(orientation, path, issues) {
  if (orientation === undefined) {
    return;
  }
  if (!orientation || typeof orientation !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }
  if (orientation.forceLandscapeOnPhones !== undefined && typeof orientation.forceLandscapeOnPhones !== "boolean") {
    issues.push(`${path}.forceLandscapeOnPhones: must be a boolean`);
  }
  if (orientation.requireTouch !== undefined && typeof orientation.requireTouch !== "boolean") {
    issues.push(`${path}.requireTouch: must be a boolean`);
  }
  if (orientation.maxPhoneShortSidePx !== undefined) {
    requireNumberInRange(orientation.maxPhoneShortSidePx, `${path}.maxPhoneShortSidePx`, 1, Infinity, issues);
  }
  if (orientation.maxPhoneLongSidePx !== undefined) {
    requireNumberInRange(orientation.maxPhoneLongSidePx, `${path}.maxPhoneLongSidePx`, 1, Infinity, issues);
  }
  if (orientation.rotateDegrees !== undefined) {
    requireNumberInRange(orientation.rotateDegrees, `${path}.rotateDegrees`, -270, 270, issues);
  }
}

function validateMapUiDialog(dialog, path, issues) {
  if (dialog === undefined) {
    return;
  }
  if (!dialog || typeof dialog !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }
  if (dialog.backdropOpacity !== undefined) {
    requireNumberInRange(dialog.backdropOpacity, `${path}.backdropOpacity`, 0, 1, issues);
  }
  if (dialog.backdropBlurPx !== undefined) {
    requireNumberInRange(dialog.backdropBlurPx, `${path}.backdropBlurPx`, 0, Infinity, issues);
  }
  if (dialog.textLetterMs !== undefined) {
    requireNumberInRange(dialog.textLetterMs, `${path}.textLetterMs`, 0, Infinity, issues);
  }
  if (dialog.answersFadeMs !== undefined) {
    requireNumberInRange(dialog.answersFadeMs, `${path}.answersFadeMs`, 0, Infinity, issues);
  }
  for (const field of ["characterImage", "characterWidthPx", "characterWidthPct", "characterBottomPx", "characterCenterXPct", "characterCenterYPct"]) {
    if (dialog[field] !== undefined) {
      issues.push(`${path}.${field}: character asset, size and position belong to dialog event payload, not map-ui`);
    }
  }
}

function validateMapUiNodes(nodes, path, issues) {
  if (nodes === undefined) {
    return;
  }
  if (!nodes || typeof nodes !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }
  if (nodes.hoverScale !== undefined) {
    requireNumberInRange(nodes.hoverScale, `${path}.hoverScale`, 1, Infinity, issues);
  }
  if (nodes.activeLightIcon !== undefined && requireString(nodes.activeLightIcon, `${path}.activeLightIcon`, issues)) {
    validateCatalogAssetPath(nodes.activeLightIcon, "data/Assets/", `${path}.activeLightIcon`, issues);
  }
  if (nodes.activeLightSizePx !== undefined) {
    requireNumberInRange(nodes.activeLightSizePx, `${path}.activeLightSizePx`, 1, Infinity, issues);
  }
  if (nodes.hoverLightIcon !== undefined && requireString(nodes.hoverLightIcon, `${path}.hoverLightIcon`, issues)) {
    validateCatalogAssetPath(nodes.hoverLightIcon, "data/Assets/", `${path}.hoverLightIcon`, issues);
  }
  if (nodes.hoverLightSizePx !== undefined) {
    requireNumberInRange(nodes.hoverLightSizePx, `${path}.hoverLightSizePx`, 1, Infinity, issues);
  }
  if (nodes.positionJitterPct !== undefined) {
    if (!nodes.positionJitterPct || typeof nodes.positionJitterPct !== "object") {
      issues.push(`${path}.positionJitterPct: must be an object when present`);
    } else {
      validateNumberRangeConfig(nodes.positionJitterPct.x, `${path}.positionJitterPct.x`, -100, 100, issues);
      validateNumberRangeConfig(nodes.positionJitterPct.y, `${path}.positionJitterPct.y`, -100, 100, issues);
    }
  }
  if (nodes.layoutPasses !== undefined) {
    requireIntegerInRange(nodes.layoutPasses, `${path}.layoutPasses`, 0, 20, issues);
  }
}

function validateMapUiTopButtons(topButtons, path, issues, requiredTextKeys) {
  if (topButtons === undefined) {
    return;
  }
  if (!topButtons || typeof topButtons !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }

  for (const [buttonId, config] of Object.entries(topButtons)) {
    const prefix = `${path}.${buttonId}`;
    if (!config || typeof config !== "object") {
      issues.push(`${prefix}: must be an object`);
      continue;
    }
    if (requireString(config.textKey, `${prefix}.textKey`, issues)) {
      requiredTextKeys.add(config.textKey);
    }
    if (requireString(config.icon, `${prefix}.icon`, issues)) {
      validateCatalogAssetPath(config.icon, "data/Assets/icons/", `${prefix}.icon`, issues);
    }
    if (config.iconSizePx !== undefined) {
      requireNumberInRange(config.iconSizePx, `${prefix}.iconSizePx`, 1, Infinity, issues);
    }
  }
}

function validateMapAnimationConfig(animation, path, issues) {
  if (animation === undefined) {
    return;
  }
  if (!animation || typeof animation !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }

  if (animation.enabled !== undefined && typeof animation.enabled !== "boolean") {
    issues.push(`${path}.enabled: expected boolean`);
  }

  const definitionTypes = validateMapAnimationDefinitions(
    animation.definitions,
    `${path}.definitions`,
    issues,
  );
  validateMapAnimationCounts(animation.counts, `${path}.counts`, issues, definitionTypes);
}

function validateMapAnimationDefinitions(definitions, path, issues) {
  const definitionTypes = new Set();
  if (!Array.isArray(definitions)) {
    issues.push(`${path}: must be an array`);
    return definitionTypes;
  }

  definitions.forEach((definition, index) => {
    const prefix = `${path}[${index}]`;
    if (!definition || typeof definition !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }
    requireString(definition.name, `${prefix}.name`, issues);
    if (requireString(definition.type, `${prefix}.type`, issues)) {
      definitionTypes.add(definition.type);
    }
    if (definition.enabled !== undefined && typeof definition.enabled !== "boolean") {
      issues.push(`${prefix}.enabled: expected boolean`);
    }
    if (definition.type === "bird") {
      validateMapBirdAnimationDefinition(definition, prefix, issues);
    }
  });

  return definitionTypes;
}

function validateMapBirdAnimationDefinition(definition, path, issues) {
  if (!Array.isArray(definition.frames) || definition.frames.length === 0) {
    issues.push(`${path}.frames: must contain at least one frame path`);
  } else {
    definition.frames.forEach((frame, frameIndex) => {
      if (requireString(frame, `${path}.frames[${frameIndex}]`, issues)) {
        validateCatalogAssetPath(frame, "data/Assets/", `${path}.frames[${frameIndex}]`, issues);
      }
    });
  }
  if (requireString(definition.glideFrame, `${path}.glideFrame`, issues)) {
    validateCatalogAssetPath(definition.glideFrame, "data/Assets/", `${path}.glideFrame`, issues);
  }
  validateNumberRangeConfig(definition.headingDegrees, `${path}.headingDegrees`, 0, 360, issues);
  requireNumberInRange(definition.frameIntervalMs, `${path}.frameIntervalMs`, 1, Infinity, issues);
  validateNumberRangeConfig(definition.glideDurationMs, `${path}.glideDurationMs`, 0, Infinity, issues);
  validateMapAnimationSpawnEdges(definition.spawnEdges, `${path}.spawnEdges`, issues);
  requireNumberInRange(definition.movementSpeedPxPerSecond, `${path}.movementSpeedPxPerSecond`, 1, Infinity, issues);
  if (definition.sizePx !== undefined) {
    requireNumberInRange(definition.sizePx, `${path}.sizePx`, 1, Infinity, issues);
  }
  if (definition.rotateWithHeading !== undefined && typeof definition.rotateWithHeading !== "boolean") {
    issues.push(`${path}.rotateWithHeading: expected boolean`);
  }
  if (definition.spriteAngleOffsetDegrees !== undefined) {
    requireNumberInRange(definition.spriteAngleOffsetDegrees, `${path}.spriteAngleOffsetDegrees`, -360, 360, issues);
  }
}

function validateMapAnimationSpawnEdges(spawnEdges, path, issues) {
  const validEdges = new Set(["left", "right", "top", "bottom"]);
  if (!Array.isArray(spawnEdges) || spawnEdges.length === 0) {
    issues.push(`${path}: must contain at least one edge`);
    return;
  }
  spawnEdges.forEach((edge, index) => {
    if (!validEdges.has(edge)) {
      issues.push(`${path}[${index}]: expected left, right, top or bottom`);
    }
  });
}

function validateMapAnimationCounts(counts, path, issues, definitionTypes) {
  if (!Array.isArray(counts)) {
    issues.push(`${path}: must be an array`);
    return;
  }

  counts.forEach((countConfig, index) => {
    const prefix = `${path}[${index}]`;
    if (!countConfig || typeof countConfig !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }
    if (requireString(countConfig.type, `${prefix}.type`, issues) && !definitionTypes.has(countConfig.type)) {
      issues.push(`${prefix}.type: no animation definition for type "${countConfig.type}"`);
    }
    requireIntegerInRange(countConfig.maxActive, `${prefix}.maxActive`, 0, 100, issues);
    validateNumberRangeConfig(countConfig.spawnIntervalMs, `${prefix}.spawnIntervalMs`, 0, Infinity, issues);
  });
}
