export function createMapCompletionController(deps) {
  const {
    state,
    translate,
    formatText,
    showDialog,
    returnToMainMenu,
    addLog,
    startCampaignMap,
  } = deps;

  function completeMap() {
    // Поведение завершения берется из settings/campaign.jsonc, а не из карты. Это позволяет
    // одну и ту же карту использовать несколько раз: перейти к следующей или
    // показать победу.
    const entry = state.activeMapEntry || state.campaign.maps[state.campaignIndex];
    if (entry.onComplete.type === "victory") {
      const title = translate(entry.onComplete.titleTextKey);
      const message = translate(entry.onComplete.messageTextKey);
      showDialog(
        `${title} ${message}`,
        entry.onComplete.returnToMainMenu === true ? returnToMainMenu : undefined,
      );
      addLog(formatText("log.mapVictory", { message }));
      state.availableNodeIds = new Set();
      return;
    }

    const nextIndex = findNextCampaignIndex(entry.onComplete.nextMapId);
    const nextMapMessage = formatText("log.nextMap", { map: entry.onComplete.nextMapId });
    showDialog(nextMapMessage);
    addLog(nextMapMessage);
    startCampaignMap(nextIndex);
  }

  function findNextCampaignIndex(nextMapId) {
    const afterCurrent = state.campaign.maps.findIndex(
      (entry, index) => index > state.campaignIndex && entry.mapId === nextMapId,
    );
    if (afterCurrent >= 0) {
      return afterCurrent;
    }
    const first = state.campaign.maps.findIndex((entry) => entry.mapId === nextMapId);
    return Math.max(first, 0);
  }

  return {
    completeMap,
  };
}
