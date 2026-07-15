export function createMapCheatsController(deps) {
  const {
    state,
    elements,
    playSoundEffect,
    render,
    isBattleOverlayOpen,
    getExperienceTotal,
    getNextExperienceLevel,
    addExperience,
    showNextLevelUpReward,
  } = deps;

  function handleCheatKeydown(event) {
    // Cheats слушают печать только в безопасных scope: меню или чистая карта.
    // В overlay/бою ввод принадлежит активному экрану.
    const input = getCheatInputCharacter(event);
    if (!input || shouldIgnoreCheatInputTarget(event.target) || !isCheatConfigEnabled()) {
      return;
    }

    const scope = getActiveMapCheatScope();
    if (!scope) {
      clearCheatInputBuffer();
      return;
    }

    appendCheatInput(input);
    if (scope === "mainMenu" && !state.cheatsActive && isCheatActivationMatched()) {
      event.preventDefault();
      activateCheats();
      clearCheatInputBuffer();
      return;
    }

    if (!state.cheatsActive || scope !== "map") {
      return;
    }

    const command = findCheatCommand("map", "levelUp");
    if (command && isCheatCommandMatched(command)) {
      event.preventDefault();
      triggerLevelUpCheat();
      clearCheatInputBuffer();
    }
  }

  function isCheatConfigEnabled() {
    return state.cheatConfig?.enabled !== false && state.cheatConfig?.inputMode === "typedSequence";
  }

  function getCheatInputCharacter(event) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.key?.length !== 1) {
      return "";
    }
    return event.key.toLowerCase();
  }

  function shouldIgnoreCheatInputTarget(target) {
    const element = target instanceof Element ? target : null;
    if (!element) {
      return false;
    }
    return Boolean(element.closest("input, select, textarea, [contenteditable='true']"));
  }

  function getActiveMapCheatScope() {
    if (isMainMenuCheatScopeVisible()) {
      return "mainMenu";
    }
    if (isMapCheatScopeVisible()) {
      return "map";
    }
    return "";
  }

  function isMainMenuCheatScopeVisible() {
    return !state.hasStartedGame
      && !elements.mainMenu.classList.contains("hidden")
      && elements.settingsOverlay.classList.contains("hidden")
      && elements.loadingOverlay.classList.contains("hidden");
  }

  function isMapCheatScopeVisible() {
    return state.hasStartedGame
      && !isBattleOverlayOpen()
      && elements.settingsOverlay.classList.contains("hidden")
      && elements.shopOverlay.classList.contains("hidden")
      && elements.healOverlay.classList.contains("hidden")
      && elements.rewardOverlay.classList.contains("hidden")
      && elements.mapDialogOverlay.classList.contains("hidden")
      && elements.lockpickOverlay.classList.contains("hidden")
      && elements.eventLogOverlay.classList.contains("hidden")
      && elements.surrenderOverlay.classList.contains("hidden");
  }

  function appendCheatInput(input) {
    const maxLength = getCheatInputBufferMaxLength();
    state.cheatInputBuffer = `${state.cheatInputBuffer}${input}`.slice(-maxLength);
  }

  function clearCheatInputBuffer() {
    state.cheatInputBuffer = "";
  }

  function getCheatInputBufferMaxLength() {
    const configured = Number(state.cheatConfig?.bufferMaxLength);
    const commands = [
      state.cheatConfig?.activation,
      ...(Array.isArray(state.cheatConfig?.commands) ? state.cheatConfig.commands : []),
    ];
    const longestCommand = commands.reduce((max, command) => {
      return Math.max(max, normalizeCheatCommand(command?.command).length);
    }, 0);
    return Math.max(longestCommand, Number.isFinite(configured) ? Math.floor(configured) : 0, 1);
  }

  function isCheatActivationMatched() {
    return isCheatCommandMatched(state.cheatConfig?.activation);
  }

  function isCheatCommandMatched(command) {
    const normalized = normalizeCheatCommand(command?.command);
    return normalized !== "" && state.cheatInputBuffer.endsWith(normalized);
  }

  function normalizeCheatCommand(command) {
    return String(command || "").trim().toLowerCase();
  }

  function findCheatCommand(scope, id) {
    return (state.cheatConfig?.commands || []).find((command) => {
      return command?.scope === scope && command?.id === id && normalizeCheatCommand(command.command);
    }) || null;
  }

  function activateCheats() {
    state.cheatsActive = true;
    playSoundEffect(state.cheatConfig?.activation?.sound);
    updateSmokeTestButtonVisibility();
  }

  function triggerLevelUpCheat() {
    const currentTotal = getExperienceTotal();
    const nextLevel = getNextExperienceLevel(currentTotal);
    if (!nextLevel) {
      return;
    }
    const experienceToAdd = Math.max(1, nextLevel.requiredExperience - currentTotal);
    addExperience(experienceToAdd);
    render();
    showNextLevelUpReward({ scrollToNext: false });
  }

  function createBattleCheatState() {
    // В бой передаем только battle-команды и флаг активности. Map-only команды
    // вроде lvl не должны срабатывать внутри battle overlay.
    return {
      active: state.cheatsActive,
      inputMode: state.cheatConfig?.inputMode || "",
      bufferMaxLength: getCheatInputBufferMaxLength(),
      commands: (state.cheatConfig?.commands || [])
        .filter((command) => command?.scope === "battle")
        .map((command) => ({
          id: command.id,
          scope: command.scope,
          command: normalizeCheatCommand(command.command),
        })),
    };
  }

  function getSmokeTestRunConfig() {
    const testRun = state.cheatConfig?.testRun;
    if (!testRun || testRun.enabled === false) {
      return null;
    }
    if (!testRun.mapId || !testRun.config || !testRun.playerState) {
      return null;
    }
    return testRun;
  }

  function createSmokeTestMapEntry(testRun) {
    return {
      mapId: testRun.mapId,
      config: testRun.config,
      onComplete: {
        type: "victory",
        titleTextKey: testRun.victoryTitleTextKey || "campaign.main.victory.title",
        messageTextKey: testRun.victoryMessageTextKey || "campaign.main.victory.message",
      },
    };
  }

  function getSmokeTestButtonTextKey() {
    return state.cheatConfig?.testRun?.buttonTextKey || "menu.smokeTest";
  }

  function updateSmokeTestButtonVisibility() {
    if (!elements.smokeTestButton) {
      return;
    }
    elements.smokeTestButton.classList.toggle("hidden", !(state.cheatsActive && getSmokeTestRunConfig()));
  }

  return {
    handleCheatKeydown,
    createBattleCheatState,
    getSmokeTestRunConfig,
    createSmokeTestMapEntry,
    getSmokeTestButtonTextKey,
    updateSmokeTestButtonVisibility,
  };
}
