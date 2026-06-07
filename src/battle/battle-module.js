const BATTLE_MODULE_CACHE_BUSTER = Date.now();
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
  const [{ BATTLE_CONTRACT_VERSION }, { loadBattleData }] = await Promise.all([
    importBattleContract(),
    importBattleData(),
  ]);

  assertBattleRequest(request, BATTLE_CONTRACT_VERSION);

  const battleData = await loadBattleData(request, options.loaders);
  const battleEngine = await importBattleEngine();
  const context = {
    request,
    battleData,
    battleState: battleEngine.createInitialBattleState(request, battleData),
  };
  exposeLegacyBattleContext(context);
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
  return import(`./battle-contract.js?v=${BATTLE_MODULE_CACHE_BUSTER}`);
}

function importBattleData() {
  return import(`./battle-data.js?v=${BATTLE_MODULE_CACHE_BUSTER}`);
}

function importBattleEngine() {
  return import(`./battle-engine.js?v=${BATTLE_MODULE_CACHE_BUSTER}`);
}

function importBattleView() {
  return import(`./battle-view.js?v=${BATTLE_MODULE_CACHE_BUSTER}`);
}

function exposeLegacyBattleContext(context) {
  if (typeof window !== "undefined" && context) {
    window.context = context;
    window.contex = context;
  }
}

function assertBattleRequest(request, contractVersion) {
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
