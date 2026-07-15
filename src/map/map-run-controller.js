const DEFAULT_RUN_SEED_QUERY_PARAMS = ["seed", "runSeed"];

export function createMapRunController(deps) {
  const {
    state,
    elements,
    defaultPlayerStateUrl,
    runSeedQueryParams = DEFAULT_RUN_SEED_QUERY_PARAMS,
    loadJson,
    loadJsonc,
    generateMap,
    getMapLevelSummary,
    createDebugSeed,
    createSeededRandom,
    deriveDebugSeed,
    normalizeDebugSeed,
    toProjectUrl,
    translate,
    formatText,
    resolveAssetPath,
    isGameDataReady,
    loadAndValidateGameData,
    preloadGameAssets,
    preloadBattleCode,
    showLoadingOverlay,
    hideLoadingOverlay,
    loadingText,
    renderMapTopActionButtons,
    normalizePlayerHealthByInventory,
    getSmokeTestRunConfig,
    getSmokeTestButtonTextKey,
    createSmokeTestMapEntry,
    addRunLogHeader,
    addLog,
    showDialog,
    playMusic,
    render,
    playMapIntroScroll,
    closeMapDialogOverlay,
    closeShop,
    hideRewardOverlay,
    closeLockpick,
  } = deps;

  async function startGame() {
    // Новый старт всегда сбрасывает игрока из default-player-state.json. Файл
    // current-player-state.json сейчас не используется как источник сохранения.
    elements.startGameButton.disabled = true;
    let didShowStartLoading = false;
    try {
      if (!isGameDataReady()) {
        didShowStartLoading = true;
        showLoadingOverlay({
          title: translate("menu.start"),
          status: loadingText("loading.validation", "Checking data"),
        });
        await loadAndValidateGameData(loadingText("loading.validation", "Checking data"));
        await preloadGameAssets(loadingText("loading.runAssets", "Preparing run assets"));
        await preloadBattleCode(loadingText("loading.battleCode", "Preparing battle code"));
      }
      renderMapTopActionButtons();
      await resetPlayerState();
      state.activeTestRun = false;
      state.activeStandaloneRun = false;
      state.activeMapEntry = null;
      state.hasStartedGame = true;
      state.runNumber += 1;
      state.runSeed = getRequestedRunSeed() || createDebugSeed();
      addRunLogHeader(
        formatText("log.runStarted", {
          run: state.runNumber,
          campaign: translate(state.campaign.nameTextKey),
        }),
      );
      addLog(
        formatText("log.runSeed", {
          name: "run",
          seed: state.runSeed,
        }),
      );
      addLog(
        formatText("log.validationPassed", {
          maps: state.mapConfigCache.size,
          languages: state.settings.languages.length,
        }),
      );
      elements.mainMenu.classList.add("hidden");
      playMusic(resolveAssetPath(state.settings.audio.mapMusic));
      const startIndex = state.campaign.maps.findIndex(
        (entry) => entry.mapId === state.campaign.startMapId,
      );
      await startCampaignMap(Math.max(startIndex, 0));
    } catch (error) {
      console.error(error);
      elements.campaignStatus.textContent = error.message;
      showDialog(`${translate("validation.failed")}\n${error.message}`);
    } finally {
      if (didShowStartLoading) {
        hideLoadingOverlay();
      }
      elements.startGameButton.disabled = false;
    }
  }

  async function startTutorial() {
    const tutorial = state.campaign?.tutorial?.enabled === false ? null : state.campaign?.tutorial;
    if (!tutorial?.mapId || !tutorial?.config || !tutorial?.onComplete) {
      showDialog("Tutorial is not configured.");
      return;
    }

    elements.tutorialButton.disabled = true;
    let didShowStartLoading = false;
    try {
      if (!isGameDataReady()) {
        didShowStartLoading = true;
        showLoadingOverlay({
          title: translate(tutorial.buttonTextKey || "menu.tutorial"),
          status: loadingText("loading.validation", "Checking data"),
        });
        await loadAndValidateGameData(loadingText("loading.validation", "Checking data"));
        await preloadGameAssets(loadingText("loading.runAssets", "Preparing run assets"));
        await preloadBattleCode(loadingText("loading.battleCode", "Preparing battle code"));
      }
      renderMapTopActionButtons();
      await resetPlayerState();
      applyTutorialStartingInventory(tutorial);
      state.activeTestRun = false;
      state.activeStandaloneRun = true;
      state.activeMapEntry = tutorial;
      state.hasStartedGame = true;
      state.runNumber += 1;
      state.runSeed = getRequestedRunSeed() || createDebugSeed();
      addRunLogHeader(
        formatText("log.runStarted", {
          run: state.runNumber,
          campaign: translate(`${tutorial.mapId}.name`),
        }),
      );
      addLog(
        formatText("log.runSeed", {
          name: "run",
          seed: state.runSeed,
        }),
      );
      addLog(
        formatText("log.validationPassed", {
          maps: state.mapConfigCache.size,
          languages: state.settings.languages.length,
        }),
      );
      elements.mainMenu.classList.add("hidden");
      playMusic(resolveAssetPath(state.settings.audio.mapMusic));
      await startConfiguredMap(tutorial, 0, { standalone: true });
    } catch (error) {
      console.error(error);
      elements.campaignStatus.textContent = error.message;
      showDialog(`${translate("validation.failed")}\n${error.message}`);
    } finally {
      if (didShowStartLoading) {
        hideLoadingOverlay();
      }
      elements.tutorialButton.disabled = false;
    }
  }

  async function startSmokeTestRun() {
    // SmokeTest - отдельный test-run: не входит в campaign.maps и не должен
    // менять обычный маршрут START, прогресс кампании или стартовый player state.
    const testRun = getSmokeTestRunConfig();
    if (!testRun) {
      showDialog("Smoke test run is not configured.");
      return;
    }

    elements.smokeTestButton.disabled = true;
    let didShowStartLoading = false;
    try {
      if (!isGameDataReady()) {
        didShowStartLoading = true;
        showLoadingOverlay({
          title: translate(getSmokeTestButtonTextKey()),
          status: loadingText("loading.validation", "Checking data"),
        });
        await loadAndValidateGameData(loadingText("loading.validation", "Checking data"));
        await preloadGameAssets(loadingText("loading.runAssets", "Preparing run assets"));
        await preloadBattleCode(loadingText("loading.battleCode", "Preparing battle code"));
      }
      renderMapTopActionButtons();
      await resetPlayerState(toProjectUrl(testRun.playerState));
      state.activeTestRun = true;
      state.activeStandaloneRun = true;
      state.activeMapEntry = createSmokeTestMapEntry(testRun);
      state.hasStartedGame = true;
      state.runNumber += 1;
      state.runSeed = getRequestedRunSeed() || createDebugSeed();
      addRunLogHeader(
        formatText("log.runStarted", {
          run: state.runNumber,
          campaign: translate(testRun.mapNameTextKey || "SmokeTest.name"),
        }),
      );
      addLog(
        formatText("log.runSeed", {
          name: "run",
          seed: state.runSeed,
        }),
      );
      addLog(
        formatText("log.validationPassed", {
          maps: state.mapConfigCache.size,
          languages: state.settings.languages.length,
        }),
      );
      elements.mainMenu.classList.add("hidden");
      playMusic(resolveAssetPath(state.settings.audio.mapMusic));
      await startConfiguredMap(state.activeMapEntry, 0, { testRun: true, standalone: true });
    } catch (error) {
      console.error(error);
      elements.campaignStatus.textContent = error.message;
      showDialog(`${translate("validation.failed")}\n${error.message}`);
    } finally {
      if (didShowStartLoading) {
        hideLoadingOverlay();
      }
      elements.smokeTestButton.disabled = false;
    }
  }

  async function resetPlayerState(playerStateUrl = defaultPlayerStateUrl) {
    state.playerState = structuredClone(await loadJson(playerStateUrl));
    normalizePlayerHealthByInventory(state.playerState);
  }

  function applyTutorialStartingInventory(tutorial) {
    const quantities = tutorial?.startingInventoryQuantities;
    if (!quantities || typeof quantities !== "object" || Array.isArray(quantities)) {
      return;
    }
    for (const entry of state.playerState?.inventory || []) {
      if (!entry || typeof entry.itemId !== "string" || quantities[entry.itemId] === undefined) {
        continue;
      }
      entry.quantity = Math.max(0, Number(quantities[entry.itemId]) || 0);
    }
  }

  async function startCampaignMap(campaignIndex) {
    const campaignEntry = state.campaign.maps[campaignIndex];
    await startConfiguredMap(campaignEntry, campaignIndex, { testRun: false });
  }

  async function startConfiguredMap(mapEntry, campaignIndex, options = {}) {
    // settings/campaign.jsonc хранит только порядок карт и путь к конфигу. Здесь мы читаем
    // конкретный map JSONC, генерируем новый граф и делаем весь первый уровень
    // доступным для первого выбора игрока.
    state.campaignIndex = campaignIndex;
    state.activeTestRun = options.testRun === true;
    state.activeStandaloneRun = options.standalone === true;
    state.activeMapEntry = mapEntry;
    const mapUrl = toProjectUrl(mapEntry.config);
    state.mapConfig = state.mapConfigCache.get(mapUrl) || (await loadJsonc(mapUrl));
    state.currentMapSeed = createMapSeedInfo(mapEntry, state.campaignIndex);
    state.generatedMap = generateMap(state.mapConfig, {
      random: createSeededRandom(state.currentMapSeed.seed),
    });
    state.availableNodeIds = new Set(
      state.generatedMap.levels[0].nodes.map((node) => node.id),
    );
    state.completedNodeIds = new Set();
    state.selectedPathEdges = new Set();
    state.currentNodeId = null;
    state.activeShopNode = null;
    state.activeHealNode = null;
    state.activeLockpickNode = null;
    state.activeLockpickSession = null;
    state.activeLockpickCompletion = null;
    state.shopSelection = new Map();
    state.pendingReward = null;
    state.pendingLevelUps = [];
    state.activeLevelUp = null;
    state.pendingMapCompletion = false;
    state.battleAttemptCounts = new Map();
    closeMapDialogOverlay();
    closeShop({ complete: false });
    hideRewardOverlay();
    closeLockpick();
    const levelSummary = getMapLevelSummary(state.mapConfig);
    addLog(
      formatText("log.mapGenerated", {
        map: translate(state.mapConfig.nameTextKey),
        levels: levelSummary.count,
        min: levelSummary.minNodes,
        max: levelSummary.maxNodes,
      }),
    );
    addLog(
      formatText("log.mapSeed", {
        name: state.currentMapSeed.name,
        seed: state.currentMapSeed.seed,
      }),
    );
    render();
    playMapIntroScroll();
  }

  function getRequestedRunSeed() {
    const params = new URLSearchParams(window.location.search);
    for (const paramName of runSeedQueryParams) {
      const seed = normalizeDebugSeed(params.get(paramName));
      if (seed) {
        return seed;
      }
    }
    return null;
  }

  function createMapSeedInfo(campaignEntry, campaignIndex) {
    const mapId = state.mapConfig?.id || campaignEntry?.mapId || `map-${campaignIndex + 1}`;
    const name = `map:${mapId}:${campaignIndex + 1}`;
    return {
      name,
      seed: deriveDebugSeed(state.runSeed, name),
    };
  }

  return {
    startGame,
    startTutorial,
    startSmokeTestRun,
    resetPlayerState,
    startCampaignMap,
    startConfiguredMap,
    getRequestedRunSeed,
    createMapSeedInfo,
  };
}
