import { loadJson, loadJsonc } from "./data-loader.js";

const DATA_ROOT = "./data";
const DEFAULT_PLAYER_STATE_URL = `${DATA_ROOT}/player/default-player-state.json`;
const BATTLE_UI_CONFIG_URL = `${DATA_ROOT}/settings/battle-ui.jsonc`;
const MAP_UI_CONFIG_URL = `${DATA_ROOT}/settings/map-ui.jsonc`;
const ENEMY_CONFIG_ROOT = `${DATA_ROOT}/enemy`;
const MIN_BATTLE_BOARD_DROP_TYPES = 3;
const MAP_EVENT_TYPES = ["battle", "reward", "heal", "shop", "skip", "dialog"];
const BATTLE_ITEM_STAT_KEYS = ["damage", "heal", "aggression", "calm"];
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
  "settings.musicVolume",
  "settings.soundVolume",
  "settings.language",
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
  "log.mapVictory",
  "log.nextMap",
];

function toProjectUrl(path) {
  return path.startsWith("data/") ? `./${path}` : path;
}

function getLocaleUrl(language) {
  return `${DATA_ROOT}/locales/${language}.json`;
}

function formatLoadIssue(source, error) {
  return error?.fileUrl ? error.message : `${source}: ${error.message}`;
}

export async function validateGameData(campaign, itemCatalog, experienceTable, options = {}) {
  const issues = [];
  const requiredTextKeys = new Set(REQUIRED_LOCALE_KEYS);
  const requiredItemIds = new Set(["gold", "exp", "health"]);
  const itemCatalogById = validateItemCatalog(itemCatalog, issues, requiredTextKeys);

  validateCampaign(campaign, issues, requiredTextKeys);
  validateExperienceTable(experienceTable, issues, requiredTextKeys, requiredItemIds);

  const mapConfigCache = new Map();
  const battleEnemyIds = new Set();
  const campaignMaps = Array.isArray(campaign?.maps) ? campaign.maps : [];
  const uniqueMapUrls = new Set(campaignMaps.map((entry) => toProjectUrl(entry.config || "")));
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

  validateRequiredItems(requiredItemIds, itemCatalogById, issues);
  await validateLocales(requiredTextKeys, issues, options.languages);

  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `- ${issue}`).join("\n"));
  }

  return { mapConfigCache, itemCatalogById, mapUiConfig, battleConfigCache };
}

function validateItemCatalog(itemCatalog, issues, requiredTextKeys) {
  const itemCatalogById = new Map();
  const itemBonusReferences = [];

  if (!itemCatalog || typeof itemCatalog !== "object") {
    issues.push("data/settings/items.jsonc: catalog must be an object");
    return itemCatalogById;
  }

  if (!Array.isArray(itemCatalog.items) || itemCatalog.items.length === 0) {
    issues.push("data/settings/items.jsonc.items: must contain at least one item");
    return itemCatalogById;
  }

  itemCatalog.items.forEach((item, index) => {
    const prefix = `data/settings/items.jsonc.items[${index}]`;
    if (!item || typeof item !== "object") {
      issues.push(`${prefix}: item must be an object`);
      return;
    }

    if (requireString(item.itemId, `${prefix}.itemId`, issues)) {
      if (itemCatalogById.has(item.itemId)) {
        issues.push(`${prefix}.itemId: duplicate item "${item.itemId}"`);
      } else {
        itemCatalogById.set(item.itemId, item);
      }
    }
    if (requireString(item.nameTextKey, `${prefix}.nameTextKey`, issues)) {
      requiredTextKeys.add(item.nameTextKey);
    }
    if (requireString(item.descriptionTextKey, `${prefix}.descriptionTextKey`, issues)) {
      requiredTextKeys.add(item.descriptionTextKey);
    }
    if (requireString(item.icon, `${prefix}.icon`, issues)) {
      validateCatalogAssetPath(item.icon, "data/Assets/item/", `${prefix}.icon`, issues);
    }
    if (requireString(item.bigIcon, `${prefix}.bigIcon`, issues)) {
      validateCatalogAssetPath(item.bigIcon, "data/Assets/big_icon/", `${prefix}.bigIcon`, issues);
    }
    if (item.sound_effect !== undefined && requireString(item.sound_effect, `${prefix}.sound_effect`, issues)) {
      validateCatalogAssetPath(item.sound_effect, "data/Assets/sound/", `${prefix}.sound_effect`, issues);
    }
    if (item.category !== undefined) {
      requireString(item.category, `${prefix}.category`, issues);
    }
    if (isBattleMatchItemCategory(item.category)) {
      requireString(item.type, `${prefix}.type`, issues);
      requireNumberInRange(item.damage, `${prefix}.damage`, 0, Infinity, issues);
      requireNumberInRange(item.heal, `${prefix}.heal`, 0, Infinity, issues);
      requireNumberInRange(item.aggression, `${prefix}.aggression`, 0, Infinity, issues);
      requireNumberInRange(item.calm, `${prefix}.calm`, 0, Infinity, issues);
      if (item.dmgperturn !== undefined) {
        requireNumberInRange(item.dmgperturn, `${prefix}.dmgperturn`, 0, Infinity, issues);
      }
      requireNumberInRange(item.Leave_side, `${prefix}.Leave_side`, 0, 360, issues);
      requireNumberInRange(item.death_time, `${prefix}.death_time`, 0, Infinity, issues);
    }
    collectOptionalItemReference(item.createsOnFour, `${prefix}.createsOnFour`, issues, itemBonusReferences);
    collectOptionalItemReference(item.createsOnFive, `${prefix}.createsOnFive`, issues, itemBonusReferences);
    if (item.showInHudAlways !== undefined && typeof item.showInHudAlways !== "boolean") {
      issues.push(`${prefix}.showInHudAlways: expected boolean`);
    }
    if (item.hudOrder !== undefined && (typeof item.hudOrder !== "number" || !Number.isFinite(item.hudOrder))) {
      issues.push(`${prefix}.hudOrder: expected finite number`);
    }
    if (item.hudValue !== undefined && !["health", "experience"].includes(item.hudValue)) {
      issues.push(`${prefix}.hudValue: expected "health" or "experience" when present`);
    }
    if (item.battleTimeStopSeconds !== undefined) {
      requireNumberInRange(item.battleTimeStopSeconds, `${prefix}.battleTimeStopSeconds`, 0, Infinity, issues);
    }
    if (item.battleUse !== undefined && item.battleUse !== "battery") {
      issues.push(`${prefix}.battleUse: expected "battery" when present`);
    }
    if (item.max_hp_modif !== undefined) {
      requireNumberInRange(item.max_hp_modif, `${prefix}.max_hp_modif`, 0, Infinity, issues);
    }
    if (item.heal_hp_modif !== undefined) {
      requireNumberInRange(item.heal_hp_modif, `${prefix}.heal_hp_modif`, 0, Infinity, issues);
    }
    validateItemModifiers(item, prefix, issues, itemBonusReferences);
    validateItemTransform(item, prefix, issues, itemBonusReferences);
  });

  for (const reference of itemBonusReferences) {
    if (!itemCatalogById.has(reference.itemId)) {
      issues.push(`${reference.path}: unknown itemId "${reference.itemId}"`);
    }
  }
  validateBattleDropTypeDiversity(itemCatalog.items, issues);

  return itemCatalogById;
}

function isBattleMatchItemCategory(category) {
  return category === "match-3" || category === "rare_match-3";
}

function validateBattleDropTypeDiversity(items, issues) {
  const dropTypes = new Set();

  for (const item of items) {
    if (item?.category === "match-3" && item.battleUse !== "battery" && typeof item.type === "string" && item.type.trim() !== "") {
      dropTypes.add(item.type);
    }
  }

  if (dropTypes.size < MIN_BATTLE_BOARD_DROP_TYPES) {
    const typeList = [...dropTypes].join(", ") || "none";
    issues.push(
      `data/settings/items.jsonc: too few match-3 types for battle board; expected at least `
      + `${MIN_BATTLE_BOARD_DROP_TYPES} different type values among category "match-3" items, found ${dropTypes.size} (${typeList})`,
    );
  }
}

function validateItemModifiers(item, prefix, issues, references) {
  if (item.modificate === undefined) {
    return;
  }

  if (!Array.isArray(item.modificate)) {
    issues.push(`${prefix}.modificate: expected array when present`);
    return;
  }

  item.modificate.forEach((modifier, index) => {
    const modifierPrefix = `${prefix}.modificate[${index}]`;
    if (!modifier || typeof modifier !== "object") {
      issues.push(`${modifierPrefix}: expected object`);
      return;
    }
    if (requireString(modifier.itemId, `${modifierPrefix}.itemId`, issues)) {
      references.push({
        itemId: modifier.itemId,
        path: `${modifierPrefix}.itemId`,
      });
    }
    requireNumberInRange(modifier.damage, `${modifierPrefix}.damage`, 0, Infinity, issues);
    requireNumberInRange(modifier.heal, `${modifierPrefix}.heal`, 0, Infinity, issues);
    requireNumberInRange(modifier.aggression, `${modifierPrefix}.aggression`, 0, Infinity, issues);
    requireNumberInRange(modifier.calm, `${modifierPrefix}.calm`, 0, Infinity, issues);
  });
}

function validateItemTransform(item, prefix, issues, references) {
  const hasTransform =
    item.transform_chance !== undefined ||
    item.transform_from_itemId !== undefined ||
    item.transform_to_itemId !== undefined;

  if (!hasTransform) {
    return;
  }

  requireNumberInRange(item.transform_chance, `${prefix}.transform_chance`, 0, 100, issues);
  if (requireString(item.transform_from_itemId, `${prefix}.transform_from_itemId`, issues)) {
    references.push({
      itemId: item.transform_from_itemId,
      path: `${prefix}.transform_from_itemId`,
    });
  }
  if (requireString(item.transform_to_itemId, `${prefix}.transform_to_itemId`, issues)) {
    references.push({
      itemId: item.transform_to_itemId,
      path: `${prefix}.transform_to_itemId`,
    });
  }
}

function collectOptionalItemReference(value, path, issues, references) {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${path}: expected non-empty itemId string`);
    return;
  }
  references.push({ itemId: value, path });
}

function validateCatalogAssetPath(path, expectedPrefix, pathLabel, issues) {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized.startsWith(expectedPrefix)) {
    issues.push(`${pathLabel}: expected path starting with "${expectedPrefix}"`);
  }
}

function validateRequiredItems(requiredItemIds, itemCatalogById, issues) {
  for (const itemId of requiredItemIds) {
    if (!itemCatalogById.has(itemId)) {
      issues.push(
        `data/settings/items.jsonc: missing itemId "${itemId}" referenced by game data`,
      );
    }
  }
}

function collectBattleEnemyIds(mapConfig, battleEnemyIds) {
  if (!mapConfig || typeof mapConfig !== "object") {
    return;
  }
  if (typeof mapConfig.boss?.enemyId === "string" && mapConfig.boss.enemyId.trim() !== "") {
    battleEnemyIds.add(mapConfig.boss.enemyId);
  }
  if (!Array.isArray(mapConfig.battle)) {
    return;
  }
  for (const variant of mapConfig.battle) {
    if (typeof variant?.enemyId === "string" && variant.enemyId.trim() !== "") {
      battleEnemyIds.add(variant.enemyId);
    }
  }
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

function validateMapUiConfigObject(config, source, issues, requiredTextKeys) {
  if (!config || typeof config !== "object") {
    issues.push(`${source}: map UI config must be an object`);
    return;
  }

  validateMapUiLayout(config.layout, `${source}.layout`, issues);
  validateMapUiOrientation(config.orientation, `${source}.orientation`, issues);
  validateMapUiTopButtons(config.topButtons, `${source}.topButtons`, issues, requiredTextKeys);
  validateMapUiNodes(config.nodes, `${source}.nodes`, issues);
  validateMapUiDialog(config.dialog, `${source}.dialog`, issues);
  validateMapAnimationConfig(config.animation, `${source}.animation`, issues);
}

function validateMapUiLayout(layout, path, issues) {
  if (layout === undefined) {
    return;
  }
  if (!layout || typeof layout !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }
  requireIntegerInRange(layout.designWidthPx, `${path}.designWidthPx`, 1, Infinity, issues);
  requireIntegerInRange(layout.designHeightPx, `${path}.designHeightPx`, 1, Infinity, issues);
  requireNumberInRange(layout.viewportPaddingPx, `${path}.viewportPaddingPx`, 0, Infinity, issues);
  if (typeof layout.allowUpscale !== "boolean") {
    issues.push(`${path}.allowUpscale: must be a boolean`);
  }
  requireNumberInRange(layout.upscaleFactor, `${path}.upscaleFactor`, 0, 1, issues);
  requireNumberInRange(layout.minScale, `${path}.minScale`, 0.1, 2, issues);
  if (layout.hudScaleReductionDivisor !== undefined) {
    requireNumberInRange(layout.hudScaleReductionDivisor, `${path}.hudScaleReductionDivisor`, 1, Infinity, issues);
  }
  if (layout.topButtonsScaleReductionDivisor !== undefined) {
    requireNumberInRange(layout.topButtonsScaleReductionDivisor, `${path}.topButtonsScaleReductionDivisor`, 1, Infinity, issues);
  }
  if (layout.mainMenuScaleReductionDivisor !== undefined) {
    requireNumberInRange(layout.mainMenuScaleReductionDivisor, `${path}.mainMenuScaleReductionDivisor`, 1, Infinity, issues);
  }
  if (layout.mainMenuScaleMultiplier !== undefined) {
    requireNumberInRange(layout.mainMenuScaleMultiplier, `${path}.mainMenuScaleMultiplier`, 0.1, Infinity, issues);
  }
  if (layout.settingsMenuScaleReductionDivisor !== undefined) {
    requireNumberInRange(layout.settingsMenuScaleReductionDivisor, `${path}.settingsMenuScaleReductionDivisor`, 1, Infinity, issues);
  }
  if (layout.settingsMenuScaleMultiplier !== undefined) {
    requireNumberInRange(layout.settingsMenuScaleMultiplier, `${path}.settingsMenuScaleMultiplier`, 0.1, Infinity, issues);
  }
  if (layout.settingsMenuFontScale !== undefined) {
    requireNumberInRange(layout.settingsMenuFontScale, `${path}.settingsMenuFontScale`, 0.1, Infinity, issues);
  }
}

function validateMapUiOrientation(orientation, path, issues) {
  if (orientation === undefined) {
    return;
  }
  if (!orientation || typeof orientation !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }
  if (orientation.forceLandscapeOnPhones !== undefined && typeof orientation.forceLandscapeOnPhones !== "boolean") {
    issues.push(`${path}.forceLandscapeOnPhones: must be a boolean`);
  }
  if (orientation.requireTouch !== undefined && typeof orientation.requireTouch !== "boolean") {
    issues.push(`${path}.requireTouch: must be a boolean`);
  }
  if (orientation.maxPhoneShortSidePx !== undefined) {
    requireNumberInRange(orientation.maxPhoneShortSidePx, `${path}.maxPhoneShortSidePx`, 1, Infinity, issues);
  }
  if (orientation.maxPhoneLongSidePx !== undefined) {
    requireNumberInRange(orientation.maxPhoneLongSidePx, `${path}.maxPhoneLongSidePx`, 1, Infinity, issues);
  }
  if (orientation.rotateDegrees !== undefined) {
    requireNumberInRange(orientation.rotateDegrees, `${path}.rotateDegrees`, -270, 270, issues);
  }
}

function validateMapUiDialog(dialog, path, issues) {
  if (dialog === undefined) {
    return;
  }
  if (!dialog || typeof dialog !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }
  if (dialog.backdropOpacity !== undefined) {
    requireNumberInRange(dialog.backdropOpacity, `${path}.backdropOpacity`, 0, 1, issues);
  }
  if (dialog.backdropBlurPx !== undefined) {
    requireNumberInRange(dialog.backdropBlurPx, `${path}.backdropBlurPx`, 0, Infinity, issues);
  }
  if (dialog.textLetterMs !== undefined) {
    requireNumberInRange(dialog.textLetterMs, `${path}.textLetterMs`, 0, Infinity, issues);
  }
  if (dialog.answersFadeMs !== undefined) {
    requireNumberInRange(dialog.answersFadeMs, `${path}.answersFadeMs`, 0, Infinity, issues);
  }
  for (const field of ["characterImage", "characterWidthPx", "characterWidthPct", "characterBottomPx", "characterCenterXPct", "characterCenterYPct"]) {
    if (dialog[field] !== undefined) {
      issues.push(`${path}.${field}: character asset, size and position belong to dialog event payload, not map-ui`);
    }
  }
}

function validateMapUiNodes(nodes, path, issues) {
  if (nodes === undefined) {
    return;
  }
  if (!nodes || typeof nodes !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }
  if (nodes.hoverScale !== undefined) {
    requireNumberInRange(nodes.hoverScale, `${path}.hoverScale`, 1, Infinity, issues);
  }
  if (nodes.activeLightIcon !== undefined && requireString(nodes.activeLightIcon, `${path}.activeLightIcon`, issues)) {
    validateCatalogAssetPath(nodes.activeLightIcon, "data/Assets/", `${path}.activeLightIcon`, issues);
  }
  if (nodes.activeLightSizePx !== undefined) {
    requireNumberInRange(nodes.activeLightSizePx, `${path}.activeLightSizePx`, 1, Infinity, issues);
  }
  if (nodes.hoverLightIcon !== undefined && requireString(nodes.hoverLightIcon, `${path}.hoverLightIcon`, issues)) {
    validateCatalogAssetPath(nodes.hoverLightIcon, "data/Assets/", `${path}.hoverLightIcon`, issues);
  }
  if (nodes.hoverLightSizePx !== undefined) {
    requireNumberInRange(nodes.hoverLightSizePx, `${path}.hoverLightSizePx`, 1, Infinity, issues);
  }
  if (nodes.positionJitterPct !== undefined) {
    if (!nodes.positionJitterPct || typeof nodes.positionJitterPct !== "object") {
      issues.push(`${path}.positionJitterPct: must be an object when present`);
    } else {
      validateNumberRangeConfig(nodes.positionJitterPct.x, `${path}.positionJitterPct.x`, -100, 100, issues);
      validateNumberRangeConfig(nodes.positionJitterPct.y, `${path}.positionJitterPct.y`, -100, 100, issues);
    }
  }
  if (nodes.layoutPasses !== undefined) {
    requireIntegerInRange(nodes.layoutPasses, `${path}.layoutPasses`, 0, 20, issues);
  }
}

function validateMapUiTopButtons(topButtons, path, issues, requiredTextKeys) {
  if (topButtons === undefined) {
    return;
  }
  if (!topButtons || typeof topButtons !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }

  for (const [buttonId, config] of Object.entries(topButtons)) {
    const prefix = `${path}.${buttonId}`;
    if (!config || typeof config !== "object") {
      issues.push(`${prefix}: must be an object`);
      continue;
    }
    if (requireString(config.textKey, `${prefix}.textKey`, issues)) {
      requiredTextKeys.add(config.textKey);
    }
    if (requireString(config.icon, `${prefix}.icon`, issues)) {
      validateCatalogAssetPath(config.icon, "data/Assets/icons/", `${prefix}.icon`, issues);
    }
    if (config.iconSizePx !== undefined) {
      requireNumberInRange(config.iconSizePx, `${prefix}.iconSizePx`, 1, Infinity, issues);
    }
  }
}

function validateMapAnimationConfig(animation, path, issues) {
  if (animation === undefined) {
    return;
  }
  if (!animation || typeof animation !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }

  if (animation.enabled !== undefined && typeof animation.enabled !== "boolean") {
    issues.push(`${path}.enabled: expected boolean`);
  }

  const definitionTypes = validateMapAnimationDefinitions(
    animation.definitions,
    `${path}.definitions`,
    issues,
  );
  validateMapAnimationCounts(animation.counts, `${path}.counts`, issues, definitionTypes);
}

function validateMapAnimationDefinitions(definitions, path, issues) {
  const definitionTypes = new Set();
  if (!Array.isArray(definitions)) {
    issues.push(`${path}: must be an array`);
    return definitionTypes;
  }

  definitions.forEach((definition, index) => {
    const prefix = `${path}[${index}]`;
    if (!definition || typeof definition !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }
    requireString(definition.name, `${prefix}.name`, issues);
    if (requireString(definition.type, `${prefix}.type`, issues)) {
      definitionTypes.add(definition.type);
    }
    if (definition.enabled !== undefined && typeof definition.enabled !== "boolean") {
      issues.push(`${prefix}.enabled: expected boolean`);
    }
    if (definition.type === "bird") {
      validateMapBirdAnimationDefinition(definition, prefix, issues);
    }
  });

  return definitionTypes;
}

function validateMapBirdAnimationDefinition(definition, path, issues) {
  if (!Array.isArray(definition.frames) || definition.frames.length === 0) {
    issues.push(`${path}.frames: must contain at least one frame path`);
  } else {
    definition.frames.forEach((frame, frameIndex) => {
      if (requireString(frame, `${path}.frames[${frameIndex}]`, issues)) {
        validateCatalogAssetPath(frame, "data/Assets/", `${path}.frames[${frameIndex}]`, issues);
      }
    });
  }
  if (requireString(definition.glideFrame, `${path}.glideFrame`, issues)) {
    validateCatalogAssetPath(definition.glideFrame, "data/Assets/", `${path}.glideFrame`, issues);
  }
  validateNumberRangeConfig(definition.headingDegrees, `${path}.headingDegrees`, 0, 360, issues);
  requireNumberInRange(definition.frameIntervalMs, `${path}.frameIntervalMs`, 1, Infinity, issues);
  validateNumberRangeConfig(definition.glideDurationMs, `${path}.glideDurationMs`, 0, Infinity, issues);
  validateMapAnimationSpawnEdges(definition.spawnEdges, `${path}.spawnEdges`, issues);
  requireNumberInRange(definition.movementSpeedPxPerSecond, `${path}.movementSpeedPxPerSecond`, 1, Infinity, issues);
  if (definition.sizePx !== undefined) {
    requireNumberInRange(definition.sizePx, `${path}.sizePx`, 1, Infinity, issues);
  }
  if (definition.rotateWithHeading !== undefined && typeof definition.rotateWithHeading !== "boolean") {
    issues.push(`${path}.rotateWithHeading: expected boolean`);
  }
  if (definition.spriteAngleOffsetDegrees !== undefined) {
    requireNumberInRange(definition.spriteAngleOffsetDegrees, `${path}.spriteAngleOffsetDegrees`, -360, 360, issues);
  }
}

function validateMapAnimationSpawnEdges(spawnEdges, path, issues) {
  const validEdges = new Set(["left", "right", "top", "bottom"]);
  if (!Array.isArray(spawnEdges) || spawnEdges.length === 0) {
    issues.push(`${path}: must contain at least one edge`);
    return;
  }
  spawnEdges.forEach((edge, index) => {
    if (!validEdges.has(edge)) {
      issues.push(`${path}[${index}]: expected left, right, top or bottom`);
    }
  });
}

function validateMapAnimationCounts(counts, path, issues, definitionTypes) {
  if (!Array.isArray(counts)) {
    issues.push(`${path}: must be an array`);
    return;
  }

  counts.forEach((countConfig, index) => {
    const prefix = `${path}[${index}]`;
    if (!countConfig || typeof countConfig !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }
    if (requireString(countConfig.type, `${prefix}.type`, issues) && !definitionTypes.has(countConfig.type)) {
      issues.push(`${prefix}.type: no animation definition for type "${countConfig.type}"`);
    }
    requireIntegerInRange(countConfig.maxActive, `${prefix}.maxActive`, 0, 100, issues);
    validateNumberRangeConfig(countConfig.spawnIntervalMs, `${prefix}.spawnIntervalMs`, 0, Infinity, issues);
  });
}

function validateNumberRangeConfig(range, path, min, max, issues) {
  if (!range || typeof range !== "object") {
    issues.push(`${path}: must be an object with min and max`);
    return;
  }
  requireNumberInRange(range.min, `${path}.min`, min, max, issues);
  requireNumberInRange(range.max, `${path}.max`, min, max, issues);
  if (typeof range.min === "number" && typeof range.max === "number" && range.min > range.max) {
    issues.push(`${path}: min cannot be greater than max`);
  }
}

function validateBattleUiConfigObject(config, source, issues, requiredTextKeys, requiredItemIds) {
  if (!config || typeof config !== "object") {
    issues.push(`${source}: battle UI config must be an object`);
    return;
  }

  if (!config.textKeys || typeof config.textKeys !== "object") {
    issues.push(`${source}.textKeys: must be an object`);
  } else {
    for (const [key, textKey] of Object.entries(config.textKeys)) {
      if (requireString(textKey, `${source}.textKeys.${key}`, issues)) {
        requiredTextKeys.add(textKey);
      }
    }
  }

  validateBattleUiTopButtons(config.topButtons, `${source}.topButtons`, issues, requiredTextKeys);
  const iconKeys = [
    "playerHealth",
    "playerHeal",
    "enemyHealth",
    "enemyShield",
    "enemyAggression",
    "enemyDamage",
    "enemyRage",
    "lightRed",
    "lightGold",
    "wall",
    "wall_1",
    "wall_2",
    "box",
    "vines",
  ];
  if (!config.icons || typeof config.icons !== "object") {
    issues.push(`${source}.icons: must be an object`);
  } else {
    const hasAnyWallIcon = Boolean(config.icons.wall || config.icons.wall_1 || config.icons.wall_2);
    if (!hasAnyWallIcon) {
      issues.push(`${source}.icons: at least one of wall, wall_1, wall_2 must be defined`);
    }
    for (const iconKey of iconKeys) {
      if (config.icons[iconKey] === undefined) {
        continue;
      }
      if (requireString(config.icons[iconKey], `${source}.icons.${iconKey}`, issues)) {
        validateCatalogAssetPath(config.icons[iconKey], "data/Assets/", `${source}.icons.${iconKey}`, issues);
      }
    }
  }

  if (!config.backgrounds || typeof config.backgrounds !== "object") {
    issues.push(`${source}.backgrounds: must be an object`);
  } else if (requireString(config.backgrounds.battleWindow, `${source}.backgrounds.battleWindow`, issues)) {
    validateCatalogAssetPath(
      config.backgrounds.battleWindow,
      "data/Assets/backgrounds/",
      `${source}.backgrounds.battleWindow`,
      issues,
    );
  }

  validateBattleHandItemIds(config.handItemIds, `${source}.handItemIds`, issues, requiredItemIds);
  validateBattleLayoutConfig(config.layout, `${source}.layout`, issues);
  validateBattleBoardConfig(config.board, `${source}.board`, issues);
  if (config.limits !== undefined && (!config.limits || typeof config.limits !== "object")) {
    issues.push(`${source}.limits: must be an object`);
  } else if (config.limits) {
    requireIntegerInRange(config.limits.enemyShieldMax, `${source}.limits.enemyShieldMax`, 0, 99, issues);
  }
  requireNumberInRange(config.feedback?.floatMessageMs, `${source}.feedback.floatMessageMs`, 0, Infinity, issues);
  validateBattleAvailableMoveSearchConfig(config.availableMoveSearch, `${source}.availableMoveSearch`, issues);
  validateBattleAnimationConfig(config.animations, `${source}.animations`, issues);
}

function validateBattleUiTopButtons(topButtons, path, issues, requiredTextKeys) {
  if (topButtons === undefined) {
    return;
  }
  if (!topButtons || typeof topButtons !== "object") {
    issues.push(`${path}: must be an object when present`);
    return;
  }

  for (const [buttonId, buttonConfig] of Object.entries(topButtons)) {
    const prefix = `${path}.${buttonId}`;
    if (!buttonConfig || typeof buttonConfig !== "object") {
      issues.push(`${prefix}: must be an object`);
      continue;
    }
    if (requireString(buttonConfig.textKey, `${prefix}.textKey`, issues)) {
      requiredTextKeys.add(buttonConfig.textKey);
    }
    if (requireString(buttonConfig.icon, `${prefix}.icon`, issues)) {
      validateCatalogAssetPath(buttonConfig.icon, "data/Assets/icons/", `${prefix}.icon`, issues);
    }
    if (buttonConfig.iconSizePx !== undefined) {
      requireNumberInRange(buttonConfig.iconSizePx, `${prefix}.iconSizePx`, 1, Infinity, issues);
    }
  }
}

function validateBattleLayoutConfig(layout, path, issues) {
  if (!layout || typeof layout !== "object") {
    issues.push(`${path}: must be an object`);
    return;
  }
  requireIntegerInRange(layout.designWidthPx, `${path}.designWidthPx`, 1, Infinity, issues);
  requireIntegerInRange(layout.designHeightPx, `${path}.designHeightPx`, 1, Infinity, issues);
  requireNumberInRange(layout.viewportPaddingPx, `${path}.viewportPaddingPx`, 0, Infinity, issues);
  if (typeof layout.allowUpscale !== "boolean") {
    issues.push(`${path}.allowUpscale: expected boolean`);
  }
  requireNumberInRange(layout.upscaleFactor, `${path}.upscaleFactor`, 0, 1, issues);
  requireNumberInRange(layout.minScale, `${path}.minScale`, 0.1, 2, issues);
}

function validateBattleHandItemIds(handItemIds, path, issues, requiredItemIds) {
  if (!Array.isArray(handItemIds) || handItemIds.length === 0) {
    issues.push(`${path}: must contain at least one itemId`);
    return;
  }
  handItemIds.forEach((itemId, index) => {
    if (requireString(itemId, `${path}[${index}]`, issues)) {
      requiredItemIds.add(itemId);
    }
  });
}

function validateBattleBoardConfig(board, path, issues) {
  if (!board || typeof board !== "object") {
    issues.push(`${path}: must be an object`);
    return;
  }
  requireIntegerInRange(board.width, `${path}.width`, 3, 30, issues);
  requireIntegerInRange(board.height, `${path}.height`, 3, 30, issues);
}

function validateBattleAvailableMoveSearchConfig(config, path, issues) {
  if (!config || typeof config !== "object") {
    issues.push(`${path}: must be an object`);
    return;
  }
  if (!Array.isArray(config.typeGroups) || config.typeGroups.length === 0) {
    issues.push(`${path}.typeGroups: must contain at least one group`);
    return;
  }
  config.typeGroups.forEach((group, groupIndex) => {
    const values = Array.isArray(group) ? group : [group];
    if (values.length === 0) {
      issues.push(`${path}.typeGroups[${groupIndex}]: must contain at least one item type or "*"`);
      return;
    }
    values.forEach((type, typeIndex) => {
      requireString(type, `${path}.typeGroups[${groupIndex}][${typeIndex}]`, issues);
    });
  });
}

function validateBattleAnimationConfig(animations, path, issues) {
  if (!animations || typeof animations !== "object") {
    issues.push(`${path}: must be an object`);
    return;
  }
  const requiredKeys = new Set([
    "swapMs",
    "invalidShakeMs",
    "matchShakeMs",
    "boardMoveMs",
    "boardMoveStepMs",
    "idleHintDelayMs",
    "idleHintShakeMs",
    "noMovesMessageMs",
    "noMovesShuffleMs",
    "outcomeBannerMs",
    "deathFlightPx",
  ]);
  const optionalKeys = [
    "swapMoveMs",
    "boardDropMs",
    "itemDropGapMs",
    "cascadeStepMs",
    "newItemSpawnOffsetPx",
    "newItemStackGapPx",
    "wallToggleMs",
    "healthChangeMs",
    "healthChangeFloatMs",
    "healthChangeFloatRisePx",
    "healthChangeScale",
    "healChangeMs",
    "healChangeFloatMs",
    "healChangeFloatRisePx",
    "healChangeScale",
    "aggressionChangeMs",
    "aggressionChangeFloatMs",
    "aggressionChangeFloatRisePx",
    "aggressionChangeScale",
    "lightDamageProjectileCount",
    "lightDamageProjectilesPerDamage",
    "lightDamageProjectileMs",
    "lightDamageProjectileArcHeightPx",
    "lightDamageProjectileSpreadPx",
    "lightDamageProjectileSizePx",
    "kamikazeBurstDistancePx",
    "rageWaveMs",
    "rageProjectileCount",
    "rageProjectileMs",
    "rageProjectileArcHeightPx",
    "rageProjectileSpreadPx",
    "rageProjectileSizePx",
  ];

  [
    ...requiredKeys,
  ].forEach((key) => {
    requireNumberInRange(animations[key], `${path}.${key}`, 0, Infinity, issues);
  });
  optionalKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(animations, key)) {
      requireNumberInRange(animations[key], `${path}.${key}`, 0, Infinity, issues);
    }
  });
  if (Object.prototype.hasOwnProperty.call(animations, "healthChangeScale")) {
    requireNumberInRange(animations.healthChangeScale, `${path}.healthChangeScale`, 1, Infinity, issues);
  }
  if (Object.prototype.hasOwnProperty.call(animations, "healChangeScale")) {
    requireNumberInRange(animations.healChangeScale, `${path}.healChangeScale`, 1, Infinity, issues);
  }
  if (Object.prototype.hasOwnProperty.call(animations, "aggressionChangeScale")) {
    requireNumberInRange(animations.aggressionChangeScale, `${path}.aggressionChangeScale`, 1, Infinity, issues);
  }
}

function validateEnemyConfig(enemyConfig, source, issues, requiredTextKeys, requiredItemIds) {
  if (!enemyConfig || typeof enemyConfig !== "object") {
    issues.push(`${source}: enemy config must be an object`);
    return;
  }

  requireString(enemyConfig.enemyId, `${source}.enemyId`, issues);
  if (requireString(enemyConfig.nameTextKey, `${source}.nameTextKey`, issues)) {
    requiredTextKeys.add(enemyConfig.nameTextKey);
  }
  if (requireString(enemyConfig.descriptionTextKey, `${source}.descriptionTextKey`, issues)) {
    requiredTextKeys.add(enemyConfig.descriptionTextKey);
  }
  requirePositiveInteger(enemyConfig.stageCount, `${source}.stageCount`, issues);
  if (enemyConfig.wall !== undefined) {
    requireIntegerInRange(enemyConfig.wall, `${source}.wall`, 0, Infinity, issues);
  }
  if (enemyConfig.box !== undefined) {
    requireIntegerInRange(enemyConfig.box, `${source}.box`, 0, Infinity, issues);
  }
  if (enemyConfig.vines !== undefined) {
    requireIntegerInRange(enemyConfig.vines, `${source}.vines`, 0, Infinity, issues);
  }
  if (enemyConfig.convert !== undefined) {
    issues.push(`${source}.convert: passive convert must be configured inside stages[].convert`);
  }
  if (!Array.isArray(enemyConfig.stages) || enemyConfig.stages.length === 0) {
    issues.push(`${source}.stages: must contain at least one stage`);
  } else {
    if (Number.isInteger(enemyConfig.stageCount) && enemyConfig.stageCount !== enemyConfig.stages.length) {
      issues.push(`${source}.stageCount: must match stages length`);
    }
    enemyConfig.stages.forEach((stage, index) => {
      validateEnemyStage(stage, `${source}.stages[${index}]`, issues, requiredTextKeys, requiredItemIds);
    });
  }

  if (enemyConfig.battle_music !== undefined) {
    if (requireString(enemyConfig.battle_music, `${source}.battle_music`, issues)) {
      validateCatalogAssetPath(
        enemyConfig.battle_music,
        "data/Assets/",
        `${source}.battle_music`,
        issues,
      );
    }
  }

  validateRewardConfig(enemyConfig.reward, `${source}.reward`, issues, requiredItemIds, requiredTextKeys);
}

function validateEnemyStage(stage, path, issues, requiredTextKeys, requiredItemIds) {
  if (!stage || typeof stage !== "object") {
    issues.push(`${path}: stage must be an object`);
    return;
  }
  requireString(stage.stageId, `${path}.stageId`, issues);
  if (requireString(stage.nameTextKey, `${path}.nameTextKey`, issues)) {
    requiredTextKeys.add(stage.nameTextKey);
  }
  if (requireString(stage.appearance, `${path}.appearance`, issues)) {
    validateCatalogAssetPath(stage.appearance, "data/Assets/enemy/", `${path}.appearance`, issues);
  }
  if (stage.wall !== undefined) {
    requireIntegerInRange(stage.wall, `${path}.wall`, 0, Infinity, issues);
  }
  if (stage.box !== undefined) {
    requireIntegerInRange(stage.box, `${path}.box`, 0, Infinity, issues);
  }
  if (stage.vines !== undefined) {
    requireIntegerInRange(stage.vines, `${path}.vines`, 0, Infinity, issues);
  }
  if (stage.shield !== undefined) {
    requireIntegerInRange(stage.shield, `${path}.shield`, 0, Infinity, issues);
  }
  validateEnemyConvertEffects(stage.convert, `${path}.convert`, issues, requiredItemIds);
  validateEnemyItemStatModifiers(stage.itemStatModifiers, `${path}.itemStatModifiers`, issues, requiredItemIds);
  requirePositiveNumber(stage.health, `${path}.health`, issues);
  requirePositiveNumber(stage.aggression?.threshold, `${path}.aggression.threshold`, issues);
  requireNumberInRange(stage.aggression?.damage, `${path}.aggression.damage`, 0, Infinity, issues);
  requirePositiveNumber(stage.rage?.secondsToUltimate, `${path}.rage.secondsToUltimate`, issues);
  validateOptionalStringList(stage.rage?.targetTypes, `${path}.rage.targetTypes`, issues);
  validateOptionalStringList(stage.rage?.targetItemIds, `${path}.rage.targetItemIds`, issues, requiredItemIds);

  if (!stage.ultimate || typeof stage.ultimate !== "object") {
    issues.push(`${path}.ultimate: must be an object`);
    return;
  }
  if (requireString(stage.ultimate.nameTextKey, `${path}.ultimate.nameTextKey`, issues)) {
    requiredTextKeys.add(stage.ultimate.nameTextKey);
  }
  if (requireString(stage.ultimate.descriptionTextKey, `${path}.ultimate.descriptionTextKey`, issues)) {
    requiredTextKeys.add(stage.ultimate.descriptionTextKey);
  }
  if (!Array.isArray(stage.ultimate.effects)) {
    issues.push(`${path}.ultimate.effects: must be an array`);
  } else {
    validateEnemyUltimateEffects(stage.ultimate.effects, `${path}.ultimate.effects`, issues, requiredItemIds);
  }
}

function validateEnemyItemStatModifiers(modifiers, path, issues, requiredItemIds) {
  if (modifiers === undefined) {
    return;
  }
  if (!Array.isArray(modifiers)) {
    issues.push(`${path}: must be an array when present`);
    return;
  }

  modifiers.forEach((modifier, index) => {
    const prefix = `${path}[${index}]`;
    if (!modifier || typeof modifier !== "object" || Array.isArray(modifier)) {
      issues.push(`${prefix}: must be an object`);
      return;
    }

    const itemIds = modifier.itemIds ?? modifier.itemId;
    validateOptionalStringList(itemIds, `${prefix}.itemIds`, issues, requiredItemIds);
    validateOptionalStringList(modifier.itemTypes, `${prefix}.itemTypes`, issues);
    if (!hasOptionalStringList(itemIds) && !hasOptionalStringList(modifier.itemTypes)) {
      issues.push(`${prefix}: expected itemTypes, itemIds or itemId selector`);
    }

    if (!modifier.multipliers || typeof modifier.multipliers !== "object" || Array.isArray(modifier.multipliers)) {
      issues.push(`${prefix}.multipliers: must be an object`);
      return;
    }

    let hasStatMultiplier = false;
    for (const [statKey, multiplier] of Object.entries(modifier.multipliers)) {
      if (!BATTLE_ITEM_STAT_KEYS.includes(statKey)) {
        issues.push(`${prefix}.multipliers.${statKey}: expected one of ${BATTLE_ITEM_STAT_KEYS.join(", ")}`);
        continue;
      }
      hasStatMultiplier = true;
      requireNumberInRange(multiplier, `${prefix}.multipliers.${statKey}`, 0, Infinity, issues);
    }
    if (!hasStatMultiplier) {
      issues.push(`${prefix}.multipliers: expected at least one of ${BATTLE_ITEM_STAT_KEYS.join(", ")}`);
    }
  });
}

function validateEnemyUltimateEffects(effects, path, issues, requiredItemIds) {
  effects.forEach((effect, index) => {
    const prefix = `${path}[${index}]`;
    if (!effect || typeof effect !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }

    const effectType = String(effect.type || effect.effectId || effect.id || "").trim();
    if (!effectType) {
      issues.push(`${prefix}.type: expected non-empty string`);
      return;
    }

    if (isConvertUltimateEffectType(effectType)) {
      validateConvertItemsEffect(effect, prefix, issues, requiredItemIds);
      return;
    }

    if (isDamagePlayerByBoardItemsUltimateEffectType(effectType)) {
      validateBoardItemCountEffect(effect, prefix, issues, requiredItemIds, "damagePlayerByBoardItems");
      return;
    }

    if (isHealingEnemyByBoardItemsUltimateEffectType(effectType)) {
      validateBoardItemCountEffect(effect, prefix, issues, requiredItemIds, "HealingEnemyByBoardItems");
      return;
    }

    if (isRestoreEnemyShieldByBoardItemsUltimateEffectType(effectType)) {
      validateBoardItemCountEffect(effect, prefix, issues, requiredItemIds, "RestoreEnemyShieldByBoardItems");
      return;
    }

    if (isKamikazeUltimateEffectType(effectType)) {
      return;
    }
  });
}

function validateBoardItemCountEffect(effect, prefix, issues, requiredItemIds, effectName) {
  validateOptionalStringList(effect.count?.itemTypes ?? effect.countItemTypes ?? effect.itemTypes, `${prefix}.count.itemTypes`, issues);
  const countItemIds = effect.count?.itemIds
    ?? effect.count?.itemId
    ?? effect.countItemIds
    ?? effect.countItemId
    ?? effect.itemIds
    ?? effect.itemId;
  validateOptionalStringList(
    countItemIds,
    `${prefix}.count.itemIds`,
    issues,
    requiredItemIds,
  );
  const hasItemTypes = hasOptionalStringList(effect.count?.itemTypes ?? effect.countItemTypes ?? effect.itemTypes);
  const hasItemIds = hasOptionalStringList(countItemIds);
  if (!hasItemTypes && !hasItemIds) {
    issues.push(`${prefix}.count: expected itemTypes, itemIds or itemId for ${effectName}`);
  }
  requireNumberInRange(effect.modifier, `${prefix}.modifier`, 0, Infinity, issues);
}

function validateEnemyConvertEffects(convertEffects, path, issues, requiredItemIds) {
  if (convertEffects === undefined) {
    return;
  }
  if (!Array.isArray(convertEffects)) {
    issues.push(`${path}: must be an array when present`);
    return;
  }

  convertEffects.forEach((effect, index) => {
    const prefix = `${path}[${index}]`;
    if (!effect || typeof effect !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }

    const effectType = String(effect.type || effect.effectId || effect.id || "").trim();
    if (!isConvertUltimateEffectType(effectType)) {
      issues.push(`${prefix}.type: expected "convertItems"`);
      return;
    }

    requireNumberInRange(effect.chance, `${prefix}.chance`, 0, 1, issues);
    validateConvertItemsEffect(effect, prefix, issues, requiredItemIds);
  });
}

function validateConvertItemsEffect(effect, prefix, issues, requiredItemIds) {
  validateOptionalStringList(effect.from?.itemTypes ?? effect.fromItemTypes ?? effect.itemTypes, `${prefix}.from.itemTypes`, issues);
  const fromItemIds = effect.from?.itemIds
    ?? effect.from?.itemId
    ?? effect.fromItemIds
    ?? effect.fromItemId
    ?? effect.itemIds
    ?? effect.itemId;
  validateOptionalStringList(
    fromItemIds,
    `${prefix}.from.itemIds`,
    issues,
    requiredItemIds,
  );
  const hasItemTypes = hasOptionalStringList(effect.from?.itemTypes ?? effect.fromItemTypes ?? effect.itemTypes);
  const hasItemIds = hasOptionalStringList(fromItemIds);
  if (!hasItemTypes && !hasItemIds) {
    issues.push(`${prefix}.from: expected itemTypes, itemIds or itemId for convertItems`);
  }

  const targetItemIds = effect.to?.itemIds ?? effect.toItemIds ?? effect.to?.itemId ?? effect.toItemId;
  validateOptionalStringList(targetItemIds, `${prefix}.to.itemIds`, issues, requiredItemIds);
  if (!hasOptionalStringList(targetItemIds)) {
    issues.push(`${prefix}.to: expected itemId or itemIds for convertItems`);
  }
}

function isConvertUltimateEffectType(effectType) {
  return ["convertItems", "convert", "conversion", "преобразование"].includes(effectType);
}

function isDamagePlayerByBoardItemsUltimateEffectType(effectType) {
  return ["damagePlayerByBoardItems", "damagePlayerByItems", "damageByBoardItems", "damagePlayer", "урон"].includes(effectType);
}

function isHealingEnemyByBoardItemsUltimateEffectType(effectType) {
  return [
    "HealingEnemyByBoardItems",
    "healingEnemyByBoardItems",
    "healEnemyByBoardItems",
    "enemyHealByBoardItems",
    "лечение",
  ].includes(effectType);
}

function isRestoreEnemyShieldByBoardItemsUltimateEffectType(effectType) {
  return [
    "RestoreEnemyShieldByBoardItems",
    "restoreEnemyShieldByBoardItems",
    "HealingEnemyShieldByBoardItems",
    "healingEnemyShieldByBoardItems",
    "enemyShieldByBoardItems",
    "щит",
  ].includes(effectType);
}

function isKamikazeUltimateEffectType(effectType) {
  return ["kamikaze", "Kamikaze", "enemyKamikaze", "kamikazeEnemy"].includes(effectType);
}

function hasOptionalStringList(value) {
  if (Array.isArray(value)) {
    return value.some((entry) => typeof entry === "string" && entry.trim());
  }
  return typeof value === "string" && value.trim() !== "";
}

function validateCampaign(campaign, issues, requiredTextKeys) {
  if (!campaign || typeof campaign !== "object") {
    issues.push("data/settings/campaign.jsonc: campaign must be an object");
    return;
  }

  requireString(campaign.id, "campaign.id", issues);
  requireString(campaign.nameTextKey, "campaign.nameTextKey", issues);
  collectTextKeys(campaign, requiredTextKeys);

  if (!Array.isArray(campaign.maps) || campaign.maps.length === 0) {
    issues.push("campaign.maps: must contain at least one map");
    return;
  }

  if (!campaign.maps.some((entry) => entry.mapId === campaign.startMapId)) {
    issues.push(`campaign.startMapId: unknown map "${campaign.startMapId}"`);
  }

  const mapIds = new Set(campaign.maps.map((entry) => entry.mapId));
  campaign.maps.forEach((entry, index) => {
    const prefix = `campaign.maps[${index}]`;
    requireString(entry.mapId, `${prefix}.mapId`, issues);
    requireString(entry.config, `${prefix}.config`, issues);
    if (!entry.onComplete || typeof entry.onComplete !== "object") {
      issues.push(`${prefix}.onComplete: must be an object`);
      return;
    }
    if (entry.onComplete.type === "nextMap") {
      requireString(entry.onComplete.nextMapId, `${prefix}.onComplete.nextMapId`, issues);
      if (!mapIds.has(entry.onComplete.nextMapId)) {
        issues.push(`${prefix}.onComplete.nextMapId: unknown map "${entry.onComplete.nextMapId}"`);
      }
    } else if (entry.onComplete.type === "victory") {
      requireString(entry.onComplete.titleTextKey, `${prefix}.onComplete.titleTextKey`, issues);
      requireString(entry.onComplete.messageTextKey, `${prefix}.onComplete.messageTextKey`, issues);
    } else {
      issues.push(`${prefix}.onComplete.type: expected "nextMap" or "victory"`);
    }
  });
}

function validateExperienceTable(experienceTable, issues, requiredTextKeys, requiredItemIds) {
  if (!experienceTable || typeof experienceTable !== "object") {
    issues.push("data/player/experience-table.jsonc: must be an object");
    return;
  }

  if (!Array.isArray(experienceTable.levels) || experienceTable.levels.length === 0) {
    issues.push("data/player/experience-table.jsonc.levels: must contain at least one level");
    return;
  }

  let previousRequiredExperience = -1;
  experienceTable.levels.forEach((level, index) => {
    const prefix = `data/player/experience-table.jsonc.levels[${index}]`;
    requireIntegerInRange(level.level, `${prefix}.level`, 0, Infinity, issues);
    requireNumberInRange(level.requiredExperience, `${prefix}.requiredExperience`, 0, Infinity, issues);
    requireIntegerInRange(level.rewardCount, `${prefix}.rewardCount`, 0, Infinity, issues);
    if (requireString(level.textKey, `${prefix}.textKey`, issues)) {
      requiredTextKeys.add(level.textKey);
    }
    validateEventImageField(level.eventImage, `${prefix}.eventImage`, issues);
    if (typeof level.requiredExperience === "number") {
      if (level.requiredExperience <= previousRequiredExperience) {
        issues.push(`${prefix}.requiredExperience: must be greater than previous level`);
      }
      previousRequiredExperience = level.requiredExperience;
    }

    if (!Array.isArray(level.rewards)) {
      issues.push(`${prefix}.rewards: must be an array`);
      return;
    }
    level.rewards.forEach((reward, rewardIndex) => {
      const rewardPrefix = `${prefix}.rewards[${rewardIndex}]`;
      if (requireString(reward.itemId, `${rewardPrefix}.itemId`, issues)) {
        requiredItemIds.add(reward.itemId);
      }
      requirePositiveNumber(reward.weight, `${rewardPrefix}.weight`, issues);
      requirePositiveInteger(reward.amount, `${rewardPrefix}.amount`, issues);
    });
  });
}

function validateMapConfig(config, source, issues, requiredTextKeys, requiredItemIds) {
  if (!config || typeof config !== "object") {
    issues.push(`${source}: map config must be an object`);
    return;
  }

  requireString(config.id, `${source}.id`, issues);
  requireString(config.nameTextKey, `${source}.nameTextKey`, issues);
  requireString(config.mapImage, `${source}.mapImage`, issues);
  collectTextKeys(config, requiredTextKeys);
  collectItemIds(config, requiredItemIds);

  validateMapPathRules(config.pathRules, source, issues);
  const eventCatalog = validateMapEventCatalog(config.events, source, issues);
  validateMapLevels(config, source, issues, eventCatalog);
  validateBoss(config.boss, source, issues);
  validateEventVariants(config, source, issues, requiredItemIds, eventCatalog);
  validateEventCoverage(config, source, issues, eventCatalog);
}

function validateOptionalStringList(value, path, issues, requiredValues = null) {
  if (value === undefined) {
    return;
  }

  const values = Array.isArray(value) ? value : [value];
  values.forEach((entry, index) => {
    if (requireString(entry, `${path}[${index}]`, issues) && requiredValues) {
      requiredValues.add(entry);
    }
  });
}

function validateMapEventCatalog(events, source, issues) {
  const eventCatalog = new Map();

  if (!Array.isArray(events) || events.length === 0) {
    issues.push(`${source}.events: must contain at least one event`);
    return eventCatalog;
  }

  events.forEach((eventConfig, index) => {
    const prefix = `${source}.events[${index}]`;
    if (!eventConfig || typeof eventConfig !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }
    if (requireString(eventConfig.name, `${prefix}.name`, issues)) {
      if (eventCatalog.has(eventConfig.name)) {
        issues.push(`${prefix}.name: duplicate event "${eventConfig.name}"`);
      } else {
        eventCatalog.set(eventConfig.name, eventConfig);
      }
    }
    if (!MAP_EVENT_TYPES.includes(eventConfig.type)) {
      issues.push(`${prefix}.type: expected one of ${MAP_EVENT_TYPES.join(", ")}`);
    }
    if (requireString(eventConfig.icon, `${prefix}.icon`, issues)) {
      validateCatalogAssetPath(eventConfig.icon, "data/Assets/icons/", `${prefix}.icon`, issues);
    }
  });

  return eventCatalog;
}

function validateMapLevels(config, source, issues, eventCatalog) {
  if (!Array.isArray(config.levels) || config.levels.length === 0) {
    issues.push(`${source}.levels: must contain at least one level`);
    return;
  }

  const levelNumbers = new Set();
  config.levels.forEach((level, index) => {
    const prefix = `${source}.levels[${index}]`;
    if (!level || typeof level !== "object") {
      issues.push(`${prefix}: level must be an object`);
      return;
    }

    if (requirePositiveInteger(level.level, `${prefix}.level`, issues)) {
      if (levelNumbers.has(level.level)) {
        issues.push(`${prefix}.level: duplicate level "${level.level}"`);
      }
      if (level.level !== index + 1) {
        issues.push(`${prefix}.level: expected ${index + 1} to keep map layout sequential`);
      }
      levelNumbers.add(level.level);
    }

    const nodeRange = validateLevelNodes(level.nodes, prefix, issues);
    validatePaths(level.paths, prefix, issues, config.pathRules);
    const eventSummary = validateLevelEvents(level.events, prefix, issues, eventCatalog);
    if (nodeRange && eventSummary.guaranteedCount > nodeRange.min) {
      issues.push(`${prefix}.events: guaranteed events cannot exceed min node count`);
    }
    if (nodeRange && eventSummary.guaranteedCount < nodeRange.max && eventSummary.randomWeightCount === 0) {
      issues.push(`${prefix}.events: random events need at least one positive weight when nodes can exceed guaranteed events`);
    }
  });
}

function validateLevelNodes(nodes, prefix, issues) {
  if (!nodes || typeof nodes !== "object") {
    issues.push(`${prefix}.nodes: must be an object`);
    return null;
  }

  if (nodes.count !== undefined) {
    requirePositiveInteger(nodes.count, `${prefix}.nodes.count`, issues);
    return Number.isInteger(nodes.count) ? { min: nodes.count, max: nodes.count } : null;
  }

  requirePositiveInteger(nodes.min, `${prefix}.nodes.min`, issues);
  requirePositiveInteger(nodes.max, `${prefix}.nodes.max`, issues);
  if (Number.isInteger(nodes.min) && Number.isInteger(nodes.max) && nodes.min > nodes.max) {
    issues.push(`${prefix}.nodes: min cannot be greater than max`);
  }
  return Number.isInteger(nodes.min) && Number.isInteger(nodes.max)
    ? { min: nodes.min, max: nodes.max }
    : null;
}

function validatePaths(paths, source, issues, defaultPathRules = null) {
  if (!paths || typeof paths !== "object") {
    issues.push(`${source}.paths: must be an object`);
    return;
  }

  requirePositiveInteger(paths.minConnectionsFromNode, `${source}.paths.minConnectionsFromNode`, issues);
  requirePositiveInteger(paths.maxConnectionsFromNode, `${source}.paths.maxConnectionsFromNode`, issues);
  requireNumberInRange(paths.extraConnectionChance, `${source}.paths.extraConnectionChance`, 0, 100, issues);
  if (paths.maxSinglePathChain !== undefined) {
    requirePositiveInteger(paths.maxSinglePathChain, `${source}.paths.maxSinglePathChain`, issues);
  }
  if (
    Number.isInteger(paths.minConnectionsFromNode) &&
    Number.isInteger(paths.maxConnectionsFromNode) &&
    paths.minConnectionsFromNode > paths.maxConnectionsFromNode
  ) {
    issues.push(`${source}.paths: minConnectionsFromNode cannot be greater than maxConnectionsFromNode`);
  }
  validateConnectionCountWeights(paths.connectionCountWeights, `${source}.paths.connectionCountWeights`, issues);
  validateEffectiveConnectionCountWeights(paths, defaultPathRules, `${source}.paths`, issues);
}

function validateMapPathRules(pathRules, source, issues) {
  if (pathRules === undefined) {
    return;
  }
  if (!pathRules || typeof pathRules !== "object" || Array.isArray(pathRules)) {
    issues.push(`${source}.pathRules: must be an object when present`);
    return;
  }
  validateConnectionCountWeights(
    pathRules.connectionCountWeights,
    `${source}.pathRules.connectionCountWeights`,
    issues,
  );
  if (pathRules.maxSinglePathChain !== undefined) {
    requirePositiveInteger(pathRules.maxSinglePathChain, `${source}.pathRules.maxSinglePathChain`, issues);
  }
}

function validateConnectionCountWeights(weights, path, issues) {
  if (weights === undefined) {
    return;
  }
  if (!Array.isArray(weights) || weights.length === 0) {
    issues.push(`${path}: must be a non-empty array when present`);
    return;
  }
  weights.forEach((entry, index) => {
    const prefix = `${path}[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(`${prefix}: must be an object`);
      return;
    }
    requireIntegerInRange(entry.count, `${prefix}.count`, 1, 30, issues);
    requirePositiveNumber(entry.weight, `${prefix}.weight`, issues);
  });
}

function validateEffectiveConnectionCountWeights(paths, defaultPathRules, path, issues) {
  const weights = paths.connectionCountWeights || defaultPathRules?.connectionCountWeights;
  if (!Array.isArray(weights)) {
    return;
  }
  if (!Number.isInteger(paths.minConnectionsFromNode) || !Number.isInteger(paths.maxConnectionsFromNode)) {
    return;
  }
  weights.forEach((entry, index) => {
    if (!Number.isInteger(entry?.count)) {
      return;
    }
    if (entry.count < paths.minConnectionsFromNode || entry.count > paths.maxConnectionsFromNode) {
      issues.push(
        `${path}.connectionCountWeights[${index}].count: expected from ${paths.minConnectionsFromNode} to ${paths.maxConnectionsFromNode} for this level`,
      );
    }
  });
}

function validateBoss(boss, source, issues) {
  if (boss === undefined || boss === null) {
    return;
  }
  if (Array.isArray(boss)) {
    if (boss.length === 0) {
      return;
    }
    issues.push(`${source}.boss: legacy boss config must be an object when present`);
    return;
  }
  if (typeof boss !== "object") {
    issues.push(`${source}.boss: must be an object`);
    return;
  }
  requireString(boss.enemyId, `${source}.boss.enemyId`, issues);
  validateBattleBackgroundField(boss.background, `${source}.boss.background`, issues);
  requireString(boss.nodeTitleTextKey, `${source}.boss.nodeTitleTextKey`, issues);
}

function validateLevelEvents(events, source, issues, eventCatalog) {
  const summary = {
    guaranteedCount: 0,
    randomWeightCount: 0,
  };

  if (!Array.isArray(events)) {
    issues.push(`${source}.events: must be an array`);
    return summary;
  }

  if (events.length === 0) {
    issues.push(`${source}.events: must contain at least one event`);
    return summary;
  }

  events.forEach((eventConfig, index) => {
    const prefix = `${source}.events[${index}]`;
    if (!eventConfig || typeof eventConfig !== "object") {
      issues.push(`${prefix}: must be an object`);
      return;
    }
    if (requireString(eventConfig.name, `${prefix}.name`, issues) && !eventCatalog.has(eventConfig.name)) {
      issues.push(`${prefix}.name: unknown event "${eventConfig.name}"`);
    }
    requireNumberInRange(eventConfig.weight, `${prefix}.weight`, 0, Infinity, issues);
    if (eventConfig.guaranteed !== undefined && typeof eventConfig.guaranteed !== "boolean") {
      issues.push(`${prefix}.guaranteed: expected boolean`);
    }

    if (eventConfig.guaranteed) {
      summary.guaranteedCount += 1;
    } else if (eventConfig.weight > 0) {
      summary.randomWeightCount += 1;
    }
  });

  if (summary.guaranteedCount === 0 && summary.randomWeightCount === 0) {
    issues.push(`${source}.events: at least one random event must have positive weight or one event must be guaranteed`);
  }
  return summary;
}

function validateEventVariants(config, source, issues, requiredItemIds, eventCatalog) {
  for (const eventType of MAP_EVENT_TYPES) {
    if (!Array.isArray(config[eventType])) {
      issues.push(`${source}.${eventType}: must be an array`);
      continue;
    }

    config[eventType].forEach((variant, index) => {
      const prefix = `${source}.${eventType}[${index}]`;
      if (requireString(variant.eventName, `${prefix}.eventName`, issues)) {
        const catalogEvent = eventCatalog.get(variant.eventName);
        if (!catalogEvent) {
          issues.push(`${prefix}.eventName: unknown event "${variant.eventName}"`);
        } else if (catalogEvent.type !== eventType) {
          issues.push(`${prefix}.eventName: event "${variant.eventName}" has type "${catalogEvent.type}", expected "${eventType}"`);
        }
      }
      requirePositiveInteger(variant.minLevel, `${prefix}.minLevel`, issues);
      requirePositiveInteger(variant.maxLevel, `${prefix}.maxLevel`, issues);
      requirePositiveNumber(variant.weight, `${prefix}.weight`, issues);
      if (
        Number.isInteger(variant.minLevel) &&
        Number.isInteger(variant.maxLevel) &&
        variant.minLevel > variant.maxLevel
      ) {
        issues.push(`${prefix}: minLevel cannot be greater than maxLevel`);
      }

      if (eventType === "skip") {
        requireString(variant.textKey, `${prefix}.textKey`, issues);
      } else if (eventType === "shop") {
        requireString(variant.dialogTextKey, `${prefix}.dialogTextKey`, issues);
        validateEventImageField(variant.eventImage, `${prefix}.eventImage`, issues);
        if (!Array.isArray(variant.items) || variant.items.length === 0) {
          issues.push(`${prefix}.items: must contain at least one item`);
        } else {
          variant.items.forEach((item, itemIndex) => {
            requireString(item.itemId, `${prefix}.items[${itemIndex}].itemId`, issues);
            requirePositiveInteger(item.amount ?? 1, `${prefix}.items[${itemIndex}].amount`, issues);
            requireNumberInRange(item.goldPrice, `${prefix}.items[${itemIndex}].goldPrice`, 0, Infinity, issues);
          });
        }
      } else if (eventType === "heal") {
        requireString(variant.dialogTextKey, `${prefix}.dialogTextKey`, issues);
        validateEventImageField(variant.eventImage, `${prefix}.eventImage`, issues);
        requireNumberInRange(variant.healPercent, `${prefix}.healPercent`, 0, 100, issues);
        requireNumberInRange(variant.goldPrice, `${prefix}.goldPrice`, 0, Infinity, issues);
      } else if (eventType === "battle") {
        requireString(variant.enemyId, `${prefix}.enemyId`, issues);
        if (variant.background !== undefined) {
          validateBattleBackgroundField(variant.background, `${prefix}.background`, issues);
        }
      } else if (eventType === "reward") {
        validateRewardConfig(variant, prefix, issues, requiredItemIds);
      } else if (eventType === "dialog") {
        validateDialogConfig(variant, prefix, issues, eventCatalog);
      }
    });
  }
}

function validateDialogConfig(dialogConfig, path, issues, eventCatalog) {
  if (requireString(dialogConfig.characterImage, `${path}.characterImage`, issues)) {
    validateCatalogAssetPath(dialogConfig.characterImage, "data/Assets/enemy/", `${path}.characterImage`, issues);
  }
  if (dialogConfig.characterNameTextKey !== undefined) {
    requireString(dialogConfig.characterNameTextKey, `${path}.characterNameTextKey`, issues);
  }
  if (dialogConfig.characterWidthPct !== undefined) {
    requireNumberInRange(dialogConfig.characterWidthPct, `${path}.characterWidthPct`, 1, 300, issues);
  } else {
    requireNumberInRange(dialogConfig.characterWidthPx, `${path}.characterWidthPx`, 1, Infinity, issues);
  }
  requireNumberInRange(dialogConfig.characterCenterXPct, `${path}.characterCenterXPct`, 0, 100, issues);
  if (dialogConfig.characterCenterYPct !== undefined) {
    requireNumberInRange(dialogConfig.characterCenterYPct, `${path}.characterCenterYPct`, 0, 100, issues);
  } else {
    requireNumberInRange(dialogConfig.characterBottomPx, `${path}.characterBottomPx`, 0, Infinity, issues);
  }
  if (dialogConfig.initialStepId !== undefined) {
    requireString(dialogConfig.initialStepId, `${path}.initialStepId`, issues);
  }
  if (!Array.isArray(dialogConfig.steps) || dialogConfig.steps.length === 0) {
    issues.push(`${path}.steps: must contain at least one dialog step`);
    return;
  }

  const stepIds = new Set();
  dialogConfig.steps.forEach((step, stepIndex) => {
    const stepPath = `${path}.steps[${stepIndex}]`;
    if (!step || typeof step !== "object") {
      issues.push(`${stepPath}: must be an object`);
      return;
    }
    if (requireString(step.stepId, `${stepPath}.stepId`, issues)) {
      if (stepIds.has(step.stepId)) {
        issues.push(`${stepPath}.stepId: duplicate step "${step.stepId}"`);
      }
      stepIds.add(step.stepId);
    }
    requireString(step.textKey, `${stepPath}.textKey`, issues);
    if (!Array.isArray(step.answers) || step.answers.length === 0) {
      issues.push(`${stepPath}.answers: must contain at least one answer`);
      return;
    }
    step.answers.forEach((answer, answerIndex) => {
      const answerPath = `${stepPath}.answers[${answerIndex}]`;
      if (!answer || typeof answer !== "object") {
        issues.push(`${answerPath}: must be an object`);
        return;
      }
      requireString(answer.textKey, `${answerPath}.textKey`, issues);
      const actionCount = [answer.nextStepId, answer.eventName, answer.end === true].filter(Boolean).length;
      if (actionCount !== 1) {
        issues.push(`${answerPath}: expected exactly one of nextStepId, eventName or end=true`);
      }
      if (answer.nextStepId !== undefined) {
        requireString(answer.nextStepId, `${answerPath}.nextStepId`, issues);
      }
      if (answer.eventName !== undefined && requireString(answer.eventName, `${answerPath}.eventName`, issues) && !eventCatalog.has(answer.eventName)) {
        issues.push(`${answerPath}.eventName: unknown event "${answer.eventName}"`);
      }
    });
  });

  if (dialogConfig.initialStepId && !stepIds.has(dialogConfig.initialStepId)) {
    issues.push(`${path}.initialStepId: unknown step "${dialogConfig.initialStepId}"`);
  }
  dialogConfig.steps.forEach((step, stepIndex) => {
    step?.answers?.forEach((answer, answerIndex) => {
      if (answer.nextStepId && !stepIds.has(answer.nextStepId)) {
        issues.push(`${path}.steps[${stepIndex}].answers[${answerIndex}].nextStepId: unknown step "${answer.nextStepId}"`);
      }
    });
  });
}

function validateRewardConfig(rewardConfig, path, issues, requiredItemIds, requiredTextKeys = null) {
  if (!rewardConfig || typeof rewardConfig !== "object") {
    issues.push(`${path}: reward config must be an object`);
    return;
  }

  if (requireString(rewardConfig.dialogTextKey, `${path}.dialogTextKey`, issues)) {
    requiredTextKeys?.add(rewardConfig.dialogTextKey);
  }
  validateEventImageField(rewardConfig.eventImage, `${path}.eventImage`, issues);
  requirePositiveInteger(rewardConfig.itemCount, `${path}.itemCount`, issues);
  if (!Array.isArray(rewardConfig.rewards) || rewardConfig.rewards.length === 0) {
    issues.push(`${path}.rewards: must contain at least one reward`);
    return;
  }

  rewardConfig.rewards.forEach((reward, rewardIndex) => {
    const rewardPrefix = `${path}.rewards[${rewardIndex}]`;
    if (reward.type === "gold" || reward.type === "experience" || reward.type === "health") {
      requirePositiveInteger(reward.amount, `${rewardPrefix}.amount`, issues);
    } else if (reward.type === "item") {
      if (requireString(reward.itemId, `${rewardPrefix}.itemId`, issues)) {
        requiredItemIds.add(reward.itemId);
      }
      if (reward.amount !== undefined) {
        requirePositiveInteger(reward.amount, `${rewardPrefix}.amount`, issues);
      }
    } else {
      issues.push(`${rewardPrefix}.type: expected "gold", "experience", "health" or "item"`);
    }
  });
}

function validateEventImageField(value, path, issues) {
  if (!requireString(value, path, issues)) {
    return;
  }
  validateCatalogAssetPath(value, "data/Assets/events/", path, issues);
}

function validateBattleBackgroundField(value, path, issues) {
  if (!requireString(value, path, issues)) {
    return;
  }
  validateCatalogAssetPath(value, "data/Assets/backgrounds/", path, issues);
}

function validateEventCoverage(config, source, issues, eventCatalog) {
  if (!Array.isArray(config.levels)) {
    return;
  }

  for (const [index, level] of config.levels.entries()) {
    const levelNumber = level?.level;
    if (!Number.isInteger(levelNumber) || !Array.isArray(level.events)) {
      continue;
    }
    for (const eventConfig of level.events) {
      const catalogEvent = eventCatalog.get(eventConfig?.name);
      const eventType = catalogEvent?.type;
      const isActive = eventConfig?.guaranteed === true || (eventConfig?.weight || 0) > 0;
      if (!MAP_EVENT_TYPES.includes(eventType) || !isActive) {
        continue;
      }
      const variants = Array.isArray(config[eventType]) ? config[eventType] : [];
      const hasVariant = variants.some(
        (variant) =>
          variant.eventName === eventConfig.name &&
          levelNumber >= variant.minLevel &&
          levelNumber <= variant.maxLevel,
      );
      if (!hasVariant) {
        issues.push(`${source}.levels[${index}].events[${eventConfig.name}]: no ${eventType} variant for level ${levelNumber}`);
      }
    }
  }
}

function validatePlayerState(playerState, issues, requiredItemIds) {
  if (!playerState || typeof playerState !== "object") {
    issues.push("player state: must be an object");
    return;
  }
  requireNumberInRange(playerState.health?.current, "player.health.current", 0, Infinity, issues);
  requirePositiveNumber(playerState.health?.max, "player.health.max", issues);
  if (
    typeof playerState.health?.current === "number" &&
    typeof playerState.health?.max === "number" &&
    playerState.health.current > playerState.health.max
  ) {
    issues.push("player.health.current: cannot be greater than player.health.max");
  }
  requirePositiveInteger(playerState.experience?.level, "player.experience.level", issues);
  requireNumberInRange(playerState.experience?.total, "player.experience.total", 0, Infinity, issues);
  requirePositiveNumber(playerState.heal?.health, "player.heal.health", issues);
  requireNumberInRange(playerState.heal?.current, "player.heal.current", 0, Infinity, issues);
  requirePositiveNumber(playerState.heal?.max, "player.heal.max", issues);
  if (
    typeof playerState.heal?.current === "number" &&
    typeof playerState.heal?.max === "number" &&
    playerState.heal.current > playerState.heal.max
  ) {
    issues.push("player.heal.current: cannot be greater than player.heal.max");
  }
  if (!Array.isArray(playerState.inventory)) {
    issues.push("player.inventory: must be an array");
  } else {
    for (const item of playerState.inventory) {
      if (requireString(item.itemId, "player.inventory[].itemId", issues)) {
        requiredItemIds.add(item.itemId);
      }
      requireNumberInRange(item.quantity, `player.inventory[${item.itemId}].quantity`, 0, Infinity, issues);
    }
  }
}

async function validateLocales(requiredTextKeys, issues, languages = ["en"]) {
  const activeLanguages = Array.isArray(languages) && languages.length > 0 ? languages : ["en"];
  const requiredKeys = new Set(requiredTextKeys);

  for (const language of activeLanguages) {
    requiredKeys.add(`language.${language}`);
  }

  for (const language of activeLanguages) {
    try {
      const locale = await loadJson(getLocaleUrl(language));
      for (const key of requiredKeys) {
        if (!Object.hasOwn(locale, key)) {
          issues.push(`data/locales/${language}.json: missing "${key}"`);
        }
      }
    } catch (error) {
      issues.push(formatLoadIssue(`data/locales/${language}.json`, error));
    }
  }
}

function collectTextKeys(value, requiredTextKeys) {
  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === "string" &&
      (key === "textKey" ||
        key.endsWith("TextKey") ||
        key === "titleTextKey" ||
        key === "messageTextKey")
    ) {
      requiredTextKeys.add(child);
    }
    collectTextKeys(child, requiredTextKeys);
  }
}

function collectItemIds(value, requiredItemIds) {
  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "itemId" && typeof child === "string") {
      requiredItemIds.add(child);
    }
    collectItemIds(child, requiredItemIds);
  }
}

function requireString(value, path, issues) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${path}: expected non-empty string`);
    return false;
  }
  return true;
}

function requirePositiveInteger(value, path, issues) {
  if (!Number.isInteger(value) || value <= 0) {
    issues.push(`${path}: expected positive integer`);
    return false;
  }
  return true;
}

function requirePositiveNumber(value, path, issues) {
  if (typeof value !== "number" || value <= 0) {
    issues.push(`${path}: expected number > 0`);
    return false;
  }
  return true;
}

function requireNumberInRange(value, path, min, max, issues) {
  if (typeof value !== "number" || value < min || value > max) {
    const maxText = max === Infinity ? "Infinity" : String(max);
    issues.push(`${path}: expected number from ${min} to ${maxText}`);
    return false;
  }
  return true;
}

function requireIntegerInRange(value, path, min, max, issues) {
  if (!Number.isInteger(value) || value < min || value > max) {
    issues.push(`${path}: expected integer from ${min} to ${max}`);
    return false;
  }
  return true;
}

