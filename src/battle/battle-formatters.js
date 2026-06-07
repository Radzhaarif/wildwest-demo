export function translate(locale, key) {
  if (!key) {
    return "";
  }
  return locale?.[key] || key;
}

export function translateBattleText(deps, context, textKeyName) {
  return translate(context.request.locale, deps.getBattleUiConfig(context).textKeys[textKeyName]);
}

export function formatText(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

export function formatMoveStatus(deps, context, result, enemyState) {
  const parts = [
    formatBattleStatusPart(deps, context, "moveCells", { value: result.removedCells }),
    formatBattleStatusPart(deps, context, "moveCascades", { value: result.cascades }),
    formatBattleStatusPart(deps, context, "moveDamage", { value: result.effects.damage }),
  ];

  if (result.createdBonuses > 0) {
    parts.push(formatBattleStatusPart(deps, context, "moveBonuses", { value: result.createdBonuses }));
  }
  if (result.effects.healthRecovered > 0) {
    parts.push(formatBattleStatusPart(deps, context, "moveHealthRecovered", { value: result.effects.healthRecovered }));
  }
  if (result.effects.playerDamage > 0) {
    parts.push(formatBattleStatusPart(deps, context, "movePlayerDamage", { value: result.effects.playerDamage }));
  }
  if (enemyState.isDefeated) {
    parts.push(translateBattleText(deps, context, "enemyDefeated"));
  }
  if (result.cascadeLimitReached) {
    parts.push(translateBattleText(deps, context, "cascadeLimitReached"));
  }

  return formatText(
    translateBattleText(deps, context, "moveProcessed"),
    { details: parts.join(", ") },
  );
}

export function formatBattleStatusPart(deps, context, key, values) {
  return formatText(translateBattleText(deps, context, key), values);
}

export function formatBattleSeconds(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function createBattleTooltipLabel(context, labelTextKey) {
  const localizedLabel = translate(context.request.locale, labelTextKey);
  const descriptionKey = `${labelTextKey}.description`;
  const localizedDescription = translate(context.request.locale, descriptionKey);

  return {
    label: localizedLabel,
    description: localizedDescription,
  };
}
