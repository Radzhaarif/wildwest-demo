import { appendVersionParam } from "../app-version.js";
import { exposeWildwestDebug } from "../debug-hooks.js";

let battleModulePreloadPromise = null;

export function preloadBattleModule() {
  if (!battleModulePreloadPromise) {
    battleModulePreloadPromise = Promise.all([
      importBattleContract(),
      importBattleData(),
      importBattleEngine(),
      importBattleView(),
    ]);
  }
  return battleModulePreloadPromise;
}

export async function startBattle(request, options = {}) {
  const callbacks = options.callbacks || {};
  const [{ BATTLE_CONTRACT_VERSION }, { loadBattleData }, { createSeededRandom }] = await Promise.all([
    importBattleContract(),
    importBattleData(),
    importSeededRandom(),
  ]);

  assertBattleRequest(request, BATTLE_CONTRACT_VERSION);

  const battleData = await loadBattleData(request, options.loaders);
  const battleEngine = await importBattleEngine();
  // context - приватный рантайм одной попытки боя. Карта видит его только через
  // debug hook; официальный результат возвращается из battleView.start().
  const context = {
    request,
    battleData,
    battleState: battleEngine.createInitialBattleState(request, battleData),
    battleRandom: createSeededRandom(request.seed || request.nodeId),
  };
  exposeWildwestDebug("battle", {
    context,
    request,
    battleData,
    battleState: context.battleState,
  });
  const { createBattleView } = await importBattleView();
  const battleView = createBattleView({
    root: options.root,
    engine: battleEngine,
    callbacks,
  });

  let started = false;
  let result;
  try {
    if (typeof callbacks.onBattleStart === "function") {
      callbacks.onBattleStart({
        enemyConfig: battleData?.enemyConfig,
        request,
      });
      started = true;
    }

    result = await battleView.start(context);
    return result;
  } finally {
    if (typeof callbacks.onBattleEnd === "function" && started) {
      callbacks.onBattleEnd({
        enemyConfig: battleData?.enemyConfig,
        request,
        result,
      });
    }
  }
}

function importBattleContract() {
  return import(appendVersionParam("./battle-contract.js"));
}

function importBattleData() {
  return import(appendVersionParam("./battle-data.js"));
}

function importBattleEngine() {
  return import(appendVersionParam("./battle-engine.js"));
}

function importBattleView() {
  return import(appendVersionParam("./battle-view.js"));
}

function importSeededRandom() {
  return import(appendVersionParam("../seeded-random.js"));
}

function assertBattleRequest(request, contractVersion) {
  // BattleRequest - узкая граница между картой и боем. Новые обязательные поля
  // должны попадать сюда осознанно и синхронно с BATTLE_CONTRACT_VERSION.
  if (!request || request.contractVersion !== contractVersion) {
    throw new Error(`BattleRequest must use contractVersion ${contractVersion}.`);
  }

  for (const field of ["nodeId", "nodeType", "enemyId", "background", "playerState", "itemCatalog"]) {
    if (!request[field]) {
      throw new Error(`BattleRequest is missing required field: ${field}.`);
    }
  }

  if (!["battle", "boss"].includes(request.nodeType)) {
    throw new Error(`BattleRequest nodeType must be "battle" or "boss": ${request.nodeType}.`);
  }
}
