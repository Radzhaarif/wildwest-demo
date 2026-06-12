import { appendVersionParam } from "../app-version.js";
import { getCachedAssetUrl } from "../asset-preloader.js";

export const CLOCK_ITEM_ID = "item_time";
export const LITTLE_MENU_ITEM_ID = "little_menu";
export const BAG_ITEM_ID = "bag";
export const SKULL_ITEM_ID = "item_skull";
export const SWAP_ITEM_ID = "item_swap";
export const SPECIAL_ITEM_IDS = ["item_skull", "item_swap", "item_time"];
export const GOLD_ITEM_ID = "gold";
export const ACTIVE_BATTLE_ITEM_IDS = [...SPECIAL_ITEM_IDS, GOLD_ITEM_ID];

export const DEFAULT_LIGHT_PROJECTILE_ICON = "data/Assets/icons/light_red.png";
export const DEFAULT_LIGHT_BLUE_PROJECTILE_ICON = "data/Assets/icons/light_blue.png";
export const DEFAULT_LIGHT_GREEN_PROJECTILE_ICON = "data/Assets/icons/light_green.png";
export const DEFAULT_LIGHT_GOLD_PROJECTILE_ICON = "data/Assets/icons/light_gold.png";
export const DEFAULT_LIGHT_PROJECTILE_COUNT = 5;
export const DEFAULT_LIGHT_PROJECTILE_MS = 900;
export const DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX = 70;
export const DEFAULT_LIGHT_PROJECTILE_SPREAD_PX = 28;
export const DEFAULT_LIGHT_PROJECTILE_SIZE_PX = 52;
export const DEFAULT_LIGHT_PROJECTILES_PER_DAMAGE = 0;
export const MIN_DAMAGE_PROJECTILES = 1;
export const MAX_DAMAGE_PROJECTILES = 12;

export const DEFAULT_HAND_ITEM_IDS = [
  "item_Shield",
  "item_Bandage",
  "item_granate",
  "item_bullet",
  "item_Knife",
  "red",
  "item_Shield_power",
  "item_Bandage_power",
  "item_granate_power",
  "item_bullet_power",
  "item_Knife_power",
  "green",
];

export const DEFAULT_TOP_ACTION_BUTTONS = {
  surrender: {
    textKey: "ui.surrender",
    icon: "data/Assets/icons/surrend.png",
    iconSizePx: 38,
  },
  settings: {
    textKey: "menu.settings",
    icon: "data/Assets/icons/setting.png",
    iconSizePx: 38,
  },
  log: {
    textKey: "ui.eventLog",
    icon: "data/Assets/icons/log.png",
    iconSizePx: 38,
  },
};

export const DEFAULT_CLOCK_WARNING_SECONDS = [1, 3, 5, 10, 15, 20, 30];
export const DEFAULT_CLOCK_WARNING_CHANGE_MS = 1000;
export const DEFAULT_CLOCK_WARNING_CHANGE_SCALE = 1.5;

export const DEFAULT_BATTLE_LAYOUT = {
  designWidthPx: 1500,
  designHeightPx: 860,
  viewportPaddingPx: 8,
  allowUpscale: true,
  upscaleFactor: 0.5,
  minScale: 0.1,
};

export const BATTLE_POPUP_MENU_GAP_PX = 14;
export const BATTLE_POPUP_INVENTORY_GAP_PX = 10;
export const BATTLE_POPUP_PADDING_PX = 16;
export const BATTLE_POPUP_RADIUS_PX = 16;
export const BATTLE_POPUP_SHIFT_PX = -18;
export const BATTLE_POPUP_EDGE_GAP_PX = 18;
export const BATTLE_POPUP_INVENTORY_SLOT_PX = 108;
export const BATTLE_POPUP_TOP_BUTTON_SIZE_PX = 64;
export const BATTLE_POPUP_TOP_BUTTON_RADIUS_PX = 14;
export const BATTLE_POPUP_INVENTORY_QUANTITY_FONT_PX = 24;
export const BATTLE_POPUP_INVENTORY_QUANTITY_OFFSET_X_PX = 5;
export const BATTLE_POPUP_INVENTORY_QUANTITY_OFFSET_Y_PX = 3;
export const BATTLE_POPUP_INVENTORY_QUANTITY_MIN_WIDTH_PX = 20;
export const BATTLE_POPUP_INVENTORY_COLUMNS = 6;
export const BATTLE_POPUP_INVENTORY_VERTICAL_OFFSET_RATIO = 0.5;

export function getBattleTopButtonConfig(context, actionId) {
  const topButtons = getBattleUiConfig(context).topButtons || {};
  const fallback = DEFAULT_TOP_ACTION_BUTTONS[actionId] || {};
  const source = topButtons[actionId] || {};
  const sourceIconSize = Number(source.iconSizePx);
  const fallbackIconSize = Number(fallback.iconSizePx || 38);
  return {
    textKey: source.textKey || fallback.textKey || actionId,
    icon: source.icon || fallback.icon || "",
    iconSizePx:
      Number.isFinite(sourceIconSize) && sourceIconSize > 0
        ? sourceIconSize
        : fallbackIconSize,
  };
}

export function getBattleSoundConfig(context) {
  return {
    soundVolume: context?.request?.settings?.soundVolume,
    ...(getBattleUiConfig(context).sound || {}),
  };
}

export function getBattleSoundVolume(context) {
  const soundConfig = getBattleSoundConfig(context);
  const rawVolume = Number(soundConfig.soundVolume ?? soundConfig.volume);
  if (!Number.isFinite(rawVolume)) {
    return 1;
  }
  return Math.min(1, Math.max(0, rawVolume));
}

export function getBattleTooltipDurationMs(context) {
  const settingsValue = Number(context?.request?.settings?.battleTooltipMs);
  if (Number.isFinite(settingsValue) && settingsValue >= 0) {
    return settingsValue;
  }

  const configuredValue = Number(getBattleUiConfig(context).feedback?.battleTooltipMs);
  if (Number.isFinite(configuredValue) && configuredValue >= 0) {
    return configuredValue;
  }
  return 3000;
}

export function getBattleTooltipDelayMs(context) {
  const settingsValue = Number(context?.request?.settings?.battleTooltipDelayMs);
  if (Number.isFinite(settingsValue) && settingsValue >= 0) {
    return settingsValue;
  }

  const configuredValue = Number(getBattleUiConfig(context).feedback?.battleTooltipDelayMs);
  if (Number.isFinite(configuredValue) && configuredValue >= 0) {
    return configuredValue;
  }
  return 3000;
}

export function getBattleEnemyShieldMax(context) {
  const configuredValue = Number(getBattleUiConfig(context).limits?.enemyShieldMax);
  if (!Number.isFinite(configuredValue)) {
    return 99;
  }
  return Math.max(0, Math.min(99, Math.floor(configuredValue)));
}

export function getBattleUiConfig(context) {
  const config = context?.battleData?.uiConfig || {};
  return {
    textKeys: {
      enemyStage: "battle.enemy.stage",
      enemyHealth: "battle.enemy.health",
      enemyAggression: "battle.enemy.aggression",
      enemyDamage: "battle.enemy.damage",
      enemyRage: "battle.enemy.rage",
      playerHealth: "battle.player.health",
      playerHeal: "battle.player.heal",
      clockUnavailable: "battle.clock.unavailable",
      clockUsed: "battle.clock.used",
      rageEvent: "battle.rage.event",
      shuffleBoard: "battle.shuffle.button",
      noMovesTitle: "battle.noMoves.title",
      noMovesBody: "battle.noMoves.body",
      victoryTitle: "battle.outcome.victory",
      defeatTitle: "battle.outcome.defeat",
      restartBattle: "battle.outcome.restart",
      restartBattlePending: "battle.outcome.restartPending",
      selectFirstCell: "battle.status.selectFirstCell",
      cellSelected: "battle.status.cellSelected",
      selectionCleared: "battle.status.selectionCleared",
      newCellSelected: "battle.status.newCellSelected",
      wallBlocked: "battle.status.wallBlocked",
      boxBlocked: "battle.status.boxBlocked",
      vinesBlocked: "battle.status.vinesBlocked",
      noMatchSwapCancelled: "battle.status.noMatchSwapCancelled",
      freeSwapDone: "battle.status.freeSwapDone",
      moveProcessed: "battle.status.moveProcessed",
      moveCells: "battle.status.moveCells",
      moveCascades: "battle.status.moveCascades",
      moveDamage: "battle.status.moveDamage",
      moveBonuses: "battle.status.moveBonuses",
      moveHealthRecovered: "battle.status.moveHealthRecovered",
      movePlayerDamage: "battle.status.movePlayerDamage",
      enemyDefeated: "battle.status.enemyDefeated",
      cascadeLimitReached: "battle.status.cascadeLimitReached",
      shuffleBoardDone: "battle.status.shuffleBoardDone",
      ...(config.textKeys || {}),
    },
    topButtons: {
      surrender: { ...DEFAULT_TOP_ACTION_BUTTONS.surrender },
      settings: { ...DEFAULT_TOP_ACTION_BUTTONS.settings },
      log: { ...DEFAULT_TOP_ACTION_BUTTONS.log },
      ...(config.topButtons || {}),
    },
    shuffleButton: {
      textKey: "battle.shuffle.button",
      icon: "data/Assets/icons/mix.png",
      iconSizePx: 64,
      ...(config.shuffleButton || {}),
    },
    layout: {
      ...DEFAULT_BATTLE_LAYOUT,
      ...(config.layout || {}),
    },
    handItemIds: Array.isArray(config.handItemIds) ? config.handItemIds : DEFAULT_HAND_ITEM_IDS,
    icons: {
      playerHealth: "data/Assets/icons/hearts.png",
      playerHeal: "data/Assets/item/bandage.png",
      enemyHealth: "data/Assets/icons/hearts.png",
      enemyShield: "data/Assets/item/Shield.png",
      enemyAggression: "data/Assets/icons/agressive.png",
      enemyDamage: "data/Assets/icons/damage.png",
      lightRed: "data/Assets/icons/light_red.png",
      lightBlue: "data/Assets/icons/light_blue.png",
      lightGreen: "data/Assets/icons/light_green.png",
      lightGold: "data/Assets/icons/light_gold.png",
      enemyRage: "data/Assets/icons/rage.png",
      wall: "data/Assets/icons/wall.png",
      wall_1: "data/Assets/icons/wall.png",
      wall_2: "data/Assets/icons/wall.png",
      box: "data/Assets/icons/box.png",
      vines: "data/Assets/icons/vines.png",
      ...(config.icons || {}),
    },
    bars: {
      playerHealthColor: "#c8322a",
      playerHealColor: "#72a343",
      enemyHealthColor: "#c8322a",
      enemyAggressionColor: "#b9d4ec",
      ...(config.bars || {}),
    },
    backgrounds: {
      battleWindow: "data/Assets/backgrounds/battle.png",
      ...(config.backgrounds || {}),
    },
    limits: {
      enemyShieldMax: 99,
      ...(config.limits || {}),
    },
    board: {
      width: 12,
      height: 9,
      ...(config.board || {}),
    },
    feedback: {
      floatMessageMs: 3000,
      battleTooltipMs: 3000,
      battleTooltipDelayMs: 3000,
      ...(config.feedback || {}),
    },
    availableMoveSearch: {
      typeGroups: [
        ["granate", "Knife", "bullet"],
        ["Bandage", "Shield"],
        ["*"],
      ],
      ...(config.availableMoveSearch || {}),
    },
    animations: {
      swapMs: 1000,
      invalidShakeMs: 500,
      matchShakeMs: 500,
      boardMoveMs: 500,
      boardMoveStepMs: 250,
      idleHintDelayMs: 5000,
      idleHintShakeMs: 500,
      boardDropMs: 250,
      itemDropGapMs: 125,
      cascadeStepMs: 150,
      newItemSpawnOffsetPx: 16,
      newItemStackGapPx: 10,
      wallToggleMs: 500,
      lightDamageProjectileCount: DEFAULT_LIGHT_PROJECTILE_COUNT,
      lightDamageProjectilesPerDamage: DEFAULT_LIGHT_PROJECTILES_PER_DAMAGE,
      lightDamageProjectileMs: DEFAULT_LIGHT_PROJECTILE_MS,
      lightDamageProjectileArcHeightPx: DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX,
      lightDamageProjectileSpreadPx: DEFAULT_LIGHT_PROJECTILE_SPREAD_PX,
      lightDamageProjectileSizePx: DEFAULT_LIGHT_PROJECTILE_SIZE_PX,
      kamikazeBurstDistancePx: 190,
      rageWaveMs: 900,
      rageProjectileCount: 3,
      rageProjectileMs: 800,
      rageProjectileArcHeightPx: DEFAULT_LIGHT_PROJECTILE_ARC_HEIGHT_PX,
      rageProjectileSpreadPx: DEFAULT_LIGHT_PROJECTILE_SPREAD_PX,
      rageProjectileSizePx: 35,
      noMovesMessageMs: 3000,
      noMovesShuffleMs: 2000,
      outcomeBannerMs: 2000,
      healthChangeMs: 3000,
      healthChangeScale: 1.5,
      healthChangeFloatMs: 3000,
      healthChangeFloatRisePx: 120,
      healChangeMs: 3000,
      healChangeScale: 1.5,
      healChangeFloatMs: 3000,
      healChangeFloatRisePx: 120,
      aggressionChangeMs: 3000,
      aggressionChangeScale: 1.5,
      aggressionChangeFloatMs: 3000,
      aggressionChangeFloatRisePx: 120,
      clockWarningSeconds: [...DEFAULT_CLOCK_WARNING_SECONDS],
      clockWarningChangeMs: DEFAULT_CLOCK_WARNING_CHANGE_MS,
      clockWarningChangeScale: DEFAULT_CLOCK_WARNING_CHANGE_SCALE,
      deathFlightPx: 96,
      ...(config.animations || {}),
    },
    sound: {
      ...(config.sound || {}),
    },
  };
}

export function getClockWarningSeconds(context) {
  const parsed = normalizeClockWarningSeconds(getClockWarningConfig(context).seconds);
  return parsed.length > 0 ? parsed : [...DEFAULT_CLOCK_WARNING_SECONDS];
}

export function getClockWarningChangeMs(context) {
  return parseBattlePositiveNumber(
    getClockWarningConfig(context).changeMs,
    DEFAULT_CLOCK_WARNING_CHANGE_MS,
  );
}

export function getClockWarningChangeScale(context) {
  const scale = parseBattlePositiveNumber(
    getClockWarningConfig(context).changeScale,
    DEFAULT_CLOCK_WARNING_CHANGE_SCALE,
  );
  return scale < 1 ? DEFAULT_CLOCK_WARNING_CHANGE_SCALE : scale;
}

export function getClockWarningConfig(context) {
  const uiConfig = getBattleUiConfig(context);
  const animations = uiConfig?.animations || {};

  const explicitConfig = pickClockWarningConfig(animations.clockWarning)
    || pickClockWarningConfig(uiConfig?.clockWarning);
  if (explicitConfig) {
    return {
      seconds: explicitConfig.seconds,
      changeMs: explicitConfig.changeMs,
      changeScale: explicitConfig.changeScale,
    };
  }

  const fromAnimations = {
    seconds: animations.clockWarningSeconds ?? animations.clockSeconds ?? animations.clockWarning,
    changeMs: animations.clockWarningChangeMs
      ?? animations.clockChangeMs
      ?? animations.clockWarningMs,
    changeScale: animations.clockWarningChangeScale
      ?? animations.clockScale
      ?? animations.clockWarningScale,
  };
  const fromRoot = {
    seconds: uiConfig?.clockWarningSeconds
      ?? uiConfig?.clockSeconds
      ?? uiConfig?.clockWarning,
    changeMs: uiConfig?.clockWarningChangeMs
      ?? uiConfig?.clockChangeMs
      ?? uiConfig?.clockWarningMs
      ?? uiConfig?.feedback?.clockWarningChangeMs,
    changeScale: uiConfig?.clockWarningChangeScale
      ?? uiConfig?.clockScale
      ?? uiConfig?.clockWarningScale
      ?? uiConfig?.feedback?.clockWarningChangeScale,
  };
  return {
    seconds: fromRoot.seconds || fromAnimations.seconds,
    changeMs: fromRoot.changeMs || fromAnimations.changeMs,
    changeScale: fromRoot.changeScale || fromAnimations.changeScale,
  };
}

export function pickClockWarningConfig(candidate) {
  if (!candidate) {
    return null;
  }

  if (Array.isArray(candidate)) {
    return { seconds: candidate, changeMs: null, changeScale: null };
  }

  if (typeof candidate !== "object") {
    return null;
  }

  return {
    seconds: candidate.seconds || candidate.secondsList || candidate.warningSeconds || candidate.thresholds,
    changeMs: candidate.changeMs
      || candidate.ms
      || candidate.durationMs
      || candidate.warningMs
      || candidate.clockWarningMs,
    changeScale: candidate.changeScale
      || candidate.scale
      || candidate.warningScale
      || candidate.clockWarningScale,
  };
}

export function parseBattlePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

export function normalizeClockWarningSeconds(rawValue) {
  if (Array.isArray(rawValue)) {
    const parsed = rawValue
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .map((value) => Math.floor(value));
    if (parsed.length > 0 && parsed.every((value) => value > 120)) {
      return parsed
        .map((value) => Math.floor(value / 1000))
        .filter((value) => value >= 0);
    }
    return normalizeBattleNumberArray(parsed);
  }

  if (typeof rawValue === "string") {
    return normalizeBattleNumberArray(
      rawValue
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .map((value) => Math.floor(value)),
    );
  }

  return [];
}

export function normalizeBattleNumberArray(values) {
  const parsed = Array.isArray(values) ? values : [];
  return Array.from(new Set(parsed)).sort((left, right) => left - right);
}

export function normalizeBattleBoardSize(value, fallback) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(30, Math.max(3, number));
}

export function getBattleBoardConfig(context) {
  const boardConfig = getBattleUiConfig(context).board;
  return {
    width: normalizeBattleBoardSize(boardConfig.width, 12),
    height: normalizeBattleBoardSize(boardConfig.height, 9),
  };
}

export function getBattleGenerationConfig(context, options = {}) {
  return {
    ...getBattleBoardConfig(context),
    playerState: context?.battleState?.playerState,
    enemyConvertEffects:
      typeof options.getEnemyConvertEffects === "function"
        ? options.getEnemyConvertEffects(context)
        : [],
  };
}

export function getBattleAnimationConfig(context) {
  return getBattleUiConfig(context).animations;
}

export function resolveAssetPath(assetPath) {
  if (!assetPath || assetPath.startsWith("http") || assetPath.startsWith("data:") || assetPath.startsWith("blob:")) {
    return assetPath;
  }
  const cachedUrl = getCachedAssetUrl(assetPath);
  if (cachedUrl) {
    return cachedUrl;
  }
  if (assetPath.startsWith("./") || assetPath.startsWith("/")) {
    return appendAssetCacheBuster(assetPath);
  }
  return appendAssetCacheBuster(`./${assetPath}`);
}

export function appendAssetCacheBuster(assetPath) {
  return appendVersionParam(assetPath);
}
