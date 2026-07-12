export function createEmptyEffectSummary() {
  return {
    activatedCells: 0,
    damage: 0,
    heal: 0,
    aggression: 0,
    calm: 0,
    shieldDamage: 0,
    healthRecovered: 0,
    playerDamage: 0,
    aggressionTriggers: 0,
    stageChanged: false,
    enemyDefeated: false,
    damageSourceCells: [],
    shieldSourceCells: [],
  };
}

export function mergeEffectSummary(target, source) {
  target.activatedCells += source.activatedCells;
  target.damage += source.damage;
  target.heal += source.heal;
  target.aggression += source.aggression;
  target.calm += source.calm;
  target.shieldDamage += source.shieldDamage || 0;
  target.healthRecovered += source.healthRecovered;
  target.playerDamage += source.playerDamage || 0;
  target.aggressionTriggers += source.aggressionTriggers || 0;
  target.stageChanged = target.stageChanged || source.stageChanged;
  target.enemyDefeated = target.enemyDefeated || source.enemyDefeated;
  if (Array.isArray(source.damageSourceCells)) {
    target.damageSourceCells.push(...source.damageSourceCells);
  }
  if (Array.isArray(source.shieldSourceCells)) {
    target.shieldSourceCells.push(...source.shieldSourceCells);
  }
}
