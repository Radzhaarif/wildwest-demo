const battleCellAnimationState = new WeakMap();

export async function animateBattleSwap(boardElement, firstCell, secondCell, durationMs) {
  const firstCellElement = getBattleCellElement(boardElement, firstCell);
  const secondCellElement = getBattleCellElement(boardElement, secondCell);
  const firstElement = getBattleCellIconElement(boardElement, firstCell);
  const secondElement = getBattleCellIconElement(boardElement, secondCell);

  if (!firstCellElement || !secondCellElement || !firstElement || !secondElement) {
    await wait(durationMs);
    return;
  }

  const firstDelta = getBattleCellLocalDelta(firstCellElement, secondCellElement);
  const secondDelta = getBattleCellLocalDelta(secondCellElement, firstCellElement);

  await Promise.all([
    runBattleFrameAnimation(firstElement, "is-swapping", durationMs, (progress) => {
      const easedProgress = easeInOutCubic(progress);
      firstElement.style.transform = `translate3d(${firstDelta.x * easedProgress}px, ${firstDelta.y * easedProgress}px, 0)`;
    }),
    runBattleFrameAnimation(secondElement, "is-swapping", durationMs, (progress) => {
      const easedProgress = easeInOutCubic(progress);
      secondElement.style.transform = `translate3d(${secondDelta.x * easedProgress}px, ${secondDelta.y * easedProgress}px, 0)`;
    }),
  ]);
}

export async function animateBattleShakeCells(boardElement, cells, durationMs) {
  for (const cell of cells) {
    const element = getBattleCellIconElement(boardElement, cell);
    if (element) {
      runCellAnimation(element, "is-shaking", durationMs);
    }
  }
  await wait(durationMs);
}

export async function animateBattleWallBlockedSwap(boardElement, itemCell, blockedCell, durationMs) {
  const itemElement = getBattleCellIconElement(boardElement, itemCell);
  const wallElement = getBattleWallElement(boardElement, itemCell, blockedCell);

  if (itemElement) {
    runCellAnimation(itemElement, "is-shaking", durationMs);
  }
  if (wallElement) {
    runCellAnimation(wallElement, "is-shaking", durationMs);
  }

  await wait(durationMs);
}

export async function animateBattleBoxBlockedClick(boardElement, boxCell, selectedCell, durationMs) {
  const selectedElement = selectedCell ? getBattleCellIconElement(boardElement, selectedCell) : null;
  const boxElement = getBattleBoxElement(boardElement, boxCell);

  if (selectedElement) {
    runCellAnimation(selectedElement, "is-shaking", durationMs);
  }
  if (boxElement) {
    runCellAnimation(boxElement, "is-shaking", durationMs);
  }

  await wait(durationMs);
}

export async function animateBattleVineBlockedClick(boardElement, vineCell, selectedCell, durationMs) {
  const selectedElement = selectedCell ? getBattleCellIconElement(boardElement, selectedCell) : null;
  const vineElement = getBattleVineElement(boardElement, vineCell);

  if (selectedElement) {
    runCellAnimation(selectedElement, "is-shaking", durationMs);
  }
  if (vineElement) {
    runCellAnimation(vineElement, "is-shaking", durationMs);
  }

  await wait(durationMs);
}

export async function animateBattleShuffle(boardElement, durationMs) {
  for (const element of boardElement.querySelectorAll(".battle-cell-icon")) {
    runCellAnimation(element, "is-shuffling", durationMs);
  }
  await wait(durationMs);
}

export async function animateBattleBoardShuffleMovement(boardElement, movement, durationMs) {
  if (!Array.isArray(movement) || movement.length === 0) {
    await wait(durationMs);
    return;
  }

  const animationPlans = [];
  for (const move of movement) {
    const element = getBattleCellIconElement(boardElement, move.to);
    const fromCellElement = getBattleCellElement(boardElement, move.from);
    const toCellElement = getBattleCellElement(boardElement, move.to);
    if (!element || !fromCellElement || !toCellElement) {
      continue;
    }

    const motion = getBattleShuffleMotion(
      getBattleCellLocalDelta(fromCellElement, toCellElement),
      move.from,
      move.to,
    );
    if (!motion.shuffleCurve) {
      continue;
    }
    animationPlans.push({ element, motion });
  }

  await animateBattleShufflePlans(animationPlans, durationMs);
}

export function getBattleCellLocalDelta(fromCellElement, toCellElement) {
  const fromPosition = getBattleCellLocalPosition(fromCellElement);
  const toPosition = getBattleCellLocalPosition(toCellElement);
  if (fromPosition && toPosition) {
    return {
      x: toPosition.x - fromPosition.x,
      y: toPosition.y - fromPosition.y,
    };
  }

  const fromRect = fromCellElement?.getBoundingClientRect?.();
  const toRect = toCellElement?.getBoundingClientRect?.();
  const scale = getBattleElementViewportScale(fromCellElement);
  return {
    x: ((toRect?.left || 0) - (fromRect?.left || 0)) / scale.x,
    y: ((toRect?.top || 0) - (fromRect?.top || 0)) / scale.y,
  };
}

export function getBattleCellLocalMetrics(boardElement, cellElement) {
  const rect = cellElement?.getBoundingClientRect?.();
  const scale = getBattleElementViewportScale(cellElement);
  const width = getPositiveNumber(cellElement?.offsetWidth, (rect?.width || 1) / scale.x);
  const height = getPositiveNumber(cellElement?.offsetHeight, (rect?.height || 1) / scale.y);
  return {
    width,
    height,
    columnStep: width + getBattleGridGapPx(boardElement, "columnGap"),
    rowStep: height + getBattleGridGapPx(boardElement, "rowGap"),
  };
}

export function getBattleShuffleMotion(delta, fromCell, toCell) {
  const distance = Math.hypot(delta.x, delta.y);
  if (distance === 0) {
    return delta;
  }

  const random = createBattleShuffleRandomizer(fromCell, toCell);
  const direction = random() < 0.5 ? -1 : 1;
  const forward = {
    x: delta.x / distance,
    y: delta.y / distance,
  };
  const perpendicular = {
    x: -forward.y,
    y: forward.x,
  };
  const waveAmplitude = Math.min(132, Math.max(32, distance * 0.21));
  const firstControl = getBattleShufflePathPoint(
    delta,
    perpendicular,
    0.18,
    direction * waveAmplitude * (0.8 + (random() * 0.45)),
  );
  const middlePoint = getBattleShufflePathPoint(
    delta,
    perpendicular,
    0.5,
    -direction * waveAmplitude * (0.2 + (random() * 0.3)),
  );
  const sharedTangent = {
    x: (forward.x * distance * 0.2) + (perpendicular.x * direction * waveAmplitude * 0.45),
    y: (forward.y * distance * 0.2) + (perpendicular.y * direction * waveAmplitude * 0.45),
  };
  const lastControl = getBattleShufflePathPoint(
    delta,
    perpendicular,
    0.82,
    direction * waveAmplitude * (0.8 + (random() * 0.45)),
  );

  return {
    ...delta,
    shuffleCurve: {
      startPoint: { x: 0, y: 0 },
      firstControl,
      firstEndControl: {
        x: middlePoint.x - sharedTangent.x,
        y: middlePoint.y - sharedTangent.y,
      },
      middlePoint,
      secondStartControl: {
        x: middlePoint.x + sharedTangent.x,
        y: middlePoint.y + sharedTangent.y,
      },
      secondEndControl: lastControl,
      endPoint: { x: delta.x, y: delta.y },
    },
  };
}

export function runCellAnimation(element, className, durationMs, delta = null, delayMs = 0) {
  if (!element || !className) {
    return;
  }

  const animationState = getBattleElementAnimationState(element, className);
  const safeDurationMs = Math.max(0, Number(durationMs) || 0);
  const safeDelayMs = Math.max(0, Number(delayMs) || 0);
  const clearMs = safeDurationMs + safeDelayMs;

  element.style.setProperty("--battle-animation-ms", `${safeDurationMs}ms`);
  element.style.setProperty("--battle-animation-delay-ms", `${safeDelayMs}ms`);
  if (delta) {
    element.style.setProperty("--battle-swap-x", `${delta.x}px`);
    element.style.setProperty("--battle-swap-y", `${delta.y}px`);
    for (const [index, stage] of (delta.shuffleStages || []).entries()) {
      const stageNumber = index + 1;
      element.style.setProperty(`--battle-shuffle-stage-${stageNumber}-x`, `${stage.x}px`);
      element.style.setProperty(`--battle-shuffle-stage-${stageNumber}-y`, `${stage.y}px`);
      element.style.setProperty(`--battle-shuffle-stage-${stageNumber}-rotation`, `${stage.rotation}deg`);
    }
  }

  if (animationState.timeoutId) {
    window.clearTimeout(animationState.timeoutId);
    animationState.timeoutId = null;
  }
  if (animationState.animationEndHandler) {
    element.removeEventListener("animationend", animationState.animationEndHandler);
    animationState.animationEndHandler = null;
  }

  animationState.token += 1;
  const token = animationState.token;

  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);

  const clearAnimation = () => {
    const currentState = getBattleElementAnimationState(element, className);
    if (!currentState || currentState.token !== token) {
      return;
    }
    element.classList.remove(className);
    if (currentState.animationEndHandler) {
      element.removeEventListener("animationend", currentState.animationEndHandler);
      currentState.animationEndHandler = null;
    }
    if (currentState.timeoutId) {
      window.clearTimeout(currentState.timeoutId);
      currentState.timeoutId = null;
    }
  };

  const onAnimationEnd = (event) => {
    if (event && event.target !== element) {
      return;
    }
    clearAnimation();
  };
  element.addEventListener("animationend", onAnimationEnd);
  animationState.animationEndHandler = onAnimationEnd;

  animationState.timeoutId = window.setTimeout(clearAnimation, clearMs);
}

export function animateBattleCellDeath(element, durationMs, delta) {
  const targetX = Number(delta?.x) || 0;
  const targetY = Number(delta?.y) || 0;
  return runBattleFrameAnimation(element, "is-dying", durationMs, (progress) => {
    const easedProgress = progress * progress;
    element.style.opacity = String(1 - easedProgress);
    element.style.transform = [
      `translate3d(${targetX * easedProgress}px, ${targetY * easedProgress}px, 0)`,
      `scale(${1 + easedProgress})`,
    ].join(" ");
  });
}

function runBattleFrameAnimation(element, className, durationMs, renderFrame) {
  const safeDurationMs = Math.max(0, Number(durationMs) || 0);
  const previousStyles = {
    opacity: element.style.opacity,
    transform: element.style.transform,
    willChange: element.style.willChange,
  };
  element.classList.add(className);
  element.style.willChange = "transform, opacity";

  return new Promise((resolve) => {
    let startTimestamp = null;
    let cleanupFrameId = null;

    const cleanup = () => {
      if (cleanupFrameId !== null) {
        window.cancelAnimationFrame(cleanupFrameId);
      }
      restoreInlineStyle(element, "opacity", previousStyles.opacity);
      restoreInlineStyle(element, "transform", previousStyles.transform);
      restoreInlineStyle(element, "will-change", previousStyles.willChange);
      element.classList.remove(className);
      resolve();
    };

    const runFrame = (timestamp) => {
      if (!element.isConnected) {
        cleanup();
        return;
      }
      if (startTimestamp === null) {
        startTimestamp = timestamp;
      }
      const progress = safeDurationMs === 0
        ? 1
        : Math.min(1, (timestamp - startTimestamp) / safeDurationMs);
      renderFrame(progress);

      if (progress < 1) {
        window.requestAnimationFrame(runFrame);
        return;
      }

      // Keep the final state for one real paint before the caller replaces board DOM.
      cleanupFrameId = window.requestAnimationFrame(cleanup);
    };

    window.requestAnimationFrame(runFrame);
  });
}

function restoreInlineStyle(element, propertyName, value) {
  if (value) {
    element.style.setProperty(propertyName, value);
  } else {
    element.style.removeProperty(propertyName);
  }
}

export function getBattleElementAnimationState(element, className) {
  let elementAnimationState = battleCellAnimationState.get(element);
  if (!elementAnimationState) {
    elementAnimationState = {};
    battleCellAnimationState.set(element, elementAnimationState);
  }

  let classState = elementAnimationState[className];
  if (!classState) {
    classState = {
      token: 0,
      timeoutId: null,
      timerId: null,
      animationEndHandler: null,
      healthEndHandler: null,
      healthEndElement: null,
    };
    elementAnimationState[className] = classState;
  }

  return classState;
}

function getBattleCellLocalPosition(cellElement) {
  if (!cellElement) {
    return null;
  }
  const x = Number(cellElement.offsetLeft);
  const y = Number(cellElement.offsetTop);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function getBattleElementViewportScale(element) {
  const rect = element?.getBoundingClientRect?.();
  return {
    x: getPositiveNumber(rect?.width / element?.offsetWidth, 1),
    y: getPositiveNumber(rect?.height / element?.offsetHeight, 1),
  };
}

function getBattleGridGapPx(boardElement, propertyName) {
  if (!boardElement || typeof getComputedStyle !== "function") {
    return 0;
  }
  const styles = getComputedStyle(boardElement);
  return getPositiveNumber(Number.parseFloat(styles[propertyName]), 0);
}

function getPositiveNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return number;
}

async function animateBattleShufflePlans(animationPlans, durationMs) {
  const safeDurationMs = Math.max(0, Number(durationMs) || 0);
  if (animationPlans.length === 0 || safeDurationMs === 0) {
    clearBattleShufflePlans(animationPlans);
    await wait(safeDurationMs);
    return;
  }

  for (const plan of animationPlans) {
    plan.previousTransform = plan.element.style.transform;
    plan.element.classList.add("is-board-shuffling");
    applyBattleShufflePlan(plan, 0);
  }

  await new Promise((resolve) => {
    let startTimestamp = null;
    const runFrame = (timestamp) => {
      if (startTimestamp === null) {
        startTimestamp = timestamp;
      }
      const progress = Math.min(1, (timestamp - startTimestamp) / safeDurationMs);
      for (const plan of animationPlans) {
        applyBattleShufflePlan(plan, progress);
      }

      if (progress < 1) {
        window.requestAnimationFrame(runFrame);
        return;
      }
      clearBattleShufflePlans(animationPlans);
      resolve();
    };
    window.requestAnimationFrame(runFrame);
  });
}

function applyBattleShufflePlan(plan, progress) {
  const point = getBattleShuffleCurvePoint(plan.motion.shuffleCurve, easeOutCubic(progress));
  const offsetX = point.x - plan.motion.x;
  const offsetY = point.y - plan.motion.y;
  plan.element.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
}

function clearBattleShufflePlans(animationPlans) {
  for (const plan of animationPlans) {
    if (plan.previousTransform) {
      plan.element.style.transform = plan.previousTransform;
    } else {
      plan.element.style.removeProperty("transform");
    }
    plan.element.classList.remove("is-board-shuffling");
  }
}

function getBattleShuffleCurvePoint(curve, progress) {
  if (progress <= 0.5) {
    return getCubicBezierPoint(
      curve.startPoint,
      curve.firstControl,
      curve.firstEndControl,
      curve.middlePoint,
      progress * 2,
    );
  }
  return getCubicBezierPoint(
    curve.middlePoint,
    curve.secondStartControl,
    curve.secondEndControl,
    curve.endPoint,
    (progress - 0.5) * 2,
  );
}

function getCubicBezierPoint(startPoint, firstControl, secondControl, endPoint, progress) {
  const inverseProgress = 1 - progress;
  const firstWeight = inverseProgress ** 3;
  const secondWeight = 3 * (inverseProgress ** 2) * progress;
  const thirdWeight = 3 * inverseProgress * (progress ** 2);
  const fourthWeight = progress ** 3;
  return {
    x: (startPoint.x * firstWeight)
      + (firstControl.x * secondWeight)
      + (secondControl.x * thirdWeight)
      + (endPoint.x * fourthWeight),
    y: (startPoint.y * firstWeight)
      + (firstControl.y * secondWeight)
      + (secondControl.y * thirdWeight)
      + (endPoint.y * fourthWeight),
  };
}

function easeOutCubic(progress) {
  return 1 - ((1 - progress) ** 3);
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * (progress ** 3)
    : 1 - (((-2 * progress) + 2) ** 3) / 2;
}

function getBattleShufflePathPoint(delta, perpendicular, progress, sideOffset) {
  return {
    x: (delta.x * progress) + (perpendicular.x * sideOffset),
    y: (delta.y * progress) + (perpendicular.y * sideOffset),
  };
}

function createBattleShuffleRandomizer(fromCell, toCell) {
  let value = (
    (((Number(fromCell?.row) || 0) + 1) * 73856093)
    ^ (((Number(fromCell?.col) || 0) + 1) * 19349663)
    ^ (((Number(toCell?.row) || 0) + 1) * 83492791)
    ^ (((Number(toCell?.col) || 0) + 1) * 2654435761)
  ) >>> 0;

  return () => {
    value = Math.imul(value ^ (value >>> 15), 2246822519) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 3266489917) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };
}

export function getBattleCellElement(boardElement, cell) {
  return boardElement.querySelector(`.battle-scaffold-cell[data-row="${cell.row}"][data-col="${cell.col}"]`);
}

export function getBattleCellIconElement(boardElement, cell) {
  return boardElement.querySelector(`.battle-cell-icon[data-row="${cell.row}"][data-col="${cell.col}"]`);
}

export function getBattleWallElement(boardElement, firstCell, secondCell) {
  return boardElement.querySelector(`.battle-board-wall[data-wall-key="${getBattleWallKey(firstCell, secondCell)}"]`);
}

export function getBattleBoxElement(boardElement, cell) {
  return boardElement.querySelector(`.battle-board-box[data-row="${cell.row}"][data-col="${cell.col}"]`);
}

export function getBattleVineElement(boardElement, cell) {
  return boardElement.querySelector(`.battle-board-vine[data-row="${cell.row}"][data-col="${cell.col}"]`);
}

export function getBattleWallKey(firstCell, secondCell) {
  if (!firstCell || !secondCell) {
    return "";
  }
  const firstKey = `${firstCell.row}:${firstCell.col}`;
  const secondKey = `${secondCell.row}:${secondCell.col}`;
  return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
}

export function wait(durationMs) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, durationMs)));
}
