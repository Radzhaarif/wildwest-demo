const ENEMY_DATA_ROOT = "./data/enemy";
const BATTLE_UI_CONFIG_URL = "./data/settings/battle-ui.jsonc";
const BATTLE_UI_CONFIG_URL_LEGACY = "./data/battle/battle-ui.jsonc";

async function loadBattleUiConfig(loaders) {
  if (!loaders?.loadJsonc) {
    return null;
  }
  try {
    return await loaders.loadJsonc(BATTLE_UI_CONFIG_URL);
  } catch (error) {
    if (error.message && error.message.includes("Failed to load")) {
      return loaders.loadJsonc(BATTLE_UI_CONFIG_URL_LEGACY);
    }
    throw error;
  }
}

export async function loadBattleData(request, loaders = {}) {
  const enemyConfig = loaders.loadJsonc
    ? await loaders.loadJsonc(getEnemyConfigUrl(request.enemyId))
    : null;
  const uiConfig = loaders.loadJsonc
    ? await loadBattleUiConfig(loaders)
    : null;

  return {
    enemyConfig,
    itemCatalog: request.itemCatalog,
    uiConfig,
  };
}

export function getEnemyConfigUrl(enemyId) {
  return `${ENEMY_DATA_ROOT}/${enemyId}.jsonc`;
}
