import { BATTLE_CONTRACT_VERSION } from "./battle/battle-contract.js";
import { appendVersionParam } from "./app-version.js";
import { getCachedAssetUrl } from "./asset-preloader.js";
import { loadJson, loadJsonc } from "./data-loader.js";
import { exposeWildwestDebug } from "./debug-hooks.js";
import { generateMap, getMapEventCatalog, getMapLevelSummary, pickEventPayload } from "./map/map-generation.js";
import { createMapAnimationController } from "./map/map-animations.js";
import { createMapAudioController } from "./map/map-audio.js";
import { createMapBattleController } from "./map/map-battle-controller.js";
import { createMapBootController } from "./map/map-boot-controller.js";
import { createMapCheatsController } from "./map/map-cheats.js";
import { createMapCompletionController } from "./map/map-completion.js";
import { createMapDataPreloadController } from "./map/map-data-preload.js";
import { createMapDialogController } from "./map/map-dialog.js";
import { createMapDomAdapter } from "./map/map-dom.js";
import { createMapHudRenderer } from "./map/map-hud.js";
import { createMapItemsController } from "./map/map-items.js";
import { createMapLayoutController } from "./map/map-layout.js";
import { createMapLoadingUiController, DEFAULT_LOAD_UI_CONFIG } from "./map/map-loading-ui.js";
import { createMapLockpickController } from "./map/map-lockpick.js";
import { createMapMediaHelpers } from "./map/map-media.js";
import { createMapNodeFlowController } from "./map/map-node-flow.js";
import { createMapRenderer } from "./map/map-renderer.js";
import { createMapRewardsController } from "./map/map-rewards.js";
import { createMapRunController } from "./map/map-run-controller.js";
import { createMapScrollController } from "./map/map-scroll.js";
import { createMapSettingsController } from "./map/map-settings.js";
import { createMapShellUiController } from "./map/map-shell-ui.js";
import { createMapShopHealController } from "./map/map-shop-heal.js";
import { createMapTooltipController } from "./map/map-tooltips.js";
import { createMapUiScaleController } from "./map/map-ui-scale.js";
import { renderInlineRichText } from "./rich-text.js";
import { createDebugSeed, createSeededRandom, deriveDebugSeed, normalizeDebugSeed } from "./seeded-random.js";

const DATA_ROOT = "./data";
const CAMPAIGN_URL = `${DATA_ROOT}/settings/campaign.jsonc`;
const ITEM_CATALOG_URL = `${DATA_ROOT}/settings/items.jsonc`;
const EXPERIENCE_TABLE_URL = `${DATA_ROOT}/player/experience-table.jsonc`;
const CHEAT_CONFIG_URL = `${DATA_ROOT}/player/cheats.json`;
const DEFAULT_PLAYER_STATE_URL = `${DATA_ROOT}/player/default-player-state.json`;
const DEFAULT_SETTINGS_URL = `${DATA_ROOT}/settings/default-settings.json`;
const CURRENT_SETTINGS_URL = `${DATA_ROOT}/settings/current-settings.json`;
const LOAD_UI_CONFIG_URL = `${DATA_ROOT}/settings/load.jsonc`;
const SETTINGS_STORAGE_KEY = "roguelikeCurrentSettings";
const RUN_SEED_QUERY_PARAMS = ["seed", "runSeed"];
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
const mapItemTooltipClassName = "item-tooltip";
// Runtime-состояние всей текущей сессии. Важно: это не зеркальная копия файлов
// current-*.json, браузер меняет эти данные в памяти и в localStorage, но не
// записывает JSON обратно на диск.
const state = {
  language: "en",
  campaign: null,
  campaignIndex: 0,
  defaultSettings: null,
  settings: null,
  loadConfig: DEFAULT_LOAD_UI_CONFIG,
  mapConfig: null,
  mapConfigCache: new Map(),
  mapUiConfig: null,
  battleConfigCache: null,
  itemCatalog: null,
  itemCatalogById: new Map(),
  experienceTable: null,
  cheatConfig: null,
  cheatsActive: false,
  cheatInputBuffer: "",
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
  runSeed: "",
  currentMapSeed: null,
  battleAttemptCounts: new Map(),
  scrollAnimationFrame: null,
  pendingReward: null,
  pendingLevelUps: [],
  activeLevelUp: null,
  pendingMapCompletion: false,
  pendingSurrenderCallbacks: null,
  activeTestRun: false,
  activeStandaloneRun: false,
  activeMapEntry: null,
  activeDialogNode: null,
  activeDialogStepId: null,
  activeDialogTextTimerId: null,
  activeDialogFullText: "",
  activeDialogVisibleTextLength: 0,
  isDialogTextTyping: false,
  activeShopCompletion: null,
  activeHealCompletion: null,
  activeLockpickNode: null,
  activeLockpickSession: null,
  activeLockpickCompletion: null,
};

// Единственная карта DOM-ссылок для JS. id/class в index.html являются частью
// контракта: если переименовать элемент в HTML, соответствующее поле здесь тоже
// нужно обновить, иначе обработчики событий и рендер оверлеев отвалятся.
const elements = {
  mainMenu: document.querySelector("#mainMenu"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingLogo: document.querySelector("#loadingLogo"),
  loadingWave: document.querySelector("#loadingWave"),
  loadingTitle: document.querySelector("#loadingTitle"),
  loadingStatus: document.querySelector("#loadingStatus"),
  loadingProgressBar: document.querySelector("#loadingProgressBar"),
  loadingProgressText: document.querySelector("#loadingProgressText"),
  gameOrientationRoot: document.querySelector("#gameOrientationRoot"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  mainMenuTitle: document.querySelector("#mainMenuTitle"),
  startGameButton: document.querySelector("#startGameButton"),
  tutorialButton: document.querySelector("#tutorialButton"),
  smokeTestButton: document.querySelector("#smokeTestButton"),
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
  settingsControlSchemeLabel: document.querySelector("#settingsControlSchemeLabel"),
  settingsControlSchemeSelect: document.querySelector("#settingsControlSchemeSelect"),
  settingsControlSchemeSwipeOption: document.querySelector("#settingsControlSchemeSwipeOption"),
  settingsControlSchemeClickOption: document.querySelector("#settingsControlSchemeClickOption"),
  settingsControlSchemeBothOption: document.querySelector("#settingsControlSchemeBothOption"),
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
  lockpickOverlay: document.querySelector("#lockpickOverlay"),
  lockpickBackdrop: document.querySelector("#lockpickBackdrop"),
  lockpickTitle: document.querySelector("#lockpickTitle"),
  lockpickInstructions: document.querySelector("#lockpickInstructions"),
  lockpickLives: document.querySelector("#lockpickLives"),
  lockpickLeaveButton: document.querySelector("#lockpickLeaveButton"),
  lockpickRingStage: document.querySelector("#lockpickRingStage"),
  lockpickRings: document.querySelector("#lockpickRings"),
  lockpickPickImage: document.querySelector("#lockpickPickImage"),
  lockpickSelectOuterButton: document.querySelector("#lockpickSelectOuterButton"),
  lockpickSelectInnerButton: document.querySelector("#lockpickSelectInnerButton"),
  lockpickRotateCounterclockwiseButton: document.querySelector("#lockpickRotateCounterclockwiseButton"),
  lockpickRotateClockwiseButton: document.querySelector("#lockpickRotateClockwiseButton"),
  lockpickStatus: document.querySelector("#lockpickStatus"),
  lockpickUseKeyButton: document.querySelector("#lockpickUseKeyButton"),
  lockpickUseKeyImage: document.querySelector("#lockpickUseKeyImage"),
  lockpickUseKeyText: document.querySelector("#lockpickUseKeyText"),
  lockpickConfirm: document.querySelector("#lockpickConfirm"),
  lockpickConfirmText: document.querySelector("#lockpickConfirmText"),
  lockpickConfirmYesButton: document.querySelector("#lockpickConfirmYesButton"),
  lockpickConfirmNoButton: document.querySelector("#lockpickConfirmNoButton"),
  rewardOverlay: document.querySelector("#rewardOverlay"),
  rewardBackdrop: document.querySelector("#rewardBackdrop"),
  rewardItems: document.querySelector("#rewardItems"),
  rewardDialogText: document.querySelector("#rewardDialogText"),
  rewardClaimButton: document.querySelector("#rewardClaimButton"),
};

const mapDom = createMapDomAdapter({
  state,
  elements,
  tooltipClassName: mapItemTooltipClassName,
});

const {
  getMapUiOverlayFrames,
  getAvailableNodeElements,
  isBattleOverlayOpen,
  getMapItemTooltip,
  ensureMapItemTooltip,
} = mapDom;

const mapMedia = createMapMediaHelpers({
  resolveAssetPath,
});

const {
  setEventImage,
} = mapMedia;

const mapTooltips = createMapTooltipController({
  state,
  resolveAssetPath,
  translate,
  renderInlineRichText,
  getMapItemTooltip,
  ensureMapItemTooltip,
  tooltipClassName: mapItemTooltipClassName,
});

const {
  attachMapItemTooltip,
} = mapTooltips;

const mapAudio = createMapAudioController({
  state,
  resolveAssetPath,
});

const {
  setupAudio,
  applyAudioSettings,
  playClickSound,
  playSoundEffect,
  playMusic,
  resumeMapMusicAfterBattle,
  startBattleMusic,
} = mapAudio;

const mapItems = createMapItemsController({
  state,
  translate,
  resolveAssetPath,
});

const {
  normalizePlayerHealthByInventory,
  getInventoryQuantity,
  isItemBlockedByInventoryLimit,
  isRewardBlockedByInventoryLimit,
  changeInventoryQuantity,
  getSortedItemDefinitions,
  getItemHudOrder,
  getItemName,
  getItemDescription,
  getItemImagePath,
  getItemBigImagePath,
} = mapItems;

const mapUiScale = createMapUiScaleController({
  state,
  elements,
  getMapUiOverlayFrames,
  onViewportChange: () => mapLoadingUi.updateLoadingLogoResponsiveSize(),
});

const {
  setupMapUiViewportScale,
  applyMapUiScale,
  getMapViewportSize,
} = mapUiScale;

const mapLoadingUi = createMapLoadingUiController({
  state,
  elements,
  loadJsonc,
  loadUiConfigUrl: LOAD_UI_CONFIG_URL,
  resolveAssetPath,
  getMapViewportSize,
});

const {
  loadLoadUiConfig,
  applyLoadingOverlayConfig,
  updateLoadingLogoResponsiveSize,
  showLoadingOverlay,
  hideLoadingOverlay,
  showLoadingError,
  updateLoadingOverlay,
  getAssetPreloadStatus,
  loadingText,
  formatTextWithFallback,
} = mapLoadingUi;

const mapDataPreload = createMapDataPreloadController({
  state,
  campaignUrl: CAMPAIGN_URL,
  itemCatalogUrl: ITEM_CATALOG_URL,
  experienceTableUrl: EXPERIENCE_TABLE_URL,
  cheatConfigUrl: CHEAT_CONFIG_URL,
  startupAssetPaths: STARTUP_ASSET_PATHS,
  fallbackMapEventIconPaths: FALLBACK_MAP_EVENT_ICON_PATHS,
  loadJson,
  loadJsonc,
  resolveAssetPath,
  applyMapUiScale,
  showLoadingOverlay,
  updateLoadingOverlay,
  getAssetPreloadStatus,
  loadingText,
  formatTextWithFallback,
});

const {
  loadAndValidateGameData,
  isGameDataReady,
  preloadGameAssets,
  preloadBattleCode,
  importBattleModule,
} = mapDataPreload;

const mapLayout = createMapLayoutController({
  state,
  compareNodeIds,
  getPositiveNumber,
});

const {
  getMapHeight,
  getNodePositions,
} = mapLayout;

const mapScroll = createMapScrollController({
  state,
  elements,
  getAvailableNodeElements,
});

const {
  initDragScroll,
  scrollAvailableNodesIntoActionZone,
  playMapIntroScroll,
} = mapScroll;

const mapAnimations = createMapAnimationController({
  state,
  elements,
  ensureMapEffectsLayer,
  getMapHeight,
  resolveAssetPath,
  randomNumberInRange,
  pickRandomItem,
  getPositiveNumber,
});

const {
  startMapAnimations,
  stopMapAnimations,
} = mapAnimations;

// Ниже map-module связывает контроллеры в один рантайм. Сами контроллеры не
// импортируют общий state скрыто: все зависимости проходят через этот wiring.
const mapNodeFlow = createMapNodeFlowController({
  state,
  elements,
  translate,
  formatText,
  addLog: (message, className) => mapShellUi.addLog(message, className),
  showDialog: (message, onClose, eventImage) => mapShellUi.showDialog(message, onClose, eventImage),
  render,
  scrollAvailableNodesIntoActionZone,
  getEdgeId,
  openBattleModule: (node) => mapBattle.openBattleModule(node),
  openMapDialogEvent: (node) => mapDialog.openMapDialogEvent(node),
  openLockpick: (node, completion) => mapLockpick.openLockpick(node, completion),
  resolveReward: (node, options) => mapRewards.resolveReward(node, options),
  openShop: (node, options) => mapShopHeal.openShop(node, options),
  openHeal: (node, options) => mapShopHeal.openHeal(node, options),
  completeMap: () => mapCompletion.completeMap(),
});

const {
  activateNode,
  completeMapNode,
  completeMapIfTerminalNode,
  completePendingMapIfReady,
} = mapNodeFlow;

const mapRenderer = createMapRenderer({
  state,
  elements,
  dataRoot: DATA_ROOT,
  translate,
  resolveAssetPath,
  toProjectUrl,
  getPositiveNumber,
  getMapHeight,
  getNodePositions,
  getEdgeId,
  ensureMapEffectsLayer,
  activateNode,
});

const mapShellUi = createMapShellUiController({
  state,
  elements,
  dataRoot: DATA_ROOT,
  translate,
  resolveAssetPath,
  setEventImage,
  getPositiveNumber,
  playMusic,
  getSmokeTestButtonTextKey: () => mapCheats.getSmokeTestButtonTextKey(),
  updateSmokeTestButtonVisibility: () => mapCheats.updateSmokeTestButtonVisibility(),
  stopMapAnimations,
  closeShop: (options) => mapShopHeal.closeShop(options),
  closeHeal: (options) => mapShopHeal.closeHeal(options),
  closeReward: (options) => mapRewards.closeReward(options),
  closeMapDialogOverlay: () => mapDialog.closeMapDialogOverlay(),
  closeLockpick: () => mapLockpick.closeLockpick(),
});

const {
  startMenuMusicAfterInteraction,
  setupFullscreenButton,
  renderMenu,
  updateLocalizedUi,
  renderMapTopActionButtons,
  showSettingsPanel,
  hideSettingsPanel,
  showSurrenderDialog,
  confirmSurrender,
  cancelSurrender,
  showEventLogOverlay,
  hideEventLogOverlay,
  showDialog,
  returnToMainMenu,
  addRunLogHeader,
  addLog,
} = mapShellUi;

setupFullscreenButton();

const mapSettings = createMapSettingsController({
  state,
  elements,
  dataRoot: DATA_ROOT,
  defaultSettingsUrl: DEFAULT_SETTINGS_URL,
  currentSettingsUrl: CURRENT_SETTINGS_URL,
  settingsStorageKey: SETTINGS_STORAGE_KEY,
  loadJson,
  setupAudio,
  applyAudioSettings,
  updateLocalizedUi,
  renderMenu,
  render,
});

const {
  setLanguage,
  addLanguageChangeListener,
  loadSettings,
  resetSettings,
  setMusicVolume,
  setSoundVolume,
  setControlScheme,
  getLocaleUrl,
} = mapSettings;

const mapRewards = createMapRewardsController({
  state,
  elements,
  translate,
  formatText,
  resolveAssetPath,
  seededRandomInt,
  createMapGameplayRandom,
  getPositiveNumber,
  getItemName,
  getItemDescription,
  getItemImagePath,
  getItemBigImagePath,
  getInventoryQuantity,
  attachMapItemTooltip,
  isItemBlockedByInventoryLimit,
  isRewardBlockedByInventoryLimit,
  changeInventoryQuantity,
  addLog,
  render,
  scrollAvailableNodesIntoActionZone,
  completePendingMapIfReady,
});

const mapLockpick = createMapLockpickController({
  state,
  elements,
  translate,
  formatText,
  resolveAssetPath,
  createMapGameplayRandom,
  getInventoryQuantity,
  changeInventoryQuantity,
  getItemImagePath,
  playSoundEffect,
  addLog,
  render,
});

addLanguageChangeListener(mapLockpick.refreshLockpickUi);

const mapCheats = createMapCheatsController({
  state,
  elements,
  playSoundEffect,
  render,
  isBattleOverlayOpen,
  getExperienceTotal: mapRewards.getExperienceTotal,
  getNextExperienceLevel: mapRewards.getNextExperienceLevel,
  addExperience: mapRewards.addExperience,
  showNextLevelUpReward: mapRewards.showNextLevelUpReward,
});

const {
  handleCheatKeydown,
  createBattleCheatState,
  getSmokeTestRunConfig,
  createSmokeTestMapEntry,
  getSmokeTestButtonTextKey,
  updateSmokeTestButtonVisibility,
} = mapCheats;

const mapBattle = createMapBattleController({
  state,
  elements,
  dataRoot: DATA_ROOT,
  battleContractVersion: BATTLE_CONTRACT_VERSION,
  loadJsonc,
  importBattleModule,
  exposeMapDebug: (payload) => exposeWildwestDebug("map", payload),
  toProjectUrl,
  deriveDebugSeed,
  formatText,
  addLog,
  showDialog,
  showSettingsPanel,
  showSurrenderDialog,
  addLanguageChangeListener,
  startBattleMusic,
  resumeMapMusicAfterBattle,
  stopMapAnimations,
  createBattleCheatState,
  normalizePlayerHealthByInventory,
  getEdgeId,
  render,
  scrollAvailableNodesIntoActionZone,
  resolveReward: mapRewards.resolveReward,
  completeMapIfTerminalNode,
});

const {
  openBattleModule,
} = mapBattle;

const mapShopHeal = createMapShopHealController({
  state,
  elements,
  translate,
  formatText,
  setEventImage,
  getItemName,
  getItemDescription,
  getItemImagePath,
  attachMapItemTooltip,
  getInventoryQuantity,
  isItemBlockedByInventoryLimit,
  changeInventoryQuantity,
  addLog,
  render,
  scrollAvailableNodesIntoActionZone,
});

const mapDialog = createMapDialogController({
  state,
  elements,
  translate,
  formatText,
  getPositiveNumber,
  setEventImage,
  getMapEventCatalog,
  pickEventPayload,
  createDebugSeed,
  createSeededRandom,
  deriveDebugSeed,
  openBattleModule,
  resolveReward: mapRewards.resolveReward,
  openShop: mapShopHeal.openShop,
  openHeal: mapShopHeal.openHeal,
  openLockpick: mapLockpick.openLockpick,
  showDialog,
  completeMapNode,
  addLog,
});

const mapHud = createMapHudRenderer({
  state,
  elements,
  translate,
  getSortedItemDefinitions,
  getItemHudOrder,
  getInventoryQuantity,
  getItemName,
  getItemDescription,
  getItemImagePath,
  attachMapItemTooltip,
  getNextExperienceLevel: mapRewards.getNextExperienceLevel,
});

const mapRun = createMapRunController({
  state,
  elements,
  defaultPlayerStateUrl: DEFAULT_PLAYER_STATE_URL,
  runSeedQueryParams: RUN_SEED_QUERY_PARAMS,
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
  closeMapDialogOverlay: () => mapDialog.closeMapDialogOverlay(),
  closeShop: (options) => mapShopHeal.closeShop(options),
  hideRewardOverlay: () => mapRewards.hideRewardOverlay(),
  closeLockpick: () => mapLockpick.closeLockpick(),
});

const {
  startGame,
  startTutorial,
  startSmokeTestRun,
  resetPlayerState,
  startCampaignMap,
} = mapRun;

const mapCompletion = createMapCompletionController({
  state,
  translate,
  formatText,
  showDialog,
  returnToMainMenu,
  addLog,
  startCampaignMap,
});

const mapBoot = createMapBootController({
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
});

const {
  boot,
  reloadDataAndStart,
} = mapBoot;

// Настройки меняются сразу в runtime state и сохраняются в localStorage. Это
// перекрывает current-settings.json при следующей загрузке страницы.
elements.settingsLanguageSelect.addEventListener("change", async (event) => {
  playClickSound();
  await setLanguage(event.target.value);
  renderMenu();
});

elements.musicVolumeInput.addEventListener("input", (event) => {
  setMusicVolume(event.target.value);
});

elements.soundVolumeInput.addEventListener("input", (event) => {
  setSoundVolume(event.target.value);
});

elements.settingsControlSchemeSelect.addEventListener("change", (event) => {
  playClickSound();
  setControlScheme(event.target.value);
});

elements.startGameButton.addEventListener("click", async () => {
  await startGame();
});

elements.tutorialButton.addEventListener("click", async () => {
  await startTutorial();
});

elements.smokeTestButton.addEventListener("click", async () => {
  await startSmokeTestRun();
});

document.addEventListener("keydown", handleCheatKeydown);
document.addEventListener("keydown", mapLockpick.handleKeydown);

elements.settingsButton.addEventListener("click", () => {
  showSettingsPanel("menu");
});

elements.resetSettingsButton.addEventListener("click", async () => {
  await resetSettings();
});

elements.backSettingsButton.addEventListener("click", () => {
  hideSettingsPanel();
});

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
  mapShopHeal.closeShop({ scrollToNext: true });
});
elements.shopBuyButton.addEventListener("click", () => {
  mapShopHeal.showShopConfirm();
});
elements.shopConfirmNoButton.addEventListener("click", () => {
  mapShopHeal.hideShopConfirm();
});
elements.shopConfirmYesButton.addEventListener("click", () => {
  mapShopHeal.confirmShopPurchase();
});
elements.healApplyButton.addEventListener("click", mapShopHeal.applyHealing);
elements.healLeaveButton.addEventListener("click", () => {
  mapShopHeal.closeHeal({ scrollToNext: true });
});
elements.rewardClaimButton.addEventListener("click", mapRewards.handleRewardClaim);
elements.lockpickRingStage.addEventListener("click", mapLockpick.handleRingStageClick);
elements.lockpickSelectOuterButton.addEventListener("click", () => {
  mapLockpick.selectAdjacentRing(-1);
});
elements.lockpickSelectInnerButton.addEventListener("click", () => {
  mapLockpick.selectAdjacentRing(1);
});
elements.lockpickRotateCounterclockwiseButton.addEventListener("click", () => {
  mapLockpick.rotateSelectedRing(-1);
});
elements.lockpickRotateClockwiseButton.addEventListener("click", () => {
  mapLockpick.rotateSelectedRing(1);
});
elements.lockpickUseKeyButton.addEventListener("click", mapLockpick.useKey);
elements.lockpickLeaveButton.addEventListener("click", mapLockpick.requestLeave);
elements.lockpickConfirmYesButton.addEventListener("click", mapLockpick.confirmLeave);
elements.lockpickConfirmNoButton.addEventListener("click", mapLockpick.cancelLeave);
elements.mapDialogOverlay.addEventListener("click", (event) => {
  if (event.target.closest?.(".map-dialog-answers button")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  mapDialog.handleMapDialogSceneClick();
});

initDragScroll(elements.mapViewport);
setupMapUiViewportScale();

// Общий звук клика висит на document, чтобы не дублировать playClickSound на
// каждой активной кнопке. Первый клик также помогает браузеру разрешить музыку.
document.addEventListener("click", (event) => {
  if (
    event.target.closest("button:not(:disabled)")
    && !event.target.closest("[data-skip-global-click-sound='true']")
  ) {
    playClickSound();
    startMenuMusicAfterInteraction();
  }
});

function getFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function seededRandomInt(min, max, random) {
  return Math.floor(random() * (max - min + 1)) + min;
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

function createMapGameplayRandom(domain, ...parts) {
  // Gameplay RNG всегда выводится из run/map seed и доменного ключа. Декор
  // может пользоваться Math.random(), но награды, level-up и бой должны идти
  // через этот helper, чтобы ?seed= воспроизводил забег.
  const seedSource = state.currentMapSeed?.seed || state.runSeed || "NO_RUN_SEED";
  const seedName = [domain, ...parts.map((part) => String(part ?? ""))].join(":");
  return createSeededRandom(deriveDebugSeed(seedSource, seedName));
}

function render() {
  // Полный перерендер карты: фон, SVG-дороги, кнопки-точки и HUD. Состояние
  // дорог берется из currentNodeId/availableNodeIds/selectedPathEdges.
  if (!state.generatedMap) {
    return;
  }

  elements.campaignStatus.textContent = getCurrentMapStatusText();
  mapRenderer.renderMap();
  mapHud.renderHud();
  exposeMapDebugState();
  startMapAnimations();
}

function exposeMapDebugState() {
  exposeWildwestDebug("map", { state });
}

function getCurrentMapStatusText() {
  const campaignName = state.activeStandaloneRun
    ? translate(state.mapConfig?.nameTextKey || state.activeMapEntry?.mapId || "SmokeTest")
    : translate(state.campaign.nameTextKey);
  const mapNumber = state.activeStandaloneRun ? 1 : state.campaignIndex + 1;
  const mapCount = state.activeStandaloneRun ? 1 : state.campaign.maps.length;
  return `${campaignName} · map ${mapNumber}/${mapCount}`;
}

function ensureMapEffectsLayer() {
  if (!elements.mapBoard || !elements.mapEffects) {
    return;
  }
  if (elements.mapEffects.parentElement !== elements.mapBoard) {
    elements.mapBoard.append(elements.mapEffects);
  }
}

function getPositiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getEdgeId(fromNodeId, toNodeId) {
  return `${fromNodeId}->${toNodeId}`;
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
  return appendVersionParam(path);
}

boot().catch((error) => {
  console.error(error);
  showLoadingError(error);
  elements.campaignStatus.textContent = error.message;
});



