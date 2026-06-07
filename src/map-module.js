import { BATTLE_CONTRACT_VERSION } from "./battle/battle-contract.js";
import { createAudioController } from "./audio-module.js";
import { collectAssetPaths, getCachedAssetUrl, preloadAssets } from "./asset-preloader.js";
import { loadJson, loadJsonc } from "./data-loader.js";
import { validateGameData } from "./data-validation.js?v=2026-06-02-boss-event";
import { generateMap, getMapLevelSummary } from "./map/map-generation.js";
import { renderInlineRichText } from "./rich-text.js";

const DATA_ROOT = "./data";
const CAMPAIGN_URL = `${DATA_ROOT}/settings/campaign.jsonc`;
const ITEM_CATALOG_URL = `${DATA_ROOT}/settings/items.jsonc`;
const EXPERIENCE_TABLE_URL = `${DATA_ROOT}/player/experience-table.jsonc`;
const DEFAULT_PLAYER_STATE_URL = `${DATA_ROOT}/player/default-player-state.json`;
const DEFAULT_SETTINGS_URL = `${DATA_ROOT}/settings/default-settings.json`;
const CURRENT_SETTINGS_URL = `${DATA_ROOT}/settings/current-settings.json`;
const SETTINGS_STORAGE_KEY = "roguelikeCurrentSettings";
const ASSET_CACHE_BUSTER = Date.now();
const MODULE_CACHE_BUSTER = Date.now();
const STARTUP_ASSET_PATHS = [
  "data/Assets/backgrounds/main_menu.png",
  "data/Assets/cursor/ready/cursor.png",
  "data/Assets/cursor/ready/cursor_activ.png",
  "data/Assets/cursor/ready/cursor_q.png",
  "data/Assets/cursor/ready/hand-finger.png",
  "data/Assets/cursor/ready/hand.png",
  "data/Assets/cursor/ready/hand_take.png",
  "data/Assets/cursor/ready/up_down.png",
];
const FALLBACK_MAP_EVENT_ICON_PATHS = [
  "data/Assets/icons/battle.png",
  "data/Assets/icons/boss.png",
  "data/Assets/icons/reward.png",
  "data/Assets/icons/heal.png",
  "data/Assets/icons/shop.png",
  "data/Assets/icons/skip.png",
  "data/Assets/icons/dialog.png",
];
const languageChangeListeners = new Set();
const mapItemTooltipClassName = "item-tooltip";
const BATTLE_TOOLTIP_FALLBACK_MS = 3000;
const DEFAULT_MAP_TOP_ACTION_BUTTONS = {
  surrender: {
    textKey: "ui.surrender",
    icon: "data/Assets/icons/surrend.png",
  },
  settings: {
    textKey: "menu.settings",
    icon: "data/Assets/icons/setting.png",
  },
  log: {
    textKey: "ui.eventLog",
    icon: "data/Assets/icons/log.png",
  },
};
const DEFAULT_MAP_UI_LAYOUT = {
  designWidthPx: 1500,
  designHeightPx: 860,
  viewportPaddingPx: 8,
  allowUpscale: true,
  upscaleFactor: 0.5,
  minScale: 0.1,
  hudScaleReductionDivisor: 1.5,
  topButtonsScaleReductionDivisor: 1.5,
  mainMenuScaleReductionDivisor: 1.5,
  mainMenuScaleMultiplier: 1.2,
  settingsMenuScaleReductionDivisor: 1.5,
  settingsMenuScaleMultiplier: 1.2,
  settingsMenuFontScale: 1.5,
};

// Runtime-состояние всей текущей сессии. Важно: это не зеркальная копия файлов
// current-*.json, браузер меняет эти данные в памяти и в localStorage, но не
// записывает JSON обратно на диск.
const state = {
  language: "en",
  campaign: null,
  campaignIndex: 0,
  defaultSettings: null,
  settings: null,
  mapConfig: null,
  mapConfigCache: new Map(),
  mapUiConfig: null,
  battleConfigCache: null,
  itemCatalog: null,
  itemCatalogById: new Map(),
  experienceTable: null,
  locale: {},
  generatedMap: null,
  playerState: null,
  currentNodeId: null,
  availableNodeIds: new Set(),
  completedNodeIds: new Set(),
  selectedPathEdges: new Set(),
  activeShopNode: null,
  activeHealNode: null,
  shopSelection: new Map(),
  hasStartedGame: false,
  runNumber: 0,
  scrollAnimationFrame: null,
  pendingReward: null,
  pendingLevelUps: [],
  activeLevelUp: null,
  pendingMapCompletion: false,
  pendingSurrenderCallbacks: null,
  activeDialogNode: null,
  activeDialogStepId: null,
  activeDialogTextTimerId: null,
  activeDialogFullText: "",
  activeDialogVisibleTextLength: 0,
  isDialogTextTyping: false,
  activeShopCompletion: null,
  activeHealCompletion: null,
};
const audioController = createAudioController({ resolveAssetPath });
let mapItemTooltipHideTimeoutId = null;
let mapItemTooltipShowTimeoutId = null;
let battleModulePreloadPromise = null;
const mapAnimationState = {
  active: false,
  rafId: 0,
  lastTime: 0,
  birds: [],
  nextSpawnByType: new Map(),
};

// Единственная карта DOM-ссылок для JS. id/class в index.html являются частью
// контракта: если переименовать элемент в HTML, соответствующее поле здесь тоже
// нужно обновить, иначе обработчики событий и рендер оверлеев отвалятся.
const elements = {
  mainMenu: document.querySelector("#mainMenu"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingTitle: document.querySelector("#loadingTitle"),
  loadingStatus: document.querySelector("#loadingStatus"),
  loadingProgressBar: document.querySelector("#loadingProgressBar"),
  loadingProgressText: document.querySelector("#loadingProgressText"),
  mainMenuTitle: document.querySelector("#mainMenuTitle"),
  startGameButton: document.querySelector("#startGameButton"),
  settingsButton: document.querySelector("#settingsButton"),
  mapUiFrame: document.querySelector("#mapUiFrame"),
  mapUiPanel: document.querySelector("#mapUiPanel"),
  settingsOverlay: document.querySelector("#settingsOverlay"),
  settingsPanel: document.querySelector("#settingsPanel"),
  mainMenuActions: document.querySelector("#mainMenuActions"),
  settingsTitle: document.querySelector("#settingsTitle"),
  musicVolumeLabel: document.querySelector("#musicVolumeLabel"),
  musicVolumeInput: document.querySelector("#musicVolumeInput"),
  soundVolumeLabel: document.querySelector("#soundVolumeLabel"),
  soundVolumeInput: document.querySelector("#soundVolumeInput"),
  settingsLanguageLabel: document.querySelector("#settingsLanguageLabel"),
  settingsLanguageSelect: document.querySelector("#settingsLanguageSelect"),
  resetSettingsButton: document.querySelector("#resetSettingsButton"),
  backSettingsButton: document.querySelector("#backSettingsButton"),
  campaignStatus: document.querySelector("#campaignStatus"),
  selectionStatus: document.querySelector("#selectionStatus"),
  mapHud: document.querySelector("#mapHud"),
  mapViewport: document.querySelector(".map-viewport"),
  mapBoard: document.querySelector("#mapBoard"),
  mapEffects: document.querySelector("#mapEffects"),
  eventLog: document.querySelector("#eventLog"),
  eventLogOverlay: document.querySelector("#eventLogOverlay"),
  eventLogTitle: document.querySelector("#eventLogTitle"),
  eventLogButton: document.querySelector("#eventLogButton"),
  eventLogBackButton: document.querySelector("#eventLogBackButton"),
  surrenderButton: document.querySelector("#surrenderButton"),
  surrenderOverlay: document.querySelector("#surrenderOverlay"),
  surrenderText: document.querySelector("#surrenderText"),
  surrenderConfirmButton: document.querySelector("#surrenderConfirmButton"),
  surrenderCancelButton: document.querySelector("#surrenderCancelButton"),
  mapSettingsButton: document.querySelector("#mapSettingsButton"),
  eventDialog: document.querySelector("#eventDialog"),
  eventDialogImage: document.querySelector("#eventDialogImage"),
  eventDialogText: document.querySelector("#eventDialogText"),
  shopOverlay: document.querySelector("#shopOverlay"),
  shopTitle: document.querySelector("#shopTitle"),
  shopItems: document.querySelector("#shopItems"),
  shopLeaveButton: document.querySelector("#shopLeaveButton"),
  shopBuyButton: document.querySelector("#shopBuyButton"),
  shopEventImage: document.querySelector("#shopEventImage"),
  shopDialogText: document.querySelector("#shopDialogText"),
  shopConfirm: document.querySelector("#shopConfirm"),
  shopConfirmText: document.querySelector("#shopConfirmText"),
  shopConfirmNoButton: document.querySelector("#shopConfirmNoButton"),
  shopConfirmYesButton: document.querySelector("#shopConfirmYesButton"),
  shopErrorText: document.querySelector("#shopErrorText"),
  inventoryTitle: document.querySelector("#inventoryTitle"),
  inventoryItems: document.querySelector("#inventoryItems"),
  healOverlay: document.querySelector("#healOverlay"),
  healTitle: document.querySelector("#healTitle"),
  healAmountText: document.querySelector("#healAmountText"),
  healCurrentHpText: document.querySelector("#healCurrentHpText"),
  healApplyButton: document.querySelector("#healApplyButton"),
  healLeaveButton: document.querySelector("#healLeaveButton"),
  healErrorText: document.querySelector("#healErrorText"),
  healEventImage: document.querySelector("#healEventImage"),
  healDialogText: document.querySelector("#healDialogText"),
  mapDialogOverlay: document.querySelector("#mapDialogOverlay"),
  mapDialogCharacter: document.querySelector("#mapDialogCharacter"),
  mapDialogText: document.querySelector("#mapDialogText"),
  mapDialogAnswers: document.querySelector("#mapDialogAnswers"),
  rewardOverlay: document.querySelector("#rewardOverlay"),
  rewardBackdrop: document.querySelector("#rewardBackdrop"),
  rewardItems: document.querySelector("#rewardItems"),
  rewardDialogText: document.querySelector("#rewardDialogText"),
  rewardClaimButton: document.querySelector("#rewardClaimButton"),
};

// Настройки меняются сразу в runtime state и сохраняются в localStorage. Это
// перекрывает current-settings.json при следующей загрузке страницы.
elements.settingsLanguageSelect.addEventListener("change", async (event) => {
  playClickSound();
  await setLanguage(event.target.value);
  renderMenu();
});

elements.musicVolumeInput.addEventListener("input", (event) => {
  state.settings.musicVolume = Number(event.target.value);
  applyAudioSettings();
  saveSettings();
});

elements.soundVolumeInput.addEventListener("input", (event) => {
  state.settings.soundVolume = Number(event.target.value);
  applyAudioSettings();
  saveSettings();
});

elements.startGameButton.addEventListener("click", async () => {
  await startGame();
});

elements.settingsButton.addEventListener("click", () => {
  showSettingsPanel("menu");
});

elements.resetSettingsButton.addEventListener("click", async () => {
  await resetSettings();
});

elements.backSettingsButton.addEventListener("click", () => {
  hideSettingsPanel();
});

async function setLanguage(language) {
  state.language = language;
  state.settings.language = language;
  elements.settingsLanguageSelect.value = language;
  state.locale = await loadJson(getLocaleUrl(state.language));
  saveSettings();
  updateLocalizedUi();
  render();
  notifyLanguageChangeListeners();
}

function addLanguageChangeListener(listener) {
  languageChangeListeners.add(listener);
  return () => {
    languageChangeListeners.delete(listener);
  };
}

function notifyLanguageChangeListeners() {
  for (const listener of languageChangeListeners) {
    listener({
      language: state.language,
      locale: state.locale,
    });
  }
}

elements.surrenderButton.addEventListener("click", () => showSurrenderDialog());
elements.surrenderConfirmButton.addEventListener("click", confirmSurrender);
elements.surrenderCancelButton.addEventListener("click", cancelSurrender);
elements.mapSettingsButton.addEventListener("click", () => {
  showSettingsPanel("map");
});
elements.eventLogButton.addEventListener("click", showEventLogOverlay);
elements.eventLogBackButton.addEventListener("click", hideEventLogOverlay);

elements.mainMenu.addEventListener("click", (event) => {
  if (event.target === elements.mainMenu && !elements.settingsOverlay.classList.contains("hidden")) {
    hideSettingsPanel();
  }
});

elements.shopLeaveButton.addEventListener("click", () => {
  closeShop({ scrollToNext: true });
});
elements.shopBuyButton.addEventListener("click", () => {
  showShopConfirm();
});
elements.shopConfirmNoButton.addEventListener("click", () => {
  hideShopConfirm();
});
elements.shopConfirmYesButton.addEventListener("click", () => {
  confirmShopPurchase();
});
elements.healApplyButton.addEventListener("click", applyHealing);
elements.healLeaveButton.addEventListener("click", () => {
  closeHeal({ scrollToNext: true });
});
elements.rewardClaimButton.addEventListener("click", handleRewardClaim);
elements.mapDialogOverlay.addEventListener("click", (event) => {
  if (!state.isDialogTextTyping) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  completeMapDialogTextTyping();
});

initDragScroll(elements.mapViewport);
setupMapUiViewportScale();

// Общий звук клика висит на document, чтобы не дублировать playClickSound на
// каждой активной кнопке. Первый клик также помогает браузеру разрешить музыку.
document.addEventListener("click", (event) => {
  if (event.target.closest("button:not(:disabled)")) {
    playClickSound();
    startMenuMusicAfterInteraction();
  }
});

async function boot() {
  // boot готовит только меню: кампания и состояние игрока не грузятся до START.
  // Так главное меню остается быстрым, а новый запуск игры всегда заново берет
  // default-player-state.json.
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
  await preloadStartupAssets();
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
  state.campaign = await loadJsonc(CAMPAIGN_URL);
  state.itemCatalog = await loadJsonc(ITEM_CATALOG_URL);
  state.experienceTable = await loadJsonc(EXPERIENCE_TABLE_URL);
  const validation = await validateGameData(state.campaign, state.itemCatalog, state.experienceTable, {
    languages: state.settings?.languages || state.defaultSettings?.languages || ["en"],
  });
  state.mapConfigCache = validation.mapConfigCache;
  state.mapUiConfig = validation.mapUiConfig;
  state.battleConfigCache = validation.battleConfigCache;
  state.itemCatalogById = validation.itemCatalogById;
  applyMapUiScale();
  await preloadGameAssets(loadingText("loading.mapAssets", "Preparing map assets"));
  await preloadBattleCode(loadingText("loading.battleCode", "Preparing battle code"));
  renderMapTopActionButtons();
  await resetPlayerState();
  const safeIndex = Math.min(state.campaignIndex, state.campaign.maps.length - 1);
  await startCampaignMap(Math.max(safeIndex, 0));
  hideLoadingOverlay();
}

async function preloadStartupAssets() {
  await runAssetPreload(
    collectAssetPaths(
      STARTUP_ASSET_PATHS,
      state.defaultSettings,
      state.settings,
    ),
    {
      title: loadingText("loading.title", "Loading"),
      status: loadingText("loading.menuAssets", "Loading menu assets"),
    },
  );
}

async function preloadGameAssets(status) {
  const enemyConfigs = state.battleConfigCache?.enemyConfigCache
    ? [...state.battleConfigCache.enemyConfigCache.values()]
    : [];
  const mapConfigs = state.mapConfigCache
    ? [...state.mapConfigCache.values()]
    : [];

  await runAssetPreload(
    collectAssetPaths(
      STARTUP_ASSET_PATHS,
      FALLBACK_MAP_EVENT_ICON_PATHS,
      state.settings,
      state.campaign,
      state.itemCatalog,
      state.experienceTable,
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
  if (!battleModulePreloadPromise) {
    battleModulePreloadPromise = import(`./battle/battle-module.js?v=${MODULE_CACHE_BUSTER}`);
  }
  return battleModulePreloadPromise;
}

function showLoadingOverlay({ title, status } = {}) {
  if (!elements.loadingOverlay) {
    return;
  }
  elements.loadingOverlay.classList.remove("hidden");
  elements.loadingOverlay.setAttribute("aria-busy", "true");
  if (elements.loadingTitle) {
    elements.loadingTitle.textContent = title || loadingText("loading.title", "Loading");
  }
  updateLoadingOverlay({
    loaded: 0,
    total: 1,
    status: status || loadingText("loading.assets", "Loading assets"),
  });
}

function hideLoadingOverlay() {
  if (!elements.loadingOverlay) {
    return;
  }
  elements.loadingOverlay.classList.add("hidden");
  elements.loadingOverlay.setAttribute("aria-busy", "false");
}

function showLoadingError(error) {
  showLoadingOverlay({
    title: loadingText("loading.error", "Loading error"),
    status: error?.message || String(error),
  });
  updateLoadingOverlay({
    loaded: 0,
    total: 1,
    status: error?.message || String(error),
  });
}

function updateLoadingOverlay({ loaded = 0, total = 1, status = "" } = {}) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeLoaded = Math.max(0, Math.min(Number(loaded) || 0, safeTotal));
  const percent = Math.round((safeLoaded / safeTotal) * 100);
  if (elements.loadingProgressBar) {
    elements.loadingProgressBar.style.width = `${percent}%`;
  }
  if (elements.loadingProgressText) {
    elements.loadingProgressText.textContent = `${percent}% (${safeLoaded}/${safeTotal})`;
  }
  if (elements.loadingStatus && status) {
    elements.loadingStatus.textContent = status;
  }
}

function getAssetPreloadStatus(baseStatus, current, failed) {
  if (failed?.length) {
    return formatTextWithFallback(
      "loading.failed",
      "Failed assets: {count}",
      { count: failed.length },
    );
  }
  if (!current) {
    return baseStatus || loadingText("loading.assets", "Loading assets");
  }
  return `${baseStatus || loadingText("loading.assets", "Loading assets")}: ${getAssetFileName(current)}`;
}

function getAssetFileName(assetPath) {
  const normalized = String(assetPath || "").replaceAll("\\", "/");
  return normalized.split("/").pop() || normalized;
}

function loadingText(key, fallback) {
  return state.locale?.[key] || fallback;
}

function formatTextWithFallback(key, fallback, values) {
  return Object.entries(values).reduce((text, [name, value]) => {
    return text.replaceAll(`{${name}}`, String(value));
  }, state.locale?.[key] || fallback);
}

async function startGame() {
  // Новый старт всегда сбрасывает игрока из default-player-state.json. Файл
  // current-player-state.json сейчас не используется как источник сохранения.
  elements.startGameButton.disabled = true;
  showLoadingOverlay({
    title: translate("menu.start"),
    status: loadingText("loading.validation", "Checking data"),
  });
  try {
    const campaign = await loadJsonc(CAMPAIGN_URL);
    const itemCatalog = await loadJsonc(ITEM_CATALOG_URL);
    const experienceTable = await loadJsonc(EXPERIENCE_TABLE_URL);
    const validation = await validateGameData(campaign, itemCatalog, experienceTable, {
      languages: state.settings?.languages || state.defaultSettings?.languages || ["en"],
    });
    state.campaign = campaign;
    state.itemCatalog = itemCatalog;
    state.experienceTable = experienceTable;
    state.mapConfigCache = validation.mapConfigCache;
    state.mapUiConfig = validation.mapUiConfig;
    state.battleConfigCache = validation.battleConfigCache;
    state.itemCatalogById = validation.itemCatalogById;
    await preloadGameAssets(loadingText("loading.runAssets", "Preparing run assets"));
    await preloadBattleCode(loadingText("loading.battleCode", "Preparing battle code"));
    renderMapTopActionButtons();
    await resetPlayerState();
    state.hasStartedGame = true;
    state.runNumber += 1;
    addRunLogHeader(
      formatText("log.runStarted", {
        run: state.runNumber,
        campaign: translate(state.campaign.nameTextKey),
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
    hideLoadingOverlay();
    elements.startGameButton.disabled = false;
  }
}

async function loadSettings() {
  // Приоритет настроек: default-settings.json как база, current-settings.json
  // как стартовое текущее значение, затем localStorage поверх пользовательских
  // полей. Структурные списки и rewardAnimationMs специально берутся из файлов,
  // чтобы правки JSON сразу управляли игрой без очистки localStorage.
  state.defaultSettings = await loadJson(DEFAULT_SETTINGS_URL);
  const currentSettings = await loadJson(CURRENT_SETTINGS_URL);
  const storedSettings = loadStoredSettings();
  const fileSettings = currentSettings || state.defaultSettings;
  state.settings = mergeSettings({
    ...fileSettings,
    ...(storedSettings || {}),
    languages: fileSettings.languages || state.defaultSettings.languages,
    rewardAnimationMs: fileSettings.rewardAnimationMs || state.defaultSettings.rewardAnimationMs,
  });
  state.settings.audio = {
    ...state.defaultSettings.audio,
    ...(fileSettings.audio || {}),
  };
  state.language = state.settings.language;
  applyVisualSettings();
}

function mergeSettings(settings) {
  // Глубоко объединяем вложенные настройки: иначе добавление нового звука или
  // параметра анимации в default-settings.json могло бы потеряться из-за старых сохраненных настроек.
  return {
    ...structuredClone(state.defaultSettings),
    ...structuredClone(settings),
    audio: {
      ...state.defaultSettings.audio,
      ...(settings.audio || {}),
    },
    rewardAnimationMs: {
      ...state.defaultSettings.rewardAnimationMs,
      ...(settings.rewardAnimationMs || {}),
    },
    languages: settings.languages || state.defaultSettings.languages || ["en"],
  };
}

function loadStoredSettings() {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
}

async function resetSettings() {
  // Сброс копирует именно дефолтный JSON в runtime/localStorage, после чего
  // заново загружает локаль и аудио по дефолтному language/audio.
  state.settings = structuredClone(state.defaultSettings);
  state.language = state.settings.language;
  saveSettings();
  state.locale = await loadJson(getLocaleUrl(state.language));
  setupAudio();
  applyAudioSettings();
  applyVisualSettings();
  updateLocalizedUi();
  renderMenu();
  notifyLanguageChangeListeners();
}

function setupAudio() {
  // Audio-объекты создаются из путей настроек, поэтому смена JSON настроек или
  // сброс должны пересоздавать их через resolveAssetPath.
  audioController.setup(state.settings);
}

function applyAudioSettings() {
  audioController.applySettings(state.settings);
}

function applyVisualSettings() {
  const iconSize = Number(state.settings?.inlineItemIconEm);
  const safeIconSize = Number.isFinite(iconSize) && iconSize > 0 ? iconSize : 2.1;
  const tooltipFontSize = Number(state.settings?.tooltipFontSizePx);
  const safeTooltipFontSize = Number.isFinite(tooltipFontSize) && tooltipFontSize > 0 ? tooltipFontSize : 16;
  const tooltipMaxWidth = Number(state.settings?.tooltipMaxWidthPx);
  const safeTooltipMaxWidth = Number.isFinite(tooltipMaxWidth) && tooltipMaxWidth > 0 ? tooltipMaxWidth : 360;
  document.documentElement.style.setProperty("--inline-item-icon-size", `${safeIconSize}em`);
  document.documentElement.style.setProperty("--tooltip-font-size", `${safeTooltipFontSize}px`);
  document.documentElement.style.setProperty("--tooltip-max-width", `${safeTooltipMaxWidth}px`);
}

function playClickSound() {
  audioController.playClick(state.settings);
}

function playMusic(src) {
  // Если источник уже тот же, не пересоздаем Audio. Если поменяли меню/карту или
  // настройки звука, создаем новый объект и снова применяем громкость.
  audioController.playMusic(src, state.settings);
}

function resumeMapMusicAfterBattle() {
  audioController.resumeMapMusicAfterBattle(state.settings);
}

function startBattleMusic(battleMusicPath) {
  audioController.startBattleMusic(battleMusicPath, state.settings);
}
function startMenuMusicAfterInteraction() {
  if (!state.hasStartedGame) {
    playMusic(resolveAssetPath(state.settings.audio.mainMenuMusic));
  }
}

function renderMenu() {
  elements.mainMenu.style.backgroundImage = `url("${resolveAssetPath(`${DATA_ROOT}/Assets/backgrounds/main_menu.png`)}")`;
  renderLanguageOptions();
  elements.mainMenuTitle.textContent = translate("menu.title");
  elements.startGameButton.textContent = translate("menu.start");
  elements.settingsButton.textContent = translate("menu.settings");
  renderMapTopActionButtons();
  elements.musicVolumeInput.value = state.settings.musicVolume;
  elements.soundVolumeInput.value = state.settings.soundVolume;
  elements.settingsLanguageSelect.value = state.settings.language;
  updateLocalizedUi();
}

function renderLanguageOptions() {
  const languages = state.settings.languages || state.defaultSettings.languages || ["en"];
  renderLanguageSelectOptions(elements.settingsLanguageSelect, languages);
}

function renderLanguageSelectOptions(select, languages) {
  // Название языка берется из текущей локали по ключу language.<id>. Поэтому
  // новый язык должен иметь одноименный JSON-файл и ключ имени во всех локалях.
  select.innerHTML = "";
  for (const language of languages) {
    const option = document.createElement("option");
    option.value = language;
    option.textContent = getLanguageName(language);
    select.append(option);
  }
}

function getLanguageName(language) {
  return state.locale[`language.${language}`] || language;
}

function getLocaleUrl(language) {
  return `${DATA_ROOT}/locales/${language}.json`;
}

function updateLocalizedUi() {
  elements.settingsTitle.textContent = translate("menu.settings");
  elements.musicVolumeLabel.textContent = translate("settings.musicVolume");
  elements.soundVolumeLabel.textContent = translate("settings.soundVolume");
  elements.settingsLanguageLabel.textContent = translate("settings.language");
  elements.resetSettingsButton.textContent = translate("settings.reset");
  elements.backSettingsButton.textContent = translate("ui.back");
  elements.startGameButton.textContent = translate("menu.start");
  elements.settingsButton.textContent = translate("menu.settings");
  elements.mainMenuTitle.textContent = translate("menu.title");
  elements.settingsLanguageSelect.value = state.language;
  renderMapTopActionButtons();
  elements.eventLogBackButton.textContent = translate("ui.back");
  elements.eventLogTitle.textContent = translate("ui.eventLog");
  elements.shopConfirmYesButton.textContent = translate("ui.yes");
  elements.shopConfirmNoButton.textContent = translate("ui.no");
  elements.surrenderText.textContent = translate("surrender.question");
  elements.surrenderConfirmButton.textContent = translate("surrender.confirm");
  elements.surrenderCancelButton.textContent = translate("surrender.cancel");
}

function getMapTopActionButtonConfig(actionId) {
  const source =
    state.mapUiConfig?.topButtons?.[actionId] ||
    DEFAULT_MAP_TOP_ACTION_BUTTONS[actionId] ||
    {};
  return {
    textKey: source.textKey || actionId,
    icon: source.icon || "",
    iconSizePx: getPositiveNumber(source.iconSizePx, 38),
  };
}

function renderMapTopActionButtons() {
  const surrenderConfig = getMapTopActionButtonConfig("surrender");
  const settingsConfig = getMapTopActionButtonConfig("settings");
  const logConfig = getMapTopActionButtonConfig("log");

  applyMapTopActionButton(elements.surrenderButton, surrenderConfig);
  applyMapTopActionButton(elements.mapSettingsButton, settingsConfig);
  applyMapTopActionButton(elements.eventLogButton, logConfig);
}

function applyMapTopActionButton(button, config) {
  if (!button) {
    return;
  }
  const label = translate(config.textKey);
  button.classList.add("map-top-button");
  button.textContent = "";
  if (config.icon) {
    button.append(createMapTopActionButtonIcon(config.icon));
  }
  button.style.setProperty("--map-top-button-icon-size", `${config.iconSizePx}px`);
  button.append(createMapTopActionButtonLabel(label));
  button.setAttribute("aria-label", label);
  button.title = label;
}

function createMapTopActionButtonIcon(iconPath) {
  const icon = document.createElement("img");
  icon.className = "map-top-button-icon";
  icon.src = resolveAssetPath(iconPath);
  icon.alt = "";
  return icon;
}

function createMapTopActionButtonLabel(text) {
  const label = document.createElement("span");
  label.className = "map-top-button-label";
  label.textContent = text || "";
  return label;
}

function showSettingsPanel(source) {
  // Один и тот же overlay используется и в главном меню, и на карте. source
  // нужен, чтобы при закрытии вернуть кнопки меню только если настройки открыты
  // из меню, а не поверх карты.
  elements.settingsOverlay.dataset.source = source;
  elements.mainMenuActions.classList.add("hidden");
  elements.settingsOverlay.classList.remove("hidden");
}

function hideSettingsPanel() {
  const source = elements.settingsOverlay.dataset.source;
  elements.settingsOverlay.classList.add("hidden");
  if (source === "menu") {
    elements.mainMenuActions.classList.remove("hidden");
  }
}

function surrenderToMainMenu() {
  stopMapAnimations();
  closeShop({ complete: false });
  closeHeal({ complete: false });
  closeReward({ scrollToNext: false });
  closeMapDialogOverlay();
  hideEventLogOverlay();
  hideSettingsPanel();
  hideSurrenderDialog();
  state.hasStartedGame = false;
  elements.mainMenu.classList.remove("hidden");
  elements.mainMenuActions.classList.remove("hidden");
  playMusic(resolveAssetPath(state.settings.audio.mainMenuMusic));
}

function showSurrenderDialog(callbacks = null) {
  state.pendingSurrenderCallbacks = callbacks;
  elements.surrenderText.textContent = translate("surrender.question");
  elements.surrenderConfirmButton.textContent = translate("surrender.confirm");
  elements.surrenderCancelButton.textContent = translate("surrender.cancel");
  elements.surrenderOverlay.classList.remove("hidden");
}

function confirmSurrender() {
  const callbacks = state.pendingSurrenderCallbacks;
  state.pendingSurrenderCallbacks = null;
  if (typeof callbacks?.onConfirm === "function") {
    callbacks.onConfirm();
  }
  surrenderToMainMenu();
}

function cancelSurrender() {
  const callbacks = state.pendingSurrenderCallbacks;
  state.pendingSurrenderCallbacks = null;
  if (typeof callbacks?.onCancel === "function") {
    callbacks.onCancel();
  }
  hideSurrenderDialog();
}

function hideSurrenderDialog() {
  elements.surrenderOverlay.classList.add("hidden");
}

function showEventLogOverlay() {
  elements.eventLogOverlay.classList.remove("hidden");
}

function hideEventLogOverlay() {
  elements.eventLogOverlay.classList.add("hidden");
}

function setupMapUiViewportScale() {
  const resizeTarget = window.visualViewport || window;
  resizeTarget.addEventListener("resize", applyMapUiScale);
  window.addEventListener("orientationchange", applyMapUiScale);
  applyMapUiScale();
}

function applyMapUiScale() {
  const layout = getMapUiLayoutConfig();
  const viewport = getMapViewportSize();
  const availableWidth = Math.max(1, viewport.width - layout.viewportPaddingPx * 2);
  const availableHeight = Math.max(1, viewport.height - layout.viewportPaddingPx * 2);
  const fitScale = Math.min(
    availableWidth / layout.designWidthPx,
    availableHeight / layout.designHeightPx,
  );
  const scale = fitScale > 1
    ? (layout.allowUpscale ? 1 + (fitScale - 1) * layout.upscaleFactor : 1)
    : Math.max(fitScale, layout.minScale);
  const settingsMenuScale = getReducedMapUiScale(scale, layout.settingsMenuScaleReductionDivisor)
    * layout.settingsMenuScaleMultiplier;
  const settingsMenuLocalScale = settingsMenuScale / Math.max(0.001, scale);

  document.documentElement.style.setProperty("--map-ui-current-scale", String(scale));
  document.documentElement.style.setProperty("--map-hud-scale", String(getReducedMapUiScale(scale, layout.hudScaleReductionDivisor)));
  document.documentElement.style.setProperty("--map-top-buttons-scale", String(getReducedMapUiScale(scale, layout.topButtonsScaleReductionDivisor)));
  document.documentElement.style.setProperty(
    "--main-menu-scale",
    String(getReducedMapUiScale(scale, layout.mainMenuScaleReductionDivisor) * layout.mainMenuScaleMultiplier),
  );
  document.documentElement.style.setProperty("--settings-menu-local-scale", String(settingsMenuLocalScale));
  document.documentElement.style.setProperty("--settings-menu-font-scale", String(layout.settingsMenuFontScale));
  document.documentElement.style.setProperty("--map-ui-design-width", `${layout.designWidthPx}px`);
  document.documentElement.style.setProperty("--map-ui-design-height", `${layout.designHeightPx}px`);
  document.documentElement.style.setProperty("--map-ui-viewport-padding", `${layout.viewportPaddingPx}px`);
  applyMapPermanentUiScale(elements.mapUiFrame, layout, scale);
  for (const frame of getMapUiOverlayFrames()) {
    applyMapUiFrameScale(frame, layout, scale);
  }
}

function getMapUiOverlayFrames() {
  return [...document.querySelectorAll(".map-ui-overlay-frame")];
}

function applyMapPermanentUiScale(frame, layout, scale) {
  if (!frame) {
    return;
  }
  frame.style.width = "";
  frame.style.height = "";
  frame.style.setProperty("--map-ui-design-width", `${layout.designWidthPx}px`);
  frame.style.setProperty("--map-ui-design-height", `${layout.designHeightPx}px`);
  frame.style.setProperty("--map-ui-scale", String(scale));

  const panel = frame.firstElementChild;
  if (!panel) {
    return;
  }
  panel.style.setProperty("--map-ui-design-width", `${layout.designWidthPx}px`);
  panel.style.setProperty("--map-ui-design-height", `${layout.designHeightPx}px`);
  panel.style.setProperty("--map-ui-scale", String(scale));
}

function applyMapUiFrameScale(frame, layout, scale) {
  frame.style.width = `${layout.designWidthPx * scale}px`;
  frame.style.height = `${layout.designHeightPx * scale}px`;
  frame.style.setProperty("--map-ui-design-width", `${layout.designWidthPx}px`);
  frame.style.setProperty("--map-ui-design-height", `${layout.designHeightPx}px`);
  frame.style.setProperty("--map-ui-scale", String(scale));

  const panel = frame.firstElementChild;
  if (!panel) {
    return;
  }
  panel.style.setProperty("--map-ui-design-width", `${layout.designWidthPx}px`);
  panel.style.setProperty("--map-ui-design-height", `${layout.designHeightPx}px`);
  panel.style.setProperty("--map-ui-scale", String(scale));
}

function getMapViewportSize() {
  const visualViewport = window.visualViewport;
  return {
    width: Number(visualViewport?.width) || window.innerWidth || document.documentElement.clientWidth || DEFAULT_MAP_UI_LAYOUT.designWidthPx,
    height: Number(visualViewport?.height) || window.innerHeight || document.documentElement.clientHeight || DEFAULT_MAP_UI_LAYOUT.designHeightPx,
  };
}

function getMapUiLayoutConfig() {
  const layout = state.mapUiConfig?.layout || {};
  const designWidthPx = getPositiveNumber(layout.designWidthPx, DEFAULT_MAP_UI_LAYOUT.designWidthPx);
  const designHeightPx = getPositiveNumber(layout.designHeightPx, DEFAULT_MAP_UI_LAYOUT.designHeightPx);
  const viewportPaddingPx = Math.max(0, getFiniteNumber(layout.viewportPaddingPx, DEFAULT_MAP_UI_LAYOUT.viewportPaddingPx));
  const upscaleFactor = clampNumber(
    getFiniteNumber(layout.upscaleFactor, DEFAULT_MAP_UI_LAYOUT.upscaleFactor),
    0,
    1,
  );
  const minScale = clampNumber(
    getFiniteNumber(layout.minScale, DEFAULT_MAP_UI_LAYOUT.minScale),
    0.1,
    2,
  );
  const hudScaleReductionDivisor = Math.max(1, getFiniteNumber(
    layout.hudScaleReductionDivisor,
    DEFAULT_MAP_UI_LAYOUT.hudScaleReductionDivisor,
  ));
  const topButtonsScaleReductionDivisor = Math.max(1, getFiniteNumber(
    layout.topButtonsScaleReductionDivisor,
    DEFAULT_MAP_UI_LAYOUT.topButtonsScaleReductionDivisor,
  ));
  const mainMenuScaleReductionDivisor = Math.max(1, getFiniteNumber(
    layout.mainMenuScaleReductionDivisor,
    DEFAULT_MAP_UI_LAYOUT.mainMenuScaleReductionDivisor,
  ));
  const mainMenuScaleMultiplier = Math.max(0.1, getFiniteNumber(
    layout.mainMenuScaleMultiplier,
    DEFAULT_MAP_UI_LAYOUT.mainMenuScaleMultiplier,
  ));
  const settingsMenuScaleReductionDivisor = Math.max(1, getFiniteNumber(
    layout.settingsMenuScaleReductionDivisor,
    DEFAULT_MAP_UI_LAYOUT.settingsMenuScaleReductionDivisor,
  ));
  const settingsMenuScaleMultiplier = Math.max(0.1, getFiniteNumber(
    layout.settingsMenuScaleMultiplier,
    DEFAULT_MAP_UI_LAYOUT.settingsMenuScaleMultiplier,
  ));
  const settingsMenuFontScale = Math.max(0.1, getFiniteNumber(
    layout.settingsMenuFontScale,
    DEFAULT_MAP_UI_LAYOUT.settingsMenuFontScale,
  ));
  return {
    designWidthPx,
    designHeightPx,
    viewportPaddingPx,
    allowUpscale: typeof layout.allowUpscale === "boolean"
      ? layout.allowUpscale
      : DEFAULT_MAP_UI_LAYOUT.allowUpscale,
    upscaleFactor,
    minScale,
    hudScaleReductionDivisor,
    topButtonsScaleReductionDivisor,
    mainMenuScaleReductionDivisor,
    mainMenuScaleMultiplier,
    settingsMenuScaleReductionDivisor,
    settingsMenuScaleMultiplier,
    settingsMenuFontScale,
  };
}

function getReducedMapUiScale(scale, reductionDivisor) {
  if (scale >= 1) {
    return scale;
  }
  return 1 - (1 - scale) / Math.max(1, reductionDivisor);
}

function getFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function resetPlayerState() {
  state.playerState = structuredClone(await loadJson(DEFAULT_PLAYER_STATE_URL));
  normalizePlayerHealthByInventory(state.playerState);
}

async function startCampaignMap(campaignIndex) {
  // settings/campaign.jsonc хранит только порядок карт и путь к конфигу. Здесь мы читаем
  // конкретный map JSONC, генерируем новый граф и делаем весь первый уровень
  // доступным для первого выбора игрока.
  state.campaignIndex = campaignIndex;
  const campaignEntry = state.campaign.maps[state.campaignIndex];
  const mapUrl = toProjectUrl(campaignEntry.config);
  state.mapConfig = state.mapConfigCache.get(mapUrl) || (await loadJsonc(mapUrl));
  state.generatedMap = generateMap(state.mapConfig);
  state.availableNodeIds = new Set(
    state.generatedMap.levels[0].nodes.map((node) => node.id),
  );
  state.completedNodeIds = new Set();
  state.selectedPathEdges = new Set();
  state.currentNodeId = null;
  state.activeShopNode = null;
  state.activeHealNode = null;
  state.shopSelection = new Map();
  state.pendingReward = null;
  state.pendingLevelUps = [];
  state.activeLevelUp = null;
  state.pendingMapCompletion = false;
  closeMapDialogOverlay();
  closeShop({ complete: false });
  hideRewardOverlay();
  const levelSummary = getMapLevelSummary(state.mapConfig);
  addLog(
    formatText("log.mapGenerated", {
      map: translate(state.mapConfig.nameTextKey),
      levels: levelSummary.count,
      min: levelSummary.minNodes,
      max: levelSummary.maxNodes,
    }),
  );
  render();
  playMapIntroScroll();
}

function toProjectUrl(path) {
  return path.startsWith("data/") ? `./${path}` : path;
}

function compareNodeIds(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomNumberInRange(range, fallback = 0) {
  if (!range || typeof range !== "object") {
    return fallback;
  }
  const min = Number(range.min);
  const max = Number(range.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return fallback;
  }
  return min + Math.random() * (max - min);
}

function pickRandomItem(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return items[randomInt(0, items.length - 1)];
}

function initDragScroll(viewport) {
  // Drag-scroll включается только при нажатии на пустую область карты. Нажатие
  // по .map-node должно активировать событие, а не восприниматься как скролл.
  let isDragging = false;
  let startY = 0;
  let startScrollTop = 0;

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }
    if (event.target.closest(".map-node")) {
      return;
    }
    isDragging = true;
    startY = event.clientY;
    startScrollTop = viewport.scrollTop;
    viewport.classList.add("dragging");
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!isDragging) {
      return;
    }
    event.preventDefault();
    viewport.scrollTop = startScrollTop - (event.clientY - startY);
  });

  const stopDragging = (event) => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    viewport.classList.remove("dragging");
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);
  viewport.addEventListener("pointerleave", stopDragging);
}

function render() {
  // Полный перерендер карты: фон, SVG-дороги, кнопки-точки и HUD. Состояние
  // дорог берется из currentNodeId/availableNodeIds/selectedPathEdges.
  if (!state.generatedMap) {
    return;
  }

  elements.campaignStatus.textContent = `${translate(
    state.campaign.nameTextKey,
  )} · map ${state.campaignIndex + 1}/${state.campaign.maps.length}`;
  elements.mapBoard.style.backgroundImage = `url("${resolveAssetPath(
    state.mapConfig.mapImage,
  )}")`;
  elements.mapBoard.innerHTML = "";
  ensureMapEffectsLayer();
  elements.mapBoard.style.minHeight = `${getMapHeight()}px`;
  applyMapNodeVisualSettings();

  const nodePositions = getNodePositions();
  renderPaths(nodePositions);
  renderNodes(nodePositions);
  renderHud();
  startMapAnimations();
}

function ensureMapEffectsLayer() {
  if (!elements.mapBoard || !elements.mapEffects) {
    return;
  }
  if (elements.mapEffects.parentElement !== elements.mapBoard) {
    elements.mapBoard.append(elements.mapEffects);
  }
}

function applyMapNodeVisualSettings() {
  const config = getMapNodeVisualConfig();
  elements.mapBoard.style.setProperty("--map-node-hover-scale", String(config.hoverScale));
  elements.mapBoard.style.setProperty("--map-node-active-light-size", `${config.activeLightSizePx}px`);
  elements.mapBoard.style.setProperty("--map-node-hover-light-size", `${config.hoverLightSizePx}px`);
}

function getMapNodeVisualConfig() {
  const source = state.mapUiConfig?.nodes || {};
  return {
    hoverScale: getPositiveNumber(source.hoverScale, 1.5),
    activeLightIcon: source.activeLightIcon || "data/Assets/icons/light_white.png",
    activeLightSizePx: getPositiveNumber(source.activeLightSizePx, 96),
    hoverLightIcon: source.hoverLightIcon || "data/Assets/icons/light_gold.png",
    hoverLightSizePx: getPositiveNumber(source.hoverLightSizePx, 88),
  };
}

function renderHud() {
  // HUD читает порядок, подписи и иконки из каталога предметов. Базовые строки
  // отмечены showInHudAlways, а остальные предметы появляются только при quantity > 0.
  if (!state.playerState) {
    return;
  }

  const baseHudItems = getSortedItemDefinitions().filter((item) => item.showInHudAlways);
  const renderedItemIds = new Set(baseHudItems.map((item) => item.itemId));
  elements.mapHud.innerHTML = "";

  for (const item of baseHudItems) {
    if (item.hudValue === "health") {
      elements.mapHud.append(createHealthHudItem(item));
    } else if (item.hudValue === "experience") {
      elements.mapHud.append(createExperienceHudItem(item));
    } else {
      elements.mapHud.append(createInventoryHudItem(item.itemId, getInventoryQuantity(item.itemId)));
    }
  }

  const inventoryItems = [...state.playerState.inventory].sort((a, b) => {
    return getItemHudOrder(a.itemId) - getItemHudOrder(b.itemId) || a.itemId.localeCompare(b.itemId);
  });
  for (const item of inventoryItems) {
    if (renderedItemIds.has(item.itemId) || item.quantity <= 0) {
      continue;
    }
    elements.mapHud.append(createInventoryHudItem(item.itemId, item.quantity));
  }
}

function createHealthHudItem(item) {
  return createHudItem({
    imageSrc: getItemImagePath(item.itemId),
    label: getItemName(item.itemId),
    title: getItemDescription(item.itemId),
    value: `${state.playerState.health.current}/${state.playerState.health.max}`,
  });
}

function createExperienceHudItem(item) {
  return createHudItem({
    imageSrc: getItemImagePath(item.itemId),
    label: getItemName(item.itemId),
    title: getItemDescription(item.itemId),
    value: getExperienceHudValue(),
  });
}

function getExperienceHudValue() {
  const total = state.playerState.experience?.total || 0;
  const nextLevel = getNextExperienceLevel(total);
  if (!nextLevel) {
    return translate("ui.maxLevel");
  }
  return `${total}/${nextLevel.requiredExperience}`;
}

function getNextExperienceLevel(totalExperience) {
  const levels = Array.isArray(state.experienceTable?.levels) ? state.experienceTable.levels : [];
  return levels.find((level) => level.requiredExperience > totalExperience) || null;
}

function createInventoryHudItem(itemId, quantity) {
  return createHudItem({
    imageSrc: getItemImagePath(itemId),
    label: getItemName(itemId),
    title: getItemDescription(itemId),
    value: String(quantity),
  });
}

function createHudItem({ imageSrc, label, title, value }) {
  const item = document.createElement("div");
  item.className = "hud-item";

  const image = document.createElement("img");
  image.src = imageSrc;
  image.alt = "";

  const text = document.createElement("span");
  text.textContent = value;

  attachMapItemTooltip(item, {
    name: label || "",
    description: title || "",
    icon: imageSrc,
  });
  item.append(image, text);
  return item;
}

function getMapHeight() {
  const levelCount = state.generatedMap.levels.length;
  return Math.max(980, levelCount * 170);
}

function getNodePositions() {
  // Карта вертикальная: уровень 1 визуально ниже, босс выше. Координаты в
  // процентах, чтобы SVG-линии и кнопки точек совпадали при изменении размера.
  const positions = new Map();
  const levelCount = state.generatedMap.levels.length;
  const orderedLevels = getMapLayoutOrderedLevels();

  for (const level of orderedLevels) {
    const y = 92 - (level.level / (levelCount + 1)) * 82;
    level.nodes.forEach((node, index) => {
      const baseX = ((index + 1) / (level.nodes.length + 1)) * 78 + 11;
      const jitter = getStableNodeJitter(node);
      const maxOrderSafeJitter = Math.max(0, 78 / (level.nodes.length + 1) / 2 - 2);
      const x = clamp(baseX + clamp(jitter.x, -maxOrderSafeJitter, maxOrderSafeJitter), 9, 91);
      positions.set(node.id, { x, y: clamp(y + jitter.y, 8, 92), node });
    });
  }

  return positions;
}

function getMapLayoutOrderedLevels() {
  const orderedLevels = state.generatedMap.levels.map((level) => ({
    level: level.level,
    nodes: [...level.nodes],
  }));
  const layoutPasses = getMapLayoutPasses();

  for (let pass = 0; pass < layoutPasses; pass += 1) {
    for (let index = 1; index < orderedLevels.length; index += 1) {
      orderedLevels[index].nodes = orderLevelByNeighborBarycenter(
        orderedLevels[index].nodes,
        orderedLevels[index - 1].nodes,
        "incoming",
      );
    }
    for (let index = orderedLevels.length - 2; index >= 0; index -= 1) {
      orderedLevels[index].nodes = orderLevelByNeighborBarycenter(
        orderedLevels[index].nodes,
        orderedLevels[index + 1].nodes,
        "outgoing",
      );
    }
  }

  return orderedLevels;
}

function orderLevelByNeighborBarycenter(nodes, neighborNodes, direction) {
  const neighborIndexById = new Map(neighborNodes.map((node, index) => [node.id, index]));
  return [...nodes].sort((a, b) => {
    return getNodeBarycenter(a, neighborIndexById, direction) -
      getNodeBarycenter(b, neighborIndexById, direction) ||
      compareNodeIds(a.id, b.id);
  });
}

function getNodeBarycenter(node, neighborIndexById, direction) {
  const indexes = [];
  if (direction === "outgoing") {
    for (const targetId of node.connectedTo) {
      if (neighborIndexById.has(targetId)) {
        indexes.push(neighborIndexById.get(targetId));
      }
    }
  } else {
    for (const level of state.generatedMap.levels) {
      for (const sourceNode of level.nodes) {
        if (sourceNode.connectedTo.includes(node.id) && neighborIndexById.has(sourceNode.id)) {
          indexes.push(neighborIndexById.get(sourceNode.id));
        }
      }
    }
  }
  if (indexes.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return indexes.reduce((sum, index) => sum + index, 0) / indexes.length;
}

function getMapLayoutPasses() {
  return Math.max(0, Math.trunc(getPositiveNumber(state.mapUiConfig?.nodes?.layoutPasses, 0)));
}

function getStableNodeJitter(node) {
  // Разброс строится от id точки, а не от Math.random(), чтобы карта не дергалась
  // при каждом render(), смене языка или обновлении HUD.
  const jitter = getMapNodeJitterConfig();
  return {
    x: hashToRange(`${state.mapConfig.id}:${node.id}:x`, jitter.x.min, jitter.x.max),
    y: hashToRange(`${state.mapConfig.id}:${node.id}:y`, jitter.y.min, jitter.y.max),
  };
}

function getMapNodeJitterConfig() {
  const source = state.mapUiConfig?.nodes?.positionJitterPct || {};
  return {
    x: getNumberRangeConfig(source.x, -8.5, 8.5),
    y: getNumberRangeConfig(source.y, -2.2, 2.2),
  };
}

function getNumberRangeConfig(range, fallbackMin, fallbackMax) {
  if (!range || typeof range !== "object") {
    return { min: fallbackMin, max: fallbackMax };
  }
  const min = Number(range.min);
  const max = Number(range.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: fallbackMin, max: fallbackMax };
  }
  return min <= max ? { min, max } : { min: max, max: min };
}

function hashToRange(seed, min, max) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const ratio = (hash >>> 0) / 4294967295;
  return min + (max - min) * ratio;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function orderNodesByConnectionScore(nodes) {
  // Узлы с большим количеством входящих/исходящих связей ставятся ближе к
  // центру уровня, чтобы развилки выглядели естественнее и меньше путали игрока.
  const centerFirstSlots = getCenterFirstSlots(nodes.length);
  const sortedByScore = [...nodes].sort((a, b) => {
    return getConnectionScore(b) - getConnectionScore(a) || compareNodeIds(a.id, b.id);
  });
  const ordered = Array(nodes.length);

  sortedByScore.forEach((node, index) => {
    ordered[centerFirstSlots[index]] = node;
  });

  return ordered;
}

function getCenterFirstSlots(count) {
  return Array.from({ length: count }, (_, index) => index).sort((a, b) => {
    const center = (count - 1) / 2;
    return Math.abs(a - center) - Math.abs(b - center) || a - b;
  });
}

function getConnectionScore(node) {
  return getIncomingConnectionCount(node.id) + node.connectedTo.length;
}

function getIncomingConnectionCount(nodeId) {
  let count = 0;
  for (const level of state.generatedMap.levels) {
    for (const node of level.nodes) {
      if (node.connectedTo.includes(nodeId)) {
        count += 1;
      }
    }
  }
  return count;
}

function renderPaths(positions) {
  // Цвет дороги зависит только от state:
  // completed-path зеленый и никогда не бледнеет;
  // available-path желтый только от текущей точки к доступным следующим;
  // остальные линии остаются бледными.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("path-layer");

  for (const { node, x, y } of positions.values()) {
    for (const targetId of node.connectedTo) {
      const target = positions.get(targetId);
      if (!target) {
        continue;
      }
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", `${x}%`);
      line.setAttribute("y1", `${y}%`);
      line.setAttribute("x2", `${target.x}%`);
      line.setAttribute("y2", `${target.y}%`);
      line.classList.add("path-line");
      if (state.selectedPathEdges.has(getEdgeId(node.id, targetId))) {
        line.classList.add("completed-path");
      } else if (node.id === state.currentNodeId && state.availableNodeIds.has(targetId)) {
        line.classList.add("available-path");
      }
      svg.append(line);
    }
  }

  elements.mapBoard.append(svg);
}

function renderNodes(positions) {
  // Точки - это button, а не div: disabled блокирует недоступные переходы.
  // Иконка берется по типу события из data/Assets/icons/<eventType>.png.
  const nodeVisualConfig = getMapNodeVisualConfig();
  for (const { node, x, y } of positions.values()) {
    const isAvailable = state.availableNodeIds.has(node.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = getNodeClassName(node);
    button.dataset.nodeId = node.id;
    button.style.left = `${x}%`;
    button.style.top = `${y}%`;
    button.disabled = !isAvailable;
    button.setAttribute("aria-label", getNodeTitle(node));
    button.addEventListener("click", () => {
      void activateNode(node);
    });

    if (isAvailable && nodeVisualConfig.activeLightIcon) {
      const activeLight = document.createElement("img");
      activeLight.className = "node-active-light";
      activeLight.src = resolveAssetPath(nodeVisualConfig.activeLightIcon);
      activeLight.alt = "";
      activeLight.setAttribute("aria-hidden", "true");
      button.append(activeLight);
    }

    if (isAvailable && nodeVisualConfig.hoverLightIcon) {
      const light = document.createElement("img");
      light.className = "node-hover-light";
      light.src = resolveAssetPath(nodeVisualConfig.hoverLightIcon);
      light.alt = "";
      light.setAttribute("aria-hidden", "true");
      button.append(light);
    }

    const icon = document.createElement("img");
    icon.className = "node-icon";
    icon.src = getNodeIconPath(node);
    icon.alt = node.eventType;
    button.append(icon);
    elements.mapBoard.append(button);
  }
}

function startMapAnimations() {
  ensureMapEffectsLayer();
  if (!shouldRunMapAnimations()) {
    stopMapAnimations();
    return;
  }
  if (mapAnimationState.active) {
    return;
  }

  elements.mapEffects.innerHTML = "";
  mapAnimationState.active = true;
  mapAnimationState.lastTime = performance.now();
  mapAnimationState.birds = [];
  mapAnimationState.nextSpawnByType = createInitialMapAnimationSpawnSchedule(mapAnimationState.lastTime);
  mapAnimationState.rafId = requestAnimationFrame(updateMapAnimations);
}

function stopMapAnimations() {
  if (mapAnimationState.rafId) {
    cancelAnimationFrame(mapAnimationState.rafId);
  }
  mapAnimationState.active = false;
  mapAnimationState.rafId = 0;
  mapAnimationState.lastTime = 0;
  mapAnimationState.birds = [];
  mapAnimationState.nextSpawnByType.clear();
  if (elements.mapEffects) {
    elements.mapEffects.innerHTML = "";
  }
}

function shouldRunMapAnimations() {
  return Boolean(
    state.hasStartedGame &&
      state.generatedMap &&
      elements.mapEffects &&
      getMapAnimationConfig()?.enabled !== false,
  );
}

function createInitialMapAnimationSpawnSchedule(now) {
  const schedule = new Map();
  for (const countConfig of getMapAnimationCountConfigs()) {
    schedule.set(countConfig.type, now);
  }
  return schedule;
}

function updateMapAnimations(now) {
  if (!shouldRunMapAnimations()) {
    stopMapAnimations();
    return;
  }

  const deltaMs = Math.max(0, now - mapAnimationState.lastTime);
  mapAnimationState.lastTime = now;
  spawnMapAnimations(now);
  updateMapBirds(now, deltaMs);
  mapAnimationState.rafId = requestAnimationFrame(updateMapAnimations);
}

function spawnMapAnimations(now) {
  for (const countConfig of getMapAnimationCountConfigs()) {
    const activeCount = mapAnimationState.birds.filter((bird) => bird.type === countConfig.type).length;
    if (activeCount >= countConfig.maxActive) {
      continue;
    }
    const nextSpawnAt = mapAnimationState.nextSpawnByType.get(countConfig.type) || now;
    if (now < nextSpawnAt) {
      continue;
    }
    if (countConfig.type === "bird") {
      spawnMapBird();
    }
    mapAnimationState.nextSpawnByType.set(
      countConfig.type,
      now + randomNumberInRange(countConfig.spawnIntervalMs),
    );
  }
}

function spawnMapBird() {
  const definition = pickRandomItem(getEnabledMapAnimationDefinitions("bird"));
  if (!definition || !elements.mapEffects) {
    return;
  }

  const visibleRect = getVisibleMapAnimationRect();
  if (!visibleRect || visibleRect.width <= 0 || visibleRect.height <= 0) {
    return;
  }

  const size = getPositiveNumber(definition.sizePx, 72);
  const spawnEdge = pickRandomItem(definition.spawnEdges || ["right"]);
  const heading = randomNumberInRange(definition.headingDegrees);
  const radians = (heading * Math.PI) / 180;
  const speed = getPositiveNumber(definition.movementSpeedPxPerSecond, 120);
  const dx = Math.sin(radians) * speed;
  const dy = -Math.cos(radians) * speed;
  const start = getMapAnimationSpawnPoint(spawnEdge, visibleRect, size, { dx, dy });
  const frameIntervalMs = getPositiveNumber(definition.frameIntervalMs, 120);
  const element = document.createElement("img");

  element.className = "map-animation-bird";
  element.src = resolveAssetPath(definition.glideFrame || definition.frames?.[0] || "");
  element.alt = "";
  element.style.setProperty("--map-bird-size", `${size}px`);
  elements.mapEffects.append(element);

  const bird = {
    type: "bird",
    element,
    definition,
    x: start.x,
    y: start.y,
    dx,
    dy,
    heading,
    size,
    phase: "glide",
    nextPhaseAt: performance.now() + randomNumberInRange(definition.glideDurationMs),
    nextFrameAt: 0,
    frameIndex: 0,
    frameIntervalMs,
  };

  positionMapBird(bird);
  mapAnimationState.birds.push(bird);
}

function updateMapBirds(now, deltaMs) {
  const mapBounds = getMapAnimationBoundsRect();
  if (!mapBounds) {
    return;
  }
  const liveBirds = [];

  for (const bird of mapAnimationState.birds) {
    bird.x += (bird.dx * deltaMs) / 1000;
    bird.y += (bird.dy * deltaMs) / 1000;
    updateMapBirdFrame(bird, now);
    positionMapBird(bird);

    if (isMapBirdOutOfBounds(bird, mapBounds)) {
      bird.element.remove();
    } else {
      liveBirds.push(bird);
    }
  }

  mapAnimationState.birds = liveBirds;
}

function updateMapBirdFrame(bird, now) {
  const frames = Array.isArray(bird.definition.frames) ? bird.definition.frames : [];
  if (frames.length === 0) {
    return;
  }

  if (bird.phase === "glide" && now >= bird.nextPhaseAt) {
    bird.phase = "flap";
    bird.frameIndex = 0;
    bird.nextFrameAt = now;
  }

  if (bird.phase !== "flap" || now < bird.nextFrameAt) {
    return;
  }

  bird.element.src = resolveAssetPath(frames[bird.frameIndex]);
  bird.frameIndex += 1;
  if (bird.frameIndex >= frames.length) {
    bird.phase = "glide";
    bird.element.src = resolveAssetPath(bird.definition.glideFrame || frames[0]);
    bird.nextPhaseAt = now + randomNumberInRange(bird.definition.glideDurationMs);
    return;
  }
  bird.nextFrameAt = now + bird.frameIntervalMs;
}

function positionMapBird(bird) {
  const offset = Number(bird.definition.spriteAngleOffsetDegrees);
  const shouldRotateWithHeading = bird.definition.rotateWithHeading === true;
  const rotation = (shouldRotateWithHeading ? bird.heading : 0) + (Number.isFinite(offset) ? offset : 0);
  bird.element.style.transform = `translate(${bird.x}px, ${bird.y}px) translate(-50%, -50%) rotate(${rotation}deg)`;
}

function isMapBirdOutOfBounds(bird, rect) {
  const margin = bird.size * 1.5;
  return (
    bird.x < rect.left - margin ||
    bird.x > rect.left + rect.width + margin ||
    bird.y < rect.top - margin ||
    bird.y > rect.top + rect.height + margin
  );
}

function getMapAnimationSpawnPoint(edge, rect, size, direction = { dx: 0, dy: 0 }) {
  const margin = size * 0.8;
  if (edge === "left") {
    return {
      x: rect.left - margin,
      y: getMapAnimationCrossingCoordinate(rect.top, rect.height, direction.dy, margin),
    };
  }
  if (edge === "top") {
    return {
      x: getMapAnimationCrossingCoordinate(rect.left, rect.width, direction.dx, margin),
      y: rect.top - margin,
    };
  }
  if (edge === "bottom") {
    return {
      x: getMapAnimationCrossingCoordinate(rect.left, rect.width, direction.dx, margin),
      y: rect.top + rect.height + margin,
    };
  }
  return {
    x: rect.left + rect.width + margin,
    y: getMapAnimationCrossingCoordinate(rect.top, rect.height, direction.dy, margin),
  };
}

function getMapAnimationCrossingCoordinate(start, size, velocity, margin) {
  if (velocity > 0) {
    return randomNumberInRange({ min: start - margin, max: start + size * 0.55 });
  }
  if (velocity < 0) {
    return randomNumberInRange({ min: start + size * 0.45, max: start + size + margin });
  }
  return randomNumberInRange({ min: start, max: start + size });
}

function getVisibleMapAnimationRect() {
  if (!elements.mapViewport || !elements.mapBoard) {
    return null;
  }
  const viewportRect = elements.mapViewport.getBoundingClientRect();
  const boardRect = elements.mapBoard.getBoundingClientRect();
  return {
    left: viewportRect.left - boardRect.left,
    top: viewportRect.top - boardRect.top,
    width: viewportRect.width,
    height: viewportRect.height,
  };
}

function getMapAnimationBoundsRect() {
  if (!elements.mapBoard) {
    return null;
  }
  const width = Math.max(elements.mapBoard.offsetWidth, elements.mapBoard.clientWidth);
  const height = Math.max(elements.mapBoard.offsetHeight, elements.mapBoard.clientHeight, getMapHeight());
  return {
    left: 0,
    top: 0,
    width,
    height,
  };
}

function getMapAnimationConfig() {
  return state.mapUiConfig?.animation || null;
}

function getMapAnimationCountConfigs() {
  const counts = getMapAnimationConfig()?.counts;
  return Array.isArray(counts) ? counts.filter((entry) => entry.maxActive > 0) : [];
}

function getEnabledMapAnimationDefinitions(type) {
  const definitions = getMapAnimationConfig()?.definitions;
  if (!Array.isArray(definitions)) {
    return [];
  }
  return definitions.filter((definition) => definition.type === type && definition.enabled !== false);
}

function playMapIntroScroll() {
  // При старте карты камера сначала стоит сверху и за 3 секунды плавно
  // опускается вниз. Это визуально показывает длину маршрута до первого выбора.
  requestAnimationFrame(() => {
    const viewport = elements.mapViewport;
    viewport.scrollTop = 0;
    const targetScrollTop = viewport.scrollHeight - viewport.clientHeight;
    const duration = 3000;
    const startTime = performance.now();

    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      viewport.scrollTop = targetScrollTop * easeInOutCubic(progress);
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  });
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function getNodeClassName(node) {
  const classes = ["map-node", node.eventType];
  if (node.eventName === "boss") {
    classes.push("boss");
  }
  if (state.availableNodeIds.has(node.id)) {
    classes.push("available");
  } else {
    classes.push("locked");
  }
  if (state.completedNodeIds.has(node.id)) {
    classes.push("completed");
  }
  return classes.join(" ");
}

function getNodeIconPath(node) {
  if (node.eventIcon) {
    return toProjectUrl(node.eventIcon);
  }
  return `${DATA_ROOT}/Assets/icons/${node.eventType}.png`;
}

function getNodeTitle(node) {
  if (node.payload?.nodeTitleTextKey) {
    return translate(node.payload.nodeTitleTextKey);
  }
  if (node.eventType === "skip") {
    return translate(node.payload.textKey);
  }
  return node.eventType;
}

function getNodeDescription(node) {
  const payload = node?.payload || {};
  const keys = [
    node.eventType === "skip" ? payload.textKey : null,
    payload.dialogTextKey,
    payload.nodeTitleTextKey,
  ].filter(Boolean);
  for (const key of keys) {
    const text = translate(key);
    if (text && text !== key) {
      return text;
    }
  }
  return "";
}

async function activateNode(node) {
  if (node.eventType === "battle") {
    await openBattleModule(node);
    elements.selectionStatus.textContent = `${node.id} В· ${node.eventType}`;
    render();
    return;
  }
  if (node.eventType === "dialog") {
    openMapDialogEvent(node);
    elements.selectionStatus.textContent = `${node.id} · ${node.eventType}`;
    render();
    return;
  }
  // Выбор точки одновременно продвигает игрока по графу и открывает нужный
  // модуль события. selectedPathEdges хранит уже пройденные ребра для зеленой
  // подсветки, availableNodeIds становится списком разрешенных следующих точек.
  if (state.currentNodeId) {
    state.selectedPathEdges.add(getEdgeId(state.currentNodeId, node.id));
  }
  state.currentNodeId = node.id;
  state.completedNodeIds.add(node.id);
  state.availableNodeIds = new Set(node.connectedTo);
  addLog(
    formatText("log.nodeSelected", {
      node: node.id,
      event: node.eventType,
      next: node.connectedTo.length,
    }),
  );

  if (node.eventType === "skip") {
    const message = translate(node.payload.textKey);
    showDialog(message, () => {
      if (!completeMapIfTerminalNode(node)) {
        scrollAvailableNodesIntoActionZone();
      }
    });
    addLog(formatText("log.skipResolved", { node: node.id, message }));
  } else if (node.eventType === "reward") {
    resolveReward(node, { onApplied: () => completeMapIfTerminalNode(node) });
  } else if (node.eventType === "shop") {
    openShop(node, { onClose: () => completeMapIfTerminalNode(node) });
  } else if (node.eventType === "heal") {
    openHeal(node, { onClose: () => completeMapIfTerminalNode(node) });
  } else {
    addLog(`${node.id}: ${node.eventType}`);
  }

  elements.selectionStatus.textContent = `${node.id} · ${node.eventType}`;
  render();
}

function completeMapNode(node, eventType = node.eventType, options = {}) {
  if (state.currentNodeId) {
    state.selectedPathEdges.add(getEdgeId(state.currentNodeId, node.id));
  }
  state.currentNodeId = node.id;
  state.completedNodeIds.add(node.id);
  state.availableNodeIds = new Set(node.connectedTo);
  addLog(
    formatText("log.nodeSelected", {
      node: node.id,
      event: eventType,
      next: node.connectedTo.length,
    }),
  );
  render();
  if (completeMapIfTerminalNode(node)) {
    return;
  }
  if (options.scrollToNext !== false) {
    scrollAvailableNodesIntoActionZone();
  }
}

function completeMapIfTerminalNode(node) {
  if (!node || node.connectedTo.length > 0) {
    return false;
  }
  if (state.activeLevelUp || state.pendingLevelUps.length > 0) {
    state.pendingMapCompletion = true;
    return true;
  }
  completeMap();
  return true;
}

function completePendingMapIfReady() {
  if (!state.pendingMapCompletion || state.activeLevelUp || state.pendingLevelUps.length > 0) {
    return false;
  }
  state.pendingMapCompletion = false;
  completeMap();
  return true;
}

function openMapDialogEvent(node) {
  state.activeDialogNode = node;
  state.activeDialogStepId = getInitialDialogStepId(node.payload);
  applyMapDialogUiSettings(node.payload);
  renderMapDialogStep();
  elements.mapDialogOverlay.classList.remove("hidden");
  addLog(formatText("log.dialogOpened", { node: node.id }));
}

function getInitialDialogStepId(payload) {
  if (payload?.initialStepId) {
    return payload.initialStepId;
  }
  const firstStep = Array.isArray(payload?.steps) ? payload.steps[0] : null;
  return firstStep?.stepId || "";
}

function applyMapDialogUiSettings(payload = {}) {
  const config = getMapDialogUiConfig();
  elements.mapDialogOverlay.style.setProperty("--map-dialog-backdrop-opacity", String(config.backdropOpacity));
  elements.mapDialogOverlay.style.setProperty("--map-dialog-backdrop-blur", `${config.backdropBlurPx}px`);
  elements.mapDialogOverlay.style.setProperty("--map-dialog-answers-fade-ms", `${config.answersFadeMs}ms`);
  if (payload.characterWidthPct !== undefined) {
    elements.mapDialogCharacter.style.setProperty("--map-dialog-character-width", `${getPositiveNumber(payload.characterWidthPct, 72)}%`);
  } else {
    elements.mapDialogCharacter.style.setProperty("--map-dialog-character-width", `${getPositiveNumber(payload.characterWidthPx, 420)}px`);
  }
  elements.mapDialogCharacter.style.setProperty("--map-dialog-character-bottom", `${getPositiveNumber(payload.characterBottomPx, 150)}px`);
  elements.mapDialogCharacter.style.setProperty("--map-dialog-character-left", `${getPositiveNumber(payload.characterCenterXPct, 50)}%`);
  elements.mapDialogCharacter.style.setProperty("--map-dialog-character-top", `${getPositiveNumber(payload.characterCenterYPct, 50)}%`);
  elements.mapDialogCharacter.classList.toggle("map-dialog-character--centered-y", payload.characterCenterYPct !== undefined);
  setEventImage(elements.mapDialogCharacter, payload.characterImage, translate(payload.characterNameTextKey || "sweety.name"));
}

function getMapDialogUiConfig() {
  const dialog = state.mapUiConfig?.dialog || {};
  return {
    backdropOpacity: getPositiveNumber(dialog.backdropOpacity, 0.72),
    backdropBlurPx: getPositiveNumber(dialog.backdropBlurPx, 5),
    textLetterMs: getPositiveNumber(dialog.textLetterMs, 100),
    answersFadeMs: getPositiveNumber(dialog.answersFadeMs, 1000),
  };
}

function renderMapDialogStep() {
  const node = state.activeDialogNode;
  const step = getDialogStep(node?.payload, state.activeDialogStepId);
  if (!node || !step) {
    finishMapDialogNode();
    return;
  }

  startMapDialogTextTyping(translate(step.textKey));
  elements.mapDialogAnswers.innerHTML = "";
  elements.mapDialogAnswers.classList.remove("is-visible");
  for (const answer of step.answers || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = translate(answer.textKey);
    button.addEventListener("click", () => handleMapDialogAnswer(answer));
    elements.mapDialogAnswers.append(button);
  }
}

function startMapDialogTextTyping(text) {
  clearMapDialogTextTimer();
  state.activeDialogFullText = text || "";
  state.activeDialogVisibleTextLength = 0;
  state.isDialogTextTyping = state.activeDialogFullText.length > 0;
  elements.mapDialogText.textContent = "";
  if (!state.isDialogTextTyping) {
    showMapDialogAnswers();
    return;
  }
  scheduleNextMapDialogLetter();
}

function scheduleNextMapDialogLetter() {
  const { textLetterMs } = getMapDialogUiConfig();
  state.activeDialogTextTimerId = window.setTimeout(() => {
    state.activeDialogVisibleTextLength += 1;
    elements.mapDialogText.textContent = state.activeDialogFullText.slice(0, state.activeDialogVisibleTextLength);
    if (state.activeDialogVisibleTextLength >= state.activeDialogFullText.length) {
      state.isDialogTextTyping = false;
      state.activeDialogTextTimerId = null;
      showMapDialogAnswers();
      return;
    }
    scheduleNextMapDialogLetter();
  }, textLetterMs);
}

function completeMapDialogTextTyping() {
  clearMapDialogTextTimer();
  elements.mapDialogText.textContent = state.activeDialogFullText;
  state.activeDialogVisibleTextLength = state.activeDialogFullText.length;
  state.isDialogTextTyping = false;
  showMapDialogAnswers();
}

function showMapDialogAnswers() {
  if (!state.activeDialogNode) {
    return;
  }
  requestAnimationFrame(() => {
    if (!state.activeDialogNode) {
      return;
    }
    elements.mapDialogAnswers.classList.add("is-visible");
  });
}

function clearMapDialogTextTimer() {
  if (state.activeDialogTextTimerId !== null) {
    window.clearTimeout(state.activeDialogTextTimerId);
    state.activeDialogTextTimerId = null;
  }
}

function getDialogStep(payload, stepId) {
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  return steps.find((step) => step.stepId === stepId) || steps[0] || null;
}

async function handleMapDialogAnswer(answer) {
  if (!state.activeDialogNode) {
    return;
  }
  if (answer.nextStepId) {
    state.activeDialogStepId = answer.nextStepId;
    renderMapDialogStep();
    return;
  }
  if (answer.eventName) {
    const dialogNode = state.activeDialogNode;
    closeMapDialogOverlay();
    await runDialogLinkedEvent(dialogNode, answer.eventName);
    return;
  }
  finishMapDialogNode();
}

async function runDialogLinkedEvent(dialogNode, eventName) {
  const eventConfig = getMapEventCatalog(state.mapConfig).get(eventName);
  if (!eventConfig) {
    showDialog(`Unknown dialog event: ${eventName}`, () => finishMapDialogNode(dialogNode));
    return;
  }
  const linkedNode = {
    ...dialogNode,
    eventName: eventConfig.name,
    eventType: eventConfig.type,
    eventIcon: eventConfig.icon,
    payload: pickEventPayload(state.mapConfig, eventConfig.name, eventConfig.type, dialogNode.level),
  };

  if (linkedNode.eventType === "battle") {
    await openBattleModule(linkedNode);
  } else if (linkedNode.eventType === "reward") {
    resolveReward(linkedNode, {
      onApplied: () => finishMapDialogNode(dialogNode, { scrollToNext: false }),
    });
  } else if (linkedNode.eventType === "shop") {
    openShop(linkedNode, {
      onClose: () => finishMapDialogNode(dialogNode),
    });
  } else if (linkedNode.eventType === "heal") {
    openHeal(linkedNode, {
      onClose: () => finishMapDialogNode(dialogNode),
    });
  } else if (linkedNode.eventType === "skip") {
    const message = translate(linkedNode.payload.textKey);
    showDialog(message, () => finishMapDialogNode(dialogNode));
    addLog(formatText("log.skipResolved", { node: dialogNode.id, message }));
  } else if (linkedNode.eventType === "dialog") {
    openMapDialogEvent(linkedNode);
  } else {
    finishMapDialogNode(dialogNode);
  }
}

function finishMapDialogNode(node = state.activeDialogNode, options = {}) {
  closeMapDialogOverlay();
  if (!node || state.completedNodeIds.has(node.id)) {
    return;
  }
  completeMapNode(node, "dialog", options);
  addLog(formatText("log.dialogResolved", { node: node.id }));
}

function closeMapDialogOverlay() {
  if (!elements.mapDialogOverlay) {
    return;
  }
  clearMapDialogTextTimer();
  elements.mapDialogOverlay.classList.add("hidden");
  elements.mapDialogAnswers.innerHTML = "";
  elements.mapDialogAnswers.classList.remove("is-visible");
  elements.mapDialogText.textContent = "";
  state.activeDialogNode = null;
  state.activeDialogStepId = null;
  state.activeDialogFullText = "";
  state.activeDialogVisibleTextLength = 0;
  state.isDialogTextTyping = false;
}

async function openBattleModule(node) {
  stopMapAnimations();
  try {
    const request = createBattleRequest(node);
    exposeLegacyContextAlias(request);
    const { startBattle } = await importBattleModule();
    const result = await startBattle(request, {
      loaders: { loadJsonc },
      callbacks: {
        onOpenSettings: () => {
          showSettingsPanel("map");
          return elements.settingsOverlay;
        },
        onLanguageChange: addLanguageChangeListener,
        onBattleStart: ({ enemyConfig }) => {
          if (!state.settings?.audio) {
            return;
          }
          startBattleMusic(enemyConfig?.battle_music);
        },
        onBattleEnd: () => {
          resumeMapMusicAfterBattle();
        },
        onSurrender: (callbacks) => {
          showSurrenderDialog(callbacks);
          return elements.surrenderOverlay;
        },
      },
    });
    for (const message of result.logMessages) {
      addLog(message);
    }
    addLog(`${node.id}: battle module returned ${result.outcome}`);
    if (result.outcome === "victory") {
      openBattleRewardAfterVictory(node, result);
    }
  } catch (error) {
    console.error(error);
    showDialog(error.message);
  }
}

function exposeLegacyContextAlias(request) {
  if (typeof window !== "undefined" && request) {
    window.context = request;
    window.contex = request;
  }
}

function openBattleRewardAfterVictory(node, result) {
  state.playerState = result.playerState;
  normalizePlayerHealthByInventory(state.playerState);
  if (!result.reward || !Array.isArray(result.reward.rewards) || result.reward.rewards.length === 0) {
    completeBattleNodeAfterVictory(node, result);
    return;
  }

  const grantedRewards = pickRewardEntries(result.reward);
  const grantedItems = grantedRewards.map(createGrantedRewardItem).filter(Boolean);
  const grantedLabels = grantedItems.map((item) => item.label);
  const rewardText = grantedLabels.length > 0 ? grantedLabels.join(", ") : "-";

  state.pendingReward = {
    nodeId: node.id,
    entries: grantedRewards,
    logText: rewardText,
    onApplied: () => completeBattleNodeAfterVictory(node, result, { keepCurrentPlayerState: true, scrollToNext: false }),
  };
  showRewardOverlay({
    eventImage: result.reward.eventImage || node.payload.background,
    message: translate(result.reward.dialogTextKey),
    rewards: grantedItems,
  });
}

function completeBattleNodeAfterVictory(node, result, options = {}) {
  if (state.currentNodeId) {
    state.selectedPathEdges.add(getEdgeId(state.currentNodeId, node.id));
  }
  state.currentNodeId = node.id;
  state.completedNodeIds.add(node.id);
  state.availableNodeIds = new Set(node.connectedTo);
  if (!options.keepCurrentPlayerState) {
    state.playerState = result.playerState;
    normalizePlayerHealthByInventory(state.playerState);
  }
  addLog(
    formatText("log.nodeSelected", {
      node: node.id,
      event: node.eventType,
      next: node.connectedTo.length,
    }),
  );
  render();
  if (completeMapIfTerminalNode(node)) {
    return;
  }
  if (options.scrollToNext !== false) {
    scrollAvailableNodesIntoActionZone();
  }
}

function createBattleRequest(node) {
  return {
    contractVersion: BATTLE_CONTRACT_VERSION,
    nodeId: node.id,
    nodeType: node.eventType,
    enemyId: node.payload.enemyId,
    background: node.payload.background,
    playerState: state.playerState,
    itemCatalog: state.itemCatalog,
    locale: state.locale,
    settings: state.settings,
    language: state.language,
  };
}

function scrollAvailableNodesIntoActionZone() {
  if (state.availableNodeIds.size === 0) {
    return;
  }

  requestAnimationFrame(() => {
    const viewport = elements.mapViewport;
    const boardRect = elements.mapBoard.getBoundingClientRect();
    const availableNodes = [...state.availableNodeIds]
      .map((nodeId) => elements.mapBoard.querySelector(`[data-node-id="${nodeId}"]`))
      .filter(Boolean);

    if (availableNodes.length === 0) {
      return;
    }

    const centerY =
      availableNodes.reduce((sum, node) => {
        const rect = node.getBoundingClientRect();
        return sum + rect.top - boardRect.top + rect.height / 2;
      }, 0) / availableNodes.length;
    const targetTop = centerY - viewport.clientHeight * 0.68;
    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
    const nextScrollTop = Math.max(0, Math.min(targetTop, maxScrollTop));

    animateViewportScroll(nextScrollTop, 1000);
  });
}

function animateViewportScroll(targetScrollTop, duration) {
  const viewport = elements.mapViewport;
  const startScrollTop = viewport.scrollTop;
  const distance = targetScrollTop - startScrollTop;
  const startTime = performance.now();

  if (state.scrollAnimationFrame) {
    cancelAnimationFrame(state.scrollAnimationFrame);
  }

  if (Math.abs(distance) < 1) {
    viewport.scrollTop = targetScrollTop;
    state.scrollAnimationFrame = null;
    return;
  }

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    viewport.scrollTop = startScrollTop + distance * easeInOutCubic(progress);
    if (progress < 1) {
      state.scrollAnimationFrame = requestAnimationFrame(step);
    } else {
      state.scrollAnimationFrame = null;
    }
  }

  state.scrollAnimationFrame = requestAnimationFrame(step);
}

function resolveReward(node, options = {}) {
  const grantedRewards = pickRewardEntries(node.payload);
  const grantedItems = grantedRewards.map(createGrantedRewardItem).filter(Boolean);
  const grantedLabels = grantedItems.map((item) => item.label);
  const rewardText = grantedLabels.length > 0 ? grantedLabels.join(", ") : "-";

  state.pendingReward = {
    nodeId: node.id,
    entries: grantedRewards,
    logText: rewardText,
    onApplied: options.onApplied,
  };
  showRewardOverlay({
    eventImage: node.payload.eventImage,
    message: translate(node.payload.dialogTextKey),
    rewards: grantedItems,
  });
}

function pickRewardEntries(payload) {
  const rewards = Array.isArray(payload.rewards) ? [...payload.rewards] : [];
  const count = Math.min(payload.itemCount || rewards.length, rewards.length);
  const selected = [];

  while (selected.length < count && rewards.length > 0) {
    const index = randomInt(0, rewards.length - 1);
    selected.push(rewards.splice(index, 1)[0]);
  }

  return selected;
}

function createGrantedRewardItem(reward) {
  if (reward.type === "gold") {
    const amount = reward.amount || 0;
    return {
      itemId: "gold",
      amount,
      label: `${amount}x ${getItemName("gold")}`,
    };
  }

  if (reward.type === "experience") {
    const amount = reward.amount || 0;
    return {
      itemId: "exp",
      amount,
      label: `${amount}x ${getItemName("exp")}`,
    };
  }

  if (reward.type === "health") {
    const amount = reward.amount || 0;
    return {
      itemId: "health",
      amount,
      label: `${amount}x ${getItemName("health")}`,
    };
  }

  if (reward.type === "item") {
    const amount = reward.amount || 1;
    return {
      itemId: reward.itemId,
      amount,
      label: `${amount}x ${getItemName(reward.itemId)}`,
    };
  }

  return null;
}

function applyRewardEntry(reward) {
  if (reward.type === "gold") {
    changeInventoryQuantity("gold", reward.amount || 0);
  } else if (reward.type === "experience") {
    addExperience(reward.amount || 0);
  } else if (reward.type === "health") {
    state.playerState.health.current = Math.min(
      state.playerState.health.max,
      state.playerState.health.current + (reward.amount || 0),
    );
  } else if (reward.type === "item") {
    changeInventoryQuantity(reward.itemId, reward.amount || 1);
  }
}

function addExperience(amount) {
  if (!state.playerState.experience) {
    state.playerState.experience = { level: 1, total: 0 };
  }
  const previousTotal = getExperienceTotal();
  const gainedExperience = Math.max(0, Number(amount) || 0);
  const nextTotal = previousTotal + gainedExperience;
  state.playerState.experience.total = nextTotal;
  state.playerState.experience.level = Math.max(1, getCurrentExperienceLevel(nextTotal).level);
  queueReachedLevelUps(previousTotal, nextTotal);
}

function getExperienceTotal() {
  return Math.max(0, Number(state.playerState.experience?.total) || 0);
}

function getCurrentExperienceLevel(totalExperience) {
  const levels = Array.isArray(state.experienceTable?.levels) ? state.experienceTable.levels : [];
  return [...levels]
    .reverse()
    .find((level) => level.requiredExperience <= totalExperience) || { level: 1 };
}

function queueReachedLevelUps(previousTotal, nextTotal) {
  const levels = Array.isArray(state.experienceTable?.levels) ? state.experienceTable.levels : [];
  for (const level of levels) {
    if (level.requiredExperience <= previousTotal || level.requiredExperience > nextTotal) {
      continue;
    }
    if (!Array.isArray(level.rewards) || level.rewards.length === 0 || level.rewardCount <= 0) {
      continue;
    }
    state.pendingLevelUps.push(level);
  }
}

function pickLevelRewardOptions(level) {
  const rewards = Array.isArray(level?.rewards) ? [...level.rewards] : [];
  const count = Math.min(level.rewardCount || rewards.length, rewards.length);
  const selected = [];

  while (selected.length < count && rewards.length > 0) {
    const totalWeight = rewards.reduce((sum, reward) => sum + Math.max(0, reward.weight || 0), 0);
    let roll = Math.random() * totalWeight;
    let selectedIndex = 0;

    if (totalWeight <= 0) {
      selectedIndex = randomInt(0, rewards.length - 1);
    } else {
      for (let index = 0; index < rewards.length; index += 1) {
        roll -= Math.max(0, rewards[index].weight || 0);
        if (roll <= 0) {
          selectedIndex = index;
          break;
        }
      }
    }

    selected.push(rewards.splice(selectedIndex, 1)[0]);
  }

  return selected;
}

function applyLevelReward(reward) {
  if (!reward) {
    return;
  }
  changeInventoryQuantity(reward.itemId, reward.amount || 1);
}

function showRewardOverlay({ eventImage, message, rewards }) {
  state.activeLevelUp = null;
  applyRewardAnimationSettings();
  elements.rewardBackdrop.style.backgroundImage = `url("${resolveAssetPath(eventImage)}")`;
  elements.rewardItems.innerHTML = "";
  for (const [index, reward] of rewards.entries()) {
    elements.rewardItems.append(createRewardItem(reward, index));
  }
  elements.rewardDialogText.textContent = message;
  elements.rewardClaimButton.textContent = translate("ui.claimReward");
  elements.rewardClaimButton.disabled = false;
  elements.rewardOverlay.classList.remove("reward-overlay--choice");
  elements.rewardOverlay.classList.remove("hidden");
}

function showNextLevelUpReward(options = {}) {
  while (state.pendingLevelUps.length > 0) {
    const level = state.pendingLevelUps.shift();
    const rewards = pickLevelRewardOptions(level);
    if (rewards.length === 0) {
      continue;
    }

    state.activeLevelUp = {
      level,
      rewards,
      selectedIndex: null,
      scrollToNext: options.scrollToNext !== false,
    };
    applyRewardAnimationSettings();
    elements.rewardBackdrop.style.backgroundImage = `url("${resolveAssetPath(level.eventImage)}")`;
    elements.rewardItems.innerHTML = "";
    for (const [index, reward] of rewards.entries()) {
      elements.rewardItems.append(createRewardItem(
        {
          itemId: reward.itemId,
          amount: reward.amount || 1,
        },
        index,
        { selectable: true },
      ));
    }
    elements.rewardDialogText.textContent = translate(level.textKey);
    elements.rewardClaimButton.textContent = translate("ui.claimReward");
    elements.rewardClaimButton.disabled = true;
    elements.rewardOverlay.classList.add("reward-overlay--choice");
    elements.rewardOverlay.classList.remove("hidden");
    return true;
  }

  return false;
}

function createRewardItem(reward, index, options = {}) {
  const animation = getRewardAnimationSettings();
  const item = document.createElement(options.selectable ? "button" : "article");
  item.className = "reward-item";
  if (options.selectable) {
    item.type = "button";
    item.classList.add("reward-item--choice");
    item.dataset.rewardIndex = String(index);
    item.setAttribute("aria-pressed", "false");
    item.addEventListener("click", () => selectLevelReward(index));
  }
  item.style.setProperty("--reward-delay-ms", `${animation.iconDelayMs + index * animation.iconStaggerMs}ms`);

  const image = document.createElement("img");
  image.src = getItemBigImagePath(reward.itemId) || getItemImagePath(reward.itemId);
  image.alt = getItemName(reward.itemId);

  const name = document.createElement("strong");
  name.textContent = getItemName(reward.itemId);

  const amount = document.createElement("span");
  amount.textContent = `x${reward.amount}`;

  attachMapItemTooltip(item, {
    name: getItemName(reward.itemId),
    description: getItemDescription(reward.itemId),
    icon: getItemImagePath(reward.itemId),
  });
  item.append(image, name, amount);
  return item;
}

function selectLevelReward(index) {
  if (!state.activeLevelUp || !state.activeLevelUp.rewards[index]) {
    return;
  }
  state.activeLevelUp.selectedIndex = index;
  elements.rewardItems.querySelectorAll(".reward-item--choice").forEach((item) => {
    const isSelected = Number(item.dataset.rewardIndex) === index;
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
  elements.rewardClaimButton.disabled = false;
}

function applyRewardAnimationSettings() {
  const animation = getRewardAnimationSettings();
  elements.rewardOverlay.style.setProperty("--reward-clear-ms", `${animation.clearMs}ms`);
  elements.rewardOverlay.style.setProperty("--reward-blur-ms", `${animation.blurMs}ms`);
  elements.rewardOverlay.style.setProperty("--reward-icon-zoom-ms", `${animation.iconZoomMs}ms`);
}

function getRewardAnimationSettings() {
  const defaults = state.defaultSettings?.rewardAnimationMs || {};
  const settings = state.settings?.rewardAnimationMs || {};
  return {
    clearMs: getPositiveNumber(settings.clearMs, defaults.clearMs || 1000),
    blurMs: getPositiveNumber(settings.blurMs, defaults.blurMs || 2000),
    iconDelayMs: getPositiveNumber(settings.iconDelayMs, defaults.iconDelayMs || 1000),
    iconZoomMs: getPositiveNumber(settings.iconZoomMs, defaults.iconZoomMs || 4000),
    iconStaggerMs: getPositiveNumber(settings.iconStaggerMs, defaults.iconStaggerMs || 160),
  };
}

function getMapTooltipDelayMs() {
  const settingsValue = Number(state.settings?.battleTooltipDelayMs);
  if (Number.isFinite(settingsValue) && settingsValue >= 0) {
    return settingsValue;
  }
  return BATTLE_TOOLTIP_FALLBACK_MS;
}

function getMapTooltipDurationMs() {
  const settingsValue = Number(state.settings?.battleTooltipMs);
  if (Number.isFinite(settingsValue) && settingsValue >= 0) {
    return settingsValue;
  }
  return BATTLE_TOOLTIP_FALLBACK_MS;
}

function getPositiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function handleRewardClaim() {
  if (state.activeLevelUp) {
    claimSelectedLevelReward();
    return;
  }
  closeReward();
}

function claimSelectedLevelReward() {
  if (!state.activeLevelUp) {
    return;
  }
  const selectedReward = state.activeLevelUp.rewards[state.activeLevelUp.selectedIndex];
  if (!selectedReward) {
    return;
  }

  const scrollToNext = state.activeLevelUp.scrollToNext !== false;
  applyLevelReward(selectedReward);
  state.activeLevelUp = null;
  hideRewardOverlay();
  render();

  if (showNextLevelUpReward({ scrollToNext })) {
    return;
  }
  if (completePendingMapIfReady()) {
    return;
  }
  if (scrollToNext) {
    scrollAvailableNodesIntoActionZone();
  }
}

function closeReward(options = {}) {
  if (!elements.rewardOverlay) {
    return;
  }
  if (state.activeLevelUp) {
    state.activeLevelUp = null;
    state.pendingLevelUps = [];
  }
  const scrollToNext = options.scrollToNext !== false;
  hideRewardOverlay();
  applyPendingReward();
  if (showNextLevelUpReward({ scrollToNext })) {
    return;
  }
  if (completePendingMapIfReady()) {
    return;
  }
  if (scrollToNext) {
    scrollAvailableNodesIntoActionZone();
  }
}

function hideRewardOverlay() {
  elements.rewardOverlay.classList.add("hidden");
  elements.rewardOverlay.classList.remove("reward-overlay--choice");
  elements.rewardItems.innerHTML = "";
  elements.rewardBackdrop.style.backgroundImage = "";
  elements.rewardDialogText.textContent = "";
  elements.rewardClaimButton.disabled = false;
}

function applyPendingReward() {
  if (!state.pendingReward) {
    return;
  }

  for (const reward of state.pendingReward.entries) {
    applyRewardEntry(reward);
  }
  addLog(
    formatText("log.rewardResolved", {
      node: state.pendingReward.nodeId,
      rewards: state.pendingReward.logText,
    }),
  );
  if (typeof state.pendingReward.onApplied === "function") {
    state.pendingReward.onApplied();
  }
  state.pendingReward = null;
  render();
}

function openHeal(node, options = {}) {
  // Данные лечения приходят из payload выбранной точки: healPercent, goldPrice,
  // dialogTextKey и eventImage. Окно не меняет состояние до applyHealing.
  state.activeHealNode = node;
  state.activeHealCompletion = typeof options.onClose === "function" ? options.onClose : null;
  const healAmount = getHealAmount(node.payload);
  const price = node.payload.goldPrice || 0;
  elements.healTitle.textContent = translate("events.heal.title");
  elements.healAmountText.textContent = formatText("events.heal.amount", {
    amount: healAmount,
  });
  elements.healCurrentHpText.textContent = formatText("events.heal.currentHp", {
    current: state.playerState.health.current,
    max: state.playerState.health.max,
  });
  elements.healDialogText.textContent = translate(node.payload.dialogTextKey);
  setEventImage(
    elements.healEventImage,
    node.payload.eventImage,
    translate("events.heal.title"),
  );
  elements.healEventImage.alt = translate("events.heal.title");
  elements.healApplyButton.textContent =
    price > 0
      ? formatText("healer.paidThanks", { price })
      : translate("healer.freeThanks");
  elements.healApplyButton.disabled = false;
  hideHealError();
  elements.healLeaveButton.textContent = translate("ui.leave");
  elements.healOverlay.classList.remove("hidden");
  addLog(
    formatText("log.healOpened", {
      node: node.id,
      amount: healAmount,
      price,
      current: state.playerState.health.current,
      max: state.playerState.health.max,
    }),
  );
}

function closeHeal(options = {}) {
  if (!elements.healOverlay) {
    return;
  }
  elements.healOverlay.classList.add("hidden");
  const completion = state.activeHealCompletion;
  state.activeHealNode = null;
  state.activeHealCompletion = null;
  let completedMap = false;
  if (typeof completion === "function" && options.complete !== false) {
    completedMap = completion() === true;
  }
  if (options.scrollToNext && !completedMap) {
    scrollAvailableNodesIntoActionZone();
  }
}

function applyHealing() {
  // Проверка золота происходит до изменения HP и до закрытия окна. Если денег
  // не хватает, показываем локализованную ошибку и оставляем игрока в оверлее.
  const node = state.activeHealNode || getCurrentNode();
  if (!node || node.eventType !== "heal") {
    closeHeal({ scrollToNext: true });
    return;
  }
  const price = node.payload.goldPrice || 0;
  if (price > getInventoryQuantity("gold")) {
    showHealError(translate("ui.notEnoughGold"));
    return;
  }
  if (price > 0) {
    changeInventoryQuantity("gold", -price);
  }
  const healAmount = getHealAmount(node.payload);
  state.playerState.health.current = Math.min(
    state.playerState.health.max,
    state.playerState.health.current + healAmount,
  );
  addLog(
    formatText("log.healApplied", {
      amount: healAmount,
      current: state.playerState.health.current,
      max: state.playerState.health.max,
      gold: getInventoryQuantity("gold"),
    }),
  );
  render();
  closeHeal({ scrollToNext: true });
}

function showHealError(message) {
  elements.healErrorText.textContent = message;
  elements.healErrorText.classList.remove("hidden");
}

function hideHealError() {
  if (!elements.healErrorText) {
    return;
  }
  elements.healErrorText.classList.add("hidden");
}

function getHealAmount(payload) {
  return Math.ceil((state.playerState.health.max * payload.healPercent) / 100);
}

function getCurrentNode() {
  // После выбора события currentNodeId нужен обработчикам shop/heal, чтобы они
  // нашли payload активной точки даже после перерендера карты.
  for (const level of state.generatedMap.levels) {
    const found = level.nodes.find((node) => node.id === state.currentNodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function openShop(node, options = {}) {
  // Магазин хранит активную точку отдельно от currentNodeId, потому что выбор
  // товаров происходит уже внутри оверлея и должен ссылаться на payload магазина.
  state.activeShopNode = node;
  state.activeShopCompletion = typeof options.onClose === "function" ? options.onClose : null;
  state.shopSelection = new Map();
  hideShopConfirm();
  hideShopError();
  elements.shopTitle.textContent = translate("events.shop.title");
  elements.shopLeaveButton.textContent = translate("ui.leave");
  elements.shopBuyButton.textContent = translate("ui.purchase");
  elements.inventoryTitle.textContent = translate("ui.inventory");
  elements.shopDialogText.textContent = translate(node.payload.dialogTextKey);
  setEventImage(
    elements.shopEventImage,
    node.payload.eventImage,
    translate("events.shop.traderAlt"),
  );
  elements.shopOverlay.classList.remove("hidden");
  renderShop();
  addLog(
    formatText("log.shopOpened", {
      node: node.id,
      offers: (node.payload.items || []).length,
      gold: getInventoryQuantity("gold"),
    }),
  );
}

function closeShop(options = {}) {
  if (!elements.shopOverlay) {
    return;
  }
  elements.shopOverlay.classList.add("hidden");
  const completion = state.activeShopCompletion;
  state.activeShopNode = null;
  state.activeShopCompletion = null;
  state.shopSelection = new Map();
  hideShopConfirm();
  hideShopError();
  let completedMap = false;
  if (typeof completion === "function" && options.complete !== false) {
    completedMap = completion() === true;
  }
  if (options.scrollToNext && !completedMap) {
    scrollAvailableNodesIntoActionZone();
  }
}

function renderShop() {
  if (!state.activeShopNode) {
    return;
  }

  elements.shopItems.innerHTML = "";
  const goods = state.activeShopNode.payload.items || [];
  for (const item of goods) {
    elements.shopItems.append(createShopItemCard(item));
  }

  renderInventory();
  updateShopBuyButton();
}

function createShopItemCard(item) {
  // Одна торговая позиция выбирается максимум один раз. Ключ включает itemId,
  // amount и goldPrice, поэтому две разные позиции с тем же itemId не сольются.
  const offerKey = getShopOfferKey(item);
  const isSelected = state.shopSelection.has(offerKey);
  const amount = item.amount || 1;
  const card = document.createElement("article");
  card.className = "shop-item-card";
  if (isSelected) {
    card.classList.add("selected");
  }

  const image = document.createElement("img");
  image.src = getItemImagePath(item.itemId);
  image.alt = getItemName(item.itemId);

  const name = document.createElement("strong");
  name.textContent = getItemName(item.itemId);

  const price = document.createElement("span");
  price.textContent = `${amount} × ${getItemName(item.itemId)} · ${item.goldPrice} ${getItemName("gold")}`;

  const controls = document.createElement("div");
  controls.className = "quantity-controls";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = isSelected ? translate("ui.selected") : translate("ui.select");
  toggle.addEventListener("click", () => toggleShopOffer(item));

  controls.append(toggle);
  attachMapItemTooltip(card, {
    name: getItemName(item.itemId),
    description: getItemDescription(item.itemId),
    icon: getItemImagePath(item.itemId),
  });
  card.append(image, name, price, controls);
  return card;
}

function toggleShopOffer(item) {
  hideShopConfirm();
  hideShopError();
  const offerKey = getShopOfferKey(item);
  if (state.shopSelection.has(offerKey)) {
    state.shopSelection.delete(offerKey);
  } else {
    state.shopSelection.set(offerKey, item);
  }
  renderShop();
}

function updateShopBuyButton() {
  const total = getShopSelectionTotal();
  const gold = getInventoryQuantity("gold");
  elements.shopBuyButton.disabled = total <= 0;
  elements.shopBuyButton.textContent =
    total > 0
      ? `${translate("ui.purchase")} (${total} ${getItemName("gold")})`
      : translate("ui.purchase");
}

function showShopConfirm() {
  // Подтверждение покупки живет внутри игрового интерфейса, без browser confirm.
  // Недостаток золота проверяется до показа подтверждения.
  const total = getShopSelectionTotal();
  if (total <= 0) {
    return;
  }
  if (total > getInventoryQuantity("gold")) {
    showShopError(translate("ui.notEnoughGold"));
    return;
  }

  elements.shopConfirmText.textContent = `${translate(
    "ui.purchase.question",
  )} ${total} ${getItemName("gold")}`;
  elements.shopConfirm.classList.remove("hidden");
}

function hideShopConfirm() {
  if (!elements.shopConfirm) {
    return;
  }
  elements.shopConfirm.classList.add("hidden");
}

function showShopError(message) {
  elements.shopErrorText.textContent = message;
  elements.shopErrorText.classList.remove("hidden");
}

function hideShopError() {
  if (!elements.shopErrorText) {
    return;
  }
  elements.shopErrorText.classList.add("hidden");
}

function confirmShopPurchase() {
  // Деньги списываются за сумму выбранных позиций, затем каждая позиция добавляет
  // amount предметов в инвентарь. После успешной покупки магазин закрывается.
  const total = getShopSelectionTotal();
  if (total <= 0 || total > getInventoryQuantity("gold")) {
    showShopError(translate("ui.notEnoughGold"));
    return;
  }
  changeInventoryQuantity("gold", -total);
  const purchasedItems = [...state.shopSelection.values()]
    .map((item) => `${item.amount || 1}x ${getItemName(item.itemId)}`)
    .join(", ");
  for (const item of state.shopSelection.values()) {
    changeInventoryQuantity(item.itemId, item.amount || 1);
  }

  addLog(
    formatText("log.shopPurchased", {
      items: purchasedItems,
      total,
      gold: getInventoryQuantity("gold"),
    }),
  );
  render();
  closeShop({ scrollToNext: true });
}

function getShopSelectionTotal() {
  if (!state.activeShopNode) {
    return 0;
  }
  const goodsById = new Map(
    (state.activeShopNode.payload.items || []).map((item) => [getShopOfferKey(item), item]),
  );
  let total = 0;
  for (const offerKey of state.shopSelection.keys()) {
    total += goodsById.get(offerKey)?.goldPrice || 0;
  }
  return total;
}

function getShopOfferKey(item) {
  return `${item.itemId}:${item.amount || 1}:${item.goldPrice}`;
}

function renderInventory() {
  elements.inventoryItems.innerHTML = "";
  for (const item of state.playerState.inventory) {
    const card = document.createElement("article");
    card.className = "inventory-item-card";

    const image = document.createElement("img");
    image.src = getItemImagePath(item.itemId);
    image.alt = getItemName(item.itemId);

    const name = document.createElement("strong");
    name.textContent = getItemName(item.itemId);

    const quantity = document.createElement("span");
    quantity.textContent = String(item.quantity);

  attachMapItemTooltip(card, {
    name: getItemName(item.itemId),
    description: getItemDescription(item.itemId),
    icon: getItemImagePath(item.itemId),
  });
    card.append(image, name, quantity);
    elements.inventoryItems.append(card);
  }
}

function attachMapItemTooltip(element, { name, description, icon }) {
  const onContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    scheduleMapItemTooltip(event, false);
  };

  const onPointerMove = (event) => {
    const tooltip = ensureMapItemTooltip();
    if (!tooltip.classList.contains("is-visible")) {
      return;
    }
    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 12;
    const x = Math.max(margin, Math.min(event.clientX + 14, window.innerWidth - tooltipRect.width - margin));
    const y = Math.max(margin, Math.min(event.clientY + 14, window.innerHeight - tooltipRect.height - margin));
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  };

  const onPointerEnter = (event) => {
    scheduleMapItemTooltip(event, false);
  };

  const onPointerLeave = () => {
    clearMapItemTooltipShowTimeout();
    hideMapItemTooltip();
  };

  function setTooltipContent() {
    const tooltip = ensureMapItemTooltip();
    tooltip.querySelector("strong").textContent = name || "";
    renderInlineRichText(tooltip.querySelector("p"), description || "", {
      itemCatalogById: state.itemCatalogById,
      resolveAssetPath,
      translateTextKey: translate,
    });
  }

  function clearMapItemTooltipShowTimeout() {
    if (mapItemTooltipShowTimeoutId) {
      window.clearTimeout(mapItemTooltipShowTimeoutId);
      mapItemTooltipShowTimeoutId = null;
    }
  }

  function clearMapItemTooltipHideTimeout() {
    if (mapItemTooltipHideTimeoutId) {
      window.clearTimeout(mapItemTooltipHideTimeoutId);
      mapItemTooltipHideTimeoutId = null;
    }
  }

  function hideMapItemTooltip() {
    clearMapItemTooltipHideTimeout();
    const tooltip = document.querySelector(`.${mapItemTooltipClassName}`);
    if (tooltip) {
      tooltip.classList.remove("is-visible");
    }
  }

  const showMapItemTooltip = (event) => {
    const tooltip = ensureMapItemTooltip();
    setTooltipContent();
    tooltip.className = `${mapItemTooltipClassName} is-visible`;
    onPointerMove(event);
    clearMapItemTooltipHideTimeout();
    const hideDelay = getMapTooltipDurationMs();
    if (hideDelay > 0) {
      mapItemTooltipHideTimeoutId = window.setTimeout(() => {
        hideMapItemTooltip();
      }, hideDelay);
    }
  };

  const scheduleMapItemTooltip = (event, immediate = false) => {
    clearMapItemTooltipShowTimeout();
    if (immediate || getMapTooltipDelayMs() <= 0) {
      showMapItemTooltip(event);
      return;
    }
    mapItemTooltipShowTimeoutId = window.setTimeout(() => {
      showMapItemTooltip(event);
    }, getMapTooltipDelayMs());
  };

  const supportsPointer = typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";
  if (supportsPointer) {
    element.addEventListener("pointerenter", onPointerEnter);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerleave", onPointerLeave);
    element.addEventListener("pointercancel", onPointerLeave);
  } else {
    element.addEventListener("mouseenter", onPointerEnter);
    element.addEventListener("mousemove", onPointerMove);
    element.addEventListener("mouseleave", onPointerLeave);
  }
  element.addEventListener("contextmenu", onContextMenu);
}

function ensureMapItemTooltip() {
  let tooltip = document.querySelector(`.${mapItemTooltipClassName}`);
  if (tooltip) {
    return tooltip;
  }

  tooltip = document.createElement("div");
  tooltip.className = mapItemTooltipClassName;
  tooltip.setAttribute("role", "status");

  const title = document.createElement("strong");
  const descriptionLine = document.createElement("p");
  tooltip.append(title, descriptionLine);
  document.body.append(tooltip);
  return tooltip;
}

function normalizePlayerHealthByInventory(playerState = state.playerState) {
  if (!playerState || !playerState.health) {
    return;
  }

  const healthState = playerState.health;
  const inventory = Array.isArray(playerState.inventory) ? playerState.inventory : [];

  const maxHpBonus = inventory.reduce((total, entry) => {
    const item = getItemDefinition(entry?.itemId);
    const qty = Number.isFinite(entry?.quantity) ? Math.max(0, Math.trunc(entry.quantity)) : 0;
    const modifier = Number(item?.max_hp_modif);
    return total + (Number.isFinite(modifier) ? modifier * qty : 0);
  }, 0);

  const defaultMax =
    Number.isFinite(Number(healthState.baseMax)) && Number(healthState.baseMax) > 0
      ? Number(healthState.baseMax)
      : Math.max(1, (Number(healthState.max) || 1) - maxHpBonus);

  healthState.baseMax = Math.max(1, defaultMax);
  healthState.max = healthState.baseMax + maxHpBonus;
  healthState.current = Math.max(0, Math.min(Number.isFinite(healthState.current) ? healthState.current : 0, healthState.max));
}

function getInventoryQuantity(itemId) {
  return state.playerState.inventory.find((item) => item.itemId === itemId)?.quantity || 0;
}

function changeInventoryQuantity(itemId, delta) {
  // Инвентарь расширяем лениво: если магазин или награда добавит новый itemId,
  // запись создастся автоматически. Количество не уходит ниже нуля.
  let entry = state.playerState.inventory.find((item) => item.itemId === itemId);
  if (!entry) {
    entry = { itemId, quantity: 0 };
    state.playerState.inventory.push(entry);
  }
  entry.quantity = Math.max(0, entry.quantity + delta);
  normalizePlayerHealthByInventory();
}

function getSortedItemDefinitions() {
  return [...state.itemCatalogById.values()].sort((a, b) => {
    return getItemHudOrder(a.itemId) - getItemHudOrder(b.itemId) || a.itemId.localeCompare(b.itemId);
  });
}

function getItemHudOrder(itemId) {
  const definition = getItemDefinition(itemId);
  return typeof definition.hudOrder === "number" ? definition.hudOrder : 1000;
}

function getItemDefinition(itemId) {
  return (
    state.itemCatalogById.get(itemId) || {
      itemId,
      nameTextKey: `items.${itemId}.name`,
      descriptionTextKey: `items.${itemId}.description`,
      icon: "",
      bigIcon: "",
    }
  );
}

function getItemName(itemId) {
  return translate(getItemDefinition(itemId).nameTextKey);
}

function getItemDescription(itemId) {
  return translate(getItemDefinition(itemId).descriptionTextKey);
}

function getItemImagePath(itemId) {
  return resolveAssetPath(getItemDefinition(itemId).icon);
}

function getItemBigImagePath(itemId) {
  return resolveAssetPath(getItemDefinition(itemId).bigIcon);
}

function setEventImage(image, sourcePath, altText) {
  // Новый стандарт для JSON: eventImage и похожие поля пишутся полным путем
  // от data/. Тогда код не должен знать, в какой именно подпапке лежит ассет.
  const resolvedPath = resolveAssetPath(sourcePath);
  image.alt = altText;
  image.removeAttribute("hidden");
  image.onerror = () => {
    console.error(`Failed to load character image: ${sourcePath} -> ${resolvedPath}`);
    image.setAttribute("hidden", "");
  };
  image.onload = () => {
    image.removeAttribute("hidden");
  };
  image.src = resolvedPath;
}

function getEdgeId(fromNodeId, toNodeId) {
  return `${fromNodeId}->${toNodeId}`;
}

function completeMap() {
  // Поведение завершения берется из settings/campaign.jsonc, а не из карты. Это позволяет
  // одну и ту же карту использовать несколько раз: перейти к следующей или
  // показать победу.
  const entry = state.campaign.maps[state.campaignIndex];
  if (entry.onComplete.type === "victory") {
    const title = translate(entry.onComplete.titleTextKey);
    const message = translate(entry.onComplete.messageTextKey);
    showDialog(`${title} ${message}`);
    addLog(formatText("log.mapVictory", { message }));
    state.availableNodeIds = new Set();
    return;
  }

  const nextIndex = findNextCampaignIndex(entry.onComplete.nextMapId);
  const nextMapMessage = formatText("log.nextMap", { map: entry.onComplete.nextMapId });
  showDialog(nextMapMessage);
  addLog(nextMapMessage);
  startCampaignMap(nextIndex);
}

function findNextCampaignIndex(nextMapId) {
  const afterCurrent = state.campaign.maps.findIndex(
    (entry, index) => index > state.campaignIndex && entry.mapId === nextMapId,
  );
  if (afterCurrent >= 0) {
    return afterCurrent;
  }
  const first = state.campaign.maps.findIndex((entry) => entry.mapId === nextMapId);
  return Math.max(first, 0);
}

function showDialog(message, onClose, eventImage = "") {
  elements.eventDialogText.textContent = message;
  setDialogEventImage(eventImage);
  if (typeof elements.eventDialog.showModal === "function") {
    if (onClose) {
      elements.eventDialog.addEventListener("close", onClose, { once: true });
    }
    elements.eventDialog.showModal();
  } else {
    alert(message);
    if (onClose) {
      onClose();
    }
  }
}

function setDialogEventImage(eventImage) {
  if (!elements.eventDialogImage) {
    return;
  }
  if (!eventImage) {
    elements.eventDialogImage.setAttribute("hidden", "");
    elements.eventDialogImage.removeAttribute("src");
    return;
  }
  setEventImage(elements.eventDialogImage, eventImage, "");
}

function addRunLogHeader(message) {
  addLog(message, "event-log-separator");
}

function addLog(message, className = "") {
  const entry = document.createElement("li");
  entry.textContent = message;
  if (className) {
    entry.classList.add(className);
  }
  elements.eventLog.prepend(entry);
}

function translate(key) {
  // Локали плоские: простой объект key -> text. Если ключа нет, показываем сам
  // ключ, чтобы сразу было видно, какой текст забыли добавить.
  return state.locale[key] || key;
}

function formatText(key, values) {
  // Простой шаблонизатор для строк локали вида "Цена: {price}". Используется
  // там, где UI должен подставить число из события или состояния.
  return Object.entries(values).reduce((text, [name, value]) => {
    return text.replaceAll(`{${name}}`, String(value));
  }, translate(key));
}

function resolveAssetPath(path) {
  // Новый стандарт для JSON/JSONC: писать прямой путь от data/, например
  // data/Assets/events/trader.png. Так новые папки ассетов не требуют правок JS.
  if (!path) {
    return "";
  }

  const normalized = path.replaceAll("\\", "/");
  const cachedUrl = getCachedAssetUrl(normalized);
  if (cachedUrl) {
    return cachedUrl;
  }

  if (normalized.startsWith("data/")) {
    return appendAssetCacheBuster(`./${normalized}`);
  }

  if (normalized.startsWith("./") || normalized.startsWith("/")) {
    return appendAssetCacheBuster(normalized);
  }

  return normalized;
}

function appendAssetCacheBuster(path) {
  if (path.startsWith("http") || path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }
  const [pathWithoutHash, hash = ""] = path.split("#");
  const separator = pathWithoutHash.includes("?") ? "&" : "?";
  return `${pathWithoutHash}${separator}v=${ASSET_CACHE_BUSTER}${hash ? `#${hash}` : ""}`;
}

boot().catch((error) => {
  console.error(error);
  showLoadingError(error);
  elements.campaignStatus.textContent = error.message;
});



