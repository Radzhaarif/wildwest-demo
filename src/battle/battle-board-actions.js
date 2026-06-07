export async function handleGoldBoardClick(deps, context, cell, renderTargets) {
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  deps.resetBattleIdleTimer(context, renderTargets);
  deps.clearBattleGoldTargetPreview(context);

  const itemId = context.battleState.board?.[cell.row]?.[cell.col];
  const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
  const price = deps.getBattleGoldPrice(item);
  const currentGold = deps.getInventoryQuantity(context.battleState.playerState, deps.GOLD_ITEM_ID);

  if (price === null) {
    await deps.animateBattleShakeCells(boardElement, [cell], deps.getBattleAnimationConfig(context).invalidShakeMs);
    if (deps.shouldContinueBattle(context, renderTargets)) {
      deps.setBattleStatus(
        context,
        statusElement,
        deps.translate(context.request.locale, deps.getBattleUiConfig(context).textKeys.clockUnavailable),
      );
    }
    return;
  }

  if (currentGold < price) {
    await deps.animateBattleShakeCells(boardElement, [cell], deps.getBattleAnimationConfig(context).invalidShakeMs);
    if (deps.shouldContinueBattle(context, renderTargets)) {
      deps.setBattleStatus(context, statusElement, deps.translate(context.request.locale, "ui.notEnoughGold"));
    }
    return;
  }

  const nextItemId = context.engine.pickBattleGoldLootItem(context.request.itemCatalog, {
    sourceItemId: itemId,
    playerState: context.battleState.playerState,
    random: Math.random,
  });
  if (!nextItemId) {
    await deps.animateBattleShakeCells(boardElement, [cell], deps.getBattleAnimationConfig(context).invalidShakeMs);
    if (deps.shouldContinueBattle(context, renderTargets)) {
      deps.setBattleStatus(
        context,
        statusElement,
        deps.translate(context.request.locale, deps.getBattleUiConfig(context).textKeys.clockUnavailable),
      );
    }
    return;
  }

  context.battleState.isResolving = true;
  context.battleState.selectedCell = null;
  context.battleState.specialSwapCell = null;
  deps.changeInventoryQuantity(context.battleState.playerState, deps.GOLD_ITEM_ID, -price);
  context.battleState.board[cell.row][cell.col] = nextItemId;
  deps.clearActiveBattleSpecial(context);
  renderCurrentInventory(deps, context, renderTargets);
  deps.renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);

  const firstMatches = context.engine.findBattleMatches(context.battleState.board, context.request.itemCatalog, {
    boxes: context.battleState.boxes,
    vines: context.battleState.vines,
  });

  if (firstMatches.length > 0) {
    const result = await deps.resolveBattleCascades(context.battleState.board, context, {
      boardElement,
      statusElement,
      enemyStatsElement,
      playerMetersElement,
      ultimateTextElement,
      bonusCell: cell,
      lifecycleToken: renderTargets.lifecycleToken,
      attemptToken: renderTargets.attemptToken,
    });
    if (result.cancelled || !deps.shouldContinueBattle(context, renderTargets)) {
      return;
    }
    context.battleState.board = result.board;
    context.battleState.lastMoveSummary = result;
    deps.setBattleStatus(context, statusElement, deps.formatMoveStatus(context, result, context.battleState.enemyState));
  } else {
    deps.setBattleStatus(context, statusElement, deps.translateBattleText(context, "freeSwapDone"));
  }

  context.battleState.isResolving = false;
  deps.renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
  renderCurrentInventory(deps, context, renderTargets);
  await deps.finishBattleMoveIfNeeded(context, renderTargets);
}

export async function handleSkullBoardClick(deps, context, cell, renderTargets) {
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  deps.resetBattleIdleTimer(context, renderTargets);
  context.battleState.isResolving = true;
  context.battleState.selectedCell = null;
  deps.clearActiveBattleSpecial(context);
  renderCurrentInventory(deps, context, renderTargets);

  const activatedCells = deps.getBattleAreaCells(context.battleState.board, cell, 1)
    .filter((targetCell) => !deps.isBattleCellBoxed(context, targetCell));
  await deps.animateBattleShakeCells(boardElement, activatedCells, deps.getBattleAnimationConfig(context).matchShakeMs);
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const manualMatches = [{ type: "manual", kind: "special", cells: activatedCells }];
  const beforeEnemyState = {
    health: { current: Number(context.battleState.enemyState?.health?.current || 0) },
    aggression: { current: Number(context.battleState.enemyState?.aggression?.current || 0) },
  };
  const beforePlayerState = context.engine.cloneBattlePlayerState(context.battleState.playerState);
  const effectSummary = context.engine.applyBattleMatchEffects(
    { ...context.battleState, board: context.battleState.board },
    manualMatches,
    context.request.itemCatalog,
    { suppressAggression: true },
  );
  deps.setMatchFeedbackForBattleChange(
    context,
    beforeEnemyState,
    context.battleState.enemyState,
    beforePlayerState,
    context.battleState.playerState,
    effectSummary,
    context.battleState.board,
    manualMatches,
  );
  if (effectSummary.stageChanged) {
    deps.syncBattleWallsWithStage(context, { force: true });
    deps.syncBattleVinesWithStage(context, { force: true });
  }
  deps.renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
  deps.playBattleItemActivationSounds(context, context.battleState.board, activatedCells);
  await deps.animateBattleDeaths(boardElement, context.battleState.board, activatedCells, context);
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const beforeGravityBoard = context.engine.removeBattleMatches(context.battleState.board, manualMatches, {
    boxes: context.battleState.boxes,
  });
  const refillResult = deps.refillBattleBoardFromReserve(context, beforeGravityBoard);
  context.battleState.board = refillResult.board;
  if (effectSummary.stageChanged) {
    deps.syncBattleBoxesWithStage(context, { force: true });
    deps.syncBattleVinesWithStage(context, { force: true });
  }
  deps.renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
  await deps.animateBattleBoardMove(boardElement, refillResult.movement, context);
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const cascadeResult = await deps.resolveBattleCascades(context.battleState.board, context, {
    boardElement,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
    bonusCell: null,
    lifecycleToken: renderTargets.lifecycleToken,
    attemptToken: renderTargets.attemptToken,
  });
  if (cascadeResult.cancelled || !deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  deps.mergeEffectSummary(cascadeResult.effects, effectSummary);
  cascadeResult.removedCells += activatedCells.length;
  context.battleState.board = cascadeResult.board;
  context.battleState.lastMoveSummary = cascadeResult;
  context.battleState.isResolving = false;
  deps.setBattleStatus(context, statusElement, deps.formatMoveStatus(context, cascadeResult, context.battleState.enemyState));
  await deps.finishBattleMoveIfNeeded(context, renderTargets);
}

export async function handleFreeSwapBoardClick(deps, context, cell, renderTargets) {
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  deps.resetBattleIdleTimer(context, renderTargets);
  const selectedCell = context.battleState.specialSwapCell;

  if (!selectedCell) {
    context.battleState.specialSwapCell = cell;
    context.battleState.selectedCell = cell;
    deps.renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
    return;
  }

  if (deps.isSameCell(selectedCell, cell)) {
    context.battleState.specialSwapCell = null;
    context.battleState.selectedCell = null;
    deps.renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
    return;
  }

  context.battleState.isResolving = true;
  context.battleState.selectedCell = null;
  context.battleState.specialSwapCell = null;
  deps.clearActiveBattleSpecial(context);
  renderCurrentInventory(deps, context, renderTargets);

  const swappedBoard = context.engine.swapBattleCells(context.battleState.board, selectedCell, cell);
  await deps.animateBattleSwap(boardElement, selectedCell, cell, deps.getBattleSwapDurationMs(context));
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  context.battleState.board = swappedBoard;
  deps.renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);

  const firstMatches = context.engine.findBattleMatches(swappedBoard, context.request.itemCatalog, {
    boxes: context.battleState.boxes,
    vines: context.battleState.vines,
  });
  if (firstMatches.length > 0) {
    const result = await deps.resolveBattleCascades(swappedBoard, context, {
      boardElement,
      statusElement,
      enemyStatsElement,
      playerMetersElement,
      ultimateTextElement,
      bonusCell: cell,
      lifecycleToken: renderTargets.lifecycleToken,
      attemptToken: renderTargets.attemptToken,
    });
    if (result.cancelled || !deps.shouldContinueBattle(context, renderTargets)) {
      return;
    }
    context.battleState.board = result.board;
    context.battleState.lastMoveSummary = result;
    deps.setBattleStatus(context, statusElement, deps.formatMoveStatus(context, result, context.battleState.enemyState));
  } else {
    deps.setBattleStatus(context, statusElement, deps.translateBattleText(context, "freeSwapDone"));
  }

  context.battleState.isResolving = false;
  await deps.finishBattleMoveIfNeeded(context, renderTargets);
}

export async function handleBatteryBoardClick(deps, context, activation, renderTargets) {
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  deps.resetBattleIdleTimer(context, renderTargets);
  context.battleState.isResolving = true;
  context.battleState.selectedCell = null;

  const activatedCells = activation.cells.filter((targetCell) => (
    !deps.isBattleCellBoxed(context, targetCell) && !deps.isBattleCellVined(context, targetCell)
  ));
  await deps.animateBattleShakeCells(boardElement, activatedCells, deps.getBattleAnimationConfig(context).matchShakeMs);
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const manualMatches = [{
    type: activation.targetType || "battery",
    kind: activation.kind,
    cells: activatedCells,
  }];
  const beforeEnemyState = {
    health: { current: Number(context.battleState.enemyState?.health?.current || 0) },
    aggression: { current: Number(context.battleState.enemyState?.aggression?.current || 0) },
  };
  const beforePlayerState = context.engine.cloneBattlePlayerState(context.battleState.playerState);
  const effectSummary = context.engine.applyBattleMatchEffects(
    { ...context.battleState, board: context.battleState.board },
    manualMatches,
    context.request.itemCatalog,
    { suppressAggression: true },
  );
  deps.setMatchFeedbackForBattleChange(
    context,
    beforeEnemyState,
    context.battleState.enemyState,
    beforePlayerState,
    context.battleState.playerState,
    effectSummary,
    context.battleState.board,
    manualMatches,
  );
  if (effectSummary.stageChanged) {
    deps.syncBattleWallsWithStage(context, { force: true });
    deps.syncBattleVinesWithStage(context, { force: true });
  }
  deps.renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
  deps.playBattleItemActivationSounds(context, context.battleState.board, activatedCells);
  await deps.animateBattleDeaths(boardElement, context.battleState.board, activatedCells, context);
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const beforeGravityBoard = context.engine.removeBattleMatches(context.battleState.board, manualMatches, {
    boxes: context.battleState.boxes,
    vines: context.battleState.vines,
  });
  const refillResult = deps.refillBattleBoardFromReserve(context, beforeGravityBoard);
  context.battleState.board = refillResult.board;
  if (effectSummary.stageChanged) {
    deps.syncBattleBoxesWithStage(context, { force: true });
    deps.syncBattleVinesWithStage(context, { force: true });
  }
  deps.renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
  await deps.animateBattleBoardMove(boardElement, refillResult.movement, context);
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const cascadeResult = await deps.resolveBattleCascades(context.battleState.board, context, {
    boardElement,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
    bonusCell: null,
    lifecycleToken: renderTargets.lifecycleToken,
    attemptToken: renderTargets.attemptToken,
  });
  if (cascadeResult.cancelled || !deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  deps.mergeEffectSummary(cascadeResult.effects, effectSummary);
  cascadeResult.removedCells += activatedCells.length;
  context.battleState.board = cascadeResult.board;
  context.battleState.lastMoveSummary = cascadeResult;
  context.battleState.isResolving = false;
  deps.setBattleStatus(context, statusElement, deps.formatMoveStatus(context, cascadeResult, context.battleState.enemyState));
  await deps.finishBattleMoveIfNeeded(context, renderTargets);
}

export async function handleBattleBoxedCellClick(deps, context, cell, renderTargets) {
  const { boardElement, statusElement } = renderTargets;
  deps.resetBattleIdleTimer(context, renderTargets);
  context.battleState.isResolving = true;
  const selectedCell = context.battleState.specialSwapCell || context.battleState.selectedCell;
  await deps.animateBattleBoxBlockedClick(
    boardElement,
    cell,
    selectedCell && !deps.isSameCell(selectedCell, cell) ? selectedCell : null,
    deps.getBattleAnimationConfig(context).invalidShakeMs,
  );
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  if (!context.battleState.activeSpecialItemId) {
    context.battleState.selectedCell = null;
  }
  context.battleState.isResolving = false;
  deps.setBattleStatus(context, statusElement, deps.translateBattleText(context, "boxBlocked"));
  await deps.finishBattleMoveIfNeeded(context, renderTargets);
}

export async function handleBattleVinedCellClick(deps, context, cell, renderTargets) {
  const { boardElement, statusElement } = renderTargets;
  deps.resetBattleIdleTimer(context, renderTargets);
  context.battleState.isResolving = true;
  const selectedCell = context.battleState.selectedCell;
  await deps.animateBattleVineBlockedClick(
    boardElement,
    cell,
    selectedCell && !deps.isSameCell(selectedCell, cell) ? selectedCell : null,
    deps.getBattleAnimationConfig(context).invalidShakeMs,
  );
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  context.battleState.selectedCell = null;
  context.battleState.isResolving = false;
  deps.setBattleStatus(context, statusElement, deps.translateBattleText(context, "vinesBlocked"));
  await deps.finishBattleMoveIfNeeded(context, renderTargets);
}

export async function handleBattleCellClick(deps, context, cell, renderTargets) {
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  if (context.battleState.isResolving) {
    return;
  }

  if (deps.isBattleCellBoxed(context, cell)) {
    await handleBattleBoxedCellClick(deps, context, cell, renderTargets);
    return;
  }

  if (context.battleState.activeSpecialItemId === deps.GOLD_ITEM_ID) {
    await handleGoldBoardClick(deps, context, cell, renderTargets);
    return;
  }

  if (context.battleState.activeSpecialItemId === deps.SKULL_ITEM_ID) {
    await handleSkullBoardClick(deps, context, cell, renderTargets);
    return;
  }

  if (context.battleState.activeSpecialItemId === deps.SWAP_ITEM_ID) {
    await handleFreeSwapBoardClick(deps, context, cell, renderTargets);
    return;
  }

  if (deps.isBattleCellVined(context, cell)) {
    await handleBattleVinedCellClick(deps, context, cell, renderTargets);
    return;
  }

  deps.resetBattleIdleTimer(context, renderTargets);
  const selectedCell = context.battleState.selectedCell;
  if (!selectedCell) {
    context.battleState.selectedCell = cell;
    deps.setBattleStatus(context, statusElement, deps.translateBattleText(context, "cellSelected"));
    return;
  }

  if (deps.isSameCell(selectedCell, cell)) {
    context.battleState.selectedCell = null;
    deps.setBattleStatus(context, statusElement, deps.translateBattleText(context, "selectionCleared"));
    return;
  }

  if (!deps.areAdjacentCells(selectedCell, cell)) {
    context.battleState.selectedCell = cell;
    deps.setBattleStatus(context, statusElement, deps.translateBattleText(context, "newCellSelected"));
    return;
  }

  if (context.engine.hasBattleWallBetween(context.battleState.walls, selectedCell, cell)) {
    context.battleState.selectedCell = null;
    context.battleState.isResolving = true;
    await deps.animateBattleWallBlockedSwap(
      boardElement,
      selectedCell,
      cell,
      deps.getBattleAnimationConfig(context).invalidShakeMs,
    );
    if (!deps.shouldContinueBattle(context, renderTargets)) {
      return;
    }
    context.battleState.isResolving = false;
    deps.setBattleStatus(context, statusElement, deps.translateBattleText(context, "wallBlocked"));
    await deps.finishBattleMoveIfNeeded(context, renderTargets);
    return;
  }

  const batteryActivation = context.engine.findBattleBatteryActivation(
    context.battleState.board,
    context.request.itemCatalog,
    selectedCell,
    cell,
    { boxes: context.battleState.boxes, vines: context.battleState.vines },
  );
  if (batteryActivation) {
    await handleBatteryBoardClick(deps, context, batteryActivation, renderTargets);
    return;
  }

  const swappedBoard = context.engine.swapBattleCells(context.battleState.board, selectedCell, cell);
  const firstMatches = context.engine.findBattleMatches(swappedBoard, context.request.itemCatalog, {
    boxes: context.battleState.boxes,
    vines: context.battleState.vines,
  });

  context.battleState.selectedCell = null;
  context.battleState.isResolving = true;
  await deps.animateBattleSwap(boardElement, selectedCell, cell, deps.getBattleSwapDurationMs(context));
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  if (firstMatches.length === 0) {
    await deps.animateBattleShakeCells(boardElement, [selectedCell, cell], deps.getBattleAnimationConfig(context).invalidShakeMs);
    if (!deps.shouldContinueBattle(context, renderTargets)) {
      return;
    }
    context.battleState.isResolving = false;
    deps.setBattleStatus(context, statusElement, deps.translateBattleText(context, "noMatchSwapCancelled"));
    await deps.finishBattleMoveIfNeeded(context, renderTargets);
    return;
  }

  context.battleState.board = swappedBoard;
  deps.renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
  const turnDamageSummary = applyBattleOrdinarySwapTurnDamage(deps, context);
  if (turnDamageSummary.playerDamage > 0) {
    deps.renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
    if (deps.isBattlePlayerDefeated(context)) {
      context.battleState.isResolving = false;
      deps.showBattleDefeat(context, renderTargets);
      return;
    }
  }
  const result = await deps.resolveBattleCascades(swappedBoard, context, {
    ...renderTargets,
    bonusCell: cell,
  });
  if (result.cancelled || !deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  deps.mergeEffectSummary(result.effects, turnDamageSummary);
  context.battleState.board = result.board;
  context.battleState.lastMoveSummary = result;
  context.battleState.isResolving = false;
  deps.setBattleStatus(context, statusElement, deps.formatMoveStatus(context, result, context.battleState.enemyState));
  await deps.finishBattleMoveIfNeeded(context, renderTargets);
}

export function applyBattleOrdinarySwapTurnDamage(deps, context) {
  const summary = deps.createEmptyEffectSummary();
  const turnDamage = context.engine.applyBattleTurnDamage(
    context.battleState,
    context.request.itemCatalog,
    { boxes: context.battleState.boxes },
  );
  const playerDamage = Number(turnDamage?.playerDamage || 0);
  if (playerDamage <= 0) {
    return summary;
  }

  summary.playerDamage = playerDamage;
  deps.setBattleHealthFeedbackDelta(context, "player-health", -playerDamage, {
    sourceElements: deps.getBoardElementsForSourceCells(context, turnDamage.sourceCells),
    disableFallbackSource: true,
  });
  return summary;
}

function renderCurrentInventory(deps, context, renderTargets) {
  const targets = context.battleRenderTargets || renderTargets;
  if (!targets?.specialItems || !targets?.handItems) {
    return;
  }
  deps.renderBattleInventory(targets.specialItems, targets.handItems, context, targets);
}
