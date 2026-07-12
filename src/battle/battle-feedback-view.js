import { getBattleElementAnimationState } from "./battle-animations.js";
import { isBattleLifecycleActive } from "./battle-runtime.js";

const battleHealthSourceElementKeys = new WeakMap();
let battleHealthSourceElementKeyCounter = 0;

export function getBattleHealthChangeFeedback(context, statId, currentValue) {
  // Feedback хранит прошлое значение стата отдельно от самого battleState.
  // Так render может показывать delta, не влияя на механику боя.
  const normalizedValue = Number(currentValue) || 0;
  context.battleHealthFeedbackState = context.battleHealthFeedbackState || {};
  const stateEntry = context.battleHealthFeedbackState[statId];
  const previousValue = Number.isFinite(Number(stateEntry?.value)) ? Number(stateEntry.value) : Number(stateEntry);
  const forcedDelta = Number.isFinite(Number(stateEntry?.pendingDelta)) ? Number(stateEntry.pendingDelta) : null;
  context.battleHealthFeedbackState[statId] = {
    value: normalizedValue,
    pendingDelta: 0,
    sourceElements: [],
    forceDamageProjectiles: false,
    forceHealProjectiles: false,
    forceShieldProjectiles: false,
    disableFallbackSource: false,
  };

  const suppression = consumeBattleHealthFeedbackSuppression(context, statId);
  if (suppression?.suppressAll) {
    return null;
  }

  const delta = Number.isFinite(forcedDelta) ? forcedDelta : normalizedValue - previousValue;
  if (!Number.isFinite(previousValue) || !Number.isFinite(delta) || delta === 0) {
    return null;
  }

  if (suppression?.suppressNegativeDelta && delta < 0) {
    return null;
  }

  return {
    delta,
    sourceElements: Array.isArray(stateEntry?.sourceElements) ? stateEntry.sourceElements : [],
    forceDamageProjectiles: Boolean(stateEntry?.forceDamageProjectiles),
    forceHealProjectiles: Boolean(stateEntry?.forceHealProjectiles),
    forceShieldProjectiles: Boolean(stateEntry?.forceShieldProjectiles),
    disableFallbackSource: Boolean(stateEntry?.disableFallbackSource),
  };
}

export function setBattleHealthFeedbackDelta(context, statId, delta, options = {}) {
  // Несколько изменений здоровья за один визуальный шаг сливаются в pending
  // delta, чтобы игрок видел один понятный floating number.
  if (!context?.battleHealthFeedbackState) {
    context.battleHealthFeedbackState = {};
  }
  const stateEntry = context.battleHealthFeedbackState[statId];
  const normalizedDelta = Number(delta) || 0;
  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) {
    return;
  }

  const currentPending = Number.isFinite(Number(stateEntry?.pendingDelta)) ? Number(stateEntry.pendingDelta) : 0;
  const currentValue = Number.isFinite(Number(stateEntry?.value)) ? Number(stateEntry.value) : 0;
  const mergedSourceElements = mergeBattleHealthSourceElements(
    Array.isArray(stateEntry?.sourceElements) ? stateEntry.sourceElements : [],
    Array.isArray(options?.sourceElements) ? options.sourceElements : [],
  );
  const mergedForceDamageProjectiles = Boolean(
    (stateEntry && stateEntry.forceDamageProjectiles) || options?.forceDamageProjectiles,
  );
  const mergedForceHealProjectiles = Boolean(
    (stateEntry && stateEntry.forceHealProjectiles) || options?.forceHealProjectiles,
  );
  const mergedForceShieldProjectiles = Boolean(
    (stateEntry && stateEntry.forceShieldProjectiles) || options?.forceShieldProjectiles,
  );
  const mergedDisableFallbackSource = Boolean(
    (stateEntry && stateEntry.disableFallbackSource) || options?.disableFallbackSource,
  );
  context.battleHealthFeedbackState[statId] = {
    ...(stateEntry && typeof stateEntry === "object" ? stateEntry : {}),
    pendingDelta: currentPending + normalizedDelta,
    value: currentValue,
    sourceElements: mergedSourceElements,
    forceDamageProjectiles: mergedForceDamageProjectiles,
    forceHealProjectiles: mergedForceHealProjectiles,
    forceShieldProjectiles: mergedForceShieldProjectiles,
    disableFallbackSource: mergedDisableFallbackSource,
  };
}

export function setBattleHealthFeedbackSuppression(context, statId, options = {}) {
  if (!context?.battleState) {
    return;
  }
  context.battleState.healthFeedbackSuppression = context.battleState.healthFeedbackSuppression || {};
  context.battleState.healthFeedbackSuppression[statId] = {
    ...(context.battleState.healthFeedbackSuppression[statId] || {}),
    ...options,
  };
}

export function consumeBattleHealthFeedbackSuppression(context, statId) {
  if (!context?.battleState?.healthFeedbackSuppression) {
    return null;
  }

  const suppression = context.battleState.healthFeedbackSuppression[statId] || null;
  if (suppression) {
    delete context.battleState.healthFeedbackSuppression[statId];
    if (Object.keys(context.battleState.healthFeedbackSuppression).length === 0) {
      context.battleState.healthFeedbackSuppression = {};
    }
  }
  return suppression;
}

export function triggerBattleHealthChangeFeedback(deps, context, iconWrapper, delta, modifier, sourceElements = [], options = {}) {
  const normalizedDelta = Number(delta) || 0;
  if (!iconWrapper || !Number.isFinite(normalizedDelta) || normalizedDelta === 0) {
    return;
  }
  const resolvedOptions = Array.isArray(options) ? {} : options;

  const lifecycleToken = context?.battleRenderTargets?.lifecycleToken;
  const animationConfig = deps.getBattleHealthChangeAnimation(context, modifier);
  context.battleHealthFeedbackAnimationState = context.battleHealthFeedbackAnimationState || {};
  const feedbackState = context.battleHealthFeedbackAnimationState[modifier] || {
    running: false,
    pending: 0,
    timerId: null,
    delayTimerId: null,
  };
  feedbackState.pending += normalizedDelta;
  context.battleHealthFeedbackAnimationState[modifier] = feedbackState;

  const runAnimation = () => {
    if (!feedbackState.pending) {
      feedbackState.running = false;
      iconWrapper.classList.remove("is-health-changing");
      iconWrapper.classList.remove("is-shield-changing");
      return;
    }

    const currentDelta = feedbackState.pending;
    feedbackState.pending = 0;
    feedbackState.running = true;

    const risePx = Math.max(0, Number(animationConfig.floatRisePx) || 0);
    const riseStart = Math.max(8, Math.min(risePx * 0.35, 80));
    const riseMid = Math.max(24, Math.min(risePx * 0.85, 180));
    const riseEnd = risePx;
    iconWrapper.style.setProperty("--battle-health-change-ms", `${animationConfig.durationMs}ms`);
    iconWrapper.style.setProperty("--battle-health-change-scale", String(animationConfig.scale));
    iconWrapper.style.setProperty("--battle-health-change-float-ms", `${animationConfig.floatMs}ms`);
    iconWrapper.style.setProperty("--battle-health-change-float-rise-start-px", `${riseStart}px`);
    iconWrapper.style.setProperty("--battle-health-change-float-rise-mid-px", `${riseMid}px`);
    iconWrapper.style.setProperty("--battle-health-change-float-rise-end-px", `${riseEnd}px`);

    const oldDeltaElement = iconWrapper.querySelector(".battle-health-change-float");
    if (oldDeltaElement) {
      oldDeltaElement.remove();
    }

    const deltaElement = document.createElement("span");
    deltaElement.className = `battle-health-change-float ${currentDelta > 0 ? "is-positive" : "is-negative"}`;
    if (resolvedOptions.forceShieldProjectiles) {
      deltaElement.classList.add("is-shield");
    }
    const formattedDelta = typeof deps.formatBattleNumber === "function"
      ? deps.formatBattleNumber(currentDelta)
      : String(currentDelta);
    deltaElement.textContent = `${currentDelta > 0 ? "+" : ""}${formattedDelta}`;
    iconWrapper.append(deltaElement);

    const animationClass = resolvedOptions.forceShieldProjectiles ? "is-shield-changing" : "is-health-changing";
    const animatedElement = resolvedOptions.forceShieldProjectiles
      ? iconWrapper.querySelector(".battle-scaffold-meter-shield")
      : iconWrapper.querySelector(".battle-scaffold-meter-base-icon");

    iconWrapper.classList.remove(animationClass);
    void iconWrapper.offsetWidth;
    iconWrapper.classList.add(animationClass);

    const previousAnimationState = getBattleElementAnimationState(iconWrapper, animationClass);
    const animationToken = (previousAnimationState.token || 0) + 1;
    previousAnimationState.token = animationToken;

    if (previousAnimationState.timerId) {
      window.clearTimeout(previousAnimationState.timerId);
      previousAnimationState.timerId = null;
    }

    const clearAnimation = () => {
      const currentAnimationState = getBattleElementAnimationState(iconWrapper, animationClass);
      if (currentAnimationState.token !== animationToken) {
        return;
      }
      iconWrapper.classList.remove(animationClass);
      if (currentAnimationState.healthEndElement && currentAnimationState.healthEndHandler) {
        currentAnimationState.healthEndElement.removeEventListener("animationend", currentAnimationState.healthEndHandler);
        currentAnimationState.healthEndHandler = null;
        currentAnimationState.healthEndElement = null;
      }
      if (currentAnimationState.timerId) {
        window.clearTimeout(currentAnimationState.timerId);
        currentAnimationState.timerId = null;
      }
      currentAnimationState.token = 0;
      if (!isBattleLifecycleActive(context, context.battleRenderTargets?.lifecycleToken)) {
        feedbackState.running = false;
        feedbackState.pending = 0;
        return;
      }

      feedbackState.running = false;
      if (feedbackState.pending) {
        runAnimation();
      }
    };

    if (previousAnimationState.healthEndElement && previousAnimationState.healthEndHandler) {
      previousAnimationState.healthEndElement.removeEventListener("animationend", previousAnimationState.healthEndHandler);
      previousAnimationState.healthEndHandler = null;
      previousAnimationState.healthEndElement = null;
    }
    const finishHandler = (event) => {
      if (event && animatedElement && event.target !== animatedElement) {
        return;
      }
      clearAnimation();
    };
    if (animatedElement && typeof animatedElement.addEventListener === "function") {
      animatedElement.addEventListener("animationend", finishHandler);
      previousAnimationState.healthEndHandler = finishHandler;
      previousAnimationState.healthEndElement = animatedElement;
    }

    if (feedbackState.timerId) {
      clearTimeout(feedbackState.timerId);
    }
    const clearMs = Math.max(animationConfig.durationMs, animationConfig.floatMs);
    if (clearMs >= 0) {
      feedbackState.timerId = window.setTimeout(() => {
        feedbackState.timerId = null;
        clearAnimation();
      }, clearMs);
      previousAnimationState.timerId = feedbackState.timerId;
    } else {
      clearAnimation();
    }
  };

  const shouldDeferByProjectiles = (() => {
    if (modifier !== "player-health" && modifier !== "enemy-health" && modifier !== "enemy-aggression" && modifier !== "player-heal") {
      return false;
    }
    return true;
  })();
  const deferredProjectilesMs = shouldDeferByProjectiles
    ? deps.triggerBattleLightDamageProjectiles(
      context,
      iconWrapper,
      normalizedDelta,
      modifier,
      sourceElements,
      resolvedOptions,
    )
    : 0;

  const hasProjectileDelay = Number.isFinite(deferredProjectilesMs) && deferredProjectilesMs > 0;
  if (hasProjectileDelay) {
    if (feedbackState.delayTimerId || feedbackState.running) {
      return;
    }
    feedbackState.delayTimerId = window.setTimeout(() => {
      feedbackState.delayTimerId = null;
      if (!isBattleLifecycleActive(context, lifecycleToken)) {
        feedbackState.pending = 0;
        feedbackState.running = false;
        return;
      }
      runAnimation();
    }, deferredProjectilesMs);
    return;
  }

  if (feedbackState.running) {
    return;
  }

  runAnimation();
}

function mergeBattleHealthSourceElements(existingSourceElements, incomingSourceElements) {
  const getElementKey = (element) => {
    if (!element) {
      return null;
    }
    const elementRow = element.dataset?.row;
    const elementCol = element.dataset?.col;
    if (elementRow != null && elementCol != null) {
      return `${elementRow}:${elementCol}`;
    }
    const existingKey = battleHealthSourceElementKeys.get(element);
    if (existingKey) {
      return existingKey;
    }
    const generatedKey = `health-source-${battleHealthSourceElementKeyCounter += 1}`;
    battleHealthSourceElementKeys.set(element, generatedKey);
    return generatedKey;
  };

  const seen = new Set();
  const mergedElements = [];

  const addElement = (element) => {
    if (!element) {
      return;
    }
    const key = getElementKey(element);
    if (!key) {
      return;
    }

    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    mergedElements.push(element);
  };

  for (const element of existingSourceElements || []) {
    addElement(element);
  }
  for (const element of incomingSourceElements || []) {
    addElement(element);
  }

  return mergedElements;
}
