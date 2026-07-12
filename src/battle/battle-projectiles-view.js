import { wait } from "./battle-animations.js";

export function triggerBattleLightDamageProjectiles(deps, context, iconWrapper, statDelta, modifier, sourceElements = [], options = {}) {
  // Projectile effects только визуальные: они возвращают задержку до impact,
  // чтобы health feedback синхронизировался с полетом, но не меняют state.
  const normalizedStatDelta = Number(statDelta) || 0;
  const resolvedOptions = Array.isArray(options) ? {} : options;
  const sourceConfig = getBattleStatProjectileConfig(deps, context, modifier, normalizedStatDelta, resolvedOptions);
  if (!sourceConfig?.enabled || !iconWrapper) {
    return 0;
  }
  const rawAmount = Math.abs(normalizedStatDelta);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return 0;
  }
  const targetIcon = sourceConfig.targetSelector
    ? iconWrapper.querySelector(sourceConfig.targetSelector)
    : iconWrapper.querySelector("img");
  const resolvedSourceElements = Array.isArray(sourceElements)
    ? sourceElements.filter((element) => element && element.isConnected)
    : [];
  const allowFallbackSource = !resolvedOptions.disableFallbackSource;
  if (!targetIcon) {
    return 0;
  }
  const fxLayer = context?.battleRenderTargets?.battleFxLayer;
  if (!fxLayer) {
    return 0;
  }
  const iconPath = deps.resolveAssetPath(sourceConfig.iconPath);

  const animationConfig = deps.getBattleAnimationConfig(context);
  const perDamage = Number(animationConfig.lightDamageProjectilesPerDamage);
  const baseCount = Number(animationConfig.lightDamageProjectileCount);
  let firstImpactMs = Number.POSITIVE_INFINITY;
  const projectileCount = Number.isFinite(perDamage) && perDamage > 0
    ? Math.max(1, Math.round(rawAmount * perDamage))
    : Number.isFinite(baseCount) && baseCount > 0
      ? Math.round(baseCount)
      : deps.DEFAULT_LIGHT_PROJECTILE_COUNT;
  const finalCount = Math.max(
    deps.MIN_DAMAGE_PROJECTILES,
    Math.min(
      deps.MAX_DAMAGE_PROJECTILES,
      Math.round(projectileCount) || deps.MIN_DAMAGE_PROJECTILES,
    ),
  );
  if (!finalCount) {
    return 0;
  }

  const durationMs = Math.max(0, Number(animationConfig.lightDamageProjectileMs || deps.DEFAULT_LIGHT_PROJECTILE_MS));
  const arcHeightPx = Math.max(0, Number(animationConfig.lightDamageProjectileArcHeightPx || deps.DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX));
  const spreadPx = Math.max(0, Number(animationConfig.lightDamageProjectileSpreadPx || deps.DEFAULT_LIGHT_PROJECTILE_SPREAD_PX));
  const sizePx = Math.max(8, Number(animationConfig.lightDamageProjectileSizePx || deps.DEFAULT_LIGHT_PROJECTILE_SIZE_PX));

  const layerRect = fxLayer.getBoundingClientRect();
  const getSourceRect = (sourceElement) => {
    if (sourceElement) {
      return sourceElement.getBoundingClientRect();
    }
    if (!allowFallbackSource) {
      return null;
    }
    const fallbackSource = getBattleProjectileSourceIcon(context, sourceConfig.sourceSelector);
    return fallbackSource ? fallbackSource.getBoundingClientRect() : null;
  };
  const targetRect = targetIcon.getBoundingClientRect();
  const end = {
    x: targetRect.left + targetRect.width * 0.5 - layerRect.left,
    y: targetRect.top + targetRect.height * 0.5 - layerRect.top,
  };
  const defaultSourceRect = (() => {
    if (!allowFallbackSource) {
      return null;
    }
    const fallbackSource = getBattleProjectileSourceIcon(context, sourceConfig.sourceSelector);
    return fallbackSource ? fallbackSource.getBoundingClientRect() : null;
  })();
  if (!defaultSourceRect && resolvedSourceElements.length === 0) {
    return 0;
  }

  for (let index = 0; index < finalCount; index += 1) {
    const sourceElement = resolvedSourceElements[index % resolvedSourceElements.length]
      || (allowFallbackSource ? getBattleProjectileSourceIcon(context, sourceConfig.sourceSelector) : null);
    const sourceRect = getSourceRect(sourceElement);
    if (!sourceRect) {
      continue;
    }
    const start = {
      x: sourceRect.left + sourceRect.width * 0.5 - layerRect.left,
      y: sourceRect.top + sourceRect.height * 0.5 - layerRect.top,
    };
    const projectile = document.createElement("div");
    projectile.className = "battle-damage-light-projectile";
    projectile.style.left = `${start.x}px`;
    projectile.style.top = `${start.y}px`;
    projectile.style.width = `${sizePx}px`;
    projectile.style.height = `${sizePx}px`;

    const img = document.createElement("img");
    img.src = iconPath;
    img.alt = "";
    img.draggable = false;
    projectile.append(img);
    fxLayer.append(projectile);

    const sideSign = Math.random() < 0.5 ? -1 : 1;
    const sideSpread = spreadPx > 0 ? (Math.random() * 2 - 1) * spreadPx : 0;
    const heightSpread = arcHeightPx > 0
      ? arcHeightPx * (0.75 + Math.random() * 0.45)
      : 0;
    const mid = {
      x: ((start.x + end.x) * 0.5) + sideSpread,
      y: ((start.y + end.y) * 0.5) - sideSign * heightSpread,
    };
    const delayMs = Math.max(0, Math.floor(index * 40));
    const thisDuration = Math.max(250, durationMs + Math.floor((Math.random() * 0.2 - 0.1) * durationMs));
    const thisImpactMs = delayMs + thisDuration;
    if (thisImpactMs < firstImpactMs) {
      firstImpactMs = thisImpactMs;
    }

    const animation = projectile.animate([
      {
        transform: "translate(0px, 0px) scale(0.7)",
        opacity: 0,
      },
      {
        offset: 0.15,
        opacity: 1,
        transform: "translate(0px, 0px) scale(1)",
      },
      {
        offset: 0.72,
        transform: `translate(${mid.x - start.x}px, ${mid.y - start.y}px) scale(1.1)`,
        opacity: 1,
      },
      {
        transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(0.75)`,
        opacity: 0,
      },
    ], {
      duration: thisDuration,
      delay: delayMs,
      easing: "ease-in-out",
      fill: "forwards",
    });

    const cleanupProjectile = () => {
      if (projectile.isConnected) {
        projectile.remove();
      }
    };
    projectile.addEventListener("animationend", cleanupProjectile, { once: true });
    window.setTimeout(cleanupProjectile, thisDuration + delayMs + 50);

    if (animation.playState !== "finished") {
      animation.play();
    }
  }

  return Number.isFinite(firstImpactMs) && firstImpactMs !== Number.POSITIVE_INFINITY
    ? Math.floor(firstImpactMs)
    : 0;
}

export async function animateBattleRageWave(deps, context, boardElement) {
  if (!boardElement) {
    return;
  }
  const animationConfig = deps.getBattleAnimationConfig(context);
  const durationMs = Math.max(0, Number(animationConfig.rageWaveMs) || 0);
  if (durationMs <= 0) {
    return;
  }

  const icons = Array.from(boardElement.querySelectorAll(".battle-cell-icon"));
  icons.forEach((iconWrap, index) => {
    iconWrap.style.setProperty("--battle-rage-wave-ms", `${durationMs}ms`);
    iconWrap.style.setProperty("--battle-rage-wave-delay-ms", `${Math.min(220, index * 12)}ms`);
    iconWrap.classList.remove("is-rage-wave");
    void iconWrap.offsetWidth;
    iconWrap.classList.add("is-rage-wave");
  });

  await wait(durationMs + Math.min(220, Math.max(0, icons.length - 1) * 12));
  icons.forEach((iconWrap) => {
    iconWrap.classList.remove("is-rage-wave");
    iconWrap.style.removeProperty("--battle-rage-wave-ms");
    iconWrap.style.removeProperty("--battle-rage-wave-delay-ms");
  });
}

export async function animateBattleRageProjectiles(deps, context, boardElement, targetIcons = null) {
  const targets = Array.isArray(targetIcons) ? targetIcons : getBattleRageTargetIcons(deps, context, boardElement);
  const sourceIcon = deps.getBattleEnemyStatRoot(context)?.querySelector('[data-battle-stat="enemy-rage"] img');
  const fxLayer = context.battleRenderTargets?.battleFxLayer;
  if (!sourceIcon || !fxLayer || targets.length === 0) {
    return;
  }

  const animationConfig = deps.getBattleAnimationConfig(context);
  const uiConfig = deps.getBattleUiConfig(context);
  const projectileCount = Math.max(1, Math.floor(Number(animationConfig.rageProjectileCount) || 1));
  const durationMs = Math.max(0, Number(animationConfig.rageProjectileMs) || deps.DEFAULT_LIGHT_PROJECTILE_MS);
  const arcHeightPx = Math.max(0, Number(animationConfig.rageProjectileArcHeightPx) || deps.DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX);
  const spreadPx = Math.max(0, Number(animationConfig.rageProjectileSpreadPx) || deps.DEFAULT_LIGHT_PROJECTILE_SPREAD_PX);
  const sizePx = Math.max(8, Number(animationConfig.rageProjectileSizePx) || deps.DEFAULT_LIGHT_PROJECTILE_SIZE_PX);
  const iconPath = deps.resolveAssetPath(uiConfig.icons.lightGold || deps.DEFAULT_LIGHT_GOLD_PROJECTILE_ICON);
  const layerRect = fxLayer.getBoundingClientRect();
  const sourceRect = sourceIcon.getBoundingClientRect();
  const start = {
    x: sourceRect.left + sourceRect.width * 0.5 - layerRect.left,
    y: sourceRect.top + sourceRect.height * 0.5 - layerRect.top,
  };
  let maxEndMs = 0;

  targets.forEach((targetIcon, targetIndex) => {
    const targetRect = targetIcon.getBoundingClientRect();
    const end = {
      x: targetRect.left + targetRect.width * 0.5 - layerRect.left,
      y: targetRect.top + targetRect.height * 0.5 - layerRect.top,
    };

    for (let index = 0; index < projectileCount; index += 1) {
      const projectile = document.createElement("div");
      projectile.className = "battle-damage-light-projectile battle-rage-light-projectile";
      projectile.style.left = `${start.x}px`;
      projectile.style.top = `${start.y}px`;
      projectile.style.width = `${sizePx}px`;
      projectile.style.height = `${sizePx}px`;

      const img = document.createElement("img");
      img.src = iconPath;
      img.alt = "";
      img.draggable = false;
      projectile.append(img);
      fxLayer.append(projectile);

      const sideSign = Math.random() < 0.5 ? -1 : 1;
      const sideSpread = spreadPx > 0 ? (Math.random() * 2 - 1) * spreadPx : 0;
      const heightSpread = arcHeightPx > 0 ? arcHeightPx * (0.75 + Math.random() * 0.45) : 0;
      const mid = {
        x: ((start.x + end.x) * 0.5) + sideSpread,
        y: ((start.y + end.y) * 0.5) - sideSign * heightSpread,
      };
      const delayMs = Math.max(0, targetIndex * 55 + index * 35);
      const thisDuration = Math.max(220, durationMs + Math.floor((Math.random() * 0.2 - 0.1) * durationMs));
      maxEndMs = Math.max(maxEndMs, delayMs + thisDuration);

      const animation = projectile.animate([
        { transform: "translate(0px, 0px) scale(0.55)", opacity: 0 },
        { offset: 0.15, transform: "translate(0px, 0px) scale(1)", opacity: 1 },
        {
          offset: 0.72,
          transform: `translate(${mid.x - start.x}px, ${mid.y - start.y}px) scale(1.12)`,
          opacity: 1,
        },
        {
          transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(0.75)`,
          opacity: 0,
        },
      ], {
        duration: thisDuration,
        delay: delayMs,
        easing: "ease-in-out",
        fill: "forwards",
      });

      const cleanupProjectile = () => {
        if (projectile.isConnected) {
          projectile.remove();
        }
      };
      projectile.addEventListener("animationend", cleanupProjectile, { once: true });
      window.setTimeout(cleanupProjectile, thisDuration + delayMs + 50);
      if (animation.playState !== "finished") {
        animation.play();
      }
    }
  });

  await wait(maxEndMs);
}

export async function animateBattleKamikazeSelfDamageBurst(deps, context, amount = 0) {
  const sourceElement = deps.getBattleEnemyHealthSourceElements(context)[0];
  const fxLayer = context?.battleRenderTargets?.battleFxLayer;
  if (!sourceElement || !fxLayer) {
    return;
  }

  const animationConfig = deps.getBattleAnimationConfig(context);
  const rawAmount = Math.max(0, Math.abs(Number(amount) || 0));
  const perDamage = Number(animationConfig.lightDamageProjectilesPerDamage);
  const baseCount = Number(animationConfig.lightDamageProjectileCount);
  const projectileCount = Number.isFinite(perDamage) && perDamage > 0
    ? Math.max(1, Math.round(rawAmount * perDamage))
    : Number.isFinite(baseCount) && baseCount > 0
      ? Math.round(baseCount)
      : deps.DEFAULT_LIGHT_PROJECTILE_COUNT;
  const finalCount = Math.max(
    deps.MIN_DAMAGE_PROJECTILES,
    Math.min(deps.MAX_DAMAGE_PROJECTILES, Math.round(projectileCount) || deps.MIN_DAMAGE_PROJECTILES),
  );
  const durationMs = Math.max(250, Number(animationConfig.lightDamageProjectileMs || deps.DEFAULT_LIGHT_PROJECTILE_MS));
  const sizePx = Math.max(8, Number(animationConfig.lightDamageProjectileSizePx || deps.DEFAULT_LIGHT_PROJECTILE_SIZE_PX));
  const burstDistancePx = Math.max(90, Number(animationConfig.kamikazeBurstDistancePx || 190));
  const iconPath = deps.resolveAssetPath(deps.getBattleUiConfig(context).icons.lightRed || deps.DEFAULT_LIGHT_PROJECTILE_ICON);
  const layerRect = fxLayer.getBoundingClientRect();
  const sourceRect = sourceElement.getBoundingClientRect();
  const start = {
    x: sourceRect.left + sourceRect.width * 0.5 - layerRect.left,
    y: sourceRect.top + sourceRect.height * 0.5 - layerRect.top,
  };

  for (let index = 0; index < finalCount; index += 1) {
    const angle = ((Math.PI * 2) / finalCount) * index + (Math.random() * 0.5 - 0.25);
    const distance = burstDistancePx * (0.75 + Math.random() * 0.55);
    const end = {
      x: start.x + Math.cos(angle) * distance,
      y: start.y + Math.sin(angle) * distance,
    };
    const projectile = document.createElement("div");
    projectile.className = "battle-damage-light-projectile";
    projectile.style.left = `${start.x}px`;
    projectile.style.top = `${start.y}px`;
    projectile.style.width = `${sizePx}px`;
    projectile.style.height = `${sizePx}px`;

    const img = document.createElement("img");
    img.src = iconPath;
    img.alt = "";
    img.draggable = false;
    projectile.append(img);
    fxLayer.append(projectile);

    const delayMs = Math.max(0, Math.floor(index * 28));
    const thisDuration = Math.max(220, durationMs + Math.floor((Math.random() * 0.18 - 0.09) * durationMs));
    const animation = projectile.animate([
      {
        transform: "translate(0px, 0px) scale(0.6)",
        opacity: 0,
        filter: "blur(0px)",
      },
      {
        offset: 0.12,
        opacity: 1,
        transform: "translate(0px, 0px) scale(1.1)",
        filter: "blur(0px)",
      },
      {
        offset: 0.7,
        opacity: 0.75,
        transform: `translate(${(end.x - start.x) * 0.72}px, ${(end.y - start.y) * 0.72}px) scale(1.45)`,
        filter: "blur(1.5px)",
      },
      {
        transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(1.8)`,
        opacity: 0,
        filter: "blur(3px)",
      },
    ], {
      duration: thisDuration,
      delay: delayMs,
      easing: "ease-out",
      fill: "forwards",
    });

    const cleanupProjectile = () => {
      if (projectile.isConnected) {
        projectile.remove();
      }
    };
    projectile.addEventListener("animationend", cleanupProjectile, { once: true });
    window.setTimeout(cleanupProjectile, thisDuration + delayMs + 50);
    if (animation.playState !== "finished") {
      animation.play();
    }
  }

  await wait(durationMs + finalCount * 28 + 80);
}

export function animateBattleRageTransformTargetLights(deps, context, boardElement, effects = null) {
  if (!boardElement) {
    return [];
  }
  const targets = getBattleUltimateConvertTargetIcons(deps, context, boardElement, effects);
  targets.forEach((iconWrap) => {
    iconWrap.classList.add("is-rage-transform-target");
  });
  return targets;
}

export function stopBattleRageTransformTargetLights(targets) {
  if (!Array.isArray(targets)) {
    return;
  }
  targets.forEach((iconWrap) => {
    iconWrap.classList.remove("is-rage-transform-target");
  });
}

export function getBattleRageEffectTargetIcons(deps, context, boardElement, effect, transformLights = []) {
  if (deps.isBattleUltimateConvertEffect(effect)) {
    return transformLights
      .map((iconWrap) => iconWrap?.querySelector("img"))
      .filter(Boolean);
  }

  if (deps.isBattleUltimateDamagePlayerByBoardItemsEffect(effect)) {
    return getBattleUltimateDamageTargetIcons(deps, context, boardElement, effect);
  }

  if (deps.isBattleUltimateHealingEnemyByBoardItemsEffect(effect)) {
    return getBattleUltimateDamageTargetIcons(deps, context, boardElement, effect);
  }

  if (deps.isBattleUltimateRestoreEnemyShieldByBoardItemsEffect(effect)) {
    return getBattleUltimateDamageTargetIcons(deps, context, boardElement, effect);
  }

  if (deps.isBattleUltimateKamikazeEffect(effect)) {
    return getBattlePlayerHealthTargetIcons(context);
  }

  return getBattleRageTargetIcons(deps, context, boardElement);
}

function getBattleProjectileSourceIcon(context, selector) {
  if (!context?.battleRenderTargets) {
    return null;
  }
  const searchRoots = [
    context.battleRenderTargets.enemyVisual,
    context.battleRenderTargets.enemyStats,
    context.battleRenderTargets.playerMeters,
    context.battleRenderTargets.overlay,
  ].filter(Boolean);

  for (const root of searchRoots) {
    if (!root) {
      continue;
    }
    const found = root.querySelector(selector);
    if (found) {
      return found;
    }
  }
  return null;
}

function getBattleStatProjectileConfig(deps, context, modifier, normalizedStatDelta, options = {}) {
  const icons = deps.getBattleUiConfig(context).icons || {};
  const resolvedOptions = options || {};
  const sourceSelectorByModifier = {
    "enemy-health": '[data-battle-stat="enemy-damage"] img',
    "player-health": '[data-battle-stat="enemy-damage"] img',
    "enemy-aggression": '[data-battle-stat-id="enemy-aggression"] img',
    "player-heal": '[data-battle-stat="player-heal"] img',
  };
  const config = {
    enabled: false,
    sourceSelector: sourceSelectorByModifier[modifier] || '[data-battle-stat="enemy-damage"] img',
    iconPath: deps.DEFAULT_LIGHT_PROJECTILE_ICON,
  };

  if (modifier === "player-health" && normalizedStatDelta > 0 && resolvedOptions.forceDamageProjectiles) {
    return {
      ...config,
      enabled: true,
      sourceSelector: '[data-battle-stat-id="player-heal"] img',
      iconPath: icons.lightRed || deps.DEFAULT_LIGHT_PROJECTILE_ICON,
    };
  }

  if (modifier === "enemy-health" && normalizedStatDelta > 0 && resolvedOptions.forceHealProjectiles) {
    return {
      ...config,
      enabled: true,
      sourceSelector: '[data-battle-stat-id="enemy-health"] img',
      iconPath: icons.lightGreen || icons.light_green || deps.DEFAULT_LIGHT_GREEN_PROJECTILE_ICON,
    };
  }

  if (modifier === "enemy-health" && normalizedStatDelta > 0 && resolvedOptions.forceShieldProjectiles) {
    return {
      ...config,
      enabled: true,
      sourceSelector: '[data-battle-stat-id="enemy-health"] img',
      targetSelector: ".battle-scaffold-meter-shield-icon",
      iconPath: icons.lightBlue || icons.light_blue || deps.DEFAULT_LIGHT_BLUE_PROJECTILE_ICON,
    };
  }

  if (modifier === "enemy-health" || modifier === "player-health") {
    if (normalizedStatDelta < 0) {
      return {
        ...config,
        enabled: true,
        iconPath: icons.lightRed || deps.DEFAULT_LIGHT_PROJECTILE_ICON,
      };
    }
    return config;
  }

  if (modifier === "enemy-aggression" && normalizedStatDelta !== 0) {
    return {
      ...config,
      enabled: true,
      iconPath: icons.lightBlue || icons.light_blue || deps.DEFAULT_LIGHT_BLUE_PROJECTILE_ICON,
    };
  }

  if (modifier === "player-heal" && normalizedStatDelta > 0) {
    return {
      ...config,
      enabled: true,
      iconPath: icons.lightGreen || icons.light_green || icons.lightYellow || deps.DEFAULT_LIGHT_GREEN_PROJECTILE_ICON,
    };
  }

  return config;
}

function getBattleUltimateConvertTargetIcons(deps, context, boardElement, effects = null) {
  const sourceEffects = Array.isArray(effects) ? effects : deps.getCurrentBattleUltimateEffects(context);
  const sourceItemIds = new Set();
  const sourceItemTypes = new Set();

  sourceEffects
    .filter((effect) => deps.isBattleUltimateConvertEffect(effect))
    .forEach((effect) => {
      deps.normalizeStringList(effect.from?.itemIds ?? effect.from?.itemId ?? effect.fromItemIds ?? effect.fromItemId ?? effect.itemIds ?? effect.itemId)
        .forEach((itemId) => sourceItemIds.add(itemId));
      deps.normalizeStringList(effect.from?.itemTypes ?? effect.fromItemTypes ?? effect.itemTypes)
        .forEach((itemType) => sourceItemTypes.add(itemType));
    });

  if (sourceItemIds.size === 0 && sourceItemTypes.size === 0) {
    return [];
  }

  const targets = [];
  context.battleState.board.forEach((row, rowIndex) => {
    row.forEach((itemId, colIndex) => {
      if (deps.isBattleCellBoxed(context, { row: rowIndex, col: colIndex })) {
        return;
      }
      const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
      const matchesItem = sourceItemIds.has(itemId) || sourceItemIds.has(item?.itemId);
      const matchesType = item?.type && sourceItemTypes.has(item.type);
      if (!matchesItem && !matchesType) {
        return;
      }
      const iconWrap = boardElement.querySelector(`.battle-cell-icon[data-row="${rowIndex}"][data-col="${colIndex}"]`);
      if (iconWrap) {
        targets.push(iconWrap);
      }
    });
  });
  return targets;
}

function getBattlePlayerHealthTargetIcons(context) {
  const playerHealthMeter = context?.battleRenderTargets?.playerMeters?.querySelector('[data-battle-stat-id="player-health"]');
  if (!playerHealthMeter) {
    return [];
  }
  const playerHealthIcon = playerHealthMeter.querySelector(".battle-scaffold-meter-base-icon")
    || playerHealthMeter.querySelector("img");
  return playerHealthIcon ? [playerHealthIcon] : [];
}

function getBattleUltimateDamageTargetIcons(deps, context, boardElement, effect) {
  if (!boardElement) {
    return [];
  }

  const targetTypes = new Set(deps.normalizeStringList(effect.count?.itemTypes ?? effect.countItemTypes ?? effect.itemTypes));
  const targetItemIds = new Set(deps.normalizeStringList(effect.count?.itemIds ?? effect.count?.itemId ?? effect.countItemIds ?? effect.countItemId ?? effect.itemIds ?? effect.itemId));
  if (targetTypes.size === 0 && targetItemIds.size === 0) {
    return [];
  }

  const targets = [];
  context.battleState.board.forEach((row, rowIndex) => {
    row.forEach((itemId, colIndex) => {
      if (deps.isBattleCellBoxed(context, { row: rowIndex, col: colIndex })) {
        return;
      }
      const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
      if (!item) {
        return;
      }
      const matchesItem = targetItemIds.has(itemId) || targetItemIds.has(item.itemId);
      const matchesType = item.type && targetTypes.has(item.type);
      if (!matchesItem && !matchesType) {
        return;
      }
      const icon = boardElement.querySelector(`.battle-cell-icon[data-row="${rowIndex}"][data-col="${colIndex}"] img`);
      if (icon) {
        targets.push(icon);
      }
    });
  });
  return targets;
}

function getBattleRageTargetIcons(deps, context, boardElement) {
  if (!boardElement) {
    return [];
  }

  const rageConfig = deps.getCurrentBattleRageConfig(context);
  const targetTypes = new Set(deps.normalizeStringList(rageConfig?.targetTypes));
  const targetItemIds = new Set(deps.normalizeStringList(rageConfig?.targetItemIds));
  if (targetTypes.size === 0 && targetItemIds.size === 0) {
    return [];
  }

  const targets = [];
  context.battleState.board.forEach((row, rowIndex) => {
    row.forEach((itemId, colIndex) => {
      const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
      if (!item) {
        return;
      }
      const matchesItem = targetItemIds.has(itemId) || targetItemIds.has(item.itemId);
      const matchesType = item.type && targetTypes.has(item.type);
      if (!matchesItem && !matchesType) {
        return;
      }
      const icon = boardElement.querySelector(`.battle-cell-icon[data-row="${rowIndex}"][data-col="${colIndex}"] img`);
      if (icon) {
        targets.push(icon);
      }
    });
  });
  return targets;
}
