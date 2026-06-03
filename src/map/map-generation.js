export function generateMap(config) {
  const eventCatalog = getMapEventCatalog(config);
  const levelConfigs = getMapLevelConfigs(config);
  const levels = [];

  for (const levelConfig of levelConfigs) {
    const levelNumber = levelConfig.level;
    const nodeCount = getLevelNodeCount(levelConfig);
    const eventConfigs = pickLevelEvents(levelConfig, nodeCount, eventCatalog);
    const nodes = eventConfigs.map((eventConfig, index) =>
      createNode(config, levelNumber, index + 1, eventConfig),
    );
    levels.push({ level: levelNumber, nodes });
  }

  let singlePathDepths = new Map(levels[0]?.nodes.map((node) => [node.id, 0]) || []);
  for (let index = 0; index < levels.length - 1; index += 1) {
    singlePathDepths = connectLevels(
      levels[index].nodes,
      levels[index + 1].nodes,
      getLevelPathConfig(config, levelConfigs[index], singlePathDepths),
    );
  }

  return { levels };
}

export function getMapLevelSummary(config) {
  const levelConfigs = getMapLevelConfigs(config);
  const ranges = levelConfigs.map((levelConfig) => getLevelNodeRange(levelConfig));
  return {
    count: levelConfigs.length,
    minNodes: Math.min(...ranges.map((range) => range.min)),
    maxNodes: Math.max(...ranges.map((range) => range.max)),
  };
}

function getMapLevelConfigs(config) {
  return Array.isArray(config.levels) ? config.levels : [];
}

function getLevelPathConfig(config, levelConfig, singlePathDepths = new Map()) {
  const pathRules = config.pathRules && typeof config.pathRules === "object"
    ? config.pathRules
    : {};
  const levelPaths = levelConfig.paths && typeof levelConfig.paths === "object"
    ? levelConfig.paths
    : {};
  return {
    ...levelPaths,
    connectionCountWeights:
      levelPaths.connectionCountWeights ||
      pathRules.connectionCountWeights ||
      null,
    maxSinglePathChain: levelPaths.maxSinglePathChain || pathRules.maxSinglePathChain || null,
    singlePathDepths,
  };
}

function getMapEventCatalog(config) {
  const events = Array.isArray(config.events) ? config.events : [];
  return new Map(events.map((eventConfig) => [eventConfig.name, eventConfig]));
}

function getLevelNodeRange(levelConfig) {
  if (Number.isInteger(levelConfig.nodes?.count)) {
    return {
      min: levelConfig.nodes.count,
      max: levelConfig.nodes.count,
    };
  }
  return {
    min: levelConfig.nodes.min,
    max: levelConfig.nodes.max,
  };
}

function getLevelNodeCount(levelConfig) {
  const range = getLevelNodeRange(levelConfig);
  return randomInt(range.min, range.max);
}

function pickLevelEvents(levelConfig, nodeCount, eventCatalog) {
  const resolveEvent = (levelEvent) => {
    const eventConfig = eventCatalog.get(levelEvent.name);
    if (!eventConfig) {
      throw new Error(`level ${levelConfig.level}: unknown event "${levelEvent.name}"`);
    }
    return eventConfig;
  };

  const guaranteedEvents = [];
  for (const levelEvent of levelConfig.events) {
    if (!levelEvent.guaranteed) {
      continue;
    }
    guaranteedEvents.push(resolveEvent(levelEvent));
  }

  if (guaranteedEvents.length > nodeCount) {
    throw new Error(`level ${levelConfig.level}: guaranteed events exceed node count`);
  }

  const randomEvents = levelConfig.events.filter(
    (levelEvent) => !levelEvent.guaranteed && levelEvent.weight > 0,
  );
  const pickedEvents = [...guaranteedEvents];
  while (pickedEvents.length < nodeCount) {
    pickedEvents.push(resolveEvent(pickMapEvent(randomEvents)));
  }

  return shuffleArray(pickedEvents);
}

function createNode(config, levelNumber, index, eventConfig) {
  const eventType = eventConfig.type;
  return {
    id: `L${levelNumber}_N${index}`,
    level: levelNumber,
    eventName: eventConfig.name,
    eventType,
    eventIcon: eventConfig.icon,
    payload: pickEventPayload(config, eventConfig.name, eventType, levelNumber),
    connectedTo: [],
  };
}

function pickEventPayload(config, eventName, eventType, levelNumber) {
  const variants = Array.isArray(config[eventType]) ? config[eventType] : [];
  const available = variants.filter(
    (variant) =>
      variant.eventName === eventName &&
      levelNumber >= variant.minLevel &&
      levelNumber <= variant.maxLevel,
  );
  if (available.length === 0) {
    return {};
  }
  return pickWeightedArray(available);
}

function connectLevels(currentNodes, nextNodes, pathConfig) {
  const connectionSets = new Map(currentNodes.map((node) => [node.id, new Set()]));
  const sourceIndexById = new Map(currentNodes.map((node, index) => [node.id, index]));
  const targetIndexById = new Map(nextNodes.map((node, index) => [node.id, index]));
  const minConnections = Math.min(pathConfig.minConnectionsFromNode, nextNodes.length);
  const maxConnections = Math.min(pathConfig.maxConnectionsFromNode, nextNodes.length);
  const desiredConnectionCounts = new Map(
    currentNodes.map((node) => [
      node.id,
      pickDesiredConnectionCount(pathConfig, minConnections, maxConnections, node.id),
    ]),
  );

  for (const [sourceIndex, node] of currentNodes.entries()) {
    const primaryTarget = nextNodes[getProjectedIndex(sourceIndex, currentNodes.length, nextNodes.length)];
    connectionSets.get(node.id).add(primaryTarget.id);
  }

  for (const [targetIndex, target] of nextNodes.entries()) {
    const hasIncomingConnection = [...connectionSets.values()].some((targets) =>
      targets.has(target.id),
    );
    if (!hasIncomingConnection) {
      const primarySource = currentNodes[getProjectedIndex(targetIndex, nextNodes.length, currentNodes.length)];
      const sources = [
        primarySource,
        ...getOrderedSourcesForTarget(target, nextNodes, currentNodes).filter((source) =>
          source.id !== primarySource.id
        ),
      ];
      const readableSource = sources.find((source) =>
        addConnectionIfReadable(
          connectionSets,
          source.id,
          target.id,
          sourceIndexById,
          targetIndexById,
        ),
      );
      if (!readableSource) {
        connectionSets.get(sources[0].id).add(target.id);
      }
    }
  }

  for (const [sourceIndex, node] of getConnectionGrowthOrder(
    currentNodes,
    desiredConnectionCounts,
    pathConfig.singlePathDepths,
  )) {
    const nearbyTargets = getOrderedTargets(sourceIndex, currentNodes.length, nextNodes);
    const desiredConnections = desiredConnectionCounts.get(node.id) || minConnections;
    for (const target of nearbyTargets) {
      const targets = connectionSets.get(node.id);
      if (targets.size >= desiredConnections) {
        break;
      }
      addConnectionIfReadable(
        connectionSets,
        node.id,
        target.id,
        sourceIndexById,
        targetIndexById,
      );
    }
    for (const target of nearbyTargets) {
      const targets = connectionSets.get(node.id);
      if (
        targets.size < maxConnections &&
        !targets.has(target.id) &&
        Math.random() * 100 < pathConfig.extraConnectionChance &&
        !wouldConnectionCross(
          connectionSets,
          node.id,
          target.id,
          sourceIndexById,
          targetIndexById,
        )
      ) {
        targets.add(target.id);
      }
    }
  }

  for (const node of currentNodes) {
    node.connectedTo = [...connectionSets.get(node.id)].sort(compareNodeIds);
  }
  return getNextSinglePathDepths(currentNodes, nextNodes, pathConfig.singlePathDepths);
}

function getConnectionGrowthOrder(nodes, desiredConnectionCounts, singlePathDepths = new Map()) {
  const center = (nodes.length - 1) / 2;
  return [...nodes.entries()].sort(([indexA, nodeA], [indexB, nodeB]) => {
    const desiredDiff =
      (desiredConnectionCounts.get(nodeB.id) || 0) -
      (desiredConnectionCounts.get(nodeA.id) || 0);
    if (desiredDiff !== 0) {
      return desiredDiff;
    }
    const depthDiff = (singlePathDepths.get(nodeB.id) || 0) - (singlePathDepths.get(nodeA.id) || 0);
    if (depthDiff !== 0) {
      return depthDiff;
    }
    return Math.abs(indexA - center) - Math.abs(indexB - center) || compareNodeIds(nodeA.id, nodeB.id);
  });
}

function pickDesiredConnectionCount(pathConfig, minConnections, maxConnections, nodeId = null) {
  const weights = Array.isArray(pathConfig.connectionCountWeights)
    ? pathConfig.connectionCountWeights.filter((entry) =>
        Number.isInteger(entry?.count) && entry.count > 0 && entry.weight > 0
      )
    : [];
  let desiredCount = minConnections;

  if (weights.length > 0) {
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of weights) {
      roll -= entry.weight;
      if (roll <= 0) {
        desiredCount = clamp(entry.count, minConnections, maxConnections);
        break;
      }
    }
    if (roll > 0) {
      desiredCount = clamp(weights.at(-1).count, minConnections, maxConnections);
    }
  }

  const maxSinglePathChain = getMaxSinglePathChain(pathConfig);
  const singlePathDepth = nodeId ? pathConfig.singlePathDepths?.get(nodeId) || 0 : 0;
  if (singlePathDepth >= maxSinglePathChain - 1) {
    desiredCount = Math.max(desiredCount, Math.min(2, maxConnections));
  }

  return desiredCount;
}

function getMaxSinglePathChain(pathConfig) {
  return Number.isInteger(pathConfig.maxSinglePathChain) && pathConfig.maxSinglePathChain > 0
    ? pathConfig.maxSinglePathChain
    : Number.POSITIVE_INFINITY;
}

function getNextSinglePathDepths(currentNodes, nextNodes, currentDepths = new Map()) {
  const nextDepths = new Map(nextNodes.map((node) => [node.id, 0]));
  for (const node of currentNodes) {
    const depth = currentDepths.get(node.id) || 0;
    const nextDepth = node.connectedTo.length === 1 ? depth + 1 : 0;
    for (const targetId of node.connectedTo) {
      nextDepths.set(targetId, Math.max(nextDepths.get(targetId) || 0, nextDepth));
    }
  }
  return nextDepths;
}

function getProjectedIndex(index, sourceCount, targetCount) {
  if (targetCount <= 1) {
    return 0;
  }
  if (sourceCount <= 1) {
    return Math.floor((targetCount - 1) / 2);
  }
  return Math.max(0, Math.min(targetCount - 1, Math.round((index / (sourceCount - 1)) * (targetCount - 1))));
}

function addConnectionIfReadable(connectionSets, sourceId, targetId, sourceIndexById, targetIndexById) {
  const targets = connectionSets.get(sourceId);
  if (!targets || targets.has(targetId)) {
    return false;
  }
  if (wouldConnectionCross(connectionSets, sourceId, targetId, sourceIndexById, targetIndexById)) {
    return false;
  }
  targets.add(targetId);
  return true;
}

function wouldConnectionCross(connectionSets, sourceId, targetId, sourceIndexById, targetIndexById) {
  const sourceIndex = sourceIndexById.get(sourceId);
  const targetIndex = targetIndexById.get(targetId);
  if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) {
    return false;
  }

  for (const [otherSourceId, otherTargets] of connectionSets.entries()) {
    const otherSourceIndex = sourceIndexById.get(otherSourceId);
    if (!Number.isInteger(otherSourceIndex) || otherSourceIndex === sourceIndex) {
      continue;
    }
    for (const otherTargetId of otherTargets) {
      const otherTargetIndex = targetIndexById.get(otherTargetId);
      if (!Number.isInteger(otherTargetIndex) || otherTargetIndex === targetIndex) {
        continue;
      }
      if (
        (sourceIndex < otherSourceIndex && targetIndex > otherTargetIndex) ||
        (sourceIndex > otherSourceIndex && targetIndex < otherTargetIndex)
      ) {
        return true;
      }
    }
  }
  return false;
}

function pickMapEvent(events) {
  const entries = events.filter((event) => event.weight > 0);
  if (entries.length === 0) {
    throw new Error("event must contain at least one positive weight");
  }
  const total = entries.reduce((sum, event) => sum + event.weight, 0);
  let roll = Math.random() * total;
  for (const event of entries) {
    roll -= event.weight;
    if (roll <= 0) {
      return event;
    }
  }
  return entries.at(-1);
}

function shuffleArray(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function pickWeightedArray(items) {
  const weightedItems = items.filter((item) => item.weight > 0);
  if (weightedItems.length === 0) {
    throw new Error("weighted array must contain at least one positive weight");
  }
  const total = weightedItems.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of weightedItems) {
    roll -= item.weight;
    if (roll <= 0) {
      return structuredClone(item);
    }
  }
  return structuredClone(weightedItems.at(-1));
}

function getOrderedTargets(sourceIndex, sourceCount, targets) {
  const sourceRatio = sourceCount === 1 ? 0.5 : sourceIndex / (sourceCount - 1);
  return [...targets].sort((a, b) => {
    const aDistance = Math.abs(getNodeRatio(a, targets) - sourceRatio);
    const bDistance = Math.abs(getNodeRatio(b, targets) - sourceRatio);
    return aDistance - bDistance || compareNodeIds(a.id, b.id);
  });
}

function getOrderedSourcesForTarget(target, targets, sources) {
  const targetRatio = getNodeRatio(target, targets);
  return [...sources].sort((a, b) => {
    const aDistance = Math.abs(getNodeRatio(a, sources) - targetRatio);
    const bDistance = Math.abs(getNodeRatio(b, sources) - targetRatio);
    return aDistance - bDistance || compareNodeIds(a.id, b.id);
  });
}

function getNodeRatio(node, nodes) {
  const index = nodes.findIndex((candidate) => candidate.id === node.id);
  return nodes.length === 1 ? 0.5 : index / (nodes.length - 1);
}

function compareNodeIds(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}
