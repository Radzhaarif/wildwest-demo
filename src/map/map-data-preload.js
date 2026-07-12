import { appendVersionParam } from "../app-version.js";
import { collectAssetPaths, preloadAssets } from "../asset-preloader.js";
import { validateGameData } from "../data-validation.js";

export function createMapDataPreloadController(deps) {
  const {
    state,
    campaignUrl,
    itemCatalogUrl,
    experienceTableUrl,
    cheatConfigUrl,
    startupAssetPaths,
    fallbackMapEventIconPaths,
    loadJson,
    loadJsonc,
    resolveAssetPath,
    applyMapUiScale,
    showLoadingOverlay,
    updateLoadingOverlay,
    getAssetPreloadStatus,
    loadingText,
    formatTextWithFallback,
  } = deps;

  let battleModulePreloadPromise = null;

  async function loadAndValidateGameData(status) {
    updateLoadingOverlay({
      status: status || loadingText("loading.validation", "Checking data"),
    });
    const campaign = await loadJsonc(campaignUrl);
    const itemCatalog = await loadJsonc(itemCatalogUrl);
    const experienceTable = await loadJsonc(experienceTableUrl);
    const cheatConfig = await loadJson(cheatConfigUrl);
    // Validation возвращает уже прогретые cache-объекты: обычные campaign maps,
    // enabled SmokeTest map, battle configs, item lookup и UI config.
    const validation = await validateGameData(campaign, itemCatalog, experienceTable, {
      cheatConfig,
      languages: state.settings?.languages || state.defaultSettings?.languages || ["en"],
    });
    state.campaign = campaign;
    state.itemCatalog = itemCatalog;
    state.experienceTable = experienceTable;
    state.cheatConfig = cheatConfig;
    state.mapConfigCache = validation.mapConfigCache;
    state.mapUiConfig = validation.mapUiConfig;
    state.battleConfigCache = validation.battleConfigCache;
    state.itemCatalogById = validation.itemCatalogById;
    applyMapUiScale();
  }

  function isGameDataReady() {
    return Boolean(
      state.campaign
        && state.itemCatalog
        && state.experienceTable
        && state.cheatConfig
        && state.mapConfigCache?.size
        && state.mapUiConfig
        && state.battleConfigCache
        && state.itemCatalogById?.size,
    );
  }

  async function preloadGameAssets(status) {
    const enemyConfigs = state.battleConfigCache?.enemyConfigCache
      ? [...state.battleConfigCache.enemyConfigCache.values()]
      : [];
    const mapConfigs = state.mapConfigCache
      ? [...state.mapConfigCache.values()]
      : [];

    // Preload берет данные из validation cache, поэтому SmokeTest ассеты
    // проверяются и грузятся вместе с обычными картами.
    await runAssetPreload(
      collectAssetPaths(
        startupAssetPaths,
        state.loadConfig,
        fallbackMapEventIconPaths,
        state.settings,
        state.campaign,
        state.itemCatalog,
        state.experienceTable,
        state.cheatConfig,
        state.mapUiConfig,
        state.battleConfigCache?.battleUiConfig,
        mapConfigs,
        enemyConfigs,
      ),
      {
        title: loadingText("loading.title", "Loading"),
        status,
      },
    );
  }

  async function runAssetPreload(assetPaths, options = {}) {
    showLoadingOverlay({
      title: options.title || loadingText("loading.title", "Loading"),
      status: options.status || loadingText("loading.assets", "Loading assets"),
    });

    const result = await preloadAssets(assetPaths, {
      resolveAssetPath,
      concurrency: 8,
      onProgress: ({ loaded, total, current, failed }) => {
        updateLoadingOverlay({
          loaded,
          total,
          status: getAssetPreloadStatus(options.status, current, failed),
        });
      },
    });

    if (result.failed.length > 0) {
      console.warn("Asset preload failed", result.failed);
      updateLoadingOverlay({
        loaded: result.loaded,
        total: result.total,
        status: formatTextWithFallback(
          "loading.failed",
          "Failed assets: {count}",
          { count: result.failed.length },
        ),
      });
    }

    return result;
  }

  async function preloadBattleCode(status) {
    showLoadingOverlay({
      title: loadingText("loading.title", "Loading"),
      status,
    });
    const battleModule = await importBattleModule();
    if (typeof battleModule.preloadBattleModule === "function") {
      await battleModule.preloadBattleModule();
    }
  }

  function importBattleModule() {
    // Один promise используется и для preload, и для реального старта боя:
    // повторный import не дергает сеть/диск заново.
    if (!battleModulePreloadPromise) {
      battleModulePreloadPromise = import(appendVersionParam("../battle/battle-module.js"));
    }
    return battleModulePreloadPromise;
  }

  return {
    loadAndValidateGameData,
    isGameDataReady,
    preloadGameAssets,
    preloadBattleCode,
    importBattleModule,
  };
}
