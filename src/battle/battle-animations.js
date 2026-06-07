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

  const firstRect = firstCellElement.getBoundingClientRect();
  const secondRect = secondCellElement.getBoundingClientRect();
  const firstDelta = {
    x: secondRect.left - firstRect.left,
    y: secondRect.top - firstRect.top,
  };
  const secondDelta = {
    x: firstRect.left - secondRect.left,
    y: firstRect.top - secondRect.top,
  };

  runCellAnimation(firstElement, "is-swapping", durationMs, firstDelta);
  runCellAnimation(secondElement, "is-swapping", durationMs, secondDelta);
  await wait(durationMs);
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

  for (const move of movement) {
    const element = getBattleCellIconElement(boardElement, move.from);
    const fromCellElement = getBattleCellElement(boardElement, move.from);
    const toCellElement = getBattleCellElement(boardElement, move.to);
    if (!element || !fromCellElement || !toCellElement) {
      continue;
    }

    const fromRect = fromCellElement.getBoundingClientRect();
    const toRect = toCellElement.getBoundingClientRect();
    runCellAnimation(element, "is-board-shuffling", durationMs, {
      x: toRect.left - fromRect.left,
      y: toRect.top - fromRect.top,
    });
  }

  await wait(durationMs);
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
