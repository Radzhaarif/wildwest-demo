export function attachBattleLanguageChangeListener(deps, context, renderTargets) {
  if (typeof context.callbacks?.onLanguageChange !== "function") {
    return;
  }

  context.unsubscribeLanguageChange = context.callbacks.onLanguageChange(({ language, locale }) => {
    if (!deps.shouldContinueBattle(context, renderTargets)) {
      return;
    }
    context.request.language = language;
    context.request.locale = locale;
    refreshBattleLanguage(deps, context, renderTargets);
  });
}

export function refreshBattleLanguage(deps, context, renderTargets) {
  const {
    title,
    surrenderButton,
    settingsButton,
    logButton,
    menuButton,
    shuffleButton,
    status,
    enemyStats,
    playerMeters,
    ultimateText,
    specialItems,
    handItems,
    logOverlay,
  } = renderTargets;

  title.textContent = deps.translate(context.request.locale, context.battleData.enemyConfig?.nameTextKey)
    || context.request.enemyId;
  renderTargets.fitBattleEnemyTitle?.();
  updateBattleTopActionButtonLabel(deps, context, surrenderButton, "surrender");
  updateBattleTopActionButtonLabel(deps, context, settingsButton, "settings");
  updateBattleTopActionButtonLabel(deps, context, logButton, "log");
  deps.updateBattleHeaderMenuButton(context, renderTargets);
  deps.updateBattleShuffleButtonLanguage(context, shuffleButton);
  status.textContent = deps.translateBattleText(context, "selectFirstCell");
  deps.renderBattleStats(enemyStats, playerMeters, ultimateText, context);
  deps.renderBattleInventory(specialItems, handItems, context, renderTargets);
  deps.refreshBattleLogOverlayLanguage(logOverlay, context);
}

export function updateBattleTopActionButtonLabel(deps, context, button, actionId) {
  if (!button) {
    return;
  }

  const config = deps.getBattleTopButtonConfig(context, actionId);
  const label = deps.translate(context.request.locale, config.textKey);
  const labelElement = button.querySelector(".battle-top-button-label");
  if (labelElement) {
    labelElement.textContent = label;
  }
  button.setAttribute("aria-label", label);
}
