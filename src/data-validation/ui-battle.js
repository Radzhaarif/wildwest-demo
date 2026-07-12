import {
  requireIntegerInRange,
  requireNumberInRange,
  requireString,
  validateCatalogAssetPath,
} from "./common.js";

export function validateBattleUiConfigObject(config, source, issues, requiredTextKeys, requiredItemIds) {
  if (!config || typeof config !== "object") {
    issues.push(`${source}: battle UI config must be an object`);
    return;
  }

  if (!config.textKeys || typeof config.textKeys !== "object") {
    issues.push(`${source}.textKeys: must be an object`);
  } else {
    for (const [key, textKey] of Object.entries(config.textKeys)) {
      if (requireString(textKey, `${source}.textKeys.${key}`, issues)) {
        requiredTextKeys.add(textKey);
      }
    }
  }

  validateBattleUiTopButtons(config.topButtons, `${source}.topButtons`, issues, requiredTextKeys);
  const iconKeys = [
    "playerHealth",
    "playerHeal",
    "enemyHealth",
    "enemyShield",
    "enemyAggression",
    "enemyDamage",
    "enemyRage",
    "lightRed",
    "lightGold",
    "wall",
    "wall_1",
    "wall_2",
    "box",
    "vines",
  ];
  if (!config.icons || typeof config.icons !== "object") {
    issues.push(`${source}.icons: must be an object`);
  } else {
    const hasAnyWallIcon = Boolean(config.icons.wall || config.icons.wall_1 || config.icons.wall_2);
    if (!hasAnyWallIcon) {
      issues.push(`${source}.icons: at least one of wall, wall_1, wall_2 must be defined`);
    }
    for (const iconKey of iconKeys) {
      if (config.icons[iconKey] === undefined) {
        continue;
      }
      if (requireString(config.icons[iconKey], `${source}.icons.${iconKey}`, issues)) {
        validateCatalogAssetPath(config.icons[iconKey], "data/Assets/", `${source}.icons.${iconKey}`, issues);
      }
    }
  }

  if (!config.backgrounds || typeof config.backgrounds !== "object") {
    issues.push(`${source}.backgrounds: must be an object`);
  } else if (requireString(config.backgrounds.battleWindow, `${source}.backgrounds.battleWindow`, issues)) {
    validateCatalogAssetPath(
      config.backgrounds.battleWindow,
      "data/Assets/backgrounds/",
      `${source}.backgrounds.battleWindow`,
      issues,
    );
  }

  validateBattleHandItemIds(config.handItemIds, `${source}.handItemIds`, issues, requiredItemIds);
  validateBattleLayoutConfig(config.layout, `${source}.layout`, issues);
  validateBattleBoardConfig(config.board, `${source}.board`, issues);
  if (config.limits !== undefined && (!config.limits || typeof config.limits !== "object")) {
    issues.push(`${source}.limits: must be an object`);
  } else if (config.limits) {
    requireIntegerInRange(config.limits.enemyShieldMax, `${source}.limits.enemyShieldMax`, 0, 99, issues);
  }
  requireNumberInRange(config.feedback?.floatMessageMs, `${source}.feedback.floatMessageMs`, 0, Infinity, issues);
  validateBattleAvailableMoveSearchConfig(config.availableMoveSearch, `${source}.availableMoveSearch`, issues);
  validateBattleAnimationConfig(config.animations, `${source}.animations`, issues);
}

function validateBattleUiTopButtons(topButtons, path, issues, requiredTextKeys) {
  if (topButtons === undefined) {
    return;
  }
  if (!topButtons || typeof topButtons !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }

  for (const [buttonId, buttonConfig] of Object.entries(topButtons)) {
    const prefix = `${path}.${buttonId}`;
    if (!buttonConfig || typeof buttonConfig !== "object") {
      issues.push(`${prefix}: must be an object`);
      continue;
    }
    if (requireString(buttonConfig.textKey, `${prefix}.textKey`, issues)) {
      requiredTextKeys.add(buttonConfig.textKey);
    }
    if (requireString(buttonConfig.icon, `${prefix}.icon`, issues)) {
      validateCatalogAssetPath(buttonConfig.icon, "data/Assets/icons/", `${prefix}.icon`, issues);
    }
    if (buttonConfig.iconSizePx !== undefined) {
      requireNumberInRange(buttonConfig.iconSizePx, `${prefix}.iconSizePx`, 1, Infinity, issues);
    }
  }
}

function validateBattleLayoutConfig(layout, path, issues) {
  if (!layout || typeof layout !== "object") {
    issues.push(`${path}: must be an object`);
    return;
  }
  requireIntegerInRange(layout.designWidthPx, `${path}.designWidthPx`, 1, Infinity, issues);
  requireIntegerInRange(layout.designHeightPx, `${path}.designHeightPx`, 1, Infinity, issues);
  requireNumberInRange(layout.viewportPaddingPx, `${path}.viewportPaddingPx`, 0, Infinity, issues);
  if (typeof layout.allowUpscale !== "boolean") {
    issues.push(`${path}.allowUpscale: expected boolean`);
  }
  requireNumberInRange(layout.upscaleFactor, `${path}.upscaleFactor`, 0, 1, issues);
  requireNumberInRange(layout.minScale, `${path}.minScale`, 0.1, 2, issues);
}

function validateBattleHandItemIds(handItemIds, path, issues, requiredItemIds) {
  if (!Array.isArray(handItemIds) || handItemIds.length === 0) {
    issues.push(`${path}: must contain at least one itemId`);
    return;
  }
  handItemIds.forEach((itemId, index) => {
    if (requireString(itemId, `${path}[${index}]`, issues)) {
      requiredItemIds.add(itemId);
    }
  });
}

function validateBattleBoardConfig(board, path, issues) {
  if (!board || typeof board !== "object") {
    issues.push(`${path}: must be an object`);
    return;
  }
  requireIntegerInRange(board.width, `${path}.width`, 3, 30, issues);
  requireIntegerInRange(board.height, `${path}.height`, 3, 30, issues);
}

function validateBattleAvailableMoveSearchConfig(config, path, issues) {
  if (!config || typeof config !== "object") {
    issues.push(`${path}: must be an object`);
    return;
  }
  if (!Array.isArray(config.typeGroups) || config.typeGroups.length === 0) {
    issues.push(`${path}.typeGroups: must contain at least one group`);
    return;
  }
  config.typeGroups.forEach((group, groupIndex) => {
    const values = Array.isArray(group) ? group : [group];
    if (values.length === 0) {
      issues.push(`${path}.typeGroups[${groupIndex}]: must contain at least one item type or "*"`);
      return;
    }
    values.forEach((type, typeIndex) => {
      requireString(type, `${path}.typeGroups[${groupIndex}][${typeIndex}]`, issues);
    });
  });
}

function validateBattleAnimationConfig(animations, path, issues) {
  if (!animations || typeof animations !== "object") {
    issues.push(`${path}: must be an object`);
    return;
  }
  const requiredKeys = new Set([
    "swapMs",
    "invalidShakeMs",
    "matchShakeMs",
    "boardMoveMs",
    "boardMoveStepMs",
    "idleHintDelayMs",
    "idleHintShakeMs",
    "noMovesMessageMs",
    "noMovesShuffleMs",
    "outcomeBannerMs",
    "deathFlightPx",
  ]);
  const optionalKeys = [
    "swapMoveMs",
    "boardDropMs",
    "itemDropGapMs",
    "cascadeStepMs",
    "newItemSpawnOffsetPx",
    "newItemStackGapPx",
    "wallToggleMs",
    "healthChangeMs",
    "healthChangeFloatMs",
    "healthChangeFloatRisePx",
    "healthChangeScale",
    "healChangeMs",
    "healChangeFloatMs",
    "healChangeFloatRisePx",
    "healChangeScale",
    "aggressionChangeMs",
    "aggressionChangeFloatMs",
    "aggressionChangeFloatRisePx",
    "aggressionChangeScale",
    "lightDamageProjectileCount",
    "lightDamageProjectilesPerDamage",
    "lightDamageProjectileMs",
    "lightDamageProjectileArcHeightPx",
    "lightDamageProjectileSpreadPx",
    "lightDamageProjectileSizePx",
    "kamikazeBurstDistancePx",
    "rageWaveMs",
    "rageProjectileCount",
    "rageProjectileMs",
    "rageProjectileArcHeightPx",
    "rageProjectileSpreadPx",
    "rageProjectileSizePx",
  ];

  [
    ...requiredKeys,
  ].forEach((key) => {
    requireNumberInRange(animations[key], `${path}.${key}`, 0, Infinity, issues);
  });
  optionalKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(animations, key)) {
      requireNumberInRange(animations[key], `${path}.${key}`, 0, Infinity, issues);
    }
  });
  if (Object.prototype.hasOwnProperty.call(animations, "healthChangeScale")) {
    requireNumberInRange(animations.healthChangeScale, `${path}.healthChangeScale`, 1, Infinity, issues);
  }
  if (Object.prototype.hasOwnProperty.call(animations, "healChangeScale")) {
    requireNumberInRange(animations.healChangeScale, `${path}.healChangeScale`, 1, Infinity, issues);
  }
  if (Object.prototype.hasOwnProperty.call(animations, "aggressionChangeScale")) {
    requireNumberInRange(animations.aggressionChangeScale, `${path}.aggressionChangeScale`, 1, Infinity, issues);
  }
}
