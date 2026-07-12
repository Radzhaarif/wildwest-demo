export function createMapBootController(deps) {
  const {
    state,
    loadLoadUiConfig,
    applyLoadingOverlayConfig,
    showLoadingOverlay,
    updateLoadingOverlay,
    hideLoadingOverlay,
    loadingText,
    loadSettings,
    loadJson,
    getLocaleUrl,
    loadAndValidateGameData,
    preloadGameAssets,
    preloadBattleCode,
    setupAudio,
    applyAudioSettings,
    updateLocalizedUi,
    renderMenu,
    playMusic,
    resolveAssetPath,
    renderMapTopActionButtons,
    resetPlayerState,
    startCampaignMap,
  } = deps;

  async function boot() {
    // boot готовит весь runtime до показа меню: данные, ассеты и код боя.
    // START после этого только начинает новый забег из уже прогретого состояния.
    state.loadConfig = await loadLoadUiConfig();
    applyLoadingOverlayConfig();
    showLoadingOverlay({
      title: loadingText("loading.title", "Loading"),
      status: loadingText("loading.settings", "Loading settings"),
    });
    await loadSettings();
    updateLoadingOverlay({
      loaded: 1,
      total: 4,
      status: loadingText("loading.locale", "Loading locale"),
    });
    state.locale = await loadJson(getLocaleUrl(state.language));
    await loadAndValidateGameData(loadingText("loading.validation", "Checking data"));
    await preloadGameAssets(loadingText("loading.runAssets", "Preparing run assets"));
    await preloadBattleCode(loadingText("loading.battleCode", "Preparing battle code"));
    setupAudio();
    applyAudioSettings();
    updateLocalizedUi();
    renderMenu();
    playMusic(resolveAssetPath(state.settings.audio.mainMenuMusic));
    hideLoadingOverlay();
  }

  async function reloadDataAndStart() {
    // Оставлено как служебный перезапуск данных: перечитывает локаль, кампанию и
    // стартовое состояние игрока, затем возвращает текущий индекс карты.
    state.locale = await loadJson(getLocaleUrl(state.language));
    await loadAndValidateGameData(loadingText("loading.validation", "Checking data"));
    await preloadGameAssets(loadingText("loading.mapAssets", "Preparing map assets"));
    await preloadBattleCode(loadingText("loading.battleCode", "Preparing battle code"));
    renderMapTopActionButtons();
    await resetPlayerState();
    const safeIndex = Math.min(state.campaignIndex, state.campaign.maps.length - 1);
    await startCampaignMap(Math.max(safeIndex, 0));
    hideLoadingOverlay();
  }

  return {
    boot,
    reloadDataAndStart,
  };
}
