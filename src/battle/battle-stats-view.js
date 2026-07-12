import { renderInlineRichText } from "../rich-text.js";

export function createEnemyVisual(deps, context) {
  const visual = document.createElement("div");
  visual.className = "battle-scaffold-enemy-visual";
  visual.style.backgroundImage = `url("${deps.resolveAssetPath(context.request.background)}")`;

  const healthOverlay = document.createElement("div");
  healthOverlay.className = "battle-scaffold-enemy-meter-overlay battle-scaffold-enemy-health-overlay";

  const aggressionOverlay = document.createElement("div");
  aggressionOverlay.className = "battle-scaffold-enemy-meter-overlay battle-scaffold-enemy-aggression-overlay";

  const damageOverlay = document.createElement("div");
  damageOverlay.className = "battle-scaffold-enemy-damage-overlay";

  const currentStage = context.engine.getCurrentBattleStage(
    context.battleData.enemyConfig,
    context.battleState.enemyState,
  );
  const enemyImage = document.createElement("img");
  const resolvedAppearance = deps.resolveAssetPath(currentStage?.appearance);
  enemyImage.src = resolvedAppearance;
  enemyImage.dataset.appearance = resolvedAppearance;
  enemyImage.alt = "";
  visual.append(healthOverlay, enemyImage, damageOverlay, aggressionOverlay);
  return visual;
}

export function renderBattleStats(deps, enemyStatsElement, playerMetersElement, ultimateTextElement, context) {
  const enemyState = context.battleState.enemyState;
  const playerState = context.battleState.playerState;
  const currentStage = context.engine.getCurrentBattleStage(context.battleData.enemyConfig, enemyState);
  const uiConfig = deps.getBattleUiConfig(context);
  const stageNumber = Math.min(enemyState.stageIndex + 1, enemyState.stageCount);
  const playerMaxHealth = context.engine.getBattlePlayerMaxHealth(playerState, context.request.itemCatalog);
  const resolvedAppearance = deps.resolveAssetPath(currentStage?.appearance);
  const enemyHealthFeedback = deps.getBattleHealthChangeFeedback(context, "enemy-health", enemyState.health.current);
  const playerHealthFeedback = deps.getBattleHealthChangeFeedback(context, "player-health", playerState.health?.current ?? 0);
  const enemyAggressionFeedback = deps.getBattleHealthChangeFeedback(context, "enemy-aggression", enemyState.aggression.current);
  const playerHealFeedback = deps.getBattleHealthChangeFeedback(context, "player-heal", playerState.heal?.current ?? 0);
  const textLabels = {
    enemyHealth: deps.createBattleTooltipLabel(context, uiConfig.textKeys.enemyHealth),
    enemyAggression: deps.createBattleTooltipLabel(context, uiConfig.textKeys.enemyAggression),
    enemyDamage: deps.createBattleTooltipLabel(context, uiConfig.textKeys.enemyDamage),
    enemyRage: deps.createBattleTooltipLabel(context, uiConfig.textKeys.enemyRage),
    playerHealth: deps.createBattleTooltipLabel(context, uiConfig.textKeys.playerHealth),
    playerHeal: deps.createBattleTooltipLabel(context, uiConfig.textKeys.playerHeal),
    enemyStage: deps.translate(context.request.locale, uiConfig.textKeys.enemyStage),
  };

  const stageLabel = textLabels.enemyStage;
  const enemyVisual = context.battleRenderTargets?.enemyVisual;
  if (enemyVisual) {
    const enemyImage = enemyVisual.querySelector("img");
    if (enemyImage && enemyImage.dataset.appearance !== resolvedAppearance) {
      enemyImage.dataset.appearance = resolvedAppearance;
      enemyImage.src = resolvedAppearance;
    }
  }

  const stageContainer = context.battleRenderTargets?.enemyStage || enemyStatsElement;
  const stageLine = stageContainer.querySelector(".battle-scaffold-stage-line");
  const stageText = `${stageLabel} ${stageNumber}/${enemyState.stageCount}`;
  if (stageLine) {
    stageLine.textContent = stageText;
  } else {
    stageContainer.replaceChildren(createEnemyStageLine(stageLabel, stageNumber, enemyState.stageCount));
  }

  const enemyHealthContainer = enemyVisual?.querySelector(".battle-scaffold-enemy-health-overlay") || enemyStatsElement;
  const enemyAggressionContainer = enemyVisual?.querySelector(".battle-scaffold-enemy-aggression-overlay") || enemyStatsElement;

  upsertBattleLabeledMeter(deps, context, enemyHealthContainer, {
    label: textLabels.enemyHealth.label,
    description: textLabels.enemyHealth.description,
    icon: uiConfig.icons.enemyHealth,
    current: enemyState.health.current,
    max: enemyState.health.max,
    color: uiConfig.bars.enemyHealthColor,
    modifier: "enemy-health",
    healthFeedback: enemyHealthFeedback,
    shieldOverlay: createEnemyShieldOverlayConfig(deps, context, enemyState),
  });
  upsertBattleLabeledMeter(deps, context, enemyAggressionContainer, {
    label: textLabels.enemyAggression.label,
    description: textLabels.enemyAggression.description,
    icon: uiConfig.icons.enemyAggression,
    current: enemyState.aggression.current,
    max: enemyState.aggression.max,
    color: uiConfig.bars.enemyAggressionColor,
    modifier: "enemy-aggression",
    healthFeedback: enemyAggressionFeedback,
  });

  const enemyDamageContainer = enemyVisual?.querySelector(".battle-scaffold-enemy-damage-overlay") || enemyStatsElement;
  upsertEnemyDamageBadge(deps, context, enemyDamageContainer, {
    stat: "enemy-damage",
    label: textLabels.enemyDamage.label,
    description: textLabels.enemyDamage.description,
    icon: uiConfig.icons.enemyDamage,
    value: enemyState.aggression.damage,
  });

  const enemyValuesContainer = context.battleRenderTargets?.enemyHeaderValues || enemyStatsElement;
  const oldEnemyValueRow = enemyStatsElement.querySelector(".battle-scaffold-value-row");
  if (oldEnemyValueRow && enemyValuesContainer !== enemyStatsElement) {
    oldEnemyValueRow.remove();
  }
  const enemyValueRow = enemyValuesContainer.querySelector(".battle-scaffold-value-row");
  const enemyValues = [
    {
      stat: "enemy-rage",
      label: textLabels.enemyRage.label,
      description: textLabels.enemyRage.description,
      icon: uiConfig.icons.enemyRage,
      value: deps.formatBattleSeconds(enemyState.rage.current),
    },
  ];
  if (enemyValueRow) {
    enemyValueRow.replaceChildren(...enemyValues.map((value) => createEnemyValue(deps, context, value)));
  } else {
    enemyValuesContainer.append(createEnemyValuesRow(deps, context, enemyValues));
  }

  applyBattleRageWarningVisualState(deps, context, enemyValuesContainer);

  upsertBattleLabeledMeter(deps, context, playerMetersElement, {
    label: textLabels.playerHealth.label,
    description: textLabels.playerHealth.description,
    icon: uiConfig.icons.playerHealth,
    current: playerState.health?.current ?? 0,
    max: playerMaxHealth,
    color: uiConfig.bars.playerHealthColor,
    modifier: "player-health",
    healthFeedback: playerHealthFeedback,
  });
  upsertBattleLabeledMeter(deps, context, playerMetersElement, {
    label: textLabels.playerHeal.label,
    description: textLabels.playerHeal.description,
    icon: uiConfig.icons.playerHeal,
    current: playerState.heal?.current ?? 0,
    max: playerState.heal?.max ?? 0,
    color: uiConfig.bars.playerHealColor,
    modifier: "player-heal",
    healthFeedback: playerHealFeedback,
  });

  renderInlineRichText(
    ultimateTextElement,
    deps.translate(context.request.locale, currentStage?.ultimate?.descriptionTextKey)
      || currentStage?.ultimate?.descriptionTextKey
      || "",
    {
      itemCatalog: context.request.itemCatalog,
      resolveAssetPath: deps.resolveAssetPath,
      translateTextKey: (key) => deps.translate(context.request.locale, key),
    },
  );
}

export function updateBattleRageTimerDisplay(deps, context, enemyStatsElement) {
  if (!enemyStatsElement) {
    return;
  }

  const rageValueElement = enemyStatsElement.querySelector('[data-battle-stat="enemy-rage"] strong:last-child');
  if (!rageValueElement) {
    return;
  }

  const enemyState = context.battleState.enemyState;
  rageValueElement.textContent = deps.formatBattleSeconds(enemyState?.rage?.current || 0);
}

export function applyBattleRageWarningVisualState(deps, context, enemyStatsElement) {
  if (!enemyStatsElement) {
    return;
  }

  const warningSeconds = deps.getClockWarningSeconds(context);
  if (!Array.isArray(warningSeconds) || warningSeconds.length === 0) {
    return;
  }

  const enemyState = context.battleState.enemyState || {};
  const currentRage = Math.max(0, Math.floor(Number(enemyState.rage?.current) || 0));
  const shouldWarn = warningSeconds.includes(currentRage);
  const warningMs = Math.max(0, Math.floor(Number(deps.getClockWarningChangeMs(context)) || 0));
  const warningScale = Number.isFinite(Number(deps.getClockWarningChangeScale(context)))
    ? Number(deps.getClockWarningChangeScale(context))
    : deps.DEFAULT_CLOCK_WARNING_CHANGE_SCALE;

  const rageIcon = enemyStatsElement.querySelector('[data-battle-stat="enemy-rage"] img');
  if (!rageIcon) {
    return;
  }

  if (!shouldWarn) {
    rageIcon.style.removeProperty("--battle-clock-warning-ms");
    rageIcon.style.removeProperty("--battle-clock-warning-scale");
    rageIcon.style.removeProperty("animation");
    rageIcon.classList.remove("battle-scaffold-rage-warning");
    rageIcon.removeAttribute("data-rage-warning");
    return;
  }

  const warningMsValue = `${warningMs}ms`;
  const warningScaleValue = String(Math.max(1, warningScale));
  const warningKey = `${currentRage}:${warningMsValue}:${warningScaleValue}`;
  if (rageIcon.dataset.rageWarning === warningKey && rageIcon.classList.contains("battle-scaffold-rage-warning")) {
    return;
  }

  rageIcon.style.setProperty("--battle-clock-warning-ms", warningMsValue);
  rageIcon.style.setProperty("--battle-clock-warning-scale", warningScaleValue);
  rageIcon.style.animation = "none";
  void rageIcon.offsetWidth;
  rageIcon.classList.add("battle-scaffold-rage-warning");
  rageIcon.style.animation = `battle-clock-warning ${warningMsValue} ease-in-out 1`;
  rageIcon.dataset.rageWarning = warningKey;
}

export function getBattleEnemyStatRoot(context) {
  return context?.battleRenderTargets?.enemyHeaderValues
    || context?.battleRenderTargets?.enemyStats
    || null;
}

function createEnemyStageLine(label, current, max) {
  const line = document.createElement("div");
  line.className = "battle-scaffold-stage-line";
  line.textContent = `${label} ${current}/${max}`;
  return line;
}

function createEnemyShieldOverlayConfig(deps, context, enemyState) {
  const currentShield = Math.max(0, Number(enemyState?.shield?.current || 0));
  if (currentShield <= 0) {
    return null;
  }
  return {
    icon: deps.getBattleUiConfig(context).icons.enemyShield,
    value: currentShield,
  };
}

function createLabeledIconProgressRow(deps, context, {
  label,
  description,
  icon,
  current,
  max,
  color,
  modifier,
  healthFeedback,
  shieldOverlay = null,
}) {
  const meter = document.createElement("div");
  meter.className = `battle-scaffold-meter battle-scaffold-meter-${modifier}`;
  meter.dataset.battleStatId = modifier;
  meter.dataset.battleTooltipName = label;
  meter.dataset.battleTooltipDescription = description;
  meter.dataset.battleTooltipIcon = icon || "";
  meter.dataset.battleTooltipAttached = "1";
  meter.setAttribute("aria-label", label);
  meter.dataset.currentValue = String(current);
  meter.dataset.maxValue = String(max);

  const iconWrapper = document.createElement("span");
  iconWrapper.className = "battle-scaffold-meter-icon";

  const iconElement = document.createElement("img");
  iconElement.className = "battle-scaffold-meter-base-icon";
  iconElement.src = deps.resolveAssetPath(icon);
  iconElement.alt = "";
  iconWrapper.append(iconElement);
  syncBattleShieldOverlay(deps, iconWrapper, shieldOverlay);

  if (healthFeedback) {
    deps.triggerBattleHealthChangeFeedback(
      context,
      iconWrapper,
      healthFeedback.delta,
      modifier,
      healthFeedback.sourceElements,
      healthFeedback,
    );
  }

  const currentElement = document.createElement("strong");
  currentElement.textContent = formatBattleStatValue(deps, current);
  currentElement.className = "battle-scaffold-meter-current";

  const track = document.createElement("span");
  track.className = "battle-scaffold-meter-track";

  const fill = document.createElement("span");
  fill.className = "battle-scaffold-meter-track-fill";
  const fillPercent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  meter.style.setProperty("--battle-meter-ratio", String(fillPercent / 100));
  fill.style.width = `${fillPercent}%`;
  fill.style.background = color;
  track.append(fill);

  const maxElement = document.createElement("strong");
  maxElement.textContent = formatBattleStatValue(deps, max);
  maxElement.className = "battle-scaffold-meter-max";

  deps.attachBattleTooltip(context, meter, {
    name: () => meter.dataset.battleTooltipName || "",
    description: () => meter.dataset.battleTooltipDescription || "",
    icon: () => meter.dataset.battleTooltipIcon || "",
  });

  meter.append(iconWrapper, currentElement, track, maxElement);
  return meter;
}

function upsertBattleLabeledMeter(deps, context, container, props) {
  const existingMeter = container.querySelector(`[data-battle-stat-id="${props.modifier}"]`);
  if (!existingMeter) {
    container.append(createLabeledIconProgressRow(deps, context, props));
    return;
  }
  updateBattleLabeledIconProgressRow(deps, context, existingMeter, props);
}

function updateBattleLabeledIconProgressRow(deps, context, meter, {
  label,
  description,
  icon,
  current,
  max,
  color,
  modifier,
  healthFeedback = null,
  shieldOverlay = null,
}) {
  if (!meter) {
    return;
  }
  const resolvedIcon = deps.resolveAssetPath(icon);
  meter.dataset.battleStatId = modifier;
  meter.dataset.battleTooltipName = label;
  meter.dataset.battleTooltipDescription = description;
  meter.dataset.battleTooltipIcon = icon || "";
  meter.setAttribute("aria-label", label);
  meter.dataset.currentValue = String(current);
  meter.dataset.maxValue = String(max);

  const iconWrapper = meter.querySelector(".battle-scaffold-meter-icon");
  const iconElement = meter.querySelector(".battle-scaffold-meter-base-icon");
  if (iconElement && iconElement.getAttribute("src") !== resolvedIcon) {
    iconElement.src = resolvedIcon;
  }
  if (iconWrapper) {
    syncBattleShieldOverlay(deps, iconWrapper, shieldOverlay);
  }

  const currentElement = meter.querySelector(".battle-scaffold-meter-current");
  if (currentElement) {
    currentElement.textContent = formatBattleStatValue(deps, current);
  }

  const maxElement = meter.querySelector(".battle-scaffold-meter-max");
  if (maxElement) {
    maxElement.textContent = formatBattleStatValue(deps, max);
  }

  const trackFill = meter.querySelector(".battle-scaffold-meter-track-fill");
  if (trackFill) {
    const fillPercent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    meter.style.setProperty("--battle-meter-ratio", String(fillPercent / 100));
    trackFill.style.width = `${fillPercent}%`;
    trackFill.style.background = color;
  }

  if (healthFeedback) {
    const iconWrapperNode = meter.querySelector(".battle-scaffold-meter-icon");
    if (iconWrapperNode) {
      deps.triggerBattleHealthChangeFeedback(
        context,
        iconWrapperNode,
        healthFeedback.delta,
        modifier,
        healthFeedback.sourceElements,
        healthFeedback,
      );
    }
  }

  if (!meter.dataset.battleTooltipAttached) {
    meter.dataset.battleTooltipAttached = "1";
    deps.attachBattleTooltip(context, meter, {
      name: () => meter.dataset.battleTooltipName || "",
      description: () => meter.dataset.battleTooltipDescription || "",
      icon: () => meter.dataset.battleTooltipIcon || "",
    });
  }
}

function syncBattleShieldOverlay(deps, iconWrapper, shieldOverlay) {
  const shieldValue = Math.max(0, Number(shieldOverlay?.value || 0));
  let shieldElement = iconWrapper.querySelector(".battle-scaffold-meter-shield");

  if (shieldValue <= 0) {
    iconWrapper.classList.remove("has-shield");
    shieldElement?.remove();
    return;
  }

  iconWrapper.classList.add("has-shield");
  if (!shieldElement) {
    shieldElement = document.createElement("span");
    shieldElement.className = "battle-scaffold-meter-shield";

    const shieldIcon = document.createElement("img");
    shieldIcon.alt = "";
    shieldIcon.className = "battle-scaffold-meter-shield-icon";

    const shieldCount = document.createElement("strong");
    shieldCount.className = "battle-scaffold-meter-shield-count";

    shieldElement.append(shieldIcon, shieldCount);
    iconWrapper.append(shieldElement);
  }

  const shieldIcon = shieldElement.querySelector(".battle-scaffold-meter-shield-icon");
  const resolvedShieldIcon = deps.resolveAssetPath(shieldOverlay?.icon || "data/Assets/item/Shield.png");
  if (shieldIcon && shieldIcon.getAttribute("src") !== resolvedShieldIcon) {
    shieldIcon.src = resolvedShieldIcon;
  }

  const shieldCount = shieldElement.querySelector(".battle-scaffold-meter-shield-count");
  if (shieldCount) {
    shieldCount.textContent = formatBattleStatValue(deps, shieldValue);
  }
}

function createEnemyValuesRow(deps, context, values) {
  const row = document.createElement("div");
  row.className = "battle-scaffold-value-row";
  row.replaceChildren(...values.map((value) => createEnemyValue(deps, context, value)));
  return row;
}

function createEnemyValue(deps, context, { label, icon, value, stat }) {
  const item = document.createElement("div");
  item.className = "battle-scaffold-value";
  item.setAttribute("aria-label", label);
  if (stat) {
    item.dataset.battleStat = stat;
  }

  const iconElement = document.createElement("img");
  iconElement.src = deps.resolveAssetPath(icon);
  iconElement.alt = "";

  const currentElement = document.createElement("strong");
  currentElement.textContent = formatBattleStatValue(deps, value);

  deps.attachBattleTooltip(context, item, {
    name: label,
    description: label,
    icon,
  });

  item.append(iconElement, currentElement);
  return item;
}

function upsertEnemyDamageBadge(deps, context, container, { label, description, icon, value, stat }) {
  if (!container) {
    return;
  }

  const existingBadge = container.querySelector('[data-battle-stat="enemy-damage"]');
  if (!existingBadge) {
    container.replaceChildren(createEnemyDamageBadge(deps, context, { label, description, icon, value, stat }));
    return;
  }

  existingBadge.setAttribute("aria-label", label);
  existingBadge.dataset.battleTooltipName = label;
  existingBadge.dataset.battleTooltipDescription = description;
  existingBadge.dataset.battleTooltipIcon = icon || "";

  const iconElement = existingBadge.querySelector("img");
  if (iconElement) {
    iconElement.src = deps.resolveAssetPath(icon);
  }
  const valueElement = existingBadge.querySelector("strong");
  if (valueElement) {
    valueElement.textContent = formatBattleStatValue(deps, value);
  }
}

function createEnemyDamageBadge(deps, context, { label, description, icon, value, stat }) {
  const badge = document.createElement("div");
  badge.className = "battle-scaffold-enemy-damage-badge";
  badge.dataset.battleStat = stat || "enemy-damage";
  badge.dataset.battleTooltipName = label;
  badge.dataset.battleTooltipDescription = description;
  badge.dataset.battleTooltipIcon = icon || "";
  badge.setAttribute("aria-label", label);

  const iconElement = document.createElement("img");
  iconElement.src = deps.resolveAssetPath(icon);
  iconElement.alt = "";

  const valueElement = document.createElement("strong");
  valueElement.textContent = formatBattleStatValue(deps, value);

  deps.attachBattleTooltip(context, badge, {
    name: () => badge.dataset.battleTooltipName || "",
    description: () => badge.dataset.battleTooltipDescription || "",
    icon: () => badge.dataset.battleTooltipIcon || "",
  });

  badge.append(iconElement, valueElement);
  return badge;
}

function formatBattleStatValue(deps, value) {
  return typeof value === "number" ? deps.formatBattleNumber(value) : String(value ?? "");
}
