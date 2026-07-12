import {
  animateBattleShakeCells,
  getBattleCellElement,
  getBattleCellIconElement,
  runCellAnimation,
} from "./battle-animations.js";

export async function resolveBattleCascades(deps, board, context, renderTargets) {
  // Единственный основной цикл resolve: найти матчи, применить эффекты,
  // удалить/создать бонусы, refill из reserve, повторить до лимита.
  const { boardElement, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement } = renderTargets;
  let currentBoard = board;
  let cascades = 0;
  let removedCells = 0;
  let createdBonuses = 0;
  const effects = deps.createEmptyEffectSummary();
  const animationConfig = deps.getBattleAnimationConfig(context);
  const cascadeStepMs = Math.max(0, Number(animationConfig.cascadeStepMs || 0));
  const makeResult = (cancelled = false) => ({
    board: currentBoard,
    cascades,
    removedCells,
    createdBonuses,
    effects,
    cascadeLimitReached: false,
    cancelled,
  });

  while (cascades < deps.MAX_CASCADE_STEPS) {
    if (!deps.shouldContinueBattle(context, renderTargets)) {
      return makeResult(true);
    }
    const matches = context.engine.findBattleMatches(currentBoard, context.request.itemCatalog, {
      boxes: context.battleState.boxes,
      vines: context.battleState.vines,
    });
    if (matches.length === 0) {
      break;
    }

    const matchCells = context.engine.collectBattleMatchCells(matches);
    await animateBattleShakeCells(boardElement, matchCells, deps.getBattleAnimationConfig(context).matchShakeMs);
    if (!deps.shouldContinueBattle(context, renderTargets)) {
      return makeResult(true);
    }
    const beforeEnemyState = {
      health: { current: Number(context.battleState.enemyState?.health?.current || 0) },
      aggression: { current: Number(context.battleState.enemyState?.aggression?.current || 0) },
    };
    const beforePlayerState = context.engine.cloneBattlePlayerState(context.battleState.playerState);
    const effectSummary = context.engine.applyBattleMatchEffects(
      { ...context.battleState, board: currentBoard },
      matches,
      context.request.itemCatalog,
    );
    deps.setMatchFeedbackForBattleChange(
      context,
      beforeEnemyState,
      context.battleState.enemyState,
      beforePlayerState,
      context.battleState.playerState,
      effectSummary,
      currentBoard,
      matches,
    );
    const bonuses = context.engine.createBattleMatchBonuses(currentBoard, matches, context.request.itemCatalog, {
      preferredCell: cascades === 0 ? renderTargets.bonusCell : null,
    });

    cascades += 1;
    removedCells += matchCells.length;
    createdBonuses += bonuses.length;
    deps.mergeEffectSummary(effects, effectSummary);
    if (effectSummary.stageChanged) {
      deps.syncBattleWallsWithStage(context, { force: true });
    }

    deps.renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
    playBattleItemActivationSounds(deps, context, currentBoard, matchCells);
    await animateBattleDeaths(deps, boardElement, currentBoard, matchCells, context);
    if (!deps.shouldContinueBattle(context, renderTargets)) {
      return makeResult(true);
    }

    const beforeGravityBoard = context.engine.placeBattleBonuses(
      context.engine.removeBattleMatches(currentBoard, matches, {
        boxes: context.battleState.boxes,
        vines: context.battleState.vines,
      }),
      bonuses,
    );
    const refillResult = refillBattleBoardFromReserve(deps, context, beforeGravityBoard);
    currentBoard = refillResult.board;
    const boardMovement = refillResult.movement;
    context.battleState.board = currentBoard;
    if (effectSummary.stageChanged) {
      deps.syncBattleBoxesWithStage(context, { force: true });
      deps.syncBattleVinesWithStage(context, { force: true });
    }
    deps.renderBattleBoard(boardElement, context, statusElement, enemyStatsElement, playerMetersElement, ultimateTextElement);
    await animateBattleBoardMove(deps, boardElement, boardMovement, context);
    if (!deps.shouldContinueBattle(context, renderTargets)) {
      return makeResult(true);
    }

    if (
      cascadeStepMs > 0
      && context.engine.findBattleMatches(currentBoard, context.request.itemCatalog, {
        boxes: context.battleState.boxes,
        vines: context.battleState.vines,
      }).length > 0
    ) {
      await deps.wait(cascadeStepMs);
      if (!deps.shouldContinueBattle(context, renderTargets)) {
        return makeResult(true);
      }
    }
  }

  const cascadeLimitReached = cascades >= deps.MAX_CASCADE_STEPS
    && context.engine.findBattleMatches(currentBoard, context.request.itemCatalog, {
      boxes: context.battleState.boxes,
      vines: context.battleState.vines,
    }).length > 0;
  if (cascadeLimitReached) {
    deps.addBattleLog(context, deps.translateBattleText(context, "cascadeLimitReached"));
  }

  return { board: currentBoard, cascades, removedCells, createdBonuses, effects, cascadeLimitReached, cancelled: false };
}

export async function animateBattleDeaths(deps, boardElement, board, cells, context) {
  let maxDurationMs = 0;
  const flightPx = deps.getBattleAnimationConfig(context).deathFlightPx;

  for (const cell of cells) {
    const element = getBattleCellIconElement(boardElement, cell);
    const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, board[cell.row]?.[cell.col]);
    if (!element || !item) {
      continue;
    }

    const durationMs = Math.max(0, Number(item.death_time) || 0.5) * 1000;
    const angle = normalizeDegrees(Number(item.Leave_side) || 0);
    const radians = (angle * Math.PI) / 180;
    element.style.setProperty("--battle-death-x", `${Math.sin(radians) * flightPx}px`);
    element.style.setProperty("--battle-death-y", `${-Math.cos(radians) * flightPx}px`);
    runCellAnimation(element, "is-dying", durationMs);
    maxDurationMs = Math.max(maxDurationMs, durationMs);
  }

  await deps.wait(maxDurationMs);
}

export function playBattleItemActivationSounds(deps, context, board, cells) {
  if (typeof Audio === "undefined" || !Array.isArray(cells) || cells.length === 0) {
    return;
  }

  const volume = deps.getBattleSoundVolume(context);
  if (volume <= 0) {
    return;
  }

  const soundPaths = new Set();
  for (const cell of cells) {
    const itemId = board?.[cell.row]?.[cell.col];
    const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
    const soundPath = typeof item?.sound_effect === "string" ? item.sound_effect.trim() : "";
    if (soundPath) {
      soundPaths.add(soundPath);
    }
  }

  if (soundPaths.size === 0) {
    return;
  }

  context.battleActiveItemSounds = context.battleActiveItemSounds || new Set();
  for (const soundPath of soundPaths) {
    const audio = new Audio(deps.resolveAssetPath(soundPath));
    audio.volume = volume;
    const cleanup = () => {
      context.battleActiveItemSounds?.delete(audio);
    };
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });
    context.battleActiveItemSounds.add(audio);
    audio.play().catch(cleanup);
  }
}

export async function animateBattleBoardMove(deps, boardElement, movement, context) {
  const animationConfig = deps.getBattleAnimationConfig(context);
  const stepMs = Math.max(0, Number(animationConfig.boardDropMs ?? animationConfig.boardMoveStepMs));
  const newItemSpawnOffsetPx = Math.max(0, Number(animationConfig.newItemSpawnOffsetPx ?? 16));
  const newItemStackGapPx = Math.max(0, Number(animationConfig.newItemStackGapPx || 10));
  const animationPlans = [];

  for (const move of movement) {
    const element = getBattleCellIconElement(boardElement, move.to);
    if (!element) {
      continue;
    }

    const cellElement = getBattleCellElement(boardElement, move.to);
    const cellRect = cellElement?.getBoundingClientRect();
    const cellHeight = Math.max(1, cellRect?.height || 1);
    const newItemStackStepPx = cellHeight + newItemStackGapPx;
    const moveDistanceRows = Math.max(
      1,
      move.isNew
        ? move.to.row + (move.newIndex * (newItemStackStepPx / cellHeight))
        : Math.abs(move.fromRow - move.to.row),
    );
    const delayMs = 0;
    const durationMs = Math.max(stepMs, moveDistanceRows * stepMs);
    const startTranslateY = move.isNew
      ? -((move.to.row * cellHeight) + newItemSpawnOffsetPx + (move.newIndex * newItemStackStepPx))
      : (move.fromRow - move.to.row) * cellHeight;

    animationPlans.push({ element, startTranslateY, durationMs, delayMs });
  }

  const maxDurationMs = animationPlans.reduce(
    (max, plan) => Math.max(max, plan.durationMs + plan.delayMs),
    0,
  );

  for (const plan of animationPlans) {
    const durationMs = Math.max(0, maxDurationMs - plan.delayMs);
    plan.element.style.setProperty("--battle-move-y", `${plan.startTranslateY}px`);
    runCellAnimation(plan.element, "is-moving", durationMs, null, plan.delayMs);
  }

  await deps.wait(maxDurationMs);
}

export function refillBattleBoardFromReserve(deps, context, beforeGravityBoard) {
  deps.ensureBattleReserveBoardForCurrentStage(context);

  const generationConfig = deps.getBattleGenerationConfig(context);
  const refillResult = context.engine.refillBattleBoardFromReserve(
    beforeGravityBoard,
    context.battleState.reserveBoard,
    context.request.itemCatalog,
    {
      ...generationConfig,
      boxes: context.battleState.boxes,
    },
  );
  context.battleState.reserveBoard = refillResult.reserveBoard;
  context.battleState.reserveStageIndex = deps.getCurrentBattleStageIndex(context);
  return refillResult;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}
