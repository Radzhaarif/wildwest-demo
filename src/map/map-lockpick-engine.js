export const LOCKPICK_RING_COUNT = 5;
export const LOCKPICK_SECTOR_COUNT = 12;
export const LOCKPICK_STEP_DEGREES = 30;
export const LOCKPICK_SCRAMBLE_MIN_MOVES = 9;
export const LOCKPICK_SCRAMBLE_MAX_MOVES = 18;
export const LOCKPICK_MIN_SOLUTION_MOVES = 6;

const CLOCKWISE = 1;
const COUNTERCLOCKWISE = -1;

export function generateLockpickPuzzle(options = {}) {
  const random = typeof options.random === "function" ? options.random : Math.random;
  const ringCount = options.ringCount || LOCKPICK_RING_COUNT;
  const sectorCount = options.sectorCount || LOCKPICK_SECTOR_COUNT;
  const scrambleMinMoves = options.scrambleMinMoves || LOCKPICK_SCRAMBLE_MIN_MOVES;
  const scrambleMaxMoves = options.scrambleMaxMoves || LOCKPICK_SCRAMBLE_MAX_MOVES;
  const minimumSolutionMoves = options.minimumSolutionMoves || LOCKPICK_MIN_SOLUTION_MOVES;
  const maxAttempts = options.maxAttempts || 1200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const relations = generateLockpickRelations({ random, ringCount });
    const bumpOffsets = generateLockpickBumpOffsets({ random, ringCount, sectorCount });
    const scrambleMoveCount = randomInt(scrambleMinMoves, scrambleMaxMoves, random);
    const scramble = createSafeScramble({
      random,
      ringCount,
      sectorCount,
      relations,
      bumpOffsets,
      moveCount: scrambleMoveCount,
    });
    if (!scramble) {
      continue;
    }

    const shortestSolutionMoves = findShortestSafeLockpickSolutionDistance({
      positions: scramble.positions,
      relations,
      bumpOffsets,
      sectorCount,
      maxDepth: scrambleMoveCount,
    });
    if (shortestSolutionMoves < minimumSolutionMoves) {
      continue;
    }

    const puzzle = {
      ringCount,
      sectorCount,
      stepDegrees: 360 / sectorCount,
      relations,
      bumpOffsets,
      startPositions: scramble.positions,
      scrambleMoveCount,
      shortestSolutionMoves,
    };
    if (options.includeSolution === true) {
      puzzle.solutionActions = [...scramble.actions]
        .reverse()
        .map(invertLockpickAction);
    }
    return puzzle;
  }

  throw new Error(`Lockpick puzzle generation failed after ${maxAttempts} attempts.`);
}

export function generateLockpickRelations(options = {}) {
  const random = typeof options.random === "function" ? options.random : Math.random;
  const ringCount = options.ringCount || LOCKPICK_RING_COUNT;
  const maxAttempts = options.maxAttempts || 800;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const ringIndices = Array.from({ length: ringCount }, (_, index) => index);
    const doubleMasterCount = randomInt(1, Math.min(2, ringCount - 1), random);
    const doubleMasters = new Set(shuffle(ringIndices, random).slice(0, doubleMasterCount));
    const outDegrees = ringIndices.map((ringIndex) => {
      if (doubleMasters.has(ringIndex)) {
        return 2;
      }
      return random() < 0.66 ? 1 : 0;
    });

    const nonDoubleMasters = ringIndices.filter((ringIndex) => !doubleMasters.has(ringIndex));
    if (!outDegrees.some((count) => count === 0)) {
      outDegrees[pickRandom(nonDoubleMasters, random)] = 0;
    }

    const relations = [];
    for (const master of ringIndices) {
      const slaveCandidates = shuffle(
        ringIndices.filter((ringIndex) => ringIndex !== master),
        random,
      );
      for (const slave of slaveCandidates.slice(0, outDegrees[master])) {
        relations.push({
          master,
          slave,
          direction: random() < 0.5 ? "same" : "opposite",
        });
      }
    }

    if (validateLockpickRelations(relations, ringCount).valid) {
      return relations;
    }
  }

  throw new Error(`Lockpick relation generation failed after ${maxAttempts} attempts.`);
}

export function validateLockpickRelations(relations, ringCount = LOCKPICK_RING_COUNT) {
  const issues = [];
  const incomingCounts = Array(ringCount).fill(0);
  const outgoingCounts = Array(ringCount).fill(0);
  const relationIds = new Set();
  const undirected = Array.from({ length: ringCount }, () => new Set());

  for (const relation of relations || []) {
    const { master, slave, direction } = relation || {};
    if (
      !Number.isInteger(master)
      || !Number.isInteger(slave)
      || master < 0
      || master >= ringCount
      || slave < 0
      || slave >= ringCount
    ) {
      issues.push("relation has an invalid ring index");
      continue;
    }
    if (master === slave) {
      issues.push(`ring ${master} cannot control itself`);
      continue;
    }
    if (direction !== "same" && direction !== "opposite") {
      issues.push(`relation ${master}->${slave} has an invalid direction`);
    }
    const relationId = `${master}:${slave}`;
    if (relationIds.has(relationId)) {
      issues.push(`duplicate relation ${relationId}`);
      continue;
    }
    relationIds.add(relationId);
    outgoingCounts[master] += 1;
    incomingCounts[slave] += 1;
    undirected[master].add(slave);
    undirected[slave].add(master);
  }

  if (outgoingCounts.some((count) => count > 2)) {
    issues.push("a master cannot control more than two rings");
  }
  const doubleMasterCount = outgoingCounts.filter((count) => count === 2).length;
  if (doubleMasterCount < 1 || doubleMasterCount > 2) {
    issues.push("one or two rings must control exactly two rings");
  }
  if (!incomingCounts.some((count) => count === 0)) {
    issues.push("at least one ring must have no master");
  }
  if (!outgoingCounts.some((count) => count === 0)) {
    issues.push("at least one ring must have no slaves");
  }
  if (incomingCounts.some((count, index) => count === 0 && outgoingCounts[index] === 0)) {
    issues.push("a ring cannot have both no master and no slaves");
  }

  const visited = new Set();
  const queue = ringCount > 0 ? [0] : [];
  while (queue.length > 0) {
    const ringIndex = queue.shift();
    if (visited.has(ringIndex)) {
      continue;
    }
    visited.add(ringIndex);
    queue.push(...undirected[ringIndex]);
  }
  if (visited.size !== ringCount) {
    issues.push("relation graph must be weakly connected");
  }

  return {
    valid: issues.length === 0,
    issues,
    incomingCounts,
    outgoingCounts,
  };
}

export function generateLockpickBumpOffsets(options = {}) {
  const random = typeof options.random === "function" ? options.random : Math.random;
  const ringCount = options.ringCount || LOCKPICK_RING_COUNT;
  const sectorCount = options.sectorCount || LOCKPICK_SECTOR_COUNT;
  if (sectorCount < 5) {
    throw new Error("Lockpick needs at least five sectors to separate the gap and bump.");
  }
  return Array.from(
    { length: ringCount },
    () => randomInt(2, sectorCount - 2, random),
  );
}

export function getLockpickActionDeltas(relations, action, ringCount = LOCKPICK_RING_COUNT) {
  const direction = action?.direction === COUNTERCLOCKWISE ? COUNTERCLOCKWISE : CLOCKWISE;
  const deltas = Array(ringCount).fill(0);
  if (!Number.isInteger(action?.master) || action.master < 0 || action.master >= ringCount) {
    return deltas;
  }
  deltas[action.master] = direction;
  for (const relation of relations || []) {
    if (relation.master !== action.master) {
      continue;
    }
    deltas[relation.slave] = direction * (relation.direction === "opposite" ? -1 : 1);
  }
  return deltas;
}

export function applyLockpickAction(positions, relations, action, sectorCount = LOCKPICK_SECTOR_COUNT) {
  const deltas = getLockpickActionDeltas(relations, action, positions.length);
  return positions.map((position, index) => normalizeSector(position + deltas[index], sectorCount));
}

export function isLockpickSolved(positions) {
  return positions.every((position) => position === 0);
}

export function hasLockpickDanger(positions, bumpOffsets, sectorCount = LOCKPICK_SECTOR_COUNT) {
  return positions.some((position, index) => (
    normalizeSector(position + bumpOffsets[index], sectorCount) === 0
  ));
}

export function findShortestSafeLockpickSolutionDistance(options) {
  const {
    positions,
    relations,
    bumpOffsets,
    sectorCount = LOCKPICK_SECTOR_COUNT,
    maxDepth = LOCKPICK_SCRAMBLE_MAX_MOVES,
  } = options;
  if (isLockpickSolved(positions)) {
    return 0;
  }

  const actions = createAllLockpickActions(positions.length);
  const visited = new Set([getPositionId(positions)]);
  const queue = [{ positions, depth: 0 }];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;
    if (current.depth >= maxDepth) {
      continue;
    }
    for (const action of actions) {
      const nextPositions = applyLockpickAction(
        current.positions,
        relations,
        action,
        sectorCount,
      );
      if (hasLockpickDanger(nextPositions, bumpOffsets, sectorCount)) {
        continue;
      }
      const nextDepth = current.depth + 1;
      if (isLockpickSolved(nextPositions)) {
        return nextDepth;
      }
      const positionId = getPositionId(nextPositions);
      if (visited.has(positionId)) {
        continue;
      }
      visited.add(positionId);
      queue.push({ positions: nextPositions, depth: nextDepth });
    }
  }

  return Infinity;
}

export function invertLockpickAction(action) {
  return {
    master: action.master,
    direction: action.direction === COUNTERCLOCKWISE ? CLOCKWISE : COUNTERCLOCKWISE,
  };
}

function createSafeScramble(options) {
  const {
    random,
    ringCount,
    sectorCount,
    relations,
    bumpOffsets,
    moveCount,
  } = options;
  let positions = Array(ringCount).fill(0);
  const visited = new Set([getPositionId(positions)]);
  const actions = [];
  const allActions = createAllLockpickActions(ringCount);

  for (let moveIndex = 0; moveIndex < moveCount; moveIndex += 1) {
    const previousAction = actions.at(-1);
    const candidates = shuffle(allActions, random).filter((action) => {
      if (previousAction && isInverseAction(previousAction, action)) {
        return false;
      }
      const nextPositions = applyLockpickAction(positions, relations, action, sectorCount);
      if (
        isLockpickSolved(nextPositions)
        || hasLockpickDanger(nextPositions, bumpOffsets, sectorCount)
        || visited.has(getPositionId(nextPositions))
      ) {
        return false;
      }
      return true;
    });
    if (candidates.length === 0) {
      return null;
    }
    const action = candidates[0];
    positions = applyLockpickAction(positions, relations, action, sectorCount);
    visited.add(getPositionId(positions));
    actions.push(action);
  }

  return { positions, actions };
}

function createAllLockpickActions(ringCount) {
  const actions = [];
  for (let master = 0; master < ringCount; master += 1) {
    actions.push({ master, direction: CLOCKWISE });
    actions.push({ master, direction: COUNTERCLOCKWISE });
  }
  return actions;
}

function isInverseAction(first, second) {
  return first.master === second.master && first.direction === -second.direction;
}

function normalizeSector(value, sectorCount) {
  return ((value % sectorCount) + sectorCount) % sectorCount;
}

function getPositionId(positions) {
  return positions.join(":");
}

function randomInt(min, max, random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pickRandom(values, random) {
  return values[randomInt(0, values.length - 1, random)];
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index, random);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
