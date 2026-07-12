import { getBattleGenerationConfig as getBattleGenerationConfigFromConfig } from "./battle-config.js";

export function ensureBattleStateShape(context) {
  // Старые и прямые entrypoints могут передать неполный battleState. Перед
  // scaffold нормализуем форму, чтобы view-модули не дублировали guard'ы.
  const { battleState, battleData, engine } = context;
  if (!battleState.enemyState) {
    battleState.enemyState = engine.createBattleEnemyState(battleData.enemyConfig);
  }
  if (!battleState.playerState) {
    battleState.playerState = {};
  }
  if (!battleState.playerState.health) {
    battleState.playerState.health = { current: 0, max: 0 };
  }
  if (!battleState.playerState.heal) {
    battleState.playerState.heal = { current: 0, max: 0, health: 0 };
  }
  if (!battleState.initialPlayerState) {
    battleState.initialPlayerState = engine.cloneBattlePlayerState(battleState.playerState);
  }
  if (!("activeSpecialItemId" in battleState)) {
    battleState.activeSpecialItemId = null;
  }
  if (!("specialSwapCell" in battleState)) {
    battleState.specialSwapCell = null;
  }
  if (!("pendingRageAction" in battleState)) {
    battleState.pendingRageAction = false;
  }
  if (!("isMiniMenuOpen" in battleState)) {
    battleState.isMiniMenuOpen = false;
  }
  if (!("isInventoryOpen" in battleState)) {
    battleState.isInventoryOpen = false;
  }
  if (!Array.isArray(battleState.walls)) {
    battleState.walls = [];
  }
  if (!Array.isArray(battleState.boxes)) {
    battleState.boxes = [];
  }
  if (!Array.isArray(battleState.vines)) {
    battleState.vines = [];
  }
  if (battleState.board && !battleState.reserveBoard) {
    battleState.reserveBoard = createBattleReserveBoardForCurrentStage(context);
  }
}

export function getBattleGenerationConfig(context) {
  return {
    ...getBattleGenerationConfigFromConfig(context, {
      getEnemyConvertEffects: getCurrentBattleConvertEffects,
    }),
    random: getBattleRandom(context),
  };
}

export function getBattleRandom(context) {
  return typeof context?.battleRandom === "function" ? context.battleRandom : Math.random;
}

export function getCurrentBattleStageIndex(context) {
  return Math.max(0, Number(context?.battleState?.enemyState?.stageIndex) || 0);
}

export function createBattleReserveBoardForCurrentStage(context) {
  const reserveBoard = context.engine.createBattleReserveBoard(
    context.request.itemCatalog,
    getBattleGenerationConfig(context),
  );
  context.battleState.reserveStageIndex = getCurrentBattleStageIndex(context);
  return reserveBoard;
}

export function ensureBattleReserveBoardForCurrentStage(context) {
  if (
    !context.battleState.reserveBoard
    || context.battleState.reserveStageIndex !== getCurrentBattleStageIndex(context)
  ) {
    context.battleState.reserveBoard = createBattleReserveBoardForCurrentStage(context);
  }
}

export function getCurrentBattleConvertEffects(context) {
  if (context.battleState.enemyState?.isDefeated) {
    return [];
  }

  const stage = context.engine.getCurrentBattleStage(context.battleData.enemyConfig, context.battleState.enemyState);
  if (stage && Object.prototype.hasOwnProperty.call(stage, "convert")) {
    return Array.isArray(stage.convert) ? stage.convert : [];
  }

  return [];
}

export function prepareBattleAttemptState(context) {
  // Новая attempt пересоздает board/reserve/obstacles, но сохраняет request и
  // battleData. Это используется и при первом старте, и при restart после defeat.
  context.battleHealthFeedbackState = {};
  context.battleState.healthFeedbackSuppression = {};
  context.battleState.pendingRageAction = false;
  context.battleState.board = context.engine.createBattleBoard(
    context.request.itemCatalog,
    getBattleGenerationConfig(context),
  );
  context.battleState.reserveBoard = createBattleReserveBoardForCurrentStage(context);
  context.battleState.walls = [];
  context.battleState.boxes = [];
  context.battleState.vines = [];
  context.battleState.wallsInitialized = false;
  context.battleState.boxesInitialized = false;
  context.battleState.vinesInitialized = false;
  syncBattleBoxesWithStage(context, { forceReset: true });
  syncBattleWallsWithStage(context, { forceReset: true });
  syncBattleVinesWithStage(context, { forceReset: true });
}

export function syncBattleWallsWithStage(context, options = {}) {
  if (!context.battleState.board) {
    context.battleState.walls = [];
    return;
  }

  const wallCount = getCurrentBattleWallCount(context);

  if (context.battleState.wallsInitialized && !options.forceReset) {
    return;
  }

  context.battleState.walls = context.engine.createBattleWalls(context.battleState.board, {
    count: wallCount,
    boxes: context.battleState.boxes,
    random: getBattleRandom(context),
  });
  context.battleState.wallCount = wallCount;
  context.battleState.wallsInitialized = true;
}

export function syncBattleBoxesWithStage(context, options = {}) {
  if (!context.battleState.board) {
    context.battleState.boxes = [];
    return;
  }

  const boxCount = getCurrentBattleBoxCount(context);

  if (context.battleState.boxesInitialized && !options.forceReset) {
    return;
  }

  context.battleState.boxes = context.engine.createBattleBoxes(context.battleState.board, {
    count: boxCount,
    random: getBattleRandom(context),
  });
  context.battleState.boxCount = boxCount;
  context.battleState.boxesInitialized = true;
}

export function syncBattleVinesWithStage(context, options = {}) {
  if (!context.battleState.board) {
    context.battleState.vines = [];
    return;
  }

  const vineCount = getCurrentBattleVineCount(context);

  if (context.battleState.vinesInitialized && !options.forceReset) {
    return;
  }

  context.battleState.vines = context.engine.createBattleVines(context.battleState.board, {
    count: vineCount,
    boxes: context.battleState.boxes,
    random: getBattleRandom(context),
  });
  context.battleState.vineCount = vineCount;
  context.battleState.vinesInitialized = true;
}

export function getCurrentBattleWallCount(context) {
  if (context.battleState.enemyState?.isDefeated) {
    return 0;
  }

  const stage = context.engine.getCurrentBattleStage(context.battleData.enemyConfig, context.battleState.enemyState);
  const hasStageWall = stage && Object.prototype.hasOwnProperty.call(stage, "wall");
  const rawCount = hasStageWall ? stage.wall : context.battleData.enemyConfig?.wall;
  return Math.max(0, Math.floor(Number(rawCount) || 0));
}

export function getCurrentBattleBoxCount(context) {
  if (context.battleState.enemyState?.isDefeated) {
    return 0;
  }

  const stage = context.engine.getCurrentBattleStage(context.battleData.enemyConfig, context.battleState.enemyState);
  const hasStageBox = stage && Object.prototype.hasOwnProperty.call(stage, "box");
  const rawCount = hasStageBox ? stage.box : context.battleData.enemyConfig?.box;
  return Math.max(0, Math.floor(Number(rawCount) || 0));
}

export function getCurrentBattleVineCount(context) {
  if (context.battleState.enemyState?.isDefeated) {
    return 0;
  }

  const stage = context.engine.getCurrentBattleStage(context.battleData.enemyConfig, context.battleState.enemyState);
  const hasStageVines = stage && Object.prototype.hasOwnProperty.call(stage, "vines");
  const rawCount = hasStageVines ? stage.vines : context.battleData.enemyConfig?.vines;
  return Math.max(0, Math.floor(Number(rawCount) || 0));
}
