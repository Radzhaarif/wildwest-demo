export function openBattleSettings(deps, context, renderTargets) {
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  deps.pauseBattleRuntime(context);
  const settingsOverlay = context.callbacks?.onOpenSettings?.() || document.querySelector("#settingsOverlay");

  if (!settingsOverlay) {
    if (deps.shouldContinueBattle(context, renderTargets)) {
      deps.resumeBattleRuntime(context, renderTargets);
    }
    return;
  }

  const observer = new MutationObserver(() => {
    if (settingsOverlay.classList.contains("hidden")) {
      observer.disconnect();
      if (deps.shouldContinueBattle(context, renderTargets)) {
        deps.resumeBattleRuntime(context, renderTargets);
      }
    }
  });
  observer.observe(settingsOverlay, { attributes: true, attributeFilter: ["class"] });
}

export function openBattleSurrender(deps, context, renderTargets) {
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  deps.pauseBattleRuntime(context);
  const callbacks = {
    onConfirm: () => {
      finishBattle(deps, context, renderTargets, deps.BATTLE_OUTCOMES.cancelled);
    },
    onCancel: () => {
      deps.resumeBattleRuntime(context, renderTargets);
    },
  };

  if (typeof context.callbacks?.onSurrender === "function") {
    context.callbacks.onSurrender(callbacks);
  } else {
    finishBattle(deps, context, renderTargets, deps.BATTLE_OUTCOMES.cancelled);
  }
}

export async function completeBattleVictory(deps, context, renderTargets) {
  if (context.battleState.isComplete || !deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  context.battleState.isComplete = true;
  deps.pauseBattleRuntime(context);
  await showBattleOutcomeBanner(
    deps,
    renderTargets.overlay,
    deps.translate(context.request.locale, deps.getBattleUiConfig(context).textKeys.victoryTitle),
    deps.getBattleAnimationConfig(context).outcomeBannerMs,
  );
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  finishBattle(deps, context, renderTargets, deps.BATTLE_OUTCOMES.victory);
}

export function showBattleDefeat(deps, context, renderTargets) {
  const activeRenderTargets = deps.normalizeBattleRenderTargets(context, renderTargets);
  if (context.battleState.isComplete || !deps.shouldContinueBattle(context, activeRenderTargets)) {
    return;
  }

  context.battleState.isComplete = true;
  deps.pauseBattleRuntime(context);
  const uiConfig = deps.getBattleUiConfig(context);
  const banner = createBattleOutcomeElement(
    deps.translate(context.request.locale, uiConfig.textKeys.defeatTitle),
  );
  banner.classList.add("is-defeat");

  const actions = document.createElement("div");
  actions.className = "battle-outcome-actions";

  const surrenderButton = document.createElement("button");
  surrenderButton.type = "button";
  surrenderButton.textContent = deps.translate(context.request.locale, "ui.surrender");
  surrenderButton.addEventListener("click", () => openBattleSurrender(deps, context, activeRenderTargets));

  const restartButton = document.createElement("button");
  restartButton.type = "button";
  restartButton.textContent = deps.translate(context.request.locale, uiConfig.textKeys.restartBattle);
  restartButton.addEventListener("click", () => {
    restartCurrentBattle(deps, context, activeRenderTargets, banner);
  });

  actions.append(surrenderButton, restartButton);
  banner.append(actions);
  activeRenderTargets.overlay.append(banner);
}

export function restartCurrentBattle(deps, context, renderTargets, banner) {
  let activeRenderTargets = deps.normalizeBattleRenderTargets(context, renderTargets);
  if (!deps.shouldContinueBattle(context, activeRenderTargets)) {
    return;
  }

  deps.stopBattleRuntime(context);
  deps.cancelBattleAttempt(context);
  activeRenderTargets = deps.normalizeBattleRenderTargets(context, activeRenderTargets);
  activeRenderTargets.attemptToken = deps.startBattleAttemptLifecycle(context);
  context.battleRenderTargets = activeRenderTargets;
  banner?.remove();
  deps.clearBattleBoardMessage(activeRenderTargets.boardElement);
  deps.clearActiveBattleSpecial(context);
  context.battleLog = [];
  context.battleState.playerState = context.engine.cloneBattlePlayerState(
    context.battleState.initialPlayerState || context.request.playerState,
  );
  context.battleState.enemyState = context.engine.createBattleEnemyState(context.battleData.enemyConfig);
  context.battleState.selectedCell = null;
  context.battleState.activeSpecialItemId = null;
  context.battleState.specialSwapCell = null;
  context.battleState.noMovesMessageVisible = false;
  context.battleState.isMiniMenuOpen = false;
  context.battleState.isInventoryOpen = false;
  context.battleState.ragePausedUntil = 0;
  context.battleState.pendingRageAction = false;
  context.battleState.isResolving = false;
  context.battleState.isRageResolving = false;
  context.battleState.isComplete = false;
  context.battleState.lastMoveSummary = null;
  deps.prepareBattleAttemptState(context);
  deps.setBattleStatus(context, activeRenderTargets.status, deps.translateBattleText(context, "selectFirstCell"));
  deps.renderBattleStats(
    activeRenderTargets.enemyStats,
    activeRenderTargets.playerMeters,
    activeRenderTargets.ultimateText,
    context,
  );
  deps.renderBattleInventory(
    activeRenderTargets.specialItems,
    activeRenderTargets.handItems,
    context,
    activeRenderTargets,
  );
  deps.renderBattleBoard(
    activeRenderTargets.boardElement,
    context,
    activeRenderTargets.status,
    activeRenderTargets.enemyStats,
    activeRenderTargets.playerMeters,
    activeRenderTargets.ultimateText,
  );
  deps.startBattleRuntime(context, activeRenderTargets);
}

export async function showBattleOutcomeBanner(deps, overlay, title, durationMs) {
  const banner = createBattleOutcomeElement(title);
  overlay.append(banner);
  await deps.wait(durationMs);
  banner.remove();
}

export function createBattleOutcomeElement(title) {
  const banner = document.createElement("div");
  banner.className = "battle-outcome-banner";

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  banner.append(titleElement);
  return banner;
}

export function finishBattle(deps, context, renderTargets, outcome) {
  if (!deps.shouldContinueBattle(context, renderTargets) || context.battleLifecycle?.isFinishing) {
    return;
  }
  context.battleLifecycle.isFinishing = true;
  deps.cancelBattleLifecycle(context);
  deps.stopBattleRuntime(context);
  deps.cleanupBattleScaffold(context, renderTargets.overlay);
  closeScaffold(renderTargets.overlay);
  renderTargets.resolve(createScaffoldResult(deps, context, outcome));
}

export function createScaffoldResult(deps, context, outcome) {
  return deps.createBattleResult({
    outcome,
    nodeId: context.request.nodeId,
    nodeType: context.request.nodeType,
    playerState: context.battleState.playerState,
    enemyState: context.battleState.enemyState,
    rewards: [],
    reward: outcome === deps.BATTLE_OUTCOMES.victory ? context.battleData.enemyConfig?.reward : null,
    logMessages: [...(context.battleLog || [])].reverse(),
  });
}

export function closeScaffold(overlay) {
  overlay.remove();
}
