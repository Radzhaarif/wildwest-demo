import {
  requirePositiveInteger,
  requireString,
  validateCatalogAssetPath,
  validateDataPathPrefix,
} from "./common.js";

const CHEAT_COMMAND_IDS = new Set(["autoWin", "levelUp"]);
const CHEAT_COMMAND_SCOPES = new Set(["battle", "map"]);

export function validateCheatConfig(config, source, issues, requiredTextKeys = null) {
  if (!config || typeof config !== "object") {
    issues.push(`${source}: cheat config must be an object`);
    return;
  }
  if (config.enabled !== undefined && typeof config.enabled !== "boolean") {
    issues.push(`${source}.enabled: expected boolean`);
  }
  if (config.inputMode !== "typedSequence") {
    issues.push(`${source}.inputMode: expected "typedSequence"`);
  }
  if (config.bufferMaxLength !== undefined) {
    requirePositiveInteger(config.bufferMaxLength, `${source}.bufferMaxLength`, issues);
  }

  if (!config.activation || typeof config.activation !== "object") {
    issues.push(`${source}.activation: expected object`);
  } else {
    if (requireString(config.activation.scope, `${source}.activation.scope`, issues) && config.activation.scope !== "mainMenu") {
      issues.push(`${source}.activation.scope: expected "mainMenu"`);
    }
    requireString(config.activation.command, `${source}.activation.command`, issues);
    if (requireString(config.activation.sound, `${source}.activation.sound`, issues)) {
      validateCatalogAssetPath(config.activation.sound, "data/Assets/sound/", `${source}.activation.sound`, issues);
    }
  }

  if (!Array.isArray(config.commands) || config.commands.length === 0) {
    issues.push(`${source}.commands: must contain at least one command`);
    return;
  }

  const commandKeys = new Set();
  config.commands.forEach((command, index) => {
    const prefix = `${source}.commands[${index}]`;
    if (!command || typeof command !== "object") {
      issues.push(`${prefix}: command must be an object`);
      return;
    }
    if (requireString(command.id, `${prefix}.id`, issues) && !CHEAT_COMMAND_IDS.has(command.id)) {
      issues.push(`${prefix}.id: expected one of ${[...CHEAT_COMMAND_IDS].join(", ")}`);
    }
    if (requireString(command.scope, `${prefix}.scope`, issues) && !CHEAT_COMMAND_SCOPES.has(command.scope)) {
      issues.push(`${prefix}.scope: expected one of ${[...CHEAT_COMMAND_SCOPES].join(", ")}`);
    }
    requireString(command.command, `${prefix}.command`, issues);
    const key = `${command.scope}:${command.id}`;
    if (commandKeys.has(key)) {
      issues.push(`${prefix}: duplicate cheat command "${key}"`);
    }
    commandKeys.add(key);
  });

  validateCheatTestRunConfig(config.testRun, `${source}.testRun`, issues, requiredTextKeys);
}

function validateCheatTestRunConfig(testRun, path, issues, requiredTextKeys) {
  if (testRun === undefined) {
    return;
  }
  if (!testRun || typeof testRun !== "object" || Array.isArray(testRun)) {
    issues.push(`${path}: expected object when present`);
    return;
  }
  if (testRun.enabled !== undefined && typeof testRun.enabled !== "boolean") {
    issues.push(`${path}.enabled: expected boolean`);
  }
  if (testRun.enabled === false) {
    return;
  }
  if (requireString(testRun.buttonTextKey, `${path}.buttonTextKey`, issues)) {
    requiredTextKeys?.add(testRun.buttonTextKey);
  }
  if (requireString(testRun.mapId, `${path}.mapId`, issues)) {
    requiredTextKeys?.add(`${testRun.mapId}.name`);
  }
  if (requireString(testRun.config, `${path}.config`, issues)) {
    validateDataPathPrefix(testRun.config, "data/maps/", `${path}.config`, issues);
  }
  if (requireString(testRun.playerState, `${path}.playerState`, issues)) {
    validateDataPathPrefix(testRun.playerState, "data/player/", `${path}.playerState`, issues);
  }
  if (testRun.mapNameTextKey !== undefined && requireString(testRun.mapNameTextKey, `${path}.mapNameTextKey`, issues)) {
    requiredTextKeys?.add(testRun.mapNameTextKey);
  }
  if (testRun.victoryTitleTextKey !== undefined && requireString(testRun.victoryTitleTextKey, `${path}.victoryTitleTextKey`, issues)) {
    requiredTextKeys?.add(testRun.victoryTitleTextKey);
  }
  if (testRun.victoryMessageTextKey !== undefined && requireString(testRun.victoryMessageTextKey, `${path}.victoryMessageTextKey`, issues)) {
    requiredTextKeys?.add(testRun.victoryMessageTextKey);
  }
}

export function getEnabledTestRunConfig(cheatConfig) {
  const testRun = cheatConfig?.testRun;
  return testRun && testRun.enabled !== false ? testRun : null;
}
