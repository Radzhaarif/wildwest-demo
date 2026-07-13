export async function handleBattleIdle(deps, context, renderTargets) {
  // Idle сначала ищет легальную подсказку. Только если ходов нет, показывает
  // no-moves сообщение и предлагает ручной shuffle с ценой агрессии.
  if (!context.battleRuntime || context.battleState.isComplete || !deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  if (context.battleState.isResolving) {
    deps.resetBattleIdleTimer(context, renderTargets);
    return;
  }

  const availableMove = context.engine.findBattleAvailableMove(
    context.battleState.board,
    context.request.itemCatalog,
    {
      ...deps.getBattleUiConfig(context).availableMoveSearch,
      walls: context.battleState.walls,
      boxes: context.battleState.boxes,
      vines: context.battleState.vines,
    },
  );

  if (availableMove) {
    await deps.animateBattleShakeCells(
      renderTargets.boardElement,
      [availableMove.hintCell || availableMove.from],
      deps.getBattleAnimationConfig(context).idleHintShakeMs,
    );
    if (!deps.shouldContinueBattle(context, renderTargets)) {
      return;
    }
    deps.resetBattleIdleTimer(context, renderTargets);
    return;
  }

  await handleNoBattleMoves(deps, context, renderTargets);
}

export async function handleNoBattleMoves(deps, context, renderTargets) {
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  if (context.battleState.noMovesMessageVisible) {
    return;
  }

  const { boardElement, status } = renderTargets;
  const uiConfig = deps.getBattleUiConfig(context);
  const animationConfig = deps.getBattleAnimationConfig(context);

  context.battleState.noMovesMessageVisible = true;
  context.battleState.selectedCell = null;
  deps.showBattleBoardMessage(
    boardElement,
    deps.translate(context.request.locale, uiConfig.textKeys.noMovesTitle),
    deps.translate(context.request.locale, uiConfig.textKeys.noMovesBody),
  );

  deps.setBattleStatus(context, status, deps.translate(context.request.locale, uiConfig.textKeys.noMovesBody));
  await deps.wait(animationConfig.noMovesMessageMs);
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }
  deps.clearBattleBoardMessage(boardElement);
  context.battleState.noMovesMessageVisible = false;
  deps.resetBattleIdleTimer(context, renderTargets);
}

export async function handleManualBattleShuffle(deps, context, renderTargets) {
  if (
    context.battleState.isResolving
    || context.battleState.isComplete
    || (deps.isBattleTutorialActive?.(context) && !deps.isBattleTutorialShuffleStep?.(context))
    || !deps.shouldContinueBattle(context, renderTargets)
  ) {
    return;
  }

  const { boardElement, status, enemyStats, playerMeters, ultimateText } = renderTargets;
  context.battleState.isResolving = true;
  context.battleState.noMovesMessageVisible = false;
  context.battleState.selectedCell = null;
  context.battleState.lastMoveSummary = null;
  deps.clearBattleBoardMessage(boardElement);
  deps.clearActiveBattleSpecial(context);
  updateBattleShuffleButtonState(deps, context);
  deps.renderBattleInventory(renderTargets.specialItems, renderTargets.handItems, context, renderTargets);

  const damage = context.battleState.enemyState?.aggression?.damage || 0;
  context.engine.applyBattlePlayerDamage(context.battleState.playerState, damage);
  if (damage > 0) {
    deps.setBattleHealthFeedbackDelta(context, "player-health", -damage, {
      sourceElements: deps.getBattlePlayerHealthSourceElements(context),
    });
  }
  deps.renderBattleStats(enemyStats, playerMeters, ultimateText, context);
  deps.setBattleStatus(context, status, deps.translate(context.request.locale, deps.getBattleUiConfig(context).textKeys.noMovesBody));
  if (deps.isBattlePlayerDefeated(context)) {
    context.battleState.isResolving = false;
    recordBattleAction(deps, context, {
      type: "manualShuffle",
      accepted: true,
      playerDamage: damage,
      endedByDamage: true,
    });
    deps.showBattleDefeat(context, renderTargets);
    return;
  }

  await shuffleCurrentBattleBoard(deps, context, renderTargets, deps.getBattleAnimationConfig(context).noMovesShuffleMs);
  if (!deps.shouldContinueBattle(context, renderTargets)) {
    return;
  }

  const tutorialCompleted = deps.completeBattleTutorialAfterShuffle?.(context, renderTargets) === true;
  if (tutorialCompleted) {
    deps.renderBattleInventory(renderTargets.specialItems, renderTargets.handItems, context, renderTargets);
  }
  context.battleState.isResolving = false;
  deps.setBattleStatus(context, status, deps.translateBattleText(context, "shuffleBoardDone"));
  updateBattleShuffleButtonState(deps, context);
  deps.renderBattleBoard(boardElement, context, status, enemyStats, playerMeters, ultimateText);
  recordBattleAction(deps, context, {
    type: "manualShuffle",
    accepted: true,
    playerDamage: damage,
  });
  await deps.finishBattleMoveIfNeeded(context, renderTargets);
}

export async function shuffleCurrentBattleBoard(deps, context, renderTargets, durationMs) {
  const { boardElement, status, enemyStats, playerMeters, ultimateText } = renderTargets;
  const shuffleResult = createNoMovesBattleShuffle(deps, context);
  context.battleState.board = shuffleResult.board;
  context.battleState.reserveBoard = deps.createBattleReserveBoardForCurrentStage(context);
  deps.syncBattleWallsWithStage(context, { force: true });
  deps.syncBattleBoxesWithStage(context, { force: true });
  deps.syncBattleVinesWithStage(context, { force: true });
  deps.renderBattleBoard(boardElement, context, status, enemyStats, playerMeters, ultimateText);
  await deps.animateBattleBoardShuffleMovement(boardElement, shuffleResult.movement, durationMs);
}

export function areBattleBoardsEqual(firstBoard, secondBoard) {
  if (firstBoard === secondBoard) {
    return true;
  }
  if (!Array.isArray(firstBoard) || !Array.isArray(secondBoard)) {
    return false;
  }
  if (firstBoard.length !== secondBoard.length) {
    return false;
  }

  for (let row = 0; row < firstBoard.length; row += 1) {
    if (!Array.isArray(firstBoard[row]) || !Array.isArray(secondBoard[row])) {
      return false;
    }
    if (firstBoard[row].length !== secondBoard[row].length) {
      return false;
    }
    for (let col = 0; col < firstBoard[row].length; col += 1) {
      if (firstBoard[row][col] !== secondBoard[row][col]) {
        return false;
      }
    }
  }

  return true;
}

export function createNoMovesBattleShuffle(deps, context) {
  const maxAttempts = 80;
  let fallbackResult = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const shuffleResult = context.engine.shuffleBattleBoardWithMovement(context.battleState.board, {
      boxes: context.battleState.boxes,
      vines: context.battleState.vines,
      random: deps.getBattleRandom(context),
    });
    if (!areBattleBoardsEqual(context.battleState.board, shuffleResult.board)) {
      const hasStartingMatches = context.engine.findBattleMatches(
        shuffleResult.board,
        context.request.itemCatalog,
        { boxes: context.battleState.boxes, vines: context.battleState.vines },
      ).length > 0;
      const hasAvailableMove = context.engine.findBattleAvailableMove(
        shuffleResult.board,
        context.request.itemCatalog,
        {
          ...deps.getBattleUiConfig(context).availableMoveSearch,
          walls: context.battleState.walls,
          boxes: context.battleState.boxes,
          vines: context.battleState.vines,
        },
      );

      if (!hasStartingMatches && hasAvailableMove) {
        return shuffleResult;
      }

      if (!hasStartingMatches && !fallbackResult) {
        fallbackResult = shuffleResult;
      }

      if (!fallbackResult) {
        fallbackResult = shuffleResult;
      }
    }
  }

  return fallbackResult || {
    board: context.battleState.board,
    movement: [],
  };
}

export function updateBattleShuffleButtonLanguage(deps, context, button) {
  if (!button) {
    return;
  }

  const label = deps.translate(
    context.request.locale,
    deps.getBattleUiConfig(context).shuffleButton.textKey || deps.getBattleUiConfig(context).textKeys.shuffleBoard,
  );
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

export function updateBattleShuffleButtonState(deps, context) {
  const button = context.battleRenderTargets?.shuffleButton;
  if (!button) {
    return;
  }

  const tutorialBlocksShuffle = deps.isBattleTutorialActive?.(context)
    && !deps.isBattleTutorialShuffleStep?.(context);
  button.disabled = Boolean(
    context.battleState.isResolving
    || context.battleState.isComplete
    || tutorialBlocksShuffle
  );
}

function recordBattleAction(deps, context, action) {
  if (typeof deps.recordBattleTraceMove === "function") {
    deps.recordBattleTraceMove(context, action);
  }
}
