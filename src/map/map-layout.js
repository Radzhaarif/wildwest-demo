export function createMapLayoutController(deps) {
  const {
    state,
    compareNodeIds,
    getPositiveNumber,
  } = deps;

  function getMapHeight() {
    const levelCount = state.generatedMap.levels.length;
    return Math.max(980, levelCount * 170);
  }

  function getNodePositions() {
    // Карта вертикальная: уровень 1 визуально ниже, босс выше. Координаты в
    // процентах, чтобы SVG-линии и кнопки точек совпадали при изменении размера.
    const positions = new Map();
    const levelCount = state.generatedMap.levels.length;
    const orderedLevels = getMapLayoutOrderedLevels();

    for (const level of orderedLevels) {
      const y = 92 - (level.level / (levelCount + 1)) * 82;
      level.nodes.forEach((node, index) => {
        const baseX = ((index + 1) / (level.nodes.length + 1)) * 78 + 11;
        const jitter = getStableNodeJitter(node);
        const maxOrderSafeJitter = Math.max(0, 78 / (level.nodes.length + 1) / 2 - 2);
        const x = clamp(baseX + clamp(jitter.x, -maxOrderSafeJitter, maxOrderSafeJitter), 9, 91);
        positions.set(node.id, { x, y: clamp(y + jitter.y, 8, 92), node });
      });
    }

    return positions;
  }

  function getMapLayoutOrderedLevels() {
    const orderedLevels = state.generatedMap.levels.map((level) => ({
      level: level.level,
      nodes: [...level.nodes],
    }));
    const layoutPasses = getMapLayoutPasses();

    for (let pass = 0; pass < layoutPasses; pass += 1) {
      for (let index = 1; index < orderedLevels.length; index += 1) {
        orderedLevels[index].nodes = orderLevelByNeighborBarycenter(
          orderedLevels[index].nodes,
          orderedLevels[index - 1].nodes,
          "incoming",
        );
      }
      for (let index = orderedLevels.length - 2; index >= 0; index -= 1) {
        orderedLevels[index].nodes = orderLevelByNeighborBarycenter(
          orderedLevels[index].nodes,
          orderedLevels[index + 1].nodes,
          "outgoing",
        );
      }
    }

    return orderedLevels;
  }

  function orderLevelByNeighborBarycenter(nodes, neighborNodes, direction) {
    const neighborIndexById = new Map(neighborNodes.map((node, index) => [node.id, index]));
    return [...nodes].sort((a, b) => {
      return getNodeBarycenter(a, neighborIndexById, direction) -
        getNodeBarycenter(b, neighborIndexById, direction) ||
        compareNodeIds(a.id, b.id);
    });
  }

  function getNodeBarycenter(node, neighborIndexById, direction) {
    const indexes = [];
    if (direction === "outgoing") {
      for (const targetId of node.connectedTo) {
        if (neighborIndexById.has(targetId)) {
          indexes.push(neighborIndexById.get(targetId));
        }
      }
    } else {
      for (const level of state.generatedMap.levels) {
        for (const sourceNode of level.nodes) {
          if (sourceNode.connectedTo.includes(node.id) && neighborIndexById.has(sourceNode.id)) {
            indexes.push(neighborIndexById.get(sourceNode.id));
          }
        }
      }
    }
    if (indexes.length === 0) {
      return Number.MAX_SAFE_INTEGER;
    }
    return indexes.reduce((sum, index) => sum + index, 0) / indexes.length;
  }

  function getMapLayoutPasses() {
    return Math.max(0, Math.trunc(getPositiveNumber(state.mapUiConfig?.nodes?.layoutPasses, 0)));
  }

  function getStableNodeJitter(node) {
    // Разброс строится от id точки, а не от Math.random(), чтобы карта не дергалась
    // при каждом render(), смене языка или обновлении HUD.
    const jitter = getMapNodeJitterConfig();
    return {
      x: hashToRange(`${state.mapConfig.id}:${node.id}:x`, jitter.x.min, jitter.x.max),
      y: hashToRange(`${state.mapConfig.id}:${node.id}:y`, jitter.y.min, jitter.y.max),
    };
  }

  function getMapNodeJitterConfig() {
    const source = state.mapUiConfig?.nodes?.positionJitterPct || {};
    return {
      x: getNumberRangeConfig(source.x, -8.5, 8.5),
      y: getNumberRangeConfig(source.y, -2.2, 2.2),
    };
  }

  function getNumberRangeConfig(range, fallbackMin, fallbackMax) {
    if (!range || typeof range !== "object") {
      return { min: fallbackMin, max: fallbackMax };
    }
    const min = Number(range.min);
    const max = Number(range.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: fallbackMin, max: fallbackMax };
    }
    return min <= max ? { min, max } : { min: max, max: min };
  }

  function hashToRange(seed, min, max) {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const ratio = (hash >>> 0) / 4294967295;
    return min + (max - min) * ratio;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function orderNodesByConnectionScore(nodes) {
    // Узлы с большим количеством входящих/исходящих связей ставятся ближе к
    // центру уровня, чтобы развилки выглядели естественнее и меньше путали игрока.
    const centerFirstSlots = getCenterFirstSlots(nodes.length);
    const sortedByScore = [...nodes].sort((a, b) => {
      return getConnectionScore(b) - getConnectionScore(a) || compareNodeIds(a.id, b.id);
    });
    const ordered = Array(nodes.length);

    sortedByScore.forEach((node, index) => {
      ordered[centerFirstSlots[index]] = node;
    });

    return ordered;
  }

  function getCenterFirstSlots(count) {
    return Array.from({ length: count }, (_, index) => index).sort((a, b) => {
      const center = (count - 1) / 2;
      return Math.abs(a - center) - Math.abs(b - center) || a - b;
    });
  }

  function getConnectionScore(node) {
    return getIncomingConnectionCount(node.id) + node.connectedTo.length;
  }

  function getIncomingConnectionCount(nodeId) {
    let count = 0;
    for (const level of state.generatedMap.levels) {
      for (const node of level.nodes) {
        if (node.connectedTo.includes(nodeId)) {
          count += 1;
        }
      }
    }
    return count;
  }

  return {
    getMapHeight,
    getNodePositions,
    getIncomingConnectionCount,
    orderNodesByConnectionScore,
  };
}
