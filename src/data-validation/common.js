export const DATA_ROOT = "./data";

export function toProjectUrl(path) {
  return path.startsWith("data/") ? `./${path}` : path;
}

export function getLocaleUrl(language) {
  return `${DATA_ROOT}/locales/${language}.json`;
}

export function formatLoadIssue(source, error) {
  return error?.fileUrl ? error.message : `${source}: ${error.message}`;
}

export function validateCatalogAssetPath(path, expectedPrefix, pathLabel, issues) {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized.startsWith(expectedPrefix)) {
    issues.push(`${pathLabel}: expected path starting with "${expectedPrefix}"`);
  }
}

export function validateDataPathPrefix(path, expectedPrefix, pathLabel, issues) {
  const normalized = String(path || "").replaceAll("\\", "/");
  if (!normalized.startsWith(expectedPrefix)) {
    issues.push(`${pathLabel}: expected path starting with "${expectedPrefix}"`);
  }
}

export function validateNumberRangeConfig(range, path, min, max, issues) {
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

export function validateOptionalStringList(value, path, issues, requiredValues = null) {
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

export function validateEventImageField(value, path, issues) {
  if (!requireString(value, path, issues)) {
    return;
  }
  validateCatalogAssetPath(value, "data/Assets/events/", path, issues);
}

export function validateBattleBackgroundField(value, path, issues) {
  if (!requireString(value, path, issues)) {
    return;
  }
  validateCatalogAssetPath(value, "data/Assets/backgrounds/", path, issues);
}

export function validateRewardConfig(rewardConfig, path, issues, requiredItemIds, requiredTextKeys = null) {
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

export function hasOptionalStringList(value) {
  if (Array.isArray(value)) {
    return value.some((entry) => typeof entry === "string" && entry.trim());
  }
  return typeof value === "string" && value.trim() !== "";
}

export function collectTextKeys(value, requiredTextKeys) {
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

export function collectItemIds(value, requiredItemIds) {
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

export function requireString(value, path, issues) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${path}: expected non-empty string`);
    return false;
  }
  return true;
}

export function requirePositiveInteger(value, path, issues) {
  if (!Number.isInteger(value) || value <= 0) {
    issues.push(`${path}: expected positive integer`);
    return false;
  }
  return true;
}

export function requirePositiveNumber(value, path, issues) {
  if (typeof value !== "number" || value <= 0) {
    issues.push(`${path}: expected number > 0`);
    return false;
  }
  return true;
}

export function requireNumberInRange(value, path, min, max, issues) {
  if (typeof value !== "number" || value < min || value > max) {
    const maxText = max === Infinity ? "Infinity" : String(max);
    issues.push(`${path}: expected number from ${min} to ${maxText}`);
    return false;
  }
  return true;
}

export function requireIntegerInRange(value, path, min, max, issues) {
  if (!Number.isInteger(value) || value < min || value > max) {
    issues.push(`${path}: expected integer from ${min} to ${max}`);
    return false;
  }
  return true;
}
