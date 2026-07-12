import { getBattleCellIconElement } from "./battle-animations.js";

export function getBoardElementsForSourceCells(context, sourceCells) {
  if (!Array.isArray(sourceCells) || sourceCells.length === 0) {
    return [];
  }
  const boardElement = context?.battleRenderTargets?.boardElement;
  if (!boardElement) {
    return [];
  }
  return sourceCells
    .map((cell) => getBattleCellIconElement(boardElement, cell))
    .filter((element) => Boolean(element));
}

export function setMatchFeedbackForBattleChange(
  deps,
  context,
  beforeEnemyState,
  afterEnemyState,
  beforePlayerState,
  afterPlayerState,
  effectSummary,
  board,
  matches,
) {
  const enemyDamage = Number(effectSummary?.damage || 0);
  const playerDamage = Number(effectSummary?.playerDamage || 0);
  const healAdded = Number(effectSummary?.heal || 0);
  const aggressionDelta = Number(effectSummary?.aggression || 0) - Number(effectSummary?.calm || 0);
  const playerHealthRecovery = getBattlePotentialPlayerHealthRecovery(context, beforePlayerState, healAdded);
  const playerHealthSourceElements = deps.getBattlePlayerHealthSourceElements(context);
  const sourceCellsByModifier = collectBattleCellSourceStats(context, board, context?.battleState?.playerState, matches);
  const sourceElementsByModifier = {
    "enemy-health": getBoardElementsForSourceCells(
      context,
      Array.isArray(effectSummary?.damageSourceCells) && effectSummary.damageSourceCells.length > 0
        ? effectSummary.damageSourceCells
        : sourceCellsByModifier["enemy-health"],
    ),
    "player-heal": getBoardElementsForSourceCells(context, sourceCellsByModifier["player-heal"]),
    "enemy-aggression": getBoardElementsForSourceCells(context, sourceCellsByModifier["enemy-aggression"]),
  };

  if (enemyDamage !== 0) {
    deps.setBattleHealthFeedbackDelta(context, "enemy-health", -enemyDamage, {
      sourceElements: sourceElementsByModifier["enemy-health"],
    });
  }

  if (playerDamage > 0) {
    deps.setBattleHealthFeedbackDelta(context, "player-health", -playerDamage, {
      sourceElements: playerHealthSourceElements,
    });
  } else if (playerHealthRecovery > 0) {
    deps.setBattleHealthFeedbackDelta(context, "player-health", playerHealthRecovery, {
      sourceElements: deps.getBattlePlayerHealSourceElements(context),
      forceDamageProjectiles: true,
    });
  }

  if (healAdded !== 0) {
    deps.setBattleHealthFeedbackDelta(context, "player-heal", healAdded, {
      sourceElements: sourceElementsByModifier["player-heal"],
    });
  }

  if (aggressionDelta !== 0) {
    deps.setBattleHealthFeedbackDelta(context, "enemy-aggression", aggressionDelta, {
      sourceElements: sourceElementsByModifier["enemy-aggression"],
    });
  }

  const beforeHeal = Number(beforePlayerState?.heal?.current || 0);
  const afterHeal = Number(afterPlayerState?.heal?.current || 0);
  if (Number.isFinite(beforeHeal) && Number.isFinite(afterHeal) && afterHeal < beforeHeal) {
    deps.setBattleHealthFeedbackSuppression(context, "player-heal", { suppressNegativeDelta: true });
  }

  const beforeAggression = Number(beforeEnemyState?.aggression?.current || 0);
  const afterAggression = Number(afterEnemyState?.aggression?.current || 0);
  if (
    Number.isFinite(beforeAggression)
    && beforeAggression > 0
    && Number.isFinite(afterAggression)
    && afterAggression === 0
    && Number(effectSummary?.aggressionTriggers || 0) > 0
  ) {
    deps.setBattleHealthFeedbackSuppression(context, "enemy-aggression", { suppressNegativeDelta: true });
  }
}

function getBattlePotentialPlayerHealthRecovery(context, beforePlayerState, healAmount) {
  const healthPerTrigger = Number(
    context?.engine?.getBattleHealHealth(context?.battleState?.playerState, context?.request?.itemCatalog),
  );
  const rawHealAmount = Number(healAmount);
  const healState = beforePlayerState?.heal || {};
  const maxHeal = Number(healState.max);
  const beforeHeal = Number(healState.current) || 0;

  if (
    !Number.isFinite(healthPerTrigger)
    || healthPerTrigger <= 0
    || !Number.isFinite(rawHealAmount)
    || rawHealAmount <= 0
    || !Number.isFinite(maxHeal)
    || maxHeal <= 0
  ) {
    return 0;
  }

  const triggerCount = Math.floor((beforeHeal + rawHealAmount) / maxHeal);
  return triggerCount * healthPerTrigger;
}

function getBattleNumericValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function collectBattleCellSourceStats(context, board, playerState, matches) {
  const matchCells = context.engine?.collectBattleMatchCells(Array.isArray(matches) ? matches : []);
  const sourceCellsByModifier = {
    "enemy-health": [],
    "player-heal": [],
    "enemy-aggression": [],
  };
  const modifiersByItemId = new Map();

  const inventory = Array.isArray(playerState?.inventory) ? playerState.inventory : [];
  for (const inventoryEntry of inventory) {
    const entryQuantity = Math.max(0, getBattleNumericValue(inventoryEntry?.quantity));
    if (entryQuantity <= 0) {
      continue;
    }

    const modifierSourceItem = context.engine.getBattleItemDefinition(
      context.request.itemCatalog,
      inventoryEntry?.itemId,
    );
    if (!Array.isArray(modifierSourceItem?.modificate)) {
      continue;
    }

    for (const modifier of modifierSourceItem.modificate) {
      const targetItemId = modifier?.itemId;
      if (!targetItemId) {
        continue;
      }

      const existing = modifiersByItemId.get(targetItemId) || {
        damage: 0,
        heal: 0,
        aggression: 0,
        calm: 0,
      };
      existing.damage += getBattleNumericValue(modifier?.damage) * entryQuantity;
      existing.heal += getBattleNumericValue(modifier?.heal) * entryQuantity;
      existing.aggression += getBattleNumericValue(modifier?.aggression) * entryQuantity;
      existing.calm += getBattleNumericValue(modifier?.calm) * entryQuantity;
      modifiersByItemId.set(targetItemId, existing);
    }
  }

  const resolveItemStats = (itemId) => {
    const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
    const baseStats = {
      damage: getBattleNumericValue(item?.damage),
      heal: getBattleNumericValue(item?.heal),
      aggression: getBattleNumericValue(item?.aggression),
      calm: getBattleNumericValue(item?.calm),
    };
    const itemModifiers = modifiersByItemId.get(itemId) || {};
    return {
      damage: baseStats.damage + getBattleNumericValue(itemModifiers.damage),
      heal: baseStats.heal + getBattleNumericValue(itemModifiers.heal),
      aggression: baseStats.aggression + getBattleNumericValue(itemModifiers.aggression),
      calm: baseStats.calm + getBattleNumericValue(itemModifiers.calm),
    };
  };

  for (const cell of matchCells) {
    const itemId = board?.[cell.row]?.[cell.col];
    const itemStats = resolveItemStats(itemId);

    if (itemStats.damage > 0) {
      sourceCellsByModifier["enemy-health"].push(cell);
    }
    if (itemStats.heal > 0) {
      sourceCellsByModifier["player-heal"].push(cell);
    }
    if (itemStats.aggression !== 0 || itemStats.calm !== 0) {
      sourceCellsByModifier["enemy-aggression"].push(cell);
    }
  }

  return sourceCellsByModifier;
}
