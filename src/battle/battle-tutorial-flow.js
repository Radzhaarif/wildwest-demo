const TUTORIAL_CELL_CLASS_NAMES = [
  "is-tutorial-match-cell",
  "is-tutorial-source-cell",
  "is-tutorial-target-cell",
];

export function isBattleTutorialActive(context) {
  return Boolean(getBattleTutorialState(context)?.active && getCurrentBattleTutorialStep(context));
}

export function isBattleTutorialShuffleStep(context) {
  return isBattleTutorialActive(context) && getCurrentBattleTutorialStep(context)?.action === "shuffle";
}

export function shouldStopBattleTutorialCascades(context, resolvedCascades = 0) {
  const step = getCurrentBattleTutorialStep(context);
  if (!step || !isBattleTutorialActive(context)) {
    return false;
  }
  return step.action === "battery" || (step.action === "swap" && resolvedCascades >= 1);
}

export function prepareBattleTutorialAttemptState(context) {
  const tutorial = getBattleTutorialConfig(context);
  const steps = getBattleTutorialSteps(context);
  if (!tutorial || steps.length === 0) {
    if (context.battleState) {
      context.battleState.tutorial = null;
    }
    return null;
  }

  context.battleState.tutorial = {
    active: true,
    completed: false,
    stepIndex: 0,
  };
  return applyBattleTutorialStepBoard(context);
}

export function applyBattleTutorialStepBoard(context) {
  const step = getCurrentBattleTutorialStep(context);
  if (!step || !Array.isArray(step.board)) {
    return null;
  }

  context.battleState.board = cloneTutorialBoard(step.board);
  context.battleState.reserveBoard = cloneTutorialBoard(step.reserveBoard || step.board);
  context.battleState.reserveStageIndex = 0;
  context.battleState.walls = [];
  context.battleState.boxes = [];
  context.battleState.vines = [];
  context.battleState.wallsInitialized = true;
  context.battleState.boxesInitialized = true;
  context.battleState.vinesInitialized = true;
  context.battleState.selectedCell = null;
  context.battleState.specialSwapCell = null;
  context.battleState.activeSpecialItemId = null;
  context.battleState.lastMoveSummary = null;
  applyBattleTutorialStepStateOverrides(context, step);
  return step;
}

export function setupBattleTutorialUi(deps, context, renderTargets) {
  if (!isBattleTutorialActive(context) || context.battleTutorialUi) {
    return;
  }

  const layer = document.createElement("div");
  layer.className = "battle-tutorial-layer";
  layer.setAttribute("aria-live", "polite");

  const shade = document.createElement("div");
  shade.className = "battle-tutorial-shade";

  const teacher = document.createElement("img");
  teacher.className = "battle-tutorial-teacher";
  teacher.alt = "";

  const callout = document.createElement("div");
  callout.className = "battle-tutorial-callout";

  const title = document.createElement("strong");
  title.className = "battle-tutorial-title";

  const progress = document.createElement("span");
  progress.className = "battle-tutorial-progress";

  const text = document.createElement("p");
  text.className = "battle-tutorial-text";

  callout.append(title, progress, text);
  layer.append(shade, teacher, callout);
  (renderTargets.enemyVisual || renderTargets.panel).append(layer);

  context.battleTutorialUi = {
    layer,
    teacher,
    title,
    progress,
    text,
  };
  refreshBattleTutorialUi(deps, context, renderTargets);
}

export function refreshBattleTutorialUi(deps, context, renderTargets = {}) {
  const step = getCurrentBattleTutorialStep(context);
  const ui = context.battleTutorialUi;
  const boardElement = renderTargets.boardElement || context.battleRenderTargets?.boardElement;
  clearBattleTutorialBoardGuide(boardElement);

  if (!ui || !boardElement || !step || !isBattleTutorialActive(context)) {
    boardElement?.classList.remove("is-tutorial-active");
    if (boardElement) {
      delete boardElement.dataset.tutorialAction;
    }
    renderTargets.shuffleButton?.classList.remove("is-tutorial-required");
    if (ui?.layer) {
      ui.layer.hidden = true;
    }
    return;
  }

  const tutorial = getBattleTutorialConfig(context);
  const steps = getBattleTutorialSteps(context);
  ui.layer.hidden = false;
  ui.teacher.src = deps.resolveAssetPath(tutorial.teacherImage);
  ui.title.textContent = deps.translate(context.request.locale, tutorial.titleTextKey || "battle.tutorial.title");
  ui.progress.textContent = `${getBattleTutorialState(context).stepIndex + 1}/${steps.length}`;
  ui.text.textContent = deps.translate(context.request.locale, step.textKey);
  renderTargets.shuffleButton?.classList.toggle("is-tutorial-required", step.action === "shuffle");

  boardElement.classList.add("is-tutorial-active");
  boardElement.dataset.tutorialAction = step.action || "swap";
  markBattleTutorialLockedCells(boardElement, step);
  for (const cell of step.matchCells || []) {
    markBattleTutorialCell(boardElement, cell, "is-tutorial-match-cell");
  }
  markBattleTutorialCell(boardElement, step.from, "is-tutorial-source-cell");
  markBattleTutorialCell(boardElement, step.to, "is-tutorial-target-cell");
  renderBattleTutorialArrow(boardElement, step.from, step.to);
}

export async function guardBattleTutorialCellClick(deps, context, cell, renderTargets) {
  const step = getCurrentBattleTutorialStep(context);
  if (!step || !isBattleTutorialActive(context)) {
    return false;
  }

  const selectedCell = context.battleState.selectedCell;
  const expectsDirectBoardAction = step.action === "swap" || step.action === "battery";
  const isAllowed = selectedCell
    ? expectsDirectBoardAction && isSameCell(selectedCell, step.from) && isSameCell(cell, step.to)
    : expectsDirectBoardAction && isSameCell(cell, step.from);

  if (isAllowed) {
    return false;
  }

  const boardElement = renderTargets.boardElement || context.battleRenderTargets?.boardElement;
  const statusElement = renderTargets.statusElement || renderTargets.status || context.battleRenderTargets?.status;
  const wrongTextKey = step.wrongTextKey
    || getBattleTutorialConfig(context).wrongMoveTextKey
    || "battle.tutorial.wrongMove";
  deps.setBattleStatus(context, statusElement, deps.translate(context.request.locale, wrongTextKey));
  await deps.animateBattleShakeCells(
    boardElement,
    [cell, step.from, step.to].filter(Boolean),
    deps.getBattleAnimationConfig(context).invalidShakeMs,
  );
  return true;
}

export function advanceBattleTutorialAfterMove(deps, context, renderTargets = {}) {
  const tutorialState = getBattleTutorialState(context);
  const currentStep = getCurrentBattleTutorialStep(context);
  if (
    !tutorialState?.active
    || !currentStep
    || !["swap", "battery"].includes(currentStep.action)
    || !context.battleState.lastMoveSummary
  ) {
    return { advanced: false, finished: false };
  }

  const steps = getBattleTutorialSteps(context);
  const nextStepIndex = tutorialState.stepIndex + 1;
  if (nextStepIndex >= steps.length) {
    tutorialState.active = false;
    tutorialState.completed = true;
    context.battleTutorialUi?.layer?.remove();
    context.battleTutorialUi = null;
    return { advanced: false, finished: true };
  }

  tutorialState.stepIndex = nextStepIndex;
  applyBattleTutorialStepBoard(context);
  const activeTargets = context.battleRenderTargets || renderTargets;
  deps.setBattleStatus(
    context,
    activeTargets.status,
    deps.translate(context.request.locale, steps[nextStepIndex].textKey),
  );
  deps.renderBattleStats(activeTargets.enemyStats, activeTargets.playerMeters, activeTargets.ultimateText, context);
  deps.renderBattleInventory(activeTargets.specialItems, activeTargets.handItems, context, activeTargets);
  deps.renderBattleBoard(
    activeTargets.boardElement,
    context,
    activeTargets.status,
    activeTargets.enemyStats,
    activeTargets.playerMeters,
    activeTargets.ultimateText,
  );
  refreshBattleTutorialUi(deps, context, activeTargets);
  return { advanced: true, finished: false };
}

export function completeBattleTutorialAfterShuffle(context, renderTargets = {}) {
  const tutorialState = getBattleTutorialState(context);
  if (!tutorialState?.active || !isBattleTutorialShuffleStep(context)) {
    return false;
  }

  tutorialState.active = false;
  tutorialState.completed = true;
  context.battleTutorialUi?.layer?.remove();
  context.battleTutorialUi = null;
  const activeTargets = context.battleRenderTargets || renderTargets;
  activeTargets.shuffleButton?.classList.remove("is-tutorial-required");
  clearBattleTutorialBoardGuide(activeTargets.boardElement);
  activeTargets.boardElement?.classList.remove("is-tutorial-active");
  if (activeTargets.boardElement) {
    delete activeTargets.boardElement.dataset.tutorialAction;
  }
  return true;
}

function getBattleTutorialConfig(context) {
  const tutorial = context?.request?.tutorial;
  return tutorial && tutorial.enabled !== false ? tutorial : null;
}

function getBattleTutorialSteps(context) {
  const steps = getBattleTutorialConfig(context)?.steps;
  return Array.isArray(steps) ? steps : [];
}

function getBattleTutorialState(context) {
  return context?.battleState?.tutorial || null;
}

function getCurrentBattleTutorialStep(context) {
  const tutorialState = getBattleTutorialState(context);
  const steps = getBattleTutorialSteps(context);
  return tutorialState?.active ? steps[tutorialState.stepIndex] || null : null;
}

function applyBattleTutorialStepStateOverrides(context, step) {
  const enemyHealth = context.battleState.enemyState?.health;
  if (enemyHealth && Number.isFinite(Number(step.enemyHealthCurrent))) {
    enemyHealth.current = clampNumber(Number(step.enemyHealthCurrent), 0, Number(enemyHealth.max) || 0);
    context.battleState.enemyState.isDefeated = enemyHealth.current <= 0;
  }
  const enemyAggression = context.battleState.enemyState?.aggression;
  if (enemyAggression && Number.isFinite(Number(step.enemyAggressionCurrent))) {
    enemyAggression.current = clampNumber(Number(step.enemyAggressionCurrent), 0, Number(enemyAggression.max) || 0);
  }
  const playerHealth = context.battleState.playerState?.health;
  if (playerHealth && Number.isFinite(Number(step.playerHealthCurrent))) {
    playerHealth.current = clampNumber(Number(step.playerHealthCurrent), 0, Number(playerHealth.max) || 0);
  }
  const playerHeal = context.battleState.playerState?.heal;
  if (playerHeal && Number.isFinite(Number(step.playerHealCurrent))) {
    playerHeal.current = clampNumber(Number(step.playerHealCurrent), 0, Number(playerHeal.max) || 0);
  }
  applyBattleTutorialInventoryQuantities(context);
}

function applyBattleTutorialInventoryQuantities(context) {
  const quantities = getBattleTutorialConfig(context)?.playerInventoryQuantities;
  if (!quantities || typeof quantities !== "object" || Array.isArray(quantities)) {
    return;
  }
  const inventory = context.battleState.playerState?.inventory;
  if (!Array.isArray(inventory)) {
    return;
  }
  for (const entry of inventory) {
    if (!entry || typeof entry.itemId !== "string" || quantities[entry.itemId] === undefined) {
      continue;
    }
    entry.quantity = Math.max(0, Number(quantities[entry.itemId]) || 0);
  }
}

function cloneTutorialBoard(board) {
  return Array.isArray(board) ? board.map((row) => (Array.isArray(row) ? [...row] : [])) : [];
}

function clearBattleTutorialBoardGuide(boardElement) {
  if (!boardElement) {
    return;
  }
  for (const element of boardElement.querySelectorAll(".battle-scaffold-cell, .battle-cell-icon")) {
    element.classList.remove(...TUTORIAL_CELL_CLASS_NAMES, "is-tutorial-locked");
    if (element.classList.contains("battle-scaffold-cell")) {
      element.removeAttribute("aria-disabled");
    }
  }
  for (const arrow of boardElement.querySelectorAll(".battle-tutorial-arrow")) {
    arrow.remove();
  }
}

function markBattleTutorialLockedCells(boardElement, step) {
  const allowedCells = [
    ...(Array.isArray(step.matchCells) ? step.matchCells : []),
    step.from,
    step.to,
  ].filter(Boolean);
  const allowedKeys = new Set(allowedCells.map((cell) => `${Number(cell.row)}:${Number(cell.col)}`));

  for (const element of boardElement.querySelectorAll(".battle-scaffold-cell, .battle-cell-icon")) {
    const key = `${Number(element.dataset.row)}:${Number(element.dataset.col)}`;
    if (!allowedKeys.has(key)) {
      element.classList.add("is-tutorial-locked");
      if (element.classList.contains("battle-scaffold-cell")) {
        element.setAttribute("aria-disabled", "true");
      }
    }
  }
}

function markBattleTutorialCell(boardElement, cell, className) {
  if (!boardElement || !cell) {
    return;
  }
  const selector = `[data-row="${Number(cell.row)}"][data-col="${Number(cell.col)}"]`;
  for (const element of boardElement.querySelectorAll(selector)) {
    element.classList.add(className);
  }
}

function renderBattleTutorialArrow(boardElement, from, to) {
  const fromElement = getBattleTutorialCellElement(boardElement, from);
  const toElement = getBattleTutorialCellElement(boardElement, to);
  if (!fromElement || !toElement) {
    return;
  }

  const boardRect = boardElement.getBoundingClientRect();
  const fromRect = fromElement.getBoundingClientRect();
  const toRect = toElement.getBoundingClientRect();
  const x1 = fromRect.left - boardRect.left + fromRect.width / 2;
  const y1 = fromRect.top - boardRect.top + fromRect.height / 2;
  const x2 = toRect.left - boardRect.left + toRect.width / 2;
  const y2 = toRect.top - boardRect.top + toRect.height / 2;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("battle-tutorial-arrow");
  svg.setAttribute("viewBox", `0 0 ${Math.max(1, boardRect.width)} ${Math.max(1, boardRect.height)}`);
  svg.setAttribute("aria-hidden", "true");

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "battleTutorialArrowHead");
  marker.setAttribute("markerWidth", "10");
  marker.setAttribute("markerHeight", "10");
  marker.setAttribute("refX", "7");
  marker.setAttribute("refY", "3");
  marker.setAttribute("orient", "auto");
  marker.setAttribute("markerUnits", "strokeWidth");
  const markerPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  markerPath.setAttribute("d", "M0,0 L0,6 L8,3 z");
  marker.append(markerPath);
  defs.append(marker);

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("marker-end", "url(#battleTutorialArrowHead)");

  svg.append(defs, line);
  boardElement.append(svg);
}

function getBattleTutorialCellElement(boardElement, cell) {
  if (!boardElement || !cell) {
    return null;
  }
  return boardElement.querySelector(
    `.battle-scaffold-cell[data-row="${Number(cell.row)}"][data-col="${Number(cell.col)}"]`,
  );
}

function isSameCell(firstCell, secondCell) {
  return firstCell?.row === secondCell?.row && firstCell?.col === secondCell?.col;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
