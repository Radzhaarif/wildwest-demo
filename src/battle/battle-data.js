const ENEMY_DATA_ROOT = "./data/enemy";
const BATTLE_UI_CONFIG_URL = "./data/settings/battle-ui.jsonc";

async function loadBattleUiConfig(loaders) {
  if (!loaders?.loadJsonc) {
    return null;
  }
  return loaders.loadJsonc(BATTLE_UI_CONFIG_URL);
}

export async function loadBattleData(request, loaders = {}) {
  // Map may pass an explicit enemyConfigUrl for seeded/debug runs. Fallback by
  // enemyId keeps battle-module usable for direct smoke/manual starts.
  const enemyConfigUrl = request.enemyConfigUrl || getEnemyConfigUrl(request.enemyId);
  const enemyConfig = loaders.loadJsonc
    ? await loaders.loadJsonc(enemyConfigUrl)
    : null;
  const uiConfig = loaders.loadJsonc
    ? await loadBattleUiConfig(loaders)
    : null;

  return {
    enemyConfig,
    enemyConfigUrl,
    itemCatalog: request.itemCatalog,
    uiConfig,
  };
}

export function getEnemyConfigUrl(enemyId) {
  return `${ENEMY_DATA_ROOT}/${enemyId}.jsonc`;
}
