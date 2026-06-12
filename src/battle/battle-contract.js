export const BATTLE_CONTRACT_VERSION = 1;

export const BATTLE_OUTCOMES = Object.freeze({
  victory: "victory",
  defeat: "defeat",
  escaped: "escaped",
  cancelled: "cancelled",
});

/**
 * @typedef {object} BattleRequest
 * @property {number} contractVersion
 * @property {string} nodeId
 * @property {"battle" | "boss"} nodeType
 * @property {string} enemyId
 * @property {string=} enemyConfigUrl
 * @property {string} background
 * @property {string=} seed
 * @property {string=} seedName
 * @property {object} playerState
 * @property {object} itemCatalog
 * @property {object} locale
 * @property {object} settings
 * @property {string} language
 */

/**
 * @typedef {object} BattleReward
 * @property {"gold" | "item" | "health" | "experience"} type
 * @property {string=} itemId
 * @property {number} amount
 */

/**
 * @typedef {object} BattleResult
 * @property {number} contractVersion
 * @property {"victory" | "defeat" | "escaped" | "cancelled"} outcome
 * @property {string} nodeId
 * @property {"battle" | "boss"} nodeType
 * @property {object} playerState
 * @property {BattleReward[]} rewards
 * @property {object|null=} reward
 * @property {string[]} logMessages
 * @property {object|null=} battleTrace
 */

/**
 * The map owns route progress and decides what to unlock after battle.
 * The battle module owns only its temporary combat state and returns this result.
 *
 * @param {Omit<BattleResult, "contractVersion">} result
 * @returns {BattleResult}
 */
export function createBattleResult(result) {
  return {
    contractVersion: BATTLE_CONTRACT_VERSION,
    outcome: result.outcome,
    nodeId: result.nodeId,
    nodeType: result.nodeType,
    playerState: result.playerState,
    rewards: Array.isArray(result.rewards) ? result.rewards : [],
    reward: result.reward || null,
    logMessages: Array.isArray(result.logMessages) ? result.logMessages : [],
    battleTrace: result.battleTrace || null,
  };
}
