export function tickBattleRuntime(deps, context, renderTargets) {
  // Rage tick только ставит pending action. Сам ultimate ждет, пока поле
  // перестанет резолвиться, чтобы не смешивать две мутации board одновременно.
  if (Date.now() < (context.battleState.ragePausedUntil || 0)) {
    if (renderTargets) {
      deps.updateBattleClockCooldownDisplay(context, renderTargets.specialItems);
    }
    return;
  }

  if (context.battleState.isRageResolving || context.battleState.isComplete) {
    return;
  }

  if (context.battleState.pendingRageAction) {
    if (renderTargets) {
      deps.updateBattleRageTimerDisplay(context, deps.getBattleEnemyStatRoot(context));
      deps.applyBattleRageWarningVisualState(context, deps.getBattleEnemyStatRoot(context));
      void runPendingBattleRageIfReady(deps, context, renderTargets);
    }
    return;
  }

  const result = context.engine.tickBattleRage(context.battleState.enemyState, 1);
  if (result.triggered > 0) {
    markBattleRagePending(deps, context, renderTargets);
    if (renderTargets?.status) {
      void runPendingBattleRageIfReady(deps, context, renderTargets);
    }
    return;
  }

  if (renderTargets) {
    deps.updateBattleRageTimerDisplay(context, deps.getBattleEnemyStatRoot(context));
    deps.applyBattleRageWarningVisualState(context, deps.getBattleEnemyStatRoot(context));
  }
}

export function markBattleRagePending(deps, context, renderTargets) {
  const rageState = context.battleState.enemyState?.rage;
  context.battleState.pendingRageAction = true;
  if (rageState) {
    rageState.current = 0;
  }
  if (renderTargets) {
    deps.updateBattleRageTimerDisplay(context, deps.getBattleEnemyStatRoot(context));
    deps.applyBattleRageWarningVisualState(context, deps.getBattleEnemyStatRoot(context));
  }
}

export async function runPendingBattleRageIfReady(deps, context, renderTargets) {
  if (
    !context.battleState.pendingRageAction
    || context.battleState.isRageResolving
    || context.battleState.isComplete
    || !deps.shouldContinueBattle(context, renderTargets)
  ) {
    return false;
  }

  if (isBattleFieldBusyForRage(deps, context)) {
    return false;
  }

  await runBattleRageAction(deps, context, renderTargets);
  return true;
}

export function isBattleFieldBusyForRage(deps, context) {
  return Boolean(
    context.battleState.isResolving
    || deps.hasActiveBattleResolutionAnimation(context)
  );
}

export async function runBattleRageAction(deps, context, renderTargets) {
  // Во время rage flow блокируем обычный resolve и runtime. Все эффекты
  // применяются по одному, чтобы анимации и health feedback знали source cells.
  if (
    context.battleState.isRageResolving
    || context.battleState.isComplete
    || !deps.shouldContinueBattle(context, renderTargets)
  ) {
    return;
  }

  const enemyState = context.battleState.enemyState;
  const rageState = enemyState?.rage;
  if (!rageState) {
    return;
  }

  const uiConfig = deps.getBattleUiConfig(context);
  let transformLights = [];
  let shouldFinalizeRage = true;
  context.battleState.pendingRageAction = false;
  context.battleState.isRageResolving = true;
  context.battleState.isResolving = true;
  context.battleState.selectedCell = null;
  rageState.current = 0;
  deps.pauseBattleRuntime(context);

  try {
    deps.setBattleStatus(context, renderTargets.status, deps.translate(context.request.locale, uiConfig.textKeys.rageEvent));
    deps.updateBattleRageTimerDisplay(context, deps.getBattleEnemyStatRoot(context));
    deps.renderBattleBoard(
      renderTargets.boardElement,
      context,
      renderTargets.status,
      renderTargets.enemyStats,
      renderTargets.playerMeters,
      renderTargets.ultimateText,
    );

    await deps.animateBattleRageWave(context, renderTargets.boardElement);
    if (!deps.shouldContinueBattle(context, renderTargets)) {
      return;
    }

    let shouldResolveUltimateCascades = false;
    const ultimateEffects = getCurrentBattleUltimateEffects(context);
    if (ultimateEffects.length === 0) {
      await deps.animateBattleRageProjectiles(context, renderTargets.boardElement);
      if (!deps.shouldContinueBattle(context, renderTargets)) {
        return;
      }
    }
    for (const effect of ultimateEffects) {
      transformLights = deps.animateBattleRageTransformTargetLights(context, renderTargets.boardElement, [effect]);
      await deps.animateBattleRageProjectiles(
        context,
        renderTargets.boardElement,
        deps.getBattleRageEffectTargetIcons(context, renderTargets.boardElement, effect, transformLights),
      );
      if (!deps.shouldContinueBattle(context, renderTargets)) {
        return;
      }

      if (isBattleUltimateKamikazeEffect(effect)) {
        deps.stopBattleRageTransformTargetLights(transformLights);
        transformLights = [];
        const kamikazeResult = await handleBattleUltimateKamikazeEffect(deps, context, renderTargets);
        if (kamikazeResult?.shouldFinalizeRage === false) {
          shouldFinalizeRage = false;
        }
        if (kamikazeResult?.shouldStop) {
          return;
        }
        continue;
      }

      const effectSummary = context.engine.applyBattleUltimateEffects(
        context.battleState,
        context.request.itemCatalog,
        [effect],
        {
          boxes: context.battleState.boxes,
          enemyShieldMax: deps.getBattleEnemyShieldMax(context),
          random: deps.getBattleRandom(context),
        },
      );
      deps.stopBattleRageTransformTargetLights(transformLights);
      transformLights = [];
      if (!deps.shouldContinueBattle(context, renderTargets)) {
        return;
      }
      if (effectSummary.playerDamage > 0) {
        deps.setBattleHealthFeedbackDelta(context, "player-health", -effectSummary.playerDamage, {
          sourceElements: deps.getBoardElementsForSourceCells(context, effectSummary.damageSourceCells),
        });
        deps.renderBattleStats(renderTargets.enemyStats, renderTargets.playerMeters, renderTargets.ultimateText, context);
        await deps.wait(getBattleUltimateDamageFeedbackWaitMs(deps, context));
        if (!deps.shouldContinueBattle(context, renderTargets)) {
          return;
        }
        if (deps.isBattlePlayerDefeated(context)) {
          context.battleState.isResolving = false;
          shouldFinalizeRage = false;
          deps.showBattleDefeat(context, renderTargets);
          return;
        }
      }
      if (effectSummary.enemyHealing > 0) {
        deps.setBattleHealthFeedbackDelta(context, "enemy-health", effectSummary.enemyHealing, {
          sourceElements: deps.getBoardElementsForSourceCells(context, effectSummary.healingSourceCells),
          forceHealProjectiles: true,
          disableFallbackSource: true,
        });
        deps.renderBattleStats(renderTargets.enemyStats, renderTargets.playerMeters, renderTargets.ultimateText, context);
        await deps.wait(getBattleUltimateDamageFeedbackWaitMs(deps, context));
        if (!deps.shouldContinueBattle(context, renderTargets)) {
          return;
        }
      }
      if (effectSummary.enemyShieldHealing > 0) {
        deps.setBattleHealthFeedbackDelta(context, "enemy-health", effectSummary.enemyShieldHealing, {
          sourceElements: deps.getBoardElementsForSourceCells(context, effectSummary.shieldHealingSourceCells),
          forceShieldProjectiles: true,
          disableFallbackSource: true,
        });
        deps.renderBattleStats(renderTargets.enemyStats, renderTargets.playerMeters, renderTargets.ultimateText, context);
        await deps.wait(getBattleUltimateDamageFeedbackWaitMs(deps, context));
        if (!deps.shouldContinueBattle(context, renderTargets)) {
          return;
        }
      }
      if (effectSummary.convertedItems > 0) {
        shouldResolveUltimateCascades = true;
        deps.renderBattleBoard(
          renderTargets.boardElement,
          context,
          renderTargets.status,
          renderTargets.enemyStats,
          renderTargets.playerMeters,
          renderTargets.ultimateText,
        );
      }
    }

    rageState.current = rageState.resetAfterUltimate === false ? 0 : rageState.max;
    deps.updateBattleRageTimerDisplay(context, deps.getBattleEnemyStatRoot(context));

    if (shouldResolveUltimateCascades) {
      deps.renderBattleBoard(
        renderTargets.boardElement,
        context,
        renderTargets.status,
        renderTargets.enemyStats,
        renderTargets.playerMeters,
        renderTargets.ultimateText,
      );
      const cascadeResult = await deps.resolveBattleCascades(context.battleState.board, context, {
        boardElement: renderTargets.boardElement,
        statusElement: renderTargets.status,
        enemyStatsElement: renderTargets.enemyStats,
        playerMetersElement: renderTargets.playerMeters,
        ultimateTextElement: renderTargets.ultimateText,
        bonusCell: null,
        lifecycleToken: renderTargets.lifecycleToken,
        attemptToken: renderTargets.attemptToken,
      });
      if (cascadeResult.cancelled || !deps.shouldContinueBattle(context, renderTargets)) {
        return;
      }
      context.battleState.board = cascadeResult.board;
      context.battleState.lastMoveSummary = cascadeResult;
      if (cascadeResult.cascades > 0) {
        deps.setBattleStatus(context, renderTargets.status, deps.formatMoveStatus(context, cascadeResult, enemyState));
      }
      context.battleState.isResolving = false;
      if (await deps.finishBattleMoveIfNeeded(context, renderTargets)) {
        shouldFinalizeRage = false;
        return;
      }
      context.battleState.isResolving = true;
    }

  } finally {
    deps.stopBattleRageTransformTargetLights(transformLights);
    context.battleState.isRageResolving = false;

    if (shouldFinalizeRage && deps.shouldContinueBattle(context, renderTargets) && !context.battleState.isComplete) {
      if (Number(rageState.current) <= 0) {
        rageState.current = rageState.resetAfterUltimate === false ? 0 : rageState.max;
      }
      context.battleState.isResolving = false;
      deps.updateBattleRageTimerDisplay(context, deps.getBattleEnemyStatRoot(context));
      deps.applyBattleRageWarningVisualState(context, deps.getBattleEnemyStatRoot(context));
      deps.renderBattleBoard(
        renderTargets.boardElement,
        context,
        renderTargets.status,
        renderTargets.enemyStats,
        renderTargets.playerMeters,
        renderTargets.ultimateText,
      );
      deps.resumeBattleRuntime(context, renderTargets);
      deps.resetBattleIdleTimer(context, renderTargets);
    }
  }
}

export async function handleBattleUltimateKamikazeEffect(deps, context, renderTargets) {
  const playerDamageResult = context.engine.applyBattleKamikazePlayerDamage(context.battleState);
  const kamikazeDamage = Number(playerDamageResult.kamikazeDamage || 0);
  if (kamikazeDamage <= 0) {
    return { shouldStop: false };
  }

  if (playerDamageResult.playerDamage > 0) {
    deps.setBattleHealthFeedbackDelta(context, "player-health", -playerDamageResult.playerDamage, {
      sourceElements: deps.getBattleEnemyHealthSourceElements(context),
      disableFallbackSource: true,
    });
    deps.renderBattleStats(
      renderTargets.enemyStats,
      renderTargets.playerMeters,
      renderTargets.ultimateText,
      context,
    );
    await deps.wait(getBattleUltimateDamageFeedbackWaitMs(deps, context));
    if (!deps.shouldContinueBattle(context, renderTargets)) {
      return { shouldStop: true };
    }
  }

  await deps.animateBattleKamikazeSelfDamageBurst(context, kamikazeDamage);
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return { shouldStop: true };
  }

  const selfDamageResult = context.engine.applyBattleKamikazeEnemySelfDamage(context.battleState, kamikazeDamage);
  if (selfDamageResult.enemySelfDamage > 0) {
    deps.setBattleHealthFeedbackDelta(context, "enemy-health", -selfDamageResult.enemySelfDamage, {
      disableFallbackSource: true,
    });
  }
  deps.renderBattleStats(
    renderTargets.enemyStats,
    renderTargets.playerMeters,
    renderTargets.ultimateText,
    context,
  );
  await deps.wait(getBattleUltimateDamageFeedbackWaitMs(deps, context));
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return { shouldStop: true };
  }

  if (await deps.finishBattleMoveIfNeeded(context, renderTargets)) {
    return { shouldStop: true, shouldFinalizeRage: false };
  }
  return { shouldStop: false };
}

export function isBattleUltimateConvertEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["convertItems", "convert", "conversion", "преобразование"].includes(effectType);
}

export function isBattleUltimateDamagePlayerByBoardItemsEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["damagePlayerByBoardItems", "damagePlayerByItems", "damageByBoardItems", "damagePlayer", "урон"].includes(effectType);
}

export function isBattleUltimateFixedPlayerDamageEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["damagePlayerFixed", "fixedPlayerDamage"].includes(effectType);
}

export function isBattleUltimateHealingEnemyByBoardItemsEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return [
    "HealingEnemyByBoardItems",
    "healingEnemyByBoardItems",
    "healEnemyByBoardItems",
    "enemyHealByBoardItems",
    "лечение",
  ].includes(effectType);
}

export function isBattleUltimateRestoreEnemyShieldByBoardItemsEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return [
    "RestoreEnemyShieldByBoardItems",
    "restoreEnemyShieldByBoardItems",
    "HealingEnemyShieldByBoardItems",
    "healingEnemyShieldByBoardItems",
    "enemyShieldByBoardItems",
    "щит",
  ].includes(effectType);
}

export function isBattleUltimateKamikazeEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["kamikaze", "Kamikaze", "enemyKamikaze", "kamikazeEnemy"].includes(effectType);
}

export function getBattleUltimateDamageFeedbackWaitMs(deps, context) {
  const animationConfig = deps.getBattleAnimationConfig(context);
  const projectileMs = Math.max(0, Number(animationConfig.lightDamageProjectileMs || deps.DEFAULT_LIGHT_PROJECTILE_MS));
  const healthChangeMs = Math.max(0, Number(animationConfig.healthChangeMs || 0));
  return projectileMs + healthChangeMs;
}

export function getCurrentBattleRageConfig(context) {
  const stage = getCurrentBattleStageConfig(context);
  return stage?.rage || {};
}

export function getCurrentBattleUltimateEffects(context) {
  const stage = getCurrentBattleStageConfig(context);
  return Array.isArray(stage?.ultimate?.effects) ? stage.ultimate.effects : [];
}

export function getCurrentBattleStageConfig(context) {
  return context.engine.getCurrentBattleStage(context.battleData.enemyConfig, context.battleState.enemyState);
}

export function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim());
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}
