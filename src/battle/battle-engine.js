export const BATTLE_BOARD_WIDTH = 12;
export const BATTLE_BOARD_HEIGHT = 9;
const DEFAULT_BOARD_CREATE_ATTEMPTS = 50;
const MIN_BATTLE_BOARD_DROP_TYPES = 3;
const BATTLE_DROP_CATEGORY = "match-3";
const BATTLE_MATCH_CATEGORIES = new Set([BATTLE_DROP_CATEGORY, "rare_match-3"]);
const BATTLE_BATTERY_USE = "battery";
const BATTLE_ITEM_STAT_KEYS = ["damage", "heal", "aggression", "calm"];
const BATTLE_ITEM_STAT_ROUNDING_FACTOR = 10;
const BATTLE_ITEM_STAT_ROUNDING_EPSILON = 1e-9;
const DEFAULT_ENEMY_SHIELD_CAP = 99;

export function createInitialBattleState(request, battleData) {
  return {
    nodeId: request.nodeId,
    nodeType: request.nodeType,
    enemyId: request.enemyId,
    background: request.background,
    enemyConfig: battleData.enemyConfig,
    enemyState: createBattleEnemyState(battleData.enemyConfig),
    initialPlayerState: cloneBattlePlayerState(request.playerState),
    playerState: cloneBattlePlayerState(request.playerState),
    board: null,
    walls: [],
    boxes: [],
    vines: [],
    selectedCell: null,
    isResolving: false,
    isComplete: false,
    lastMoveSummary: null,
  };
}

export function cloneBattlePlayerState(playerState) {
  return structuredClone(playerState);
}

export function createBattleEnemyState(enemyConfig) {
  const stages = getBattleEnemyStages(enemyConfig);
  const firstStage = stages[0] || {};
  return {
    stageIndex: 0,
    stageCount: stages.length,
    health: createStageHealthState(firstStage),
    shield: createStageShieldState(firstStage),
    aggression: createStageAggressionState(firstStage),
    rage: createStageRageState(firstStage),
    isDefeated: stages.length === 0,
  };
}

export function getCurrentBattleStage(enemyConfig, enemyState) {
  return getBattleEnemyStages(enemyConfig)[enemyState?.stageIndex || 0] || null;
}

export function createBattleBoard(itemCatalog, options = {}) {
  // Стартовое поле не должно содержать готовых матчей. Если inventory/enemy
  // transform_chance сжимает drop pool до слишком похожих типов, падаем явно.
  const width = options.width || BATTLE_BOARD_WIDTH;
  const height = options.height || BATTLE_BOARD_HEIGHT;
  const attempts = options.attempts || DEFAULT_BOARD_CREATE_ATTEMPTS;
  const dropPool = getBattleDropPool(itemCatalog);
  assertBattleDropTypesForBoard(itemCatalog, options, width, height);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const board = Array.from({ length: height }, () => Array.from({ length: width }, () => null));
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        board[row][col] = pickBattleDropItem(board, row, col, dropPool, itemCatalog, options);
      }
    }
    if (!hasBattleMatches(board, itemCatalog)) {
      return board;
    }
  }

  throw new Error(
    `Cannot create battle board without starting matches after ${attempts} attempts. `
    + "Check match-3 type diversity and inventory transform_chance settings.",
  );
}

export function createBattleReserveBoard(itemCatalog, options = {}) {
  const width = options.width || BATTLE_BOARD_WIDTH;
  const height = options.height || BATTLE_BOARD_HEIGHT;
  const dropPool = getBattleDropPool(itemCatalog);

  return Array.from({ length: height }, () => (
    Array.from({ length: width }, () => pickBattleGeneratedItem(dropPool, itemCatalog, options))
  ));
}

export function shuffleBattleBoard(board, options = {}) {
  return shuffleBattleBoardWithMovement(board, options).board;
}

export function shuffleBattleBoardWithMovement(board, options = {}) {
  assertRectangularBoard(board);

  const random = typeof options.random === "function" ? options.random : Math.random;
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);
  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  const vines = Array.isArray(options.vines) ? options.vines : [];
  const cells = [];

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const cell = { row, col };
      if (!hasBattleBoxAt(boxes, cell) && !hasBattleVineAt(vines, cell) && board[row][col] !== null) {
        cells.push(cell);
      }
    }
  }

  const sourceCells = createVisibleBattleShuffleSources(board, cells, random);
  const nextBoard = cloneBattleBoard(board);
  const movement = [];

  for (let index = 0; index < cells.length; index += 1) {
    const target = cells[index];
    const source = sourceCells[index];
    nextBoard[target.row][target.col] = board[source.row][source.col];
    if (source.row !== target.row || source.col !== target.col) {
      movement.push({
        from: source,
        to: target,
      });
    }
  }

  return {
    board: nextBoard,
    movement,
  };
}

function createVisibleBattleShuffleSources(board, cells, random) {
  if (cells.length < 2) {
    return [...cells];
  }

  let bestShuffle = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const shuffled = shuffleItems(cells, random);
    const score = getVisibleBattleShuffleScore(board, cells, shuffled);
    if (score > bestScore) {
      bestShuffle = shuffled;
      bestScore = score;
    }
  }

  for (let offset = 1; offset < cells.length; offset += 1) {
    const rotated = cells.map((_, index) => cells[(index + offset) % cells.length]);
    const score = getVisibleBattleShuffleScore(board, cells, rotated);
    if (score > bestScore) {
      bestShuffle = rotated;
      bestScore = score;
    }
  }

  return bestShuffle || [...cells];
}

function getVisibleBattleShuffleScore(board, targetCells, sourceCells) {
  const neighborPenalty = countVisibleBattleShuffleNeighborPairs(targetCells, sourceCells) * 50000;
  const sourceRows = new Set();
  const sourceCols = new Set();
  let score = -neighborPenalty;

  for (let index = 0; index < targetCells.length; index += 1) {
    const target = targetCells[index];
    const source = sourceCells[index];
    const distance = Math.abs(target.row - source.row) + Math.abs(target.col - source.col);
    sourceRows.add(source.row);
    sourceCols.add(source.col);

    if (source.row !== target.row || source.col !== target.col) {
      score += 200000;
    }
    if (board[target.row]?.[target.col] !== board[source.row]?.[source.col]) {
      score += 100000;
    }
    if (source.row !== target.row) {
      score += 7000;
    } else {
      score -= 2500;
    }
    if (source.col !== target.col) {
      score += 7000;
    } else {
      score -= 2500;
    }
    score += distance * 9000;
  }

  score += sourceRows.size * 1000;
  score += sourceCols.size * 1000;
  return score;
}

function countVisibleBattleShuffleNeighborPairs(targetCells, sourceCells) {
  const sourceByTarget = new Map();
  for (let index = 0; index < targetCells.length; index += 1) {
    sourceByTarget.set(getCellKey(targetCells[index]), sourceCells[index]);
  }

  return targetCells.reduce((count, target) => {
    const source = sourceByTarget.get(getCellKey(target));
    return count
      + countVisibleBattleShuffleNeighborPair(source, sourceByTarget.get(getCellKey({ row: target.row, col: target.col + 1 })))
      + countVisibleBattleShuffleNeighborPair(source, sourceByTarget.get(getCellKey({ row: target.row + 1, col: target.col })));
  }, 0);
}

function countVisibleBattleShuffleNeighborPair(firstSource, secondSource) {
  if (!firstSource || !secondSource) {
    return 0;
  }
  return Math.abs(firstSource.row - secondSource.row) + Math.abs(firstSource.col - secondSource.col) === 1 ? 1 : 0;
}

export function createBattleWalls(board, options = {}) {
  assertRectangularBoard(board);

  const count = Math.max(0, Math.floor(Number(options.count) || 0));
  if (count <= 0) {
    return [];
  }

  const candidates = getBattleWallCandidates(board, options.boxes);
  return shuffleItems(candidates, options.random).slice(0, Math.min(count, candidates.length));
}

export function createBattleBoxes(board, options = {}) {
  assertRectangularBoard(board);

  const count = Math.max(0, Math.floor(Number(options.count) || 0));
  if (count <= 0) {
    return [];
  }

  const candidates = getBattleBoxCandidates(board);
  return shuffleItems(candidates, options.random).slice(0, Math.min(count, candidates.length));
}

export function createBattleVines(board, options = {}) {
  assertRectangularBoard(board);

  const count = Math.max(0, Math.floor(Number(options.count) || 0));
  if (count <= 0) {
    return [];
  }

  const candidates = getBattleVineCandidates(board, options.boxes);
  return shuffleItems(candidates, options.random).slice(0, Math.min(count, candidates.length));
}

export function hasBattleMatches(board, itemCatalog) {
  return findBattleMatches(board, itemCatalog).length > 0;
}

export function swapBattleCells(board, firstCell, secondCell) {
  assertCellInsideBoard(board, firstCell);
  assertCellInsideBoard(board, secondCell);

  const nextBoard = cloneBattleBoard(board);
  const temporary = nextBoard[firstCell.row][firstCell.col];
  nextBoard[firstCell.row][firstCell.col] = nextBoard[secondCell.row][secondCell.col];
  nextBoard[secondCell.row][secondCell.col] = temporary;
  return nextBoard;
}

export function findBattleMatches(board, itemCatalog, options = {}) {
  assertRectangularBoard(board);
  const boxes = Array.isArray(options.boxes) ? options.boxes : [];

  return [
    ...findHorizontalMatches(board, itemCatalog, boxes),
    ...findVerticalMatches(board, itemCatalog, boxes),
    ...findSquareMatches(board, itemCatalog, boxes),
  ];
}

export function findBattleAvailableMove(board, itemCatalog, options = {}) {
  assertRectangularBoard(board);

  const walls = Array.isArray(options.walls) ? options.walls : [];
  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  const vines = Array.isArray(options.vines) ? options.vines : [];
  const typeGroups = normalizeBattleAvailableMoveTypeGroups(options.typeGroups || options.availableMoveTypeGroups);
  if (typeGroups.length > 0) {
    for (const typeGroup of typeGroups) {
      const move = findBattleAvailableMoveForTypes(board, itemCatalog, typeGroup, walls, boxes, vines);
      if (move) {
        return move;
      }
    }
    return null;
  }

  return findBattleAvailableMoveForTypes(board, itemCatalog, null, walls, boxes, vines);
}

function findBattleAvailableMoveForTypes(board, itemCatalog, allowedTypes, walls, boxes, vines) {
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);
  const directions = [
    { row: 0, col: 1 },
    { row: 1, col: 0 },
  ];

  for (let row = height - 1; row >= 0; row -= 1) {
    for (let col = 0; col < width; col += 1) {
      for (const direction of directions) {
        const from = { row, col };
        const to = { row: row + direction.row, col: col + direction.col };
        if (to.row >= height || to.col >= width) {
          continue;
        }
        if (hasBattleBoxAt(boxes, from) || hasBattleBoxAt(boxes, to)) {
          continue;
        }
        if (hasBattleVineAt(vines, from) || hasBattleVineAt(vines, to)) {
          continue;
        }
        if (hasBattleWallBetween(walls, from, to)) {
          continue;
        }

        const batteryActivation = findBattleBatteryActivation(board, itemCatalog, from, to, { boxes, vines });
        const batteryHintCell = findBattleBatteryMoveHintCell(batteryActivation, allowedTypes);
        if (batteryHintCell) {
          return {
            from,
            to,
            hintCell: batteryHintCell,
            matches: [],
            batteryActivation,
          };
        }

        const swappedBoard = swapBattleCells(board, from, to);
        const matches = findBattleMatches(swappedBoard, itemCatalog, { boxes, vines });
        const hintCell = findBattleMoveHintCell(board, matches, itemCatalog, from, to, allowedTypes);
        if (hintCell) {
          return {
            from,
            to,
            hintCell,
            matches,
          };
        }
      }
    }
  }

  return null;
}

export function hasBattleWallBetween(walls, firstCell, secondCell) {
  if (!Array.isArray(walls) || walls.length === 0 || !areAdjacentBoardCells(firstCell, secondCell)) {
    return false;
  }
  const wallKey = getBattleWallKey(firstCell, secondCell);
  return walls.some((wall) => getBattleWallKey(wall.from, wall.to) === wallKey);
}

export function hasBattleBoxAt(boxes, cell) {
  if (!Array.isArray(boxes) || boxes.length === 0 || !cell) {
    return false;
  }
  const cellKey = getCellKey(cell);
  return boxes.some((box) => getCellKey(box) === cellKey);
}

export function hasBattleVineAt(vines, cell) {
  if (!Array.isArray(vines) || vines.length === 0 || !cell) {
    return false;
  }
  const cellKey = getCellKey(cell);
  return vines.some((vine) => getCellKey(vine) === cellKey);
}

function findBattleBatteryMoveHintCell(activation, allowedTypes) {
  if (!activation) {
    return null;
  }

  if (!allowedTypes) {
    return activation.batteryCell;
  }

  if (activation.targetType && allowedTypes.has(activation.targetType)) {
    return activation.batteryCell;
  }

  return null;
}

function findBattleMoveHintCell(board, matches, itemCatalog, from, to, allowedTypes = null) {
  if (matches.length === 0) {
    return null;
  }

  const fromType = getBattleMatchType(board[from.row]?.[from.col], itemCatalog);
  const toType = getBattleMatchType(board[to.row]?.[to.col], itemCatalog);
  const candidates = [];

  if (fromType && matches.some((match) => match.type === fromType && hasBattleMatchCell(match, to))) {
    candidates.push({ cell: from, type: fromType });
  }
  if (toType && matches.some((match) => match.type === toType && hasBattleMatchCell(match, from))) {
    candidates.push({ cell: to, type: toType });
  }

  if (!allowedTypes) {
    return candidates[0]?.cell || from;
  }

  return candidates.find((candidate) => allowedTypes.has(candidate.type))?.cell || null;
}

function hasBattleMatchCell(match, targetCell) {
  return match.cells.some((cell) => cell.row === targetCell.row && cell.col === targetCell.col);
}

function normalizeBattleAvailableMoveTypeGroups(typeGroups) {
  if (!Array.isArray(typeGroups)) {
    return [];
  }

  return typeGroups
    .map((group) => {
      const values = Array.isArray(group) ? group : [group];
      const normalized = values
        .map((type) => String(type || "").trim())
        .filter(Boolean);
      if (normalized.includes("*")) {
        return null;
      }
      return new Set(normalized);
    })
    .filter((group) => group === null || group.size > 0);
}

export function removeBattleMatches(board, matches, options = {}) {
  const nextBoard = cloneBattleBoard(board);
  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  for (const cell of collectBattleMatchCells(matches)) {
    if (hasBattleBoxAt(boxes, cell)) {
      continue;
    }
    nextBoard[cell.row][cell.col] = null;
  }
  return nextBoard;
}

export function createBattleMatchBonuses(board, matches, itemCatalog, options = {}) {
  const groupsByType = groupBattleMatchCellsByType(matches);
  const bonuses = [];

  for (const group of groupsByType.values()) {
    if (group.cells.length < 4) {
      continue;
    }

    const sourceCell = findPreferredBonusCell(group, options.preferredCell) || group.cells[0];
    const sourceItem = getBattleItemDefinition(itemCatalog, board[sourceCell.row]?.[sourceCell.col]);
    const bonusItemId = group.cells.length >= 5 ? sourceItem?.createsOnFive : sourceItem?.createsOnFour;

    if (!bonusItemId || !getBattleItemDefinition(itemCatalog, bonusItemId)) {
      continue;
    }

    bonuses.push({
      cell: sourceCell,
      itemId: bonusItemId,
      kind: group.cells.length >= 5 ? "generator" : "powered",
      type: group.type,
    });
  }

  return bonuses;
}

function findPreferredBonusCell(group, preferredCell) {
  if (!preferredCell) {
    return null;
  }
  return group.cells.find((cell) => cell.row === preferredCell.row && cell.col === preferredCell.col) || null;
}

export function placeBattleBonuses(board, bonuses) {
  const nextBoard = cloneBattleBoard(board);
  for (const bonus of bonuses) {
    assertCellInsideBoard(nextBoard, bonus.cell);
    nextBoard[bonus.cell.row][bonus.cell.col] = bonus.itemId;
  }
  return nextBoard;
}

export function findBattleBatteryActivation(board, itemCatalog, firstCell, secondCell, options = {}) {
  assertCellInsideBoard(board, firstCell);
  assertCellInsideBoard(board, secondCell);
  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  const vines = Array.isArray(options.vines) ? options.vines : [];

  if (hasBattleBoxAt(boxes, firstCell) || hasBattleBoxAt(boxes, secondCell)) {
    return null;
  }
  if (hasBattleVineAt(vines, firstCell) || hasBattleVineAt(vines, secondCell)) {
    return null;
  }

  const firstItemId = board[firstCell.row]?.[firstCell.col];
  const secondItemId = board[secondCell.row]?.[secondCell.col];
  const firstIsBattery = isBattleBatteryItemId(itemCatalog, firstItemId);
  const secondIsBattery = isBattleBatteryItemId(itemCatalog, secondItemId);

  if (!firstIsBattery && !secondIsBattery) {
    return null;
  }

  if (firstIsBattery && secondIsBattery) {
    return {
      kind: "battery-all",
      batteryCell: firstCell,
      targetCell: secondCell,
      targetType: "",
      cells: getAllBattleOccupiedCells(board, { boxes, vines }),
      suppressAggression: true,
    };
  }

  const batteryCell = firstIsBattery ? firstCell : secondCell;
  const targetCell = firstIsBattery ? secondCell : firstCell;
  const targetType = getBattleMatchType(board[targetCell.row]?.[targetCell.col], itemCatalog);

  if (!targetType) {
    return null;
  }

  return {
    kind: "battery-type",
    batteryCell,
    targetCell,
    targetType,
    cells: [
      batteryCell,
      ...getBattleCellsByType(board, itemCatalog, targetType, { boxes, vines }),
    ],
    suppressAggression: true,
  };
}

export function applyBattleMatchEffects(battleState, matches, itemCatalog, options = {}) {
  // Здесь считается чистая экономика одного resolve-step: щит съедает удар до
  // HP, heal применяется к игроку, aggression/calm могут тут же нанести урон.
  const cells = collectBattleMatchCells(matches);
  const summary = {
    activatedCells: cells.length,
    damage: 0,
    heal: 0,
    aggression: 0,
    calm: 0,
    shieldDamage: 0,
    healthRecovered: 0,
    playerDamage: 0,
    aggressionTriggers: 0,
    stageChanged: false,
    enemyDefeated: false,
    damageSourceCells: [],
    shieldSourceCells: [],
  };

  for (const cell of cells) {
    const itemStats = getBattleEffectiveItemStats(
      itemCatalog,
      battleState.board[cell.row]?.[cell.col],
      battleState.playerState,
      battleState,
    );
    const itemDamage = Math.max(0, itemStats.damage);
    if (itemDamage > 0) {
      if (applyBattleShieldHit(battleState.enemyState)) {
        summary.shieldDamage += 1;
        summary.shieldSourceCells.push(cell);
      } else {
        summary.damage += itemDamage;
        summary.damageSourceCells.push(cell);
      }
    }
    summary.heal += itemStats.heal;
    if (!options.suppressAggression) {
      summary.aggression += itemStats.aggression;
    }
    summary.calm += itemStats.calm;
  }

  summary.healthRecovered = applyBattleHeal(battleState.playerState, summary.heal, itemCatalog);
  const enemyResult = applyBattleDamage(battleState.enemyState, battleState.enemyConfig, summary.damage);
  summary.stageChanged = enemyResult.stageChanged;
  summary.enemyDefeated = enemyResult.enemyDefeated;
  if (battleState.enemyState?.isDefeated) {
    return summary;
  }

  const aggressionResult = applyBattleAggression(
    battleState.enemyState,
    battleState.playerState,
    summary.aggression,
    summary.calm,
  );
  summary.playerDamage = aggressionResult.playerDamage;
  summary.aggressionTriggers = aggressionResult.triggers;

  return summary;
}

export function tickBattleRage(enemyState, elapsedSeconds = 1) {
  const result = {
    triggered: 0,
  };

  if (!enemyState?.rage || enemyState.isDefeated) {
    return result;
  }

  const maxRage = getNumber(enemyState.rage.max);
  if (maxRage <= 0) {
    enemyState.rage.current = 0;
    return result;
  }

  let current = getNumber(enemyState.rage.current) - Math.max(0, getNumber(elapsedSeconds));
  while (current <= 0) {
    result.triggered += 1;
    if (enemyState.rage.resetAfterUltimate === false) {
      current = 0;
      break;
    }
    current += maxRage;
  }

  enemyState.rage.current = clamp(current, 0, maxRage);
  return result;
}

export function applyBattleUltimateEffects(battleState, itemCatalog, stageOrEffects, options = {}) {
  // Ultimate работает поверх текущего stage config. В summary собираем не
  // только итоговые числа, но и sourceCells для последующей анимации.
  const effects = Array.isArray(stageOrEffects)
    ? stageOrEffects
    : Array.isArray(stageOrEffects?.ultimate?.effects)
      ? stageOrEffects.ultimate.effects
      : [];
  const random = typeof options.random === "function" ? options.random : Math.random;
  const enemyShieldCap = getBattleEnemyShieldCap(options);
  const boxes = Array.isArray(options.boxes)
    ? options.boxes
    : Array.isArray(battleState?.boxes)
      ? battleState.boxes
      : [];
  const summary = {
    convertedItems: 0,
    playerDamage: 0,
    enemyHealing: 0,
    enemyHealthRecovered: 0,
    enemyShieldHealing: 0,
    enemyShieldRecovered: 0,
    fixedDamage: 0,
    kamikazeDamage: 0,
    enemySelfDamage: 0,
    stageChanged: false,
    enemyDefeated: false,
    damageSourceCells: [],
    healingSourceCells: [],
    shieldHealingSourceCells: [],
  };

  if (!battleState?.board || effects.length === 0) {
    return summary;
  }

  for (const effect of effects) {
    if (isConvertBattleUltimateEffect(effect)) {
      summary.convertedItems += applyBattleUltimateConvertItems(
        battleState.board,
        itemCatalog,
        effect,
        random,
        { boxes },
      );
    } else if (isFixedPlayerDamageUltimateEffect(effect)) {
      const playerDamage = applyPlayerDamage(
        battleState.playerState,
        Math.max(0, getNumber(effect?.amount)),
      );
      summary.fixedDamage += playerDamage;
      summary.playerDamage += playerDamage;
    } else if (isDamagePlayerByBoardItemsUltimateEffect(effect)) {
      const damageResult = applyBattleUltimateDamagePlayerByBoardItems(
        battleState,
        itemCatalog,
        effect,
        { boxes },
      );
      summary.playerDamage += damageResult.playerDamage;
      if (damageResult.playerDamage > 0) {
        summary.damageSourceCells.push(...damageResult.sourceCells);
      }
    } else if (isHealingEnemyByBoardItemsUltimateEffect(effect)) {
      const healingResult = applyBattleUltimateHealingEnemyByBoardItems(
        battleState,
        itemCatalog,
        effect,
        { boxes },
      );
      summary.enemyHealing += healingResult.enemyHealing;
      summary.enemyHealthRecovered += healingResult.enemyHealthRecovered;
      if (healingResult.enemyHealing > 0) {
        summary.healingSourceCells.push(...healingResult.sourceCells);
      }
    } else if (isRestoreEnemyShieldByBoardItemsUltimateEffect(effect)) {
      const shieldResult = applyBattleUltimateRestoreEnemyShieldByBoardItems(
        battleState,
        itemCatalog,
        effect,
        { boxes, enemyShieldCap },
      );
      summary.enemyShieldHealing += shieldResult.enemyShieldHealing;
      summary.enemyShieldRecovered += shieldResult.enemyShieldRecovered;
      if (shieldResult.enemyShieldHealing > 0) {
        summary.shieldHealingSourceCells.push(...shieldResult.sourceCells);
      }
    } else if (isKamikazeBattleUltimateEffect(effect)) {
      const kamikazeResult = applyBattleUltimateKamikaze(battleState);
      summary.kamikazeDamage += kamikazeResult.kamikazeDamage;
      summary.playerDamage += kamikazeResult.playerDamage;
      summary.enemySelfDamage += kamikazeResult.enemySelfDamage;
      summary.stageChanged = summary.stageChanged || kamikazeResult.stageChanged;
      summary.enemyDefeated = summary.enemyDefeated || kamikazeResult.enemyDefeated;
    }
  }

  return summary;
}

export function applyBattleKamikazePlayerDamage(battleState) {
  const kamikazeDamage = getBattleEnemyCurrentHealth(battleState?.enemyState);
  return {
    kamikazeDamage,
    playerDamage: applyPlayerDamage(battleState?.playerState, kamikazeDamage),
  };
}

export function applyBattleKamikazeEnemySelfDamage(battleState, damage) {
  const enemySelfDamage = Math.max(0, getNumber(damage));
  const damageResult = applyBattleDamage(battleState?.enemyState, battleState?.enemyConfig, enemySelfDamage);
  return {
    enemySelfDamage,
    stageChanged: damageResult.stageChanged,
    enemyDefeated: damageResult.enemyDefeated,
  };
}

function applyBattleUltimateKamikaze(battleState) {
  const playerResult = applyBattleKamikazePlayerDamage(battleState);
  const enemyResult = applyBattleKamikazeEnemySelfDamage(battleState, playerResult.kamikazeDamage);
  return {
    ...playerResult,
    ...enemyResult,
  };
}

function applyBattleUltimateDamagePlayerByBoardItems(battleState, itemCatalog, effect, options = {}) {
  const modifier = Math.max(0, getNumber(effect?.modifier));
  const sourceCells = findBattleUltimateMatchingCells(
    battleState.board,
    itemCatalog,
    effect,
    "count",
    options,
  );
  const rawDamage = sourceCells.length * modifier;

  return {
    playerDamage: applyPlayerDamage(battleState.playerState, rawDamage),
    sourceCells,
  };
}

function applyBattleUltimateHealingEnemyByBoardItems(battleState, itemCatalog, effect, options = {}) {
  const modifier = Math.max(0, getNumber(effect?.modifier));
  const sourceCells = findBattleUltimateMatchingCells(
    battleState.board,
    itemCatalog,
    effect,
    "count",
    options,
  );
  const rawHealing = sourceCells.length * modifier;

  return {
    enemyHealing: rawHealing,
    enemyHealthRecovered: applyBattleEnemyHealing(battleState.enemyState, rawHealing),
    sourceCells,
  };
}

function applyBattleUltimateRestoreEnemyShieldByBoardItems(battleState, itemCatalog, effect, options = {}) {
  const modifier = Math.max(0, getNumber(effect?.modifier));
  const sourceCells = findBattleUltimateMatchingCells(
    battleState.board,
    itemCatalog,
    effect,
    "count",
    options,
  );
  const rawShield = sourceCells.length * modifier;
  const enemyShieldCap = getBattleEnemyShieldCap(options);
  const enemyShieldHealing = enemyShieldCap > 0 ? rawShield : 0;

  return {
    enemyShieldHealing,
    enemyShieldRecovered: applyBattleEnemyShieldHealing(battleState.enemyState, enemyShieldHealing, enemyShieldCap),
    sourceCells,
  };
}

function applyBattleUltimateConvertItems(board, itemCatalog, effect, random, options = {}) {
  const targetItemIds = getBattleUltimateConvertTargetItemIds(effect)
    .filter((itemId, index, list) => list.indexOf(itemId) === index)
    .filter((itemId) => getBattleItemDefinition(itemCatalog, itemId));
  if (targetItemIds.length === 0) {
    return 0;
  }

  const sourceCells = findBattleUltimateMatchingCells(board, itemCatalog, effect, "from", options);
  if (sourceCells.length === 0) {
    return 0;
  }

  for (const cell of sourceCells) {
    board[cell.row][cell.col] = pickRandomItem(targetItemIds, random);
  }

  return sourceCells.length;
}

function findBattleUltimateMatchingCells(board, itemCatalog, effect, selectorKey, options = {}) {
  const sourceItemIds = new Set(getBattleUltimateSelectorItemIds(effect, selectorKey));
  const sourceItemTypes = new Set(getBattleUltimateSelectorItemTypes(effect, selectorKey));
  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  if (sourceItemIds.size === 0 && sourceItemTypes.size === 0) {
    return [];
  }

  const cells = [];
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < (board[row]?.length || 0); col += 1) {
      if (hasBattleBoxAt(boxes, { row, col })) {
        continue;
      }
      const itemId = board[row][col];
      const item = getBattleItemDefinition(itemCatalog, itemId);
      const matchesItem = sourceItemIds.has(itemId) || sourceItemIds.has(item?.itemId);
      const matchesType = item?.type && sourceItemTypes.has(item.type);
      if (!matchesItem && !matchesType) {
        continue;
      }
      cells.push({ row, col });
    }
  }

  return cells;
}

function getBattleUltimateSelectorItemIds(effect, selectorKey) {
  const selector = effect?.[selectorKey];
  return getBattleUltimateEffectStringList(
    selector?.itemIds
      ?? selector?.itemId
      ?? effect?.[`${selectorKey}ItemIds`]
      ?? effect?.[`${selectorKey}ItemId`]
      ?? effect?.itemIds
      ?? effect?.itemId,
  );
}

function getBattleUltimateSelectorItemTypes(effect, selectorKey) {
  const selector = effect?.[selectorKey];
  return getBattleUltimateEffectStringList(
    selector?.itemTypes ?? effect?.[`${selectorKey}ItemTypes`] ?? effect?.itemTypes,
  );
}

function isConvertBattleUltimateEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["convertItems", "convert", "conversion", "преобразование"].includes(effectType);
}

function isDamagePlayerByBoardItemsUltimateEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["damagePlayerByBoardItems", "damagePlayerByItems", "damageByBoardItems", "damagePlayer", "урон"].includes(effectType);
}

function isFixedPlayerDamageUltimateEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["damagePlayerFixed", "fixedPlayerDamage"].includes(effectType);
}

function isHealingEnemyByBoardItemsUltimateEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return [
    "HealingEnemyByBoardItems",
    "healingEnemyByBoardItems",
    "healEnemyByBoardItems",
    "enemyHealByBoardItems",
    "лечение",
  ].includes(effectType);
}

function isRestoreEnemyShieldByBoardItemsUltimateEffect(effect) {
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

function isKamikazeBattleUltimateEffect(effect) {
  const effectType = String(effect?.type || effect?.effectId || effect?.id || "").trim();
  return ["kamikaze", "Kamikaze", "enemyKamikaze", "kamikazeEnemy"].includes(effectType);
}

function getBattleUltimateConvertTargetItemIds(effect) {
  return getBattleUltimateEffectStringList(
    effect?.to?.itemIds ?? effect?.toItemIds ?? effect?.to?.itemId ?? effect?.toItemId,
  );
}

function getBattleUltimateEffectStringList(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim());
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

export function applyBattlePlayerDamage(playerState, damage) {
  return applyPlayerDamage(playerState, damage);
}

export function applyBattleTurnDamage(battleState, itemCatalog, options = {}) {
  const boxes = Array.isArray(options.boxes)
    ? options.boxes
    : Array.isArray(battleState?.boxes)
      ? battleState.boxes
      : [];
  const sourceCells = findBattleTurnDamageCells(battleState?.board, itemCatalog, { boxes });
  const rawDamage = sourceCells.reduce((total, cell) => {
    const item = getBattleItemDefinition(itemCatalog, battleState.board[cell.row]?.[cell.col]);
    return total + Math.max(0, getNumber(item?.dmgperturn));
  }, 0);

  return {
    playerDamage: applyPlayerDamage(battleState?.playerState, rawDamage),
    sourceCells,
  };
}

function findBattleTurnDamageCells(board, itemCatalog, options = {}) {
  if (!Array.isArray(board)) {
    return [];
  }

  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  const cells = [];
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < (board[row]?.length || 0); col += 1) {
      if (hasBattleBoxAt(boxes, { row, col })) {
        continue;
      }
      const item = getBattleItemDefinition(itemCatalog, board[row][col]);
      if (Math.max(0, getNumber(item?.dmgperturn)) > 0) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

export function dropBattleBoard(board, options = {}) {
  assertRectangularBoard(board);

  const nextBoard = cloneBattleBoard(board);
  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);

  for (let col = 0; col < width; col += 1) {
    let segmentBottom = height - 1;
    for (let row = height - 1; row >= -1; row -= 1) {
      const isBlockedRow = row >= 0 && hasBattleBoxAt(boxes, { row, col });
      if (row !== -1 && !isBlockedRow) {
        continue;
      }

      dropBattleColumnSegment(board, nextBoard, col, row + 1, segmentBottom);
      if (isBlockedRow) {
        nextBoard[row][col] = board[row][col];
      }
      segmentBottom = row - 1;
    }
  }

  return nextBoard;
}

export function refillBattleBoard(board, itemCatalog, options = {}) {
  assertRectangularBoard(board);

  const nextBoard = cloneBattleBoard(board);
  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  const dropPool = getBattleDropPool(itemCatalog);
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);

  for (let row = height - 1; row >= 0; row -= 1) {
    for (let col = 0; col < width; col += 1) {
      if (!hasBattleBoxAt(boxes, { row, col }) && nextBoard[row][col] === null) {
        nextBoard[row][col] = pickBattleGeneratedItem(dropPool, itemCatalog, options);
      }
    }
  }

  return nextBoard;
}

export function refillBattleBoardFromReserve(board, reserveBoard, itemCatalog, options = {}) {
  // Reserve board является "верхней лентой" будущих падений. Так анимация и
  // логика видят одни и те же предметы до и после refill.
  assertRectangularBoard(board);
  assertMatchingBoardSize(board, reserveBoard);

  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  const dropPool = getBattleDropPool(itemCatalog);
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);
  const nextBoard = Array.from({ length: height }, () => Array.from({ length: width }, () => null));
  const nextReserveBoard = Array.from({ length: height }, () => Array.from({ length: width }, () => null));
  const movement = [];

  for (let col = 0; col < width; col += 1) {
    const reserveEntries = [];
    for (let row = height - 1; row >= 0; row -= 1) {
      if (reserveBoard[row][col] !== null) {
        reserveEntries.push({ itemId: reserveBoard[row][col], fromRow: row - height, source: "reserve" });
      }
    }

    let segmentBottom = height - 1;
    for (let row = height - 1; row >= -1; row -= 1) {
      const isBlockedRow = row >= 0 && hasBattleBoxAt(boxes, { row, col });
      if (row !== -1 && !isBlockedRow) {
        continue;
      }

      refillBattleColumnSegmentFromReserve({
        board,
        nextBoard,
        reserveEntries,
        movement,
        col,
        top: row + 1,
        bottom: segmentBottom,
        height,
        dropPool,
        itemCatalog,
        options,
      });
      if (isBlockedRow) {
        nextBoard[row][col] = board[row][col];
      }
      segmentBottom = row - 1;
    }

    for (let row = height - 1; row >= 0; row -= 1) {
      const entry = reserveEntries.shift();
      nextReserveBoard[row][col] = entry?.itemId || pickBattleGeneratedItem(dropPool, itemCatalog, options);
    }
  }

  return {
    board: nextBoard,
    reserveBoard: nextReserveBoard,
    movement,
  };
}

function dropBattleColumnSegment(board, nextBoard, col, top, bottom) {
  if (top > bottom) {
    return;
  }

  const items = [];
  for (let row = bottom; row >= top; row -= 1) {
    if (board[row][col] !== null) {
      items.push(board[row][col]);
    }
  }
  for (let row = bottom; row >= top; row -= 1) {
    nextBoard[row][col] = items.shift() || null;
  }
}

function refillBattleColumnSegmentFromReserve({
  board,
  nextBoard,
  reserveEntries,
  movement,
  col,
  top,
  bottom,
  height,
  dropPool,
  itemCatalog,
  options,
}) {
  if (top > bottom) {
    return;
  }

  const entries = [];
  const externalSourceRow = top > 0 ? top - 1 : null;
  for (let row = bottom; row >= top; row -= 1) {
    if (board[row][col] !== null) {
      entries.push({ itemId: board[row][col], fromRow: row, source: "board" });
    }
  }

  for (let row = bottom; row >= top; row -= 1) {
    let entry = entries.shift()
      || reserveEntries.shift()
      || {
        itemId: pickBattleGeneratedItem(dropPool, itemCatalog, options),
        fromRow: -height,
        source: "new",
      };
    if (externalSourceRow !== null && entry.source !== "board") {
      entry = {
        ...entry,
        fromRow: externalSourceRow,
        source: "box",
      };
    }
    nextBoard[row][col] = entry.itemId;
    if (entry.fromRow !== row || entry.source !== "board") {
      const isNew = entry.source !== "board" && entry.source !== "box";
      movement.push({
        fromRow: entry.fromRow,
        to: { row, col },
        isNew,
        source: entry.source,
        newIndex: isNew ? Math.max(0, -entry.fromRow - 1) : 0,
      });
    }
  }
}

export function getBattleDropPool(itemCatalog) {
  const items = getBattleItemDefinitions(itemCatalog).filter((item) => item.category === BATTLE_DROP_CATEGORY);
  if (items.length === 0) {
    throw new Error("Battle item catalog must contain at least one category: match-3 item.");
  }
  return items.map((item) => item.itemId);
}

function assertBattleDropTypesForBoard(itemCatalog, options, width, height) {
  const requiredTypeCount = getMinimumBattleDropTypeCount(width, height);
  if (requiredTypeCount <= 1) {
    return;
  }

  const possibleTypes = getPossibleBattleDropTypes(itemCatalog, options);
  if (possibleTypes.size >= requiredTypeCount) {
    return;
  }

  const typeList = [...possibleTypes].join(", ") || "none";
  throw new Error(
    `Too few match-3 types for battle board: need at least ${requiredTypeCount} different generated type values, `
    + `found ${possibleTypes.size} (${typeList}). Check category: "match-3" items and inventory transform_chance settings.`,
  );
}

function getMinimumBattleDropTypeCount(width, height) {
  return width >= 3 && height >= 3 ? MIN_BATTLE_BOARD_DROP_TYPES : 1;
}

function getPossibleBattleDropTypes(itemCatalog, options = {}) {
  const types = new Set();
  const dropItems = getBattleItemDefinitions(itemCatalog).filter((item) => item.category === BATTLE_DROP_CATEGORY);

  for (const item of dropItems) {
    for (const itemId of getPossibleGeneratedBattleItemIds(itemCatalog, item.itemId, options)) {
      const type = getBattleMatchType(itemId, itemCatalog);
      if (type) {
        types.add(type);
      }
    }
  }

  return types;
}

function getPossibleGeneratedBattleItemIds(itemCatalog, sourceItemId, options = {}) {
  const possibleItemIds = new Set();
  const enemyResult = getPossibleBattleEnemyConvertResult(itemCatalog, sourceItemId, options);

  for (const itemId of enemyResult.itemIds) {
    possibleItemIds.add(itemId);
  }

  if (enemyResult.sourceCanReachPlayerTransforms) {
    for (const itemId of getPossibleBattleInventoryTransformItemIds(itemCatalog, sourceItemId, options.playerState)) {
      possibleItemIds.add(itemId);
    }
  }

  return possibleItemIds;
}

export function collectBattleMatchCells(matches) {
  const cellsByKey = new Map();
  for (const match of matches) {
    for (const cell of match.cells) {
      cellsByKey.set(getCellKey(cell), cell);
    }
  }
  return [...cellsByKey.values()];
}

function groupBattleMatchCellsByType(matches) {
  const groupsByType = new Map();

  for (const match of matches) {
    if (!groupsByType.has(match.type)) {
      groupsByType.set(match.type, {
        type: match.type,
        cells: [],
        cellKeys: new Set(),
      });
    }

    const group = groupsByType.get(match.type);
    for (const cell of match.cells) {
      const cellKey = getCellKey(cell);
      if (!group.cellKeys.has(cellKey)) {
        group.cellKeys.add(cellKey);
        group.cells.push(cell);
      }
    }
  }

  return groupsByType;
}

function pickBattleDropItem(board, row, col, dropPool, itemCatalog, options = {}) {
  const candidates = shuffleItems(dropPool, options.random);
  for (const itemId of candidates) {
    const generatedItemId = applyBattleDropTransforms(itemCatalog, itemId, options);
    if (canPlaceBattleItem(board, row, col, generatedItemId, itemCatalog)) {
      return generatedItemId;
    }
  }
  return pickBattleGeneratedItem(dropPool, itemCatalog, options);
}

function pickBattleGeneratedItem(dropPool, itemCatalog, options = {}) {
  const itemId = pickRandomItem(dropPool, options.random);
  return applyBattleDropTransforms(itemCatalog, itemId, options);
}

export function pickBattleGoldLootItem(itemCatalog, options = {}) {
  const excludedItemId = options.excludeItemId || options.sourceItemId || "";
  const lootPool = getBattleGoldLootPool(itemCatalog)
    .filter((itemId) => itemId !== excludedItemId);
  if (lootPool.length === 0) {
    return null;
  }

  const random = typeof options.random === "function" ? options.random : Math.random;
  const nearbyLootPool = getBattleNearbyGoldLootPool(itemCatalog, lootPool, options);
  const candidatePools = nearbyLootPool.length > 0
    ? [nearbyLootPool, lootPool]
    : [lootPool];

  for (const candidatePool of candidatePools) {
    const maxAttempts = Math.max(8, candidatePool.length * 3);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const itemId = pickRandomItem(candidatePool, random);
      const transformedItemId = applyBattleInventoryTransforms(itemCatalog, itemId, options.playerState, random);
      if (transformedItemId !== excludedItemId) {
        return transformedItemId;
      }
    }
  }

  return null;
}

function getBattleNearbyGoldLootPool(itemCatalog, lootPool, options) {
  const board = options.board;
  const targetCell = options.targetCell;
  if (
    !Array.isArray(board)
    || board.length === 0
    || !targetCell
    || !Number.isInteger(targetCell.row)
    || !Number.isInteger(targetCell.col)
  ) {
    return [];
  }

  const height = board.length;
  const width = Array.isArray(board[0]) ? board[0].length : 0;
  if (
    width === 0
    || targetCell.row < 0
    || targetCell.row >= height
    || targetCell.col < 0
    || targetCell.col >= width
  ) {
    return [];
  }

  const lootItemIdByType = new Map();
  for (const itemId of lootPool) {
    const type = getBattleMatchType(itemId, itemCatalog);
    if (type && !lootItemIdByType.has(type)) {
      lootItemIdByType.set(type, itemId);
    }
  }

  const nearbyLootPool = [];
  for (let row = targetCell.row - 1; row <= targetCell.row + 1; row += 1) {
    for (let col = targetCell.col - 1; col <= targetCell.col + 1; col += 1) {
      if (
        row < 0
        || row >= height
        || col < 0
        || col >= width
        || row === targetCell.row && col === targetCell.col
        || hasBattleBoxAt(options.boxes, { row, col })
      ) {
        continue;
      }

      const type = getBattleMatchType(board[row]?.[col], itemCatalog);
      const lootItemId = lootItemIdByType.get(type);
      if (lootItemId) {
        nearbyLootPool.push(lootItemId);
      }
    }
  }

  return nearbyLootPool;
}

function getBattleGoldLootPool(itemCatalog) {
  return getBattleItemDefinitions(itemCatalog)
    .filter((item) => Number(item?.goldloot) === 1)
    .map((item) => item.itemId)
    .filter(Boolean);
}

function applyBattleDropTransforms(itemCatalog, itemId, options = {}) {
  // Вражеский convert идет раньше inventory transforms: stage-механика врага
  // должна иметь приоритет над бонусами предметов игрока при генерации drop.
  const random = typeof options.random === "function" ? options.random : Math.random;
  const enemyResult = applyBattleEnemyConvertTransforms(itemCatalog, itemId, options, random);
  if (enemyResult.converted) {
    return enemyResult.itemId;
  }

  return applyBattleInventoryTransforms(itemCatalog, itemId, options.playerState, random);
}

function applyBattleInventoryTransforms(itemCatalog, itemId, playerState, random = Math.random) {
  let nextItemId = itemId;
  for (const transform of getBattleInventoryTransforms(itemCatalog, nextItemId, playerState)) {
    const chance = clamp(getNumber(transform.chancePercent) / 100, 0, 1);
    if (chance > 0 && random() < chance) {
      nextItemId = transform.toItemId;
      break;
    }
  }

  return nextItemId;
}

function getBattleInventoryTransforms(itemCatalog, sourceItemId, playerState) {
  if (!sourceItemId || !Array.isArray(playerState?.inventory)) {
    return [];
  }

  const transforms = [];
  for (const inventoryEntry of playerState.inventory) {
    const item = getBattleItemDefinition(itemCatalog, inventoryEntry.itemId);
    if (!item || item.transform_from_itemId !== sourceItemId || !item.transform_to_itemId) {
      continue;
    }
    transforms.push({
      toItemId: item.transform_to_itemId,
      chancePercent: getNumber(item.transform_chance) * Math.max(0, getNumber(inventoryEntry.quantity)),
    });
  }

  return transforms;
}

function applyBattleEnemyConvertTransforms(itemCatalog, itemId, options = {}, random = Math.random) {
  for (const effect of getBattleEnemyConvertEffects(options)) {
    if (!isConvertBattleUltimateEffect(effect) || !doesBattleUltimateSelectorMatchItemId(itemCatalog, effect, "from", itemId)) {
      continue;
    }

    const chance = getBattleEnemyConvertChance(effect);
    if (chance <= 0 || random() >= chance) {
      continue;
    }

    const targetItemIds = getBattleUltimateConvertTargetItemIds(effect)
      .filter((targetItemId, index, list) => list.indexOf(targetItemId) === index)
      .filter((targetItemId) => getBattleItemDefinition(itemCatalog, targetItemId));
    if (targetItemIds.length === 0) {
      continue;
    }

    return {
      itemId: pickRandomItem(targetItemIds, random),
      converted: true,
    };
  }

  return {
    itemId,
    converted: false,
  };
}

function getPossibleBattleInventoryTransformItemIds(itemCatalog, sourceItemId, playerState) {
  const itemIds = new Set();
  let sourceCanRemain = true;

  for (const transform of getBattleInventoryTransforms(itemCatalog, sourceItemId, playerState)) {
    const chancePercent = clamp(getNumber(transform.chancePercent), 0, 100);
    if (chancePercent > 0) {
      itemIds.add(transform.toItemId);
    }
    if (chancePercent >= 100) {
      sourceCanRemain = false;
      break;
    }
  }

  if (sourceCanRemain) {
    itemIds.add(sourceItemId);
  }

  return itemIds;
}

function getPossibleBattleEnemyConvertResult(itemCatalog, itemId, options = {}) {
  const itemIds = new Set();
  let sourceCanReachPlayerTransforms = true;

  for (const effect of getBattleEnemyConvertEffects(options)) {
    if (!isConvertBattleUltimateEffect(effect) || !doesBattleUltimateSelectorMatchItemId(itemCatalog, effect, "from", itemId)) {
      continue;
    }

    const chance = getBattleEnemyConvertChance(effect);
    const targetItemIds = getBattleUltimateConvertTargetItemIds(effect)
      .filter((targetItemId, index, list) => list.indexOf(targetItemId) === index)
      .filter((targetItemId) => getBattleItemDefinition(itemCatalog, targetItemId));
    if (chance <= 0 || targetItemIds.length === 0) {
      continue;
    }

    for (const targetItemId of targetItemIds) {
      itemIds.add(targetItemId);
    }
    if (chance >= 1) {
      sourceCanReachPlayerTransforms = false;
      break;
    }
  }

  return {
    itemIds,
    sourceCanReachPlayerTransforms,
  };
}

function getBattleEnemyConvertEffects(options = {}) {
  const effects = options.enemyConvertEffects ?? options.convertEffects ?? options.enemyConvert ?? options.convert;
  return Array.isArray(effects) ? effects : [];
}

function getBattleEnemyConvertChance(effect) {
  return clamp(getNumber(effect?.chance), 0, 1);
}

function doesBattleUltimateSelectorMatchItemId(itemCatalog, effect, selectorKey, itemId) {
  const item = getBattleItemDefinition(itemCatalog, itemId);
  const sourceItemIds = new Set(getBattleUltimateSelectorItemIds(effect, selectorKey));
  const sourceItemTypes = new Set(getBattleUltimateSelectorItemTypes(effect, selectorKey));
  return sourceItemIds.has(itemId)
    || sourceItemIds.has(item?.itemId)
    || Boolean(item?.type && sourceItemTypes.has(item.type));
}

function canPlaceBattleItem(board, row, col, itemId, itemCatalog) {
  const type = getBattleMatchType(itemId, itemCatalog);
  if (!type) {
    return true;
  }

  const leftOne = col > 0 ? getBattleMatchType(board[row][col - 1], itemCatalog) : "";
  const leftTwo = col > 1 ? getBattleMatchType(board[row][col - 2], itemCatalog) : "";
  if (leftOne === type && leftTwo === type) {
    return false;
  }

  const upOne = row > 0 ? getBattleMatchType(board[row - 1][col], itemCatalog) : "";
  const upTwo = row > 1 ? getBattleMatchType(board[row - 2][col], itemCatalog) : "";
  if (upOne === type && upTwo === type) {
    return false;
  }

  const upLeft = row > 0 && col > 0 ? getBattleMatchType(board[row - 1][col - 1], itemCatalog) : "";
  if (leftOne === type && upOne === type && upLeft === type) {
    return false;
  }

  return true;
}

function findHorizontalMatches(board, itemCatalog, boxes = []) {
  const matches = [];
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);

  for (let row = 0; row < height; row += 1) {
    let col = 0;
    while (col < width) {
      const type = getBattleCellMatchType(board, row, col, itemCatalog, boxes);
      if (!type) {
        col += 1;
        continue;
      }
      let end = col + 1;
      while (end < width && getBattleCellMatchType(board, row, end, itemCatalog, boxes) === type) {
        end += 1;
      }
      if (end - col >= 3) {
        matches.push({
          type,
          kind: "horizontal",
          cells: Array.from({ length: end - col }, (_, index) => ({ row, col: col + index })),
        });
      }
      col = end;
    }
  }

  return matches;
}

function findVerticalMatches(board, itemCatalog, boxes = []) {
  const matches = [];
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);

  for (let col = 0; col < width; col += 1) {
    let row = 0;
    while (row < height) {
      const type = getBattleCellMatchType(board, row, col, itemCatalog, boxes);
      if (!type) {
        row += 1;
        continue;
      }
      let end = row + 1;
      while (end < height && getBattleCellMatchType(board, end, col, itemCatalog, boxes) === type) {
        end += 1;
      }
      if (end - row >= 3) {
        matches.push({
          type,
          kind: "vertical",
          cells: Array.from({ length: end - row }, (_, index) => ({ row: row + index, col })),
        });
      }
      row = end;
    }
  }

  return matches;
}

function findSquareMatches(board, itemCatalog, boxes = []) {
  const matches = [];
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);

  for (let row = 0; row < height - 1; row += 1) {
    for (let col = 0; col < width - 1; col += 1) {
      const type = getBattleCellMatchType(board, row, col, itemCatalog, boxes);
      if (
        type &&
        getBattleCellMatchType(board, row, col + 1, itemCatalog, boxes) === type &&
        getBattleCellMatchType(board, row + 1, col, itemCatalog, boxes) === type &&
        getBattleCellMatchType(board, row + 1, col + 1, itemCatalog, boxes) === type
      ) {
        matches.push({
          type,
          kind: "square",
          cells: [
            { row, col },
            { row, col: col + 1 },
            { row: row + 1, col },
            { row: row + 1, col: col + 1 },
          ],
        });
      }
    }
  }

  return matches;
}

function getBattleCellMatchType(board, row, col, itemCatalog, boxes = []) {
  if (hasBattleBoxAt(boxes, { row, col })) {
    return "";
  }
  return getBattleMatchType(board[row]?.[col], itemCatalog);
}

function getBattleMatchType(itemId, itemCatalog) {
  const item = getBattleItemDefinition(itemCatalog, itemId);
  if (isBattleBatteryItem(item)) {
    return "";
  }
  return BATTLE_MATCH_CATEGORIES.has(item?.category) ? item.type : "";
}

export function getBattleItemDefinition(itemCatalog, itemId) {
  return getBattleItemDefinitions(itemCatalog).find((item) => item.itemId === itemId);
}

function isBattleBatteryItemId(itemCatalog, itemId) {
  return isBattleBatteryItem(getBattleItemDefinition(itemCatalog, itemId));
}

function isBattleBatteryItem(item) {
  return item?.battleUse === BATTLE_BATTERY_USE || item?.itemId === "battary";
}

function getBattleCellsByType(board, itemCatalog, type, options = {}) {
  const cells = [];
  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  const vines = Array.isArray(options.vines) ? options.vines : [];
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const cell = { row, col };
      if (
        !hasBattleBoxAt(boxes, cell)
        && !hasBattleVineAt(vines, cell)
        && getBattleMatchType(board[row][col], itemCatalog) === type
      ) {
        cells.push({ row, col });
      }
    }
  }

  return cells;
}

function getAllBattleOccupiedCells(board, options = {}) {
  const cells = [];
  const boxes = Array.isArray(options.boxes) ? options.boxes : [];
  const vines = Array.isArray(options.vines) ? options.vines : [];
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const cell = { row, col };
      if (!hasBattleBoxAt(boxes, cell) && !hasBattleVineAt(vines, cell) && board[row][col] !== null) {
        cells.push({ row, col });
      }
    }
  }

  return cells;
}

export function getBattleItemDefinitions(itemCatalog) {
  if (Array.isArray(itemCatalog)) {
    return itemCatalog;
  }
  if (Array.isArray(itemCatalog?.items)) {
    return itemCatalog.items;
  }
  if (itemCatalog instanceof Map) {
    return [...itemCatalog.values()];
  }
  throw new Error("Battle item catalog must be an array, a Map, or an object with items array.");
}

export function getBattlePlayerMaxHealth(playerState, itemCatalog) {
  const healthState = playerState?.health;
  const baseMaxHealth = getNumber(healthState?.baseMax) > 0
    ? getNumber(healthState.baseMax)
    : getNumber(healthState?.max);
  return baseMaxHealth + getBattleInventoryStatModifier(itemCatalog, playerState, "max_hp_modif");
}

export function getBattleHealHealth(playerState, itemCatalog) {
  const baseHealHealth = getNumber(playerState?.heal?.health);
  return baseHealHealth + getBattleInventoryStatModifier(itemCatalog, playerState, "heal_hp_modif");
}

function getBattleInventoryStatModifier(itemCatalog, playerState, statKey) {
  if (!Array.isArray(playerState?.inventory)) {
    return 0;
  }

  return playerState.inventory.reduce((total, inventoryEntry) => {
    const item = getBattleItemDefinition(itemCatalog, inventoryEntry.itemId);
    return total + getNumber(item?.[statKey]) * Math.max(0, getNumber(inventoryEntry.quantity));
  }, 0);
}

export function getBattleEffectiveItemStats(itemCatalog, itemId, playerState, battleState = null) {
  const item = getBattleItemDefinition(itemCatalog, itemId);
  const stats = {
    damage: getNumber(item?.damage),
    heal: getNumber(item?.heal),
    aggression: getNumber(item?.aggression),
    calm: getNumber(item?.calm),
  };

  for (const modifier of getBattleInventoryModifiers(itemCatalog, itemId, playerState)) {
    const quantity = Math.max(0, getNumber(modifier.quantity));
    stats.damage += getNumber(modifier.damage) * quantity;
    stats.heal += getNumber(modifier.heal) * quantity;
    stats.aggression += getNumber(modifier.aggression) * quantity;
    stats.calm += getNumber(modifier.calm) * quantity;
  }

  applyBattleEnemyItemStatModifiers(stats, itemCatalog, itemId, battleState);
  roundBattleItemStatsDown(stats);
  return stats;
}

function applyBattleEnemyItemStatModifiers(stats, itemCatalog, itemId, battleState) {
  const stage = getCurrentBattleStage(battleState?.enemyConfig, battleState?.enemyState);
  if (!Array.isArray(stage?.itemStatModifiers)) {
    return;
  }

  const item = getBattleItemDefinition(itemCatalog, itemId);
  for (const modifier of stage.itemStatModifiers) {
    if (!matchesBattleEnemyItemStatModifier(modifier, item, itemId)) {
      continue;
    }
    const multipliers = modifier?.multipliers;
    if (!multipliers || typeof multipliers !== "object") {
      continue;
    }
    for (const statKey of BATTLE_ITEM_STAT_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(multipliers, statKey)) {
        continue;
      }
      stats[statKey] = Math.max(0, getNumber(stats[statKey]) * getNumber(multipliers[statKey]));
    }
  }
}

function matchesBattleEnemyItemStatModifier(modifier, item, itemId) {
  if (!modifier || typeof modifier !== "object") {
    return false;
  }

  const itemIds = getBattleStringList(modifier.itemIds ?? modifier.itemId);
  if (itemIds.includes(itemId)) {
    return true;
  }

  const itemTypes = getBattleStringList(modifier.itemTypes);
  return itemTypes.includes(item?.type);
}

function getBattleStringList(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return (Array.isArray(value) ? value : [value])
    .filter((entry) => typeof entry === "string" && entry.trim() !== "")
    .map((entry) => entry.trim());
}

function roundBattleItemStatsDown(stats) {
  for (const statKey of BATTLE_ITEM_STAT_KEYS) {
    stats[statKey] = roundBattleItemStatDown(stats[statKey]);
  }
}

function roundBattleItemStatDown(value) {
  const safeValue = Math.max(0, getNumber(value));
  return Math.floor(
    (safeValue + BATTLE_ITEM_STAT_ROUNDING_EPSILON) * BATTLE_ITEM_STAT_ROUNDING_FACTOR,
  ) / BATTLE_ITEM_STAT_ROUNDING_FACTOR;
}

function getBattleInventoryModifiers(itemCatalog, targetItemId, playerState) {
  if (!targetItemId || !Array.isArray(playerState?.inventory)) {
    return [];
  }

  const modifiers = [];
  for (const inventoryEntry of playerState.inventory) {
    const item = getBattleItemDefinition(itemCatalog, inventoryEntry.itemId);
    if (!Array.isArray(item?.modificate)) {
      continue;
    }
    for (const modifier of item.modificate) {
      if (modifier?.itemId === targetItemId) {
        modifiers.push({
          ...modifier,
          quantity: inventoryEntry.quantity,
        });
      }
    }
  }

  return modifiers;
}

function applyBattleDamage(enemyState, enemyConfig, damage) {
  // Урон переводит врага максимум на одну следующую stage за resolve-step.
  // Новый stage пересоздает HP/shield/aggression/rage из конфига.
  const result = {
    stageChanged: false,
    enemyDefeated: false,
  };

  if (!enemyState || enemyState.isDefeated || damage <= 0) {
    return result;
  }

  enemyState.health.current = Math.max(0, enemyState.health.current - damage);
  while (enemyState.health.current <= 0 && !enemyState.isDefeated) {
    const nextStageIndex = enemyState.stageIndex + 1;
    const nextStage = getBattleEnemyStages(enemyConfig)[nextStageIndex];

    if (!nextStage) {
      enemyState.isDefeated = true;
      result.enemyDefeated = true;
      break;
    }

    enemyState.stageIndex = nextStageIndex;
    enemyState.health = createStageHealthState(nextStage);
    enemyState.shield = createStageShieldState(nextStage);
    enemyState.aggression = createStageAggressionState(nextStage);
    enemyState.rage = createStageRageState(nextStage);
    result.stageChanged = true;
    break;
  }

  return result;
}

function getBattleEnemyCurrentHealth(enemyState) {
  if (!enemyState || enemyState.isDefeated) {
    return 0;
  }
  return Math.max(0, getNumber(enemyState.health?.current));
}

function applyBattleShieldHit(enemyState) {
  const currentShield = Math.max(0, getNumber(enemyState?.shield?.current));
  if (!enemyState?.shield || enemyState.isDefeated || currentShield <= 0) {
    return false;
  }

  enemyState.shield.current = Math.max(0, currentShield - 1);
  return true;
}

function applyBattleEnemyShieldHealing(enemyState, shieldAmount, shieldCap = DEFAULT_ENEMY_SHIELD_CAP) {
  if (!enemyState) {
    return 0;
  }
  const normalizedShieldCap = getBattleEnemyShieldCap({ enemyShieldCap: shieldCap });
  const rawShieldAmount = Math.max(0, getNumber(shieldAmount));
  if (enemyState.isDefeated || rawShieldAmount <= 0 || normalizedShieldCap <= 0) {
    return 0;
  }

  if (!enemyState.shield || typeof enemyState.shield !== "object") {
    enemyState.shield = {
      current: 0,
      max: normalizedShieldCap,
    };
  }

  const shieldState = enemyState.shield;
  const previousShield = Math.max(0, getNumber(shieldState.current));
  shieldState.max = Math.max(getNumber(shieldState.max), normalizedShieldCap);
  shieldState.current = Math.min(normalizedShieldCap, previousShield + rawShieldAmount);
  return shieldState.current - previousShield;
}

function getBattleEnemyShieldCap(options = {}) {
  const configuredCap = Number(
    options.enemyShieldCap
      ?? options.enemyShieldMax
      ?? options.shieldCap
      ?? options.shieldMax
      ?? DEFAULT_ENEMY_SHIELD_CAP,
  );
  if (!Number.isFinite(configuredCap)) {
    return DEFAULT_ENEMY_SHIELD_CAP;
  }
  return Math.max(0, Math.min(DEFAULT_ENEMY_SHIELD_CAP, Math.floor(configuredCap)));
}

function applyBattleHeal(playerState, healAmount, itemCatalog) {
  const healState = playerState?.heal;
  const healthState = playerState?.health;

  if (!healState || !healthState || healAmount <= 0) {
    return 0;
  }

  const maxHeal = Math.max(1, getNumber(healState.max));
  const healthPerTrigger = getBattleHealHealth(playerState, itemCatalog);
  const maxHealth = getBattlePlayerMaxHealth(playerState, itemCatalog);
  let recovered = 0;

  healState.current = getNumber(healState.current) + healAmount;
  while (healState.current >= maxHeal) {
    healState.current -= maxHeal;
    const before = getNumber(healthState.current);
    healthState.current = Math.min(maxHealth, before + healthPerTrigger);
    recovered += healthState.current - before;
  }

  return recovered;
}

function applyBattleAggression(enemyState, playerState, aggression, calm) {
  const result = {
    triggers: 0,
    playerDamage: 0,
  };

  if (!enemyState?.aggression) {
    return result;
  }

  const maxAggression = getNumber(enemyState.aggression.max);
  if (maxAggression <= 0) {
    enemyState.aggression.current = 0;
    return result;
  }

  const nextAggression = Math.max(0, getNumber(enemyState.aggression.current) + aggression - calm);
  if (nextAggression >= maxAggression) {
    result.triggers = 1;
    result.playerDamage = applyPlayerDamage(playerState, enemyState.aggression.damage);
    enemyState.aggression.current = 0;
    return result;
  }

  enemyState.aggression.current = nextAggression;
  return result;
}

function applyPlayerDamage(playerState, damage) {
  const healthState = playerState?.health;
  const damageAmount = getNumber(damage);

  if (!healthState || damageAmount <= 0) {
    return 0;
  }

  const before = getNumber(healthState.current);
  healthState.current = Math.max(0, before - damageAmount);
  return before - healthState.current;
}

function applyBattleEnemyHealing(enemyState, healing) {
  const healthState = enemyState?.health;
  const healingAmount = Math.max(0, getNumber(healing));

  if (!healthState || enemyState?.isDefeated || healingAmount <= 0) {
    return 0;
  }

  const before = getNumber(healthState.current);
  const max = Math.max(0, getNumber(healthState.max));
  healthState.current = Math.min(max, before + healingAmount);
  return healthState.current - before;
}

function createStageHealthState(stage) {
  const max = getNumber(stage?.health);
  return {
    current: max,
    max,
  };
}

function createStageShieldState(stage) {
  const max = Math.max(0, getNumber(stage?.shield));
  return {
    current: max,
    max,
  };
}

function createStageAggressionState(stage) {
  const max = getNumber(stage?.aggression?.threshold);
  return {
    current: 0,
    max,
    damage: getNumber(stage?.aggression?.damage),
    resetOnTrigger: stage?.aggression?.resetOnTrigger !== false,
  };
}

function createStageRageState(stage) {
  const max = getNumber(stage?.rage?.secondsToUltimate);
  return {
    current: max,
    max,
    resetAfterUltimate: stage?.rage?.resetAfterUltimate !== false,
  };
}

function getBattleEnemyStages(enemyConfig) {
  return Array.isArray(enemyConfig?.stages) ? enemyConfig.stages : [];
}

function getBattleWallCandidates(board, boxes = []) {
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);
  const candidates = [];

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (col < width - 1) {
        const from = { row, col };
        const to = { row, col: col + 1 };
        if (!hasBattleBoxAt(boxes, from) && !hasBattleBoxAt(boxes, to)) {
          candidates.push({
            from,
            to,
            orientation: "vertical",
          });
        }
      }
      if (row < height - 1) {
        const from = { row, col };
        const to = { row: row + 1, col };
        if (!hasBattleBoxAt(boxes, from) && !hasBattleBoxAt(boxes, to)) {
          candidates.push({
            from,
            to,
            orientation: "horizontal",
          });
        }
      }
    }
  }

  return candidates;
}

function getBattleBoxCandidates(board) {
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);
  const candidates = [];

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (board[row][col] !== null) {
        candidates.push({ row, col });
      }
    }
  }

  return candidates;
}

function getBattleVineCandidates(board, boxes = []) {
  const width = getBoardWidth(board);
  const height = getBoardHeight(board);
  const candidates = [];

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const cell = { row, col };
      if (board[row][col] !== null && !hasBattleBoxAt(boxes, cell)) {
        candidates.push(cell);
      }
    }
  }

  return candidates;
}

function getNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneBattleBoard(board) {
  return board.map((row) => [...row]);
}

function shuffleItems(items, random = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const temporary = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = temporary;
  }
  return shuffled;
}

function pickRandomItem(items, random = Math.random) {
  return items[Math.floor(random() * items.length)];
}

function assertCellInsideBoard(board, cell) {
  assertRectangularBoard(board);
  if (
    !cell ||
    cell.row < 0 ||
    cell.col < 0 ||
    cell.row >= getBoardHeight(board) ||
    cell.col >= getBoardWidth(board)
  ) {
    throw new Error(`Battle cell is outside board: ${JSON.stringify(cell)}`);
  }
}

function assertRectangularBoard(board) {
  if (!Array.isArray(board) || board.length === 0 || !Array.isArray(board[0]) || board[0].length === 0) {
    throw new Error("Battle board must be a non-empty 2D array.");
  }
  const width = board[0].length;
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error("Battle board rows must have the same width.");
    }
  }
}

function assertMatchingBoardSize(board, otherBoard) {
  assertRectangularBoard(board);
  assertRectangularBoard(otherBoard);
  if (getBoardWidth(board) !== getBoardWidth(otherBoard) || getBoardHeight(board) !== getBoardHeight(otherBoard)) {
    throw new Error("Battle reserve board must have the same size as battle board.");
  }
}

function getBoardWidth(board) {
  return board[0].length;
}

function getBoardHeight(board) {
  return board.length;
}

function getCellKey(cell) {
  return `${cell.row}:${cell.col}`;
}

function getBattleWallKey(firstCell, secondCell) {
  if (!firstCell || !secondCell) {
    return "";
  }
  const firstKey = getCellKey(firstCell);
  const secondKey = getCellKey(secondCell);
  return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
}

function areAdjacentBoardCells(firstCell, secondCell) {
  return Boolean(firstCell && secondCell)
    && Math.abs(firstCell.row - secondCell.row) + Math.abs(firstCell.col - secondCell.col) === 1;
}
