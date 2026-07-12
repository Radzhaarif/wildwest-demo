export const BATTLE_TRACE_VERSION = 1;

export function createBattleTrace(context) {
  // Trace хранит JSON-safe снимки вместо ссылок на живой context. Его можно
  // скачать после боя и воспроизвести ход рассуждений без DOM.
  const trace = {
    traceVersion: BATTLE_TRACE_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: getAppVersion(),
    request: createRequestSnapshot(context),
    enemy: createEnemySnapshot(context),
    initialState: createBattleTraceStateSnapshot(context),
    moves: [],
    outcome: null,
  };
  context.battleTrace = trace;
  return trace;
}

export function recordBattleTraceMove(context, action) {
  if (!context) {
    return null;
  }

  const trace = ensureBattleTrace(context);
  const safeAction = toJsonSafe(action || {});
  const entry = {
    index: trace.moves.length + 1,
    recordedAt: new Date().toISOString(),
    ...safeAction,
    stateAfter: createBattleTraceStateSnapshot(context),
  };
  trace.moves.push(entry);
  return entry;
}

export function recordBattleTraceOutcome(context, outcome) {
  if (!context) {
    return null;
  }

  const trace = ensureBattleTrace(context);
  const safeOutcome = toJsonSafe(outcome || {});
  trace.outcome = {
    recordedAt: new Date().toISOString(),
    ...safeOutcome,
    finalState: createBattleTraceStateSnapshot(context),
    logMessages: [...(context.battleLog || [])].reverse(),
  };
  return trace.outcome;
}

export function createBattleTraceExport(context) {
  const trace = ensureBattleTrace(context);
  return {
    ...toJsonSafe(trace),
    exportedAt: new Date().toISOString(),
    currentState: createBattleTraceStateSnapshot(context),
  };
}

export function downloadBattleTrace(context) {
  const payload = createBattleTraceExport(context);
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    return payload;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = createBattleTraceFileName(payload);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return payload;
}

export function createBattleTraceStateSnapshot(context) {
  const state = context?.battleState || {};
  return {
    board: cloneBoard(state.board),
    reserveBoard: cloneBoard(state.reserveBoard),
    walls: toJsonSafe(state.walls || []),
    boxes: toJsonSafe(state.boxes || []),
    vines: toJsonSafe(state.vines || []),
    playerState: toJsonSafe(state.playerState || {}),
    enemyState: toJsonSafe(state.enemyState || {}),
    selectedCell: toJsonSafe(state.selectedCell || null),
    activeSpecialItemId: state.activeSpecialItemId || null,
    specialSwapCell: toJsonSafe(state.specialSwapCell || null),
    lastMoveSummary: summarizeMoveResult(state.lastMoveSummary),
  };
}

export function summarizeMoveResult(result) {
  if (!result) {
    return null;
  }

  return {
    cascades: Number(result.cascades || 0),
    removedCells: Number(result.removedCells || 0),
    createdBonuses: Number(result.createdBonuses || 0),
    cascadeLimitReached: Boolean(result.cascadeLimitReached),
    cancelled: Boolean(result.cancelled),
    effects: toJsonSafe(result.effects || {}),
  };
}

export function createTraceCell(cell) {
  if (!cell) {
    return null;
  }
  return {
    row: Number(cell.row),
    col: Number(cell.col),
  };
}

export function createTraceCells(cells) {
  return Array.isArray(cells) ? cells.map(createTraceCell).filter(Boolean) : [];
}

function ensureBattleTrace(context) {
  return context.battleTrace || createBattleTrace(context);
}

function createRequestSnapshot(context) {
  const request = context?.request || {};
  return {
    contractVersion: request.contractVersion,
    nodeId: request.nodeId || "",
    nodeType: request.nodeType || "",
    enemyId: request.enemyId || "",
    enemyConfigUrl: request.enemyConfigUrl || "",
    background: request.background || "",
    seed: request.seed || "",
    seedName: request.seedName || "",
    language: request.language || "",
  };
}

function createEnemySnapshot(context) {
  const enemyConfig = context?.battleData?.enemyConfig || {};
  return {
    enemyId: enemyConfig.enemyId || context?.request?.enemyId || "",
    baseEnemyId: enemyConfig.baseEnemyId || "",
    nameTextKey: enemyConfig.nameTextKey || "",
    configUrl: context?.request?.enemyConfigUrl || "",
  };
}

function cloneBoard(board) {
  if (!Array.isArray(board)) {
    return [];
  }
  return board.map((row) => (Array.isArray(row) ? [...row] : []));
}

function toJsonSafe(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "undefined") {
      return null;
    }
    if (Number.isNaN(value)) {
      return null;
    }
    return value;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item, seen));
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "function" || typeof item === "undefined") {
      continue;
    }
    result[key] = toJsonSafe(item, seen);
  }
  return result;
}

function getAppVersion() {
  return typeof globalThis !== "undefined" && typeof globalThis.__ROGUELITE_MATCH3_VERSION__ === "string"
    ? globalThis.__ROGUELITE_MATCH3_VERSION__
    : "";
}

function createBattleTraceFileName(payload) {
  const seedName = payload?.request?.seedName || payload?.request?.enemyId || "battle";
  const safeSeedName = String(seedName).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "battle";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `battle-trace-${safeSeedName}-${timestamp}.json`;
}
