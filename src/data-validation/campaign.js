import {
  collectTextKeys,
  requireIntegerInRange,
  requireNumberInRange,
  requirePositiveInteger,
  requirePositiveNumber,
  requireString,
  validateEventImageField,
} from "./common.js";

export function validateCampaign(campaign, issues, requiredTextKeys) {
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

export function validateExperienceTable(experienceTable, issues, requiredTextKeys, requiredItemIds) {
  if (!experienceTable || typeof experienceTable !== "object") {
    issues.push("data/player/experience-table.jsonc: must be an object");
    return;
  }

  if (experienceTable.limitedItemInventoryThreshold !== undefined) {
    requirePositiveInteger(
      experienceTable.limitedItemInventoryThreshold,
      "data/player/experience-table.jsonc.limitedItemInventoryThreshold",
      issues,
    );
  }
  if (experienceTable.rewardWeightReductionPercentPerInventoryItem !== undefined) {
    requireNumberInRange(
      experienceTable.rewardWeightReductionPercentPerInventoryItem,
      "data/player/experience-table.jsonc.rewardWeightReductionPercentPerInventoryItem",
      0,
      100,
      issues,
    );
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
