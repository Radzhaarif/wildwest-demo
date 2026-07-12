import { loadJson } from "../data-loader.js";
import {
  formatLoadIssue,
  getLocaleUrl,
  requireNumberInRange,
  requirePositiveInteger,
  requirePositiveNumber,
  requireString,
} from "./common.js";

export function validatePlayerState(playerState, issues, requiredItemIds) {
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

export async function validateLocales(requiredTextKeys, issues, languages = ["en"]) {
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
