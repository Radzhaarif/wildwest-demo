import {
  collectItemIds,
  collectTextKeys,
  requireIntegerInRange,
  requireNumberInRange,
  requirePositiveInteger,
  requirePositiveNumber,
  requireString,
  validateBattleBackgroundField,
  validateCatalogAssetPath,
  validateEventImageField,
  validateRewardConfig,
} from "./common.js";

const MAP_EVENT_TYPES = ["battle", "reward", "heal", "shop", "skip", "dialog"];

export function collectBattleEnemyIds(mapConfig, battleEnemyIds) {
  if (!mapConfig || typeof mapConfig !== "object") {
    return;
  }
  if (typeof mapConfig.boss?.enemyId === "string" && mapConfig.boss.enemyId.trim() !== "") {
    battleEnemyIds.add(mapConfig.boss.enemyId);
  }
  if (!Array.isArray(mapConfig.battle)) {
    return;
  }
  for (const variant of mapConfig.battle) {
    if (typeof variant?.enemyId === "string" && variant.enemyId.trim() !== "") {
      battleEnemyIds.add(variant.enemyId);
    }
  }
}

export function validateMapConfig(config, source, issues, requiredTextKeys, requiredItemIds) {
  if (!config || typeof config !== "object") {
    issues.push(`${source}: map config must be an object`);
    return;
  }

  requireString(config.id, `${source}.id`, issues);
  requireString(config.nameTextKey, `${source}.nameTextKey`, issues);
  requireString(config.mapImage, `${source}.mapImage`, issues);
  collectTextKeys(config, requiredTextKeys);
  collectItemIds(config, requiredItemIds);

  validateMapPathRules(config.pathRules, source, issues);
  const eventCatalog = validateMapEventCatalog(config.events, source, issues);
  validateMapLevels(config, source, issues, eventCatalog);
  validateBoss(config.boss, source, issues);
  validateEventVariants(config, source, issues, requiredItemIds, eventCatalog);
  validateEventCoverage(config, source, issues, eventCatalog);
}

function validateMapEventCatalog(events, source, issues) {
  const eventCatalog = new Map();

  if (!Array.isArray(events) || events.length === 0) {
    issues.push(`${source}.events: must contain at least one event`);
    return eventCatalog;
  }

  events.forEach((eventConfig, index) => {
    const prefix = `${source}.events[${index}]`;
    if (!eventConfig || typeof eventConfig !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }
    if (requireString(eventConfig.name, `${prefix}.name`, issues)) {
      if (eventCatalog.has(eventConfig.name)) {
        issues.push(`${prefix}.name: duplicate event "${eventConfig.name}"`);
      } else {
        eventCatalog.set(eventConfig.name, eventConfig);
      }
    }
    if (!MAP_EVENT_TYPES.includes(eventConfig.type)) {
      issues.push(`${prefix}.type: expected one of ${MAP_EVENT_TYPES.join(", ")}`);
    }
    if (requireString(eventConfig.icon, `${prefix}.icon`, issues)) {
      validateCatalogAssetPath(eventConfig.icon, "data/Assets/icons/", `${prefix}.icon`, issues);
    }
  });

  return eventCatalog;
}

function validateMapLevels(config, source, issues, eventCatalog) {
  if (!Array.isArray(config.levels) || config.levels.length === 0) {
    issues.push(`${source}.levels: must contain at least one level`);
    return;
  }

  const levelNumbers = new Set();
  config.levels.forEach((level, index) => {
    const prefix = `${source}.levels[${index}]`;
    if (!level || typeof level !== "object") {
      issues.push(`${prefix}: level must be an object`);
      return;
    }

    if (requirePositiveInteger(level.level, `${prefix}.level`, issues)) {
      if (levelNumbers.has(level.level)) {
        issues.push(`${prefix}.level: duplicate level "${level.level}"`);
      }
      if (level.level !== index + 1) {
        issues.push(`${prefix}.level: expected ${index + 1} to keep map layout sequential`);
      }
      levelNumbers.add(level.level);
    }

    const nodeRange = validateLevelNodes(level.nodes, prefix, issues);
    validatePaths(level.paths, prefix, issues, config.pathRules);
    const eventSummary = validateLevelEvents(level.events, prefix, issues, eventCatalog);
    if (nodeRange && eventSummary.guaranteedCount > nodeRange.min) {
      issues.push(`${prefix}.events: guaranteed events cannot exceed min node count`);
    }
    if (nodeRange && eventSummary.guaranteedCount < nodeRange.max && eventSummary.randomWeightCount === 0) {
      issues.push(`${prefix}.events: random events need at least one positive weight when nodes can exceed guaranteed events`);
    }
  });
}

function validateLevelNodes(nodes, prefix, issues) {
  if (!nodes || typeof nodes !== "object") {
    issues.push(`${prefix}.nodes: must be an object`);
    return null;
  }

  if (nodes.count !== undefined) {
    requirePositiveInteger(nodes.count, `${prefix}.nodes.count`, issues);
    return Number.isInteger(nodes.count) ? { min: nodes.count, max: nodes.count } : null;
  }

  requirePositiveInteger(nodes.min, `${prefix}.nodes.min`, issues);
  requirePositiveInteger(nodes.max, `${prefix}.nodes.max`, issues);
  if (Number.isInteger(nodes.min) && Number.isInteger(nodes.max) && nodes.min > nodes.max) {
    issues.push(`${prefix}.nodes: min cannot be greater than max`);
  }
  return Number.isInteger(nodes.min) && Number.isInteger(nodes.max)
    ? { min: nodes.min, max: nodes.max }
    : null;
}

function validatePaths(paths, source, issues, defaultPathRules = null) {
  if (!paths || typeof paths !== "object") {
    issues.push(`${source}.paths: must be an object`);
    return;
  }

  requirePositiveInteger(paths.minConnectionsFromNode, `${source}.paths.minConnectionsFromNode`, issues);
  requirePositiveInteger(paths.maxConnectionsFromNode, `${source}.paths.maxConnectionsFromNode`, issues);
  requireNumberInRange(paths.extraConnectionChance, `${source}.paths.extraConnectionChance`, 0, 100, issues);
  if (paths.maxSinglePathChain !== undefined) {
    requirePositiveInteger(paths.maxSinglePathChain, `${source}.paths.maxSinglePathChain`, issues);
  }
  if (
    Number.isInteger(paths.minConnectionsFromNode) &&
    Number.isInteger(paths.maxConnectionsFromNode) &&
    paths.minConnectionsFromNode > paths.maxConnectionsFromNode
  ) {
    issues.push(`${source}.paths: minConnectionsFromNode cannot be greater than maxConnectionsFromNode`);
  }
  validateConnectionCountWeights(paths.connectionCountWeights, `${source}.paths.connectionCountWeights`, issues);
  validateEffectiveConnectionCountWeights(paths, defaultPathRules, `${source}.paths`, issues);
}

function validateMapPathRules(pathRules, source, issues) {
  if (pathRules === undefined) {
    return;
  }
  if (!pathRules || typeof pathRules !== "object" || Array.isArray(pathRules)) {
    issues.push(`${source}.pathRules: must be an object when present`);
    return;
  }
  validateConnectionCountWeights(
    pathRules.connectionCountWeights,
    `${source}.pathRules.connectionCountWeights`,
    issues,
  );
  if (pathRules.maxSinglePathChain !== undefined) {
    requirePositiveInteger(pathRules.maxSinglePathChain, `${source}.pathRules.maxSinglePathChain`, issues);
  }
}

function validateConnectionCountWeights(weights, path, issues) {
  if (weights === undefined) {
    return;
  }
  if (!Array.isArray(weights) || weights.length === 0) {
    issues.push(`${path}: must be a non-empty array when present`);
    return;
  }
  weights.forEach((entry, index) => {
    const prefix = `${path}[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(`${prefix}: must be an object`);
      return;
    }
    requireIntegerInRange(entry.count, `${prefix}.count`, 1, 30, issues);
    requirePositiveNumber(entry.weight, `${prefix}.weight`, issues);
  });
}

function validateEffectiveConnectionCountWeights(paths, defaultPathRules, path, issues) {
  const weights = paths.connectionCountWeights || defaultPathRules?.connectionCountWeights;
  if (!Array.isArray(weights)) {
    return;
  }
  if (!Number.isInteger(paths.minConnectionsFromNode) || !Number.isInteger(paths.maxConnectionsFromNode)) {
    return;
  }
  weights.forEach((entry, index) => {
    if (!Number.isInteger(entry?.count)) {
      return;
    }
    if (entry.count < paths.minConnectionsFromNode || entry.count > paths.maxConnectionsFromNode) {
      issues.push(
        `${path}.connectionCountWeights[${index}].count: expected from ${paths.minConnectionsFromNode} to ${paths.maxConnectionsFromNode} for this level`,
      );
    }
  });
}

function validateBoss(boss, source, issues) {
  if (boss === undefined || boss === null) {
    return;
  }
  if (Array.isArray(boss)) {
    if (boss.length === 0) {
      return;
    }
    issues.push(`${source}.boss: legacy boss config must be an object when present`);
    return;
  }
  if (typeof boss !== "object") {
    issues.push(`${source}.boss: must be an object`);
    return;
  }
  requireString(boss.enemyId, `${source}.boss.enemyId`, issues);
  validateBattleBackgroundField(boss.background, `${source}.boss.background`, issues);
  requireString(boss.nodeTitleTextKey, `${source}.boss.nodeTitleTextKey`, issues);
}

function validateLevelEvents(events, source, issues, eventCatalog) {
  const summary = {
    guaranteedCount: 0,
    randomWeightCount: 0,
  };

  if (!Array.isArray(events)) {
    issues.push(`${source}.events: must be an array`);
    return summary;
  }

  if (events.length === 0) {
    issues.push(`${source}.events: must contain at least one event`);
    return summary;
  }

  events.forEach((eventConfig, index) => {
    const prefix = `${source}.events[${index}]`;
    if (!eventConfig || typeof eventConfig !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }
    if (requireString(eventConfig.name, `${prefix}.name`, issues) && !eventCatalog.has(eventConfig.name)) {
      issues.push(`${prefix}.name: unknown event "${eventConfig.name}"`);
    }
    requireNumberInRange(eventConfig.weight, `${prefix}.weight`, 0, Infinity, issues);
    if (eventConfig.guaranteed !== undefined && typeof eventConfig.guaranteed !== "boolean") {
      issues.push(`${prefix}.guaranteed: expected boolean`);
    }

    if (eventConfig.guaranteed) {
      summary.guaranteedCount += 1;
    } else if (eventConfig.weight > 0) {
      summary.randomWeightCount += 1;
    }
  });

  if (summary.guaranteedCount === 0 && summary.randomWeightCount === 0) {
    issues.push(`${source}.events: at least one random event must have positive weight or one event must be guaranteed`);
  }
  return summary;
}

function validateEventVariants(config, source, issues, requiredItemIds, eventCatalog) {
  for (const eventType of MAP_EVENT_TYPES) {
    if (!Array.isArray(config[eventType])) {
      issues.push(`${source}.${eventType}: must be an array`);
      continue;
    }

    config[eventType].forEach((variant, index) => {
      const prefix = `${source}.${eventType}[${index}]`;
      if (requireString(variant.eventName, `${prefix}.eventName`, issues)) {
        const catalogEvent = eventCatalog.get(variant.eventName);
        if (!catalogEvent) {
          issues.push(`${prefix}.eventName: unknown event "${variant.eventName}"`);
        } else if (catalogEvent.type !== eventType) {
          issues.push(`${prefix}.eventName: event "${variant.eventName}" has type "${catalogEvent.type}", expected "${eventType}"`);
        }
      }
      requirePositiveInteger(variant.minLevel, `${prefix}.minLevel`, issues);
      requirePositiveInteger(variant.maxLevel, `${prefix}.maxLevel`, issues);
      requirePositiveNumber(variant.weight, `${prefix}.weight`, issues);
      if (
        Number.isInteger(variant.minLevel) &&
        Number.isInteger(variant.maxLevel) &&
        variant.minLevel > variant.maxLevel
      ) {
        issues.push(`${prefix}: minLevel cannot be greater than maxLevel`);
      }

      if (eventType === "skip") {
        requireString(variant.textKey, `${prefix}.textKey`, issues);
      } else if (eventType === "shop") {
        requireString(variant.dialogTextKey, `${prefix}.dialogTextKey`, issues);
        validateEventImageField(variant.eventImage, `${prefix}.eventImage`, issues);
        if (!Array.isArray(variant.items) || variant.items.length === 0) {
          issues.push(`${prefix}.items: must contain at least one item`);
        } else {
          variant.items.forEach((item, itemIndex) => {
            requireString(item.itemId, `${prefix}.items[${itemIndex}].itemId`, issues);
            requirePositiveInteger(item.amount ?? 1, `${prefix}.items[${itemIndex}].amount`, issues);
            requireNumberInRange(item.goldPrice, `${prefix}.items[${itemIndex}].goldPrice`, 0, Infinity, issues);
          });
        }
      } else if (eventType === "heal") {
        requireString(variant.dialogTextKey, `${prefix}.dialogTextKey`, issues);
        validateEventImageField(variant.eventImage, `${prefix}.eventImage`, issues);
        requireNumberInRange(variant.healPercent, `${prefix}.healPercent`, 0, 100, issues);
        requireNumberInRange(variant.goldPrice, `${prefix}.goldPrice`, 0, Infinity, issues);
      } else if (eventType === "battle") {
        requireString(variant.enemyId, `${prefix}.enemyId`, issues);
        if (variant.background !== undefined) {
          validateBattleBackgroundField(variant.background, `${prefix}.background`, issues);
        }
        validateBattleTutorialConfig(variant.tutorial, `${prefix}.tutorial`, issues, requiredItemIds);
      } else if (eventType === "reward") {
        validateRewardConfig(variant, prefix, issues, requiredItemIds);
      } else if (eventType === "dialog") {
        validateDialogConfig(variant, prefix, issues, eventCatalog);
      }
    });
  }
}

function validateBattleTutorialConfig(tutorial, path, issues, requiredItemIds) {
  if (tutorial === undefined) {
    return;
  }
  if (!tutorial || typeof tutorial !== "object" || Array.isArray(tutorial)) {
    issues.push(`${path}: must be an object when present`);
    return;
  }
  if (tutorial.enabled !== undefined && typeof tutorial.enabled !== "boolean") {
    issues.push(`${path}.enabled: expected boolean`);
  }
  requireString(tutorial.titleTextKey, `${path}.titleTextKey`, issues);
  requireString(tutorial.wrongMoveTextKey, `${path}.wrongMoveTextKey`, issues);
  if (requireString(tutorial.teacherImage, `${path}.teacherImage`, issues)) {
    validateCatalogAssetPath(tutorial.teacherImage, "data/Assets/enemy/", `${path}.teacherImage`, issues);
  }
  validateBattleTutorialInventoryQuantities(
    tutorial.playerInventoryQuantities,
    `${path}.playerInventoryQuantities`,
    issues,
    requiredItemIds,
  );
  if (!Array.isArray(tutorial.steps) || tutorial.steps.length === 0) {
    issues.push(`${path}.steps: must contain at least one tutorial step`);
    return;
  }

  const stepIds = new Set();
  tutorial.steps.forEach((step, stepIndex) => {
    const stepPath = `${path}.steps[${stepIndex}]`;
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      issues.push(`${stepPath}: must be an object`);
      return;
    }
    if (requireString(step.id, `${stepPath}.id`, issues)) {
      if (stepIds.has(step.id)) {
        issues.push(`${stepPath}.id: duplicate step "${step.id}"`);
      }
      stepIds.add(step.id);
    }
    requireString(step.textKey, `${stepPath}.textKey`, issues);
    if (!["swap", "battery", "shuffle"].includes(step.action)) {
      issues.push(`${stepPath}.action: expected one of swap, battery, shuffle`);
    }
    if (step.wrongTextKey !== undefined) {
      requireString(step.wrongTextKey, `${stepPath}.wrongTextKey`, issues);
    }

    const boardSize = validateBattleTutorialBoard(step.board, `${stepPath}.board`, issues, requiredItemIds);
    for (const field of [
      "playerHealthCurrent",
      "playerHealCurrent",
      "enemyHealthCurrent",
      "enemyAggressionCurrent",
    ]) {
      if (step[field] !== undefined) {
        requireNumberInRange(step[field], `${stepPath}.${field}`, 0, Infinity, issues);
      }
    }
    if (step.action === "swap" || step.action === "battery") {
      validateBattleTutorialCell(step.from, `${stepPath}.from`, issues, boardSize);
      validateBattleTutorialCell(step.to, `${stepPath}.to`, issues, boardSize);
      const minMatchCells = step.action === "swap" ? 3 : 2;
      if (!Array.isArray(step.matchCells) || step.matchCells.length < minMatchCells) {
        issues.push(`${stepPath}.matchCells: ${step.action} steps must contain at least ${minMatchCells} cells`);
      } else {
        step.matchCells.forEach((cell, cellIndex) => {
          validateBattleTutorialCell(cell, `${stepPath}.matchCells[${cellIndex}]`, issues, boardSize);
        });
      }
    }
  });
}

function validateBattleTutorialInventoryQuantities(quantities, path, issues, requiredItemIds) {
  if (quantities === undefined) {
    return;
  }
  if (!quantities || typeof quantities !== "object" || Array.isArray(quantities)) {
    issues.push(`${path}: must be an object when present`);
    return;
  }
  for (const [itemId, quantity] of Object.entries(quantities)) {
    requireString(itemId, `${path}: itemId`, issues);
    requireNumberInRange(quantity, `${path}.${itemId}`, 0, Infinity, issues);
    requiredItemIds.add(itemId);
  }
}

function validateBattleTutorialBoard(board, path, issues, requiredItemIds) {
  if (!Array.isArray(board) || board.length === 0 || !Array.isArray(board[0]) || board[0].length === 0) {
    issues.push(`${path}: must be a non-empty rectangular matrix`);
    return null;
  }
  const width = board[0].length;
  board.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== width) {
      issues.push(`${path}[${rowIndex}]: expected ${width} cells`);
      return;
    }
    row.forEach((itemId, colIndex) => {
      if (requireString(itemId, `${path}[${rowIndex}][${colIndex}]`, issues)) {
        requiredItemIds.add(itemId);
      }
    });
  });
  return { width, height: board.length };
}

function validateBattleTutorialCell(cell, path, issues, boardSize) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
    issues.push(`${path}: must be an object with row and col`);
    return;
  }
  const maxRow = boardSize ? boardSize.height - 1 : Infinity;
  const maxCol = boardSize ? boardSize.width - 1 : Infinity;
  requireIntegerInRange(cell.row, `${path}.row`, 0, maxRow, issues);
  requireIntegerInRange(cell.col, `${path}.col`, 0, maxCol, issues);
}

function validateDialogConfig(dialogConfig, path, issues, eventCatalog) {
  if (requireString(dialogConfig.characterImage, `${path}.characterImage`, issues)) {
    validateCatalogAssetPath(dialogConfig.characterImage, "data/Assets/enemy/", `${path}.characterImage`, issues);
  }
  if (dialogConfig.characterNameTextKey !== undefined) {
    requireString(dialogConfig.characterNameTextKey, `${path}.characterNameTextKey`, issues);
  }
  if (dialogConfig.characterWidthPct !== undefined) {
    requireNumberInRange(dialogConfig.characterWidthPct, `${path}.characterWidthPct`, 1, 300, issues);
  } else {
    requireNumberInRange(dialogConfig.characterWidthPx, `${path}.characterWidthPx`, 1, Infinity, issues);
  }
  requireNumberInRange(dialogConfig.characterCenterXPct, `${path}.characterCenterXPct`, 0, 100, issues);
  if (dialogConfig.characterCenterYPct !== undefined) {
    requireNumberInRange(dialogConfig.characterCenterYPct, `${path}.characterCenterYPct`, 0, 100, issues);
  } else {
    requireNumberInRange(dialogConfig.characterBottomPx, `${path}.characterBottomPx`, 0, Infinity, issues);
  }
  if (dialogConfig.initialStepId !== undefined) {
    requireString(dialogConfig.initialStepId, `${path}.initialStepId`, issues);
  }
  if (!Array.isArray(dialogConfig.steps) || dialogConfig.steps.length === 0) {
    issues.push(`${path}.steps: must contain at least one dialog step`);
    return;
  }

  const stepIds = new Set();
  dialogConfig.steps.forEach((step, stepIndex) => {
    const stepPath = `${path}.steps[${stepIndex}]`;
    if (!step || typeof step !== "object") {
      issues.push(`${stepPath}: must be an object`);
      return;
    }
    if (requireString(step.stepId, `${stepPath}.stepId`, issues)) {
      if (stepIds.has(step.stepId)) {
        issues.push(`${stepPath}.stepId: duplicate step "${step.stepId}"`);
      }
      stepIds.add(step.stepId);
    }
    requireString(step.textKey, `${stepPath}.textKey`, issues);
    if (!Array.isArray(step.answers) || step.answers.length === 0) {
      issues.push(`${stepPath}.answers: must contain at least one answer`);
      return;
    }
    step.answers.forEach((answer, answerIndex) => {
      const answerPath = `${stepPath}.answers[${answerIndex}]`;
      if (!answer || typeof answer !== "object") {
        issues.push(`${answerPath}: must be an object`);
        return;
      }
      requireString(answer.textKey, `${answerPath}.textKey`, issues);
      const actionCount = [answer.nextStepId, answer.eventName, answer.end === true].filter(Boolean).length;
      if (actionCount !== 1) {
        issues.push(`${answerPath}: expected exactly one of nextStepId, eventName or end=true`);
      }
      if (answer.nextStepId !== undefined) {
        requireString(answer.nextStepId, `${answerPath}.nextStepId`, issues);
      }
      if (answer.eventName !== undefined && requireString(answer.eventName, `${answerPath}.eventName`, issues) && !eventCatalog.has(answer.eventName)) {
        issues.push(`${answerPath}.eventName: unknown event "${answer.eventName}"`);
      }
    });
  });

  if (dialogConfig.initialStepId && !stepIds.has(dialogConfig.initialStepId)) {
    issues.push(`${path}.initialStepId: unknown step "${dialogConfig.initialStepId}"`);
  }
  dialogConfig.steps.forEach((step, stepIndex) => {
    step?.answers?.forEach((answer, answerIndex) => {
      if (answer.nextStepId && !stepIds.has(answer.nextStepId)) {
        issues.push(`${path}.steps[${stepIndex}].answers[${answerIndex}].nextStepId: unknown step "${answer.nextStepId}"`);
      }
    });
  });
}

function validateEventCoverage(config, source, issues, eventCatalog) {
  // Проверяем не только наличие имени события в каталоге, но и то, что для
  // активного уровня есть подходящий payload-variant. Иначе карта сгенерирует
  // node, который невозможно корректно открыть.
  if (!Array.isArray(config.levels)) {
    return;
  }

  for (const [index, level] of config.levels.entries()) {
    const levelNumber = level?.level;
    if (!Number.isInteger(levelNumber) || !Array.isArray(level.events)) {
      continue;
    }
    for (const eventConfig of level.events) {
      const catalogEvent = eventCatalog.get(eventConfig?.name);
      const eventType = catalogEvent?.type;
      const isActive = eventConfig?.guaranteed === true || (eventConfig?.weight || 0) > 0;
      if (!MAP_EVENT_TYPES.includes(eventType) || !isActive) {
        continue;
      }
      const variants = Array.isArray(config[eventType]) ? config[eventType] : [];
      const hasVariant = variants.some(
        (variant) =>
          variant.eventName === eventConfig.name &&
          levelNumber >= variant.minLevel &&
          levelNumber <= variant.maxLevel,
      );
      if (!hasVariant) {
        issues.push(`${source}.levels[${index}].events[${eventConfig.name}]: no ${eventType} variant for level ${levelNumber}`);
      }
      if (eventType === "dialog") {
        validateDialogLinkedEventCoverage(
          config,
          source,
          issues,
          eventCatalog,
          variants,
          eventConfig.name,
          levelNumber,
          index,
        );
      }
    }
  }
}

function validateDialogLinkedEventCoverage(config, source, issues, eventCatalog, dialogVariants, eventName, levelNumber, levelIndex) {
  dialogVariants.forEach((dialogVariant, dialogVariantIndex) => {
    if (
      dialogVariant.eventName !== eventName ||
      levelNumber < dialogVariant.minLevel ||
      levelNumber > dialogVariant.maxLevel
    ) {
      return;
    }
    const linkedEventNames = getDialogLinkedEventNames(dialogVariant);
    for (const linkedEventName of linkedEventNames) {
      const linkedEvent = eventCatalog.get(linkedEventName);
      if (!linkedEvent) {
        continue;
      }
      const linkedVariants = Array.isArray(config[linkedEvent.type]) ? config[linkedEvent.type] : [];
      const hasLinkedVariant = linkedVariants.some(
        (variant) =>
          variant.eventName === linkedEventName &&
          levelNumber >= variant.minLevel &&
          levelNumber <= variant.maxLevel,
      );
      if (!hasLinkedVariant) {
        issues.push(
          `${source}.levels[${levelIndex}].events[${eventName}].dialog[${dialogVariantIndex}]: no ${linkedEvent.type} variant for linked event "${linkedEventName}" at level ${levelNumber}`,
        );
      }
    }
  });
}

function getDialogLinkedEventNames(dialogVariant) {
  const eventNames = new Set();
  for (const step of dialogVariant.steps || []) {
    for (const answer of step?.answers || []) {
      if (typeof answer?.eventName === "string" && answer.eventName.trim() !== "") {
        eventNames.add(answer.eventName);
      }
    }
  }
  return eventNames;
}
