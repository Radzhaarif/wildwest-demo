import { getBattleWallKey } from "./battle-animations.js";
import { formatText } from "./battle-formatters.js";

const BATTLE_SWIPE_MIN_DISTANCE_PX = 10;
const BATTLE_SWIPE_CELL_DISTANCE_RATIO = 0.22;
const BATTLE_SYNTHETIC_CLICK_SUPPRESSION_MS = 600;
const BATTLE_SYNTHETIC_CLICK_MAX_DISTANCE_PX = 32;
const DEFAULT_BATTLE_CONTROL_SCHEME = "swipe-and-click";
const battleBoardClickSuppressions = new WeakMap();

export function renderBattleBoard(
  deps,
  boardElement,
  context,
  statusElement,
  enemyStatsElement,
  playerMetersElement,
  ultimateTextElement,
) {
  deps.updateBattleShuffleButtonState(context);
  applyBattleBoardLayout(deps, boardElement, context);
  boardElement.replaceChildren();

  context.battleState.board.forEach((row, rowIndex) => {
    row.forEach((itemId, colIndex) => {
      const item = context.engine.getBattleItemDefinition(context.request.itemCatalog, itemId);
      const cellPosition = { row: rowIndex, col: colIndex };
      const isSelected = deps.isSameCell(context.battleState.selectedCell, cellPosition);
      const isBoxed = deps.isBattleCellBoxed(context, cellPosition);
      const isVined = deps.isBattleCellVined(context, cellPosition);
      const cell = document.createElement("div");

      cell.className = `battle-scaffold-cell${isSelected ? " is-selected" : ""}${isBoxed ? " is-boxed" : ""}${isVined ? " is-vined" : ""}`;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", deps.getItemLabel(context, item, itemId));
      cell.setAttribute("aria-disabled", String(context.battleState.isResolving || isBoxed || isVined));
      cell.setAttribute("aria-rowindex", String(rowIndex + 1));
      cell.setAttribute("aria-colindex", String(colIndex + 1));
      cell.dataset.row = String(rowIndex);
      cell.dataset.col = String(colIndex);
      cell.style.gridColumn = String(colIndex + 1);
      cell.style.gridRow = String(rowIndex + 1);

      const iconWrap = document.createElement("span");
      iconWrap.className = "battle-cell-icon";
      iconWrap.dataset.row = String(rowIndex);
      iconWrap.dataset.col = String(colIndex);
      iconWrap.style.gridColumn = String(colIndex + 1);
      iconWrap.style.gridRow = String(rowIndex + 1);
      if (item?.icon) {
        const icon = document.createElement("img");
        icon.src = deps.resolveAssetPath(item.icon);
        icon.alt = "";
        icon.draggable = false;
        iconWrap.append(icon);
      } else {
        iconWrap.textContent = itemId || "?";
      }

      if (context.battleState.activeSpecialItemId === deps.GOLD_ITEM_ID) {
        cell.classList.add("is-gold-target");
        cell.addEventListener("mouseenter", () => {
          showBattleGoldTargetPreview(deps, context, iconWrap, item, { disabled: isBoxed });
        });
        cell.addEventListener("mouseleave", () => {
          clearBattleGoldTargetPreview(context);
        });
      }

      const tutorialItemHint = getBattleTutorialItemHint(deps, context, item, itemId);
      if (tutorialItemHint) {
        deps.attachBattleTooltip(context, cell, {
          getContent: () => getBattleTutorialItemHint(deps, context, item, itemId) || tutorialItemHint,
        });
      }

      const swipeState = {
        pointerId: null,
        startX: 0,
        startY: 0,
      };

      cell.addEventListener("pointerdown", (event) => {
        if (!canTrackBattleCellPointer(context, event)) {
          return;
        }
        swipeState.pointerId = event.pointerId;
        swipeState.startX = event.clientX;
        swipeState.startY = event.clientY;
        try {
          cell.setPointerCapture?.(event.pointerId);
        } catch {
          // Synthetic events and older pointer implementations may not expose an active pointer to capture.
        }
      });

      cell.addEventListener("pointermove", (event) => {
        if (swipeState.pointerId !== event.pointerId) {
          return;
        }
        const targetCell = getBattleSwipeTarget(
          cellPosition,
          event.clientX - swipeState.startX,
          event.clientY - swipeState.startY,
          context.battleState.board,
          getBattleSwipeThreshold(cell),
        );
        if (isBattleSwipeEnabled(context)) {
          updateBattleSwipePreview(boardElement, cellPosition, targetCell);
        } else {
          clearBattleSwipePreview(boardElement);
        }
        if (targetCell) {
          event.preventDefault();
        }
      });

      cell.addEventListener("pointerup", async (event) => {
        if (swipeState.pointerId !== event.pointerId) {
          return;
        }
        const targetCell = getBattleSwipeTarget(
          cellPosition,
          event.clientX - swipeState.startX,
          event.clientY - swipeState.startY,
          context.battleState.board,
          getBattleSwipeThreshold(cell),
        );
        finishBattleCellPointerGesture(cell, boardElement, swipeState, event.pointerId);
        if (!targetCell) {
          return;
        }
        suppressBattleBoardClickOnce(boardElement, event);
        event.preventDefault();
        if (!isBattleSwipeEnabled(context)) {
          return;
        }
        await handleBattleCellSwipe(
          deps,
          context,
          cellPosition,
          targetCell,
          boardElement,
          statusElement,
          enemyStatsElement,
          playerMetersElement,
          ultimateTextElement,
        );
      });

      cell.addEventListener("pointercancel", (event) => {
        if (swipeState.pointerId === event.pointerId) {
          finishBattleCellPointerGesture(cell, boardElement, swipeState, event.pointerId);
        }
      });

      cell.addEventListener("lostpointercapture", (event) => {
        if (swipeState.pointerId === event.pointerId) {
          finishBattleCellPointerGesture(cell, boardElement, swipeState, event.pointerId);
        }
      });

      cell.addEventListener("click", async (event) => {
        if (consumeSuppressedBattleBoardClick(boardElement, event)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (context.battleState.isResolving || !isBattleClickEnabled(context)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        await handleBattleCellClick(
          deps,
          context,
          cellPosition,
          boardElement,
          statusElement,
          enemyStatsElement,
          playerMetersElement,
          ultimateTextElement,
        );
      });

      boardElement.append(cell);
      boardElement.append(iconWrap);
    });
  });
  renderBattleWalls(deps, boardElement, context);
  renderBattleBoxes(deps, boardElement, context);
  renderBattleVines(deps, boardElement, context);
  deps.refreshBattleTutorialUi?.(context, context.battleRenderTargets || {});
}

export function getBattleTutorialItemHint(deps, context, item, itemId) {
  if (context.request?.tutorial?.enabled !== true || !item) {
    return null;
  }

  const stats = typeof context.engine.getBattleEffectiveItemStats === "function"
    ? context.engine.getBattleEffectiveItemStats(
      context.request.itemCatalog,
      itemId,
      context.battleState.playerState,
      context.battleState,
    )
    : item;
  let textKey = "";
  let values = {};

  if (item.battleUse === "battery" || item.itemId === "battary") {
    textKey = "battle.tutorial.itemHint.generator";
  } else if (Number(item.dmgperturn) > 0) {
    textKey = "battle.tutorial.itemHint.barrel";
    values = { damage: Number(item.dmgperturn) || 0 };
  } else if (Number(item.damage) > 0) {
    textKey = "battle.tutorial.itemHint.attack";
    values = {
      damage: Number(stats.damage) || 0,
      aggression: Number(stats.aggression) || 0,
    };
  } else if (Number(item.heal) > 0) {
    textKey = "battle.tutorial.itemHint.bandage";
    values = {
      heal: Number(stats.heal) || 0,
      aggression: Number(stats.aggression) || 0,
    };
  } else if (Number(item.calm) > 0) {
    textKey = "battle.tutorial.itemHint.shield";
    values = { calm: Number(stats.calm) || 0 };
  } else if (Number(item.aggression) > 0) {
    textKey = "battle.tutorial.itemHint.trash";
    values = { aggression: Number(stats.aggression) || 0 };
  }

  if (!textKey) {
    return null;
  }

  return {
    name: deps.getItemLabel(context, item, itemId),
    description: formatText(deps.translate(context.request.locale, textKey), values),
    icon: item.icon || "",
  };
}

export function getBattleSwipeTarget(fromCell, deltaX, deltaY, board, thresholdPx = BATTLE_SWIPE_MIN_DISTANCE_PX) {
  const horizontalDistance = Math.abs(Number(deltaX) || 0);
  const verticalDistance = Math.abs(Number(deltaY) || 0);
  const requiredDistance = Math.max(BATTLE_SWIPE_MIN_DISTANCE_PX, Number(thresholdPx) || 0);
  if (Math.max(horizontalDistance, verticalDistance) < requiredDistance) {
    return null;
  }

  const rowDelta = verticalDistance > horizontalDistance ? Math.sign(deltaY) : 0;
  const colDelta = horizontalDistance >= verticalDistance ? Math.sign(deltaX) : 0;
  const target = {
    row: Number(fromCell?.row) + rowDelta,
    col: Number(fromCell?.col) + colDelta,
  };
  const boardHeight = Array.isArray(board) ? board.length : 0;
  const boardWidth = Array.isArray(board?.[0]) ? board[0].length : 0;
  if (target.row < 0 || target.row >= boardHeight || target.col < 0 || target.col >= boardWidth) {
    return null;
  }
  return target;
}

function canTrackBattleCellPointer(context, event) {
  return !context.battleState.isResolving
    && !context.battleState.activeSpecialItemId
    && event.isPrimary !== false
    && (event.pointerType !== "mouse" || event.button === 0);
}

function isBattleSwipeEnabled(context) {
  return getBattleControlScheme(context) !== "click";
}

function isBattleClickEnabled(context) {
  return Boolean(context.battleState.activeSpecialItemId)
    || getBattleControlScheme(context) !== "swipe";
}

function getBattleControlScheme(context) {
  const scheme = context.request?.settings?.controlScheme;
  return ["swipe", "click", DEFAULT_BATTLE_CONTROL_SCHEME].includes(scheme)
    ? scheme
    : DEFAULT_BATTLE_CONTROL_SCHEME;
}

function getBattleSwipeThreshold(cell) {
  const rect = cell.getBoundingClientRect();
  return Math.max(
    BATTLE_SWIPE_MIN_DISTANCE_PX,
    Math.min(rect.width, rect.height) * BATTLE_SWIPE_CELL_DISTANCE_RATIO,
  );
}

function updateBattleSwipePreview(boardElement, fromCell, targetCell) {
  clearBattleSwipePreview(boardElement);
  if (!targetCell) {
    return;
  }
  getBattleBoardCellElement(boardElement, fromCell)?.classList.add("is-swipe-source");
  getBattleBoardCellElement(boardElement, targetCell)?.classList.add("is-swipe-target");
}

function clearBattleSwipePreview(boardElement) {
  for (const cell of boardElement.querySelectorAll(".battle-scaffold-cell.is-swipe-source, .battle-scaffold-cell.is-swipe-target")) {
    cell.classList.remove("is-swipe-source", "is-swipe-target");
  }
}

function getBattleBoardCellElement(boardElement, cell) {
  return boardElement.querySelector(
    `.battle-scaffold-cell[data-row="${Number(cell.row)}"][data-col="${Number(cell.col)}"]`,
  );
}

function finishBattleCellPointerGesture(cell, boardElement, swipeState, pointerId) {
  swipeState.pointerId = null;
  if (cell.hasPointerCapture?.(pointerId)) {
    cell.releasePointerCapture(pointerId);
  }
  clearBattleSwipePreview(boardElement);
}

function suppressBattleBoardClickOnce(boardElement, pointerEvent) {
  battleBoardClickSuppressions.set(boardElement, {
    clientX: Number(pointerEvent.clientX) || 0,
    clientY: Number(pointerEvent.clientY) || 0,
    expiresAt: performance.now() + BATTLE_SYNTHETIC_CLICK_SUPPRESSION_MS,
  });
}

function consumeSuppressedBattleBoardClick(boardElement, clickEvent) {
  const suppression = battleBoardClickSuppressions.get(boardElement);
  if (!suppression) {
    return false;
  }
  if (performance.now() > suppression.expiresAt) {
    battleBoardClickSuppressions.delete(boardElement);
    return false;
  }

  const deltaX = (Number(clickEvent.clientX) || 0) - suppression.clientX;
  const deltaY = (Number(clickEvent.clientY) || 0) - suppression.clientY;
  if (Math.hypot(deltaX, deltaY) > BATTLE_SYNTHETIC_CLICK_MAX_DISTANCE_PX) {
    return false;
  }

  battleBoardClickSuppressions.delete(boardElement);
  return true;
}

async function handleBattleCellClick(
  deps,
  context,
  cellPosition,
  boardElement,
  statusElement,
  enemyStatsElement,
  playerMetersElement,
  ultimateTextElement,
) {
  const renderTargets = createBattleCellRenderTargets(
    context,
    boardElement,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
  );
  await deps.handleBattleCellClick(context, cellPosition, renderTargets);
  renderBattleBoardAfterInput(
    deps,
    context,
    renderTargets,
    boardElement,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
  );
}

async function handleBattleCellSwipe(
  deps,
  context,
  fromCell,
  toCell,
  boardElement,
  statusElement,
  enemyStatsElement,
  playerMetersElement,
  ultimateTextElement,
) {
  const renderTargets = createBattleCellRenderTargets(
    context,
    boardElement,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
  );
  context.battleState.selectedCell = null;
  await deps.handleBattleCellClick(context, fromCell, renderTargets);
  if (
    deps.isBattleLifecycleActive(context, renderTargets.lifecycleToken)
    && deps.isBattleAttemptActive(context, renderTargets.attemptToken)
    && deps.isSameCell(context.battleState.selectedCell, fromCell)
  ) {
    await deps.handleBattleCellClick(context, toCell, renderTargets);
  }
  renderBattleBoardAfterInput(
    deps,
    context,
    renderTargets,
    boardElement,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
  );
}

function createBattleCellRenderTargets(
  context,
  boardElement,
  statusElement,
  enemyStatsElement,
  playerMetersElement,
  ultimateTextElement,
) {
  return {
    boardElement,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
    overlay: context.battleRenderTargets?.overlay,
    resolve: context.battleRenderTargets?.resolve,
    lifecycleToken: context.battleRenderTargets?.lifecycleToken,
    attemptToken: context.battleRenderTargets?.attemptToken,
  };
}

function renderBattleBoardAfterInput(
  deps,
  context,
  renderTargets,
  boardElement,
  statusElement,
  enemyStatsElement,
  playerMetersElement,
  ultimateTextElement,
) {
  if (
    !deps.isBattleLifecycleActive(context, renderTargets.lifecycleToken)
    || !deps.isBattleAttemptActive(context, renderTargets.attemptToken)
  ) {
    return;
  }
  deps.renderBattleStats(enemyStatsElement, playerMetersElement, ultimateTextElement, context);
  renderBattleBoard(
    deps,
    boardElement,
    context,
    statusElement,
    enemyStatsElement,
    playerMetersElement,
    ultimateTextElement,
  );
}

export function renderBattleWalls(deps, boardElement, context) {
  const walls = Array.isArray(context.battleState.walls) ? context.battleState.walls : [];
  const uiConfig = deps.getBattleUiConfig(context);
  const wallIconA = uiConfig.icons.wall_1 || uiConfig.icons.wall || "";
  const wallIconB = uiConfig.icons.wall_2 || uiConfig.icons.wall || wallIconA;
  const wallToggleMs = Math.max(120, Math.floor(Number(uiConfig.animations?.wallToggleMs) || 500));
  const cycleMs = wallToggleMs * 2;
  if (walls.length === 0 || !wallIconA) {
    return;
  }

  for (const wall of walls) {
    const anchor = getBattleWallAnchor(wall);
    if (!anchor) {
      continue;
    }

    const wallElement = document.createElement("span");
    wallElement.className = `battle-board-wall battle-board-wall--${anchor.orientation}`;
    wallElement.setAttribute("aria-hidden", "true");
    wallElement.dataset.wallKey = getBattleWallKey(wall.from, wall.to);
    wallElement.style.gridColumn = String(anchor.rowCol.col + 1);
    wallElement.style.gridRow = String(anchor.rowCol.row + 1);
    wallElement.style.setProperty("--battle-wall-toggle-ms", `${wallToggleMs}ms`);
    wallElement.style.setProperty("--battle-wall-toggle-cycle-ms", `${cycleMs}ms`);

    const imageA = document.createElement("img");
    imageA.className = "battle-board-wall-frame battle-board-wall-frame-a";
    imageA.src = deps.resolveAssetPath(wallIconA);
    imageA.alt = "";
    const imageB = document.createElement("img");
    imageB.className = "battle-board-wall-frame battle-board-wall-frame-b";
    imageB.src = deps.resolveAssetPath(wallIconB);
    imageB.alt = "";
    wallElement.append(imageA, imageB);
    boardElement.append(wallElement);
  }
}

export function renderBattleBoxes(deps, boardElement, context) {
  const boxes = Array.isArray(context.battleState.boxes) ? context.battleState.boxes : [];
  const boxIcon = deps.getBattleUiConfig(context).icons.box || "";
  if (boxes.length === 0 || !boxIcon) {
    return;
  }

  for (const box of boxes) {
    if (!box || box.row < 0 || box.col < 0) {
      continue;
    }

    const boxElement = document.createElement("span");
    boxElement.className = "battle-board-box";
    boxElement.setAttribute("aria-hidden", "true");
    boxElement.dataset.row = String(box.row);
    boxElement.dataset.col = String(box.col);
    boxElement.style.gridColumn = String(box.col + 1);
    boxElement.style.gridRow = String(box.row + 1);

    const image = document.createElement("img");
    image.src = deps.resolveAssetPath(boxIcon);
    image.alt = "";
    boxElement.append(image);
    boardElement.append(boxElement);
  }
}

export function renderBattleVines(deps, boardElement, context) {
  const vines = Array.isArray(context.battleState.vines) ? context.battleState.vines : [];
  const vineIcon = deps.getBattleUiConfig(context).icons.vines || "";
  if (vines.length === 0 || !vineIcon) {
    return;
  }

  for (const vine of vines) {
    if (!vine || vine.row < 0 || vine.col < 0 || deps.isBattleCellBoxed(context, vine)) {
      continue;
    }

    const vineElement = document.createElement("span");
    vineElement.className = "battle-board-vine";
    vineElement.setAttribute("aria-hidden", "true");
    vineElement.dataset.row = String(vine.row);
    vineElement.dataset.col = String(vine.col);
    vineElement.style.gridColumn = String(vine.col + 1);
    vineElement.style.gridRow = String(vine.row + 1);

    const image = document.createElement("img");
    image.src = deps.resolveAssetPath(vineIcon);
    image.alt = "";
    vineElement.append(image);
    boardElement.append(vineElement);
  }
}

export function showBattleGoldTargetPreview(deps, context, iconWrap, item, options = {}) {
  clearBattleGoldTargetPreview(context);

  const marker = document.createElement("span");
  marker.className = "battle-gold-target-preview";
  const price = options.disabled ? null : getBattleGoldPrice(item);
  if (price === null) {
    marker.classList.add("is-disabled");
    marker.textContent = "X";
  } else {
    marker.textContent = String(price);
  }

  iconWrap.append(marker);
  context.battleGoldTargetPreview = marker;
}

export function clearBattleGoldTargetPreview(context) {
  context?.battleGoldTargetPreview?.remove();
  if (context) {
    context.battleGoldTargetPreview = null;
  }
}

export function getBattleGoldPrice(item) {
  const price = Number(item?.goldprice);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  return Math.floor(price);
}

export function getBattleWallAnchor(wall) {
  const from = wall?.from;
  const to = wall?.to;
  if (!from || !to) {
    return null;
  }
  if (from.row === to.row && Math.abs(from.col - to.col) === 1) {
    return {
      rowCol: {
        row: from.row,
        col: Math.min(from.col, to.col),
      },
      orientation: "vertical",
    };
  }
  if (from.col === to.col && Math.abs(from.row - to.row) === 1) {
    return {
      rowCol: {
        row: Math.min(from.row, to.row),
        col: from.col,
      },
      orientation: "horizontal",
    };
  }
  return null;
}

export function showBattleBoardMessage(boardElement, title, body) {
  clearBattleBoardMessage(boardElement);

  const message = document.createElement("div");
  message.className = "battle-scaffold-board-message";

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  const bodyElement = document.createElement("span");
  bodyElement.textContent = body;

  message.append(titleElement, bodyElement);
  boardElement.append(message);
}

export function clearBattleBoardMessage(boardElement) {
  boardElement.querySelector(".battle-scaffold-board-message")?.remove();
}

export function normalizeBattleBoardSize(value, fallback) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(30, Math.max(3, number));
}

export function applyBattleBoardLayout(deps, boardElement, context) {
  const boardConfig = deps.getBattleBoardConfig(context);
  boardElement.style.setProperty("--battle-board-width", String(boardConfig.width));
  boardElement.style.setProperty("--battle-board-height", String(boardConfig.height));
  boardElement.setAttribute("aria-colcount", String(boardConfig.width));
  boardElement.setAttribute("aria-rowcount", String(boardConfig.height));
}
