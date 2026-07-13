import { getBattleWallKey } from "./battle-animations.js";

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

      cell.addEventListener("click", async () => {
        const lifecycleToken = context.battleRenderTargets?.lifecycleToken;
        const attemptToken = context.battleRenderTargets?.attemptToken;
        await deps.handleBattleCellClick(context, cellPosition, {
          boardElement,
          statusElement,
          enemyStatsElement,
          playerMetersElement,
          ultimateTextElement,
          overlay: context.battleRenderTargets?.overlay,
          resolve: context.battleRenderTargets?.resolve,
          lifecycleToken,
          attemptToken,
        });
        if (!deps.isBattleLifecycleActive(context, lifecycleToken) || !deps.isBattleAttemptActive(context, attemptToken)) {
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
