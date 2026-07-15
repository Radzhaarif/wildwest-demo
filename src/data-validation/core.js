import { loadJson, loadJsonc } from "../data-loader.js";
import {
  DATA_ROOT,
  formatLoadIssue,
  toProjectUrl,
} from "./common.js";
import {
  getEnabledTestRunConfig,
  validateCheatConfig,
} from "./cheats.js";
import {
  validateCampaign,
  validateExperienceTable,
} from "./campaign.js";
import {
  validateItemCatalog,
  validateRequiredItems,
} from "./items.js";
import {
  collectBattleEnemyIds,
  validateMapConfig,
} from "./map-config.js";
import {
  validatePlayerState,
  validateLocales,
} from "./player-locales.js";
import { validateBattleUiConfigObject } from "./ui-battle.js";
import { validateMapUiConfigObject } from "./ui-map.js";
import { validateEnemyConfig } from "./enemy.js";

const DEFAULT_PLAYER_STATE_URL = `${DATA_ROOT}/player/default-player-state.json`;
const CHEAT_CONFIG_URL = `${DATA_ROOT}/player/cheats.json`;
const BATTLE_UI_CONFIG_URL = `${DATA_ROOT}/settings/battle-ui.jsonc`;
const MAP_UI_CONFIG_URL = `${DATA_ROOT}/settings/map-ui.jsonc`;
const ENEMY_CONFIG_ROOT = `${DATA_ROOT}/enemy`;

const REQUIRED_LOCALE_KEYS = [
  "campaign.main.name",
  "menu.title",
  "menu.start",
  "menu.settings",
  "loading.title",
  "loading.settings",
  "loading.locale",
  "loading.validation",
  "loading.assets",
  "loading.menuAssets",
  "loading.mapAssets",
  "loading.runAssets",
  "loading.failed",
  "loading.error",
  "battle.tutorial.itemHint.trash",
  "battle.tutorial.itemHint.attack",
  "battle.tutorial.itemHint.bandage",
  "battle.tutorial.itemHint.shield",
  "battle.tutorial.itemHint.generator",
  "battle.tutorial.itemHint.barrel",
  "settings.musicVolume",
  "settings.soundVolume",
  "settings.language",
  "settings.controlScheme",
  "settings.controlScheme.swipe",
  "settings.controlScheme.click",
  "settings.controlScheme.swipeAndClick",
  "settings.reset",
  "ui.back",
  "ui.surrender",
  "ui.eventLog",
  "ui.downloadBattleTrace",
  "ui.yes",
  "ui.no",
  "ui.leave",
  "ui.purchase",
  "ui.purchase.question",
  "ui.select",
  "ui.selected",
  "ui.inventory",
  "ui.claimReward",
  "ui.itemMax",
  "ui.maxLevel",
  "ui.notEnoughGold",
  "surrender.question",
  "surrender.confirm",
  "surrender.cancel",
  "events.shop.title",
  "events.shop.traderAlt",
  "events.heal.title",
  "events.heal.amount",
  "events.heal.currentHp",
  "lockpick.title",
  "lockpick.instructions",
  "lockpick.leave",
  "lockpick.selectOuter",
  "lockpick.selectInner",
  "lockpick.rotateCounterclockwise",
  "lockpick.rotateClockwise",
  "lockpick.status.ready",
  "lockpick.status.selected",
  "lockpick.status.moving",
  "lockpick.status.broken",
  "lockpick.status.failed",
  "lockpick.status.resetting",
  "lockpick.status.keyOpening",
  "lockpick.status.opened",
  "lockpick.ringLabel",
  "lockpick.selectedRingLabel",
  "lockpick.livesLabel",
  "lockpick.useKey",
  "lockpick.leaveConfirm",
  "healer.paidThanks",
  "healer.freeThanks",
  "hud.health",
  "validation.failed",
  "log.runStarted",
  "log.runSeed",
  "log.validationPassed",
  "log.mapGenerated",
  "log.mapSeed",
  "log.battleSeed",
  "log.nodeSelected",
  "log.skipResolved",
  "log.rewardResolved",
  "log.shopOpened",
  "log.shopPurchased",
  "log.healOpened",
  "log.healApplied",
  "log.lockpickOpened",
  "log.lockpickBroken",
  "log.lockpickKeyUsed",
  "log.lockpickSucceeded",
  "log.lockpickLeft",
  "log.lockpickFailed",
  "log.mapVictory",
  "log.nextMap",
];

export async function validateGameData(campaign, itemCatalog, experienceTable, options = {}) {
  const issues = [];
  const requiredTextKeys = new Set(REQUIRED_LOCALE_KEYS);
  const requiredItemIds = new Set(["gold", "exp", "health"]);
  const itemCatalogById = validateItemCatalog(itemCatalog, issues, requiredTextKeys);

  validateCampaign(campaign, issues, requiredTextKeys);
  validateExperienceTable(experienceTable, issues, requiredTextKeys, requiredItemIds);
  validateCheatConfig(options.cheatConfig, CHEAT_CONFIG_URL, issues, requiredTextKeys);

  const mapConfigCache = new Map();
  const battleEnemyIds = new Set();
  const campaignMaps = Array.isArray(campaign?.maps) ? campaign.maps : [];
  const uniqueMapUrls = new Set(campaignMaps.map((entry) => toProjectUrl(entry.config || "")));
  const tutorial = campaign?.tutorial?.enabled === false ? null : campaign?.tutorial;
  if (tutorial?.config) {
    uniqueMapUrls.add(toProjectUrl(tutorial.config));
  }
  const testRun = getEnabledTestRunConfig(options.cheatConfig);
  // SmokeTest не входит в campaign.maps, но валидируется тем же путем: карта,
  // враги, ассеты, локали и player state должны ломать сборку при ошибке.
  if (testRun?.config) {
    uniqueMapUrls.add(toProjectUrl(testRun.config));
  }
  for (const mapUrl of uniqueMapUrls) {
    if (!mapUrl) {
      continue;
    }
    try {
      const mapConfig = await loadJsonc(mapUrl);
      mapConfigCache.set(mapUrl, mapConfig);
      validateMapConfig(mapConfig, mapUrl, issues, requiredTextKeys, requiredItemIds);
      collectBattleEnemyIds(mapConfig, battleEnemyIds);
    } catch (error) {
      issues.push(formatLoadIssue(mapUrl, error));
    }
  }
  for (const entry of campaignMaps) {
    const mapConfig = mapConfigCache.get(toProjectUrl(entry.config || ""));
    if (mapConfig && mapConfig.id !== entry.mapId) {
      issues.push(`${entry.config}: map id "${mapConfig.id}" does not match campaign mapId "${entry.mapId}"`);
    }
  }
  if (tutorial?.config) {
    const mapConfig = mapConfigCache.get(toProjectUrl(tutorial.config));
    if (mapConfig && mapConfig.id !== tutorial.mapId) {
      issues.push(`${tutorial.config}: map id "${mapConfig.id}" does not match tutorial mapId "${tutorial.mapId}"`);
    }
  }
  if (testRun?.config) {
    const mapConfig = mapConfigCache.get(toProjectUrl(testRun.config));
    if (mapConfig && mapConfig.id !== testRun.mapId) {
      issues.push(`${testRun.config}: map id "${mapConfig.id}" does not match testRun mapId "${testRun.mapId}"`);
    }
  }

  const battleConfigCache = await validateBattleConfigs(battleEnemyIds, issues, requiredTextKeys, requiredItemIds);
  const mapUiConfig = await validateMapUiConfig(issues, requiredTextKeys);

  try {
    validatePlayerState(
      await loadJson(DEFAULT_PLAYER_STATE_URL),
      issues,
      requiredItemIds,
    );
  } catch (error) {
    issues.push(formatLoadIssue(DEFAULT_PLAYER_STATE_URL, error));
  }
  if (testRun?.playerState) {
    const playerStateUrl = toProjectUrl(testRun.playerState);
    try {
      validatePlayerState(
        await loadJson(playerStateUrl),
        issues,
        requiredItemIds,
      );
    } catch (error) {
      issues.push(formatLoadIssue(playerStateUrl, error));
    }
  }

  validateRequiredItems(requiredItemIds, itemCatalogById, issues);
  await validateLocales(requiredTextKeys, issues, options.languages);

  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `- ${issue}`).join("\n"));
  }

  return { mapConfigCache, itemCatalogById, mapUiConfig, battleConfigCache };
}

async function validateBattleConfigs(enemyIds, issues, requiredTextKeys, requiredItemIds) {
  const battleConfigCache = {
    battleUiConfig: await validateBattleUiConfig(issues, requiredTextKeys, requiredItemIds),
    enemyConfigCache: new Map(),
  };

  for (const enemyId of enemyIds) {
    const enemyUrl = getEnemyConfigUrl(enemyId);
    try {
      const enemyConfig = await loadJsonc(enemyUrl);
      battleConfigCache.enemyConfigCache.set(enemyUrl, enemyConfig);
      validateEnemyConfig(
        enemyConfig,
        enemyUrl,
        issues,
        requiredTextKeys,
        requiredItemIds,
      );
    } catch (error) {
      issues.push(formatLoadIssue(enemyUrl, error));
    }
  }

  return battleConfigCache;
}

function getEnemyConfigUrl(enemyId) {
  return `${ENEMY_CONFIG_ROOT}/${enemyId}.jsonc`;
}

async function validateBattleUiConfig(issues, requiredTextKeys, requiredItemIds) {
  try {
    const battleUiConfig = await loadJsonc(BATTLE_UI_CONFIG_URL);
    validateBattleUiConfigObject(battleUiConfig, BATTLE_UI_CONFIG_URL, issues, requiredTextKeys, requiredItemIds);
    return battleUiConfig;
  } catch (error) {
    issues.push(formatLoadIssue(BATTLE_UI_CONFIG_URL, error));
    return null;
  }
}

async function validateMapUiConfig(issues, requiredTextKeys) {
  try {
    const mapUiConfig = await loadJsonc(MAP_UI_CONFIG_URL);
    validateMapUiConfigObject(mapUiConfig, MAP_UI_CONFIG_URL, issues, requiredTextKeys);
    return mapUiConfig;
  } catch (error) {
    issues.push(formatLoadIssue(MAP_UI_CONFIG_URL, error));
    return null;
  }
}
