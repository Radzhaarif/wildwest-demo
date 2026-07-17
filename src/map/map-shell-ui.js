const DEFAULT_MAP_TOP_ACTION_BUTTONS = {
  surrender: {
    textKey: "ui.surrender",
    icon: "data/Assets/icons/surrend.png",
  },
  settings: {
    textKey: "menu.settings",
    icon: "data/Assets/icons/setting.png",
  },
  log: {
    textKey: "ui.eventLog",
    icon: "data/Assets/icons/log.png",
  },
};

export function createMapShellUiController(deps) {
  const {
    state,
    elements,
    dataRoot,
    translate,
    resolveAssetPath,
    setEventImage,
    getPositiveNumber,
    playMusic,
    getSmokeTestButtonTextKey,
    updateSmokeTestButtonVisibility,
    stopMapAnimations,
    closeShop,
    closeHeal,
    closeReward,
    closeMapDialogOverlay,
    closeLockpick,
  } = deps;

  function startMenuMusicAfterInteraction() {
    if (!state.hasStartedGame) {
      playMusic(resolveAssetPath(state.settings.audio.mainMenuMusic));
    }
  }

  function renderMenu() {
    elements.mainMenu.style.backgroundImage = `url("${resolveAssetPath(`${dataRoot}/Assets/backgrounds/main_menu.png`)}")`;
    renderLanguageOptions();
    elements.mainMenuTitle.textContent = translate("menu.title");
    elements.startGameButton.textContent = translate("menu.start");
    renderTutorialButton();
    elements.smokeTestButton.textContent = translate(getSmokeTestButtonTextKey());
    elements.settingsButton.textContent = translate("menu.settings");
    syncFullscreenButton();
    updateSmokeTestButtonVisibility();
    renderMapTopActionButtons();
    elements.musicVolumeInput.value = state.settings.musicVolume;
    elements.soundVolumeInput.value = state.settings.soundVolume;
    elements.settingsLanguageSelect.value = state.settings.language;
    elements.settingsControlSchemeSelect.value = state.settings.controlScheme || "swipe-and-click";
    updateLocalizedUi();
  }

  function renderLanguageOptions() {
    const languages = state.settings.languages || state.defaultSettings.languages || ["en"];
    renderLanguageSelectOptions(elements.settingsLanguageSelect, languages);
  }

  function renderLanguageSelectOptions(select, languages) {
    // Название языка берется из текущей локали по ключу language.<id>. Поэтому
    // новый язык должен иметь одноименный JSON-файл и ключ имени во всех локалях.
    select.innerHTML = "";
    for (const language of languages) {
      const option = document.createElement("option");
      option.value = language;
      option.textContent = getLanguageName(language);
      select.append(option);
    }
  }

  function getLanguageName(language) {
    return state.locale[`language.${language}`] || language;
  }

  function getLocaleUrl(language) {
    return `${dataRoot}/locales/${language}.json`;
  }

  function updateLocalizedUi() {
    elements.settingsTitle.textContent = translate("menu.settings");
    elements.musicVolumeLabel.textContent = translate("settings.musicVolume");
    elements.soundVolumeLabel.textContent = translate("settings.soundVolume");
    elements.settingsLanguageLabel.textContent = translate("settings.language");
    elements.settingsControlSchemeLabel.textContent = translate("settings.controlScheme");
    elements.settingsControlSchemeSwipeOption.textContent = translate("settings.controlScheme.swipe");
    elements.settingsControlSchemeClickOption.textContent = translate("settings.controlScheme.click");
    elements.settingsControlSchemeBothOption.textContent = translate("settings.controlScheme.swipeAndClick");
    elements.resetSettingsButton.textContent = translate("settings.reset");
    elements.backSettingsButton.textContent = translate("ui.back");
    elements.startGameButton.textContent = translate("menu.start");
    renderTutorialButton();
    elements.smokeTestButton.textContent = translate(getSmokeTestButtonTextKey());
    elements.settingsButton.textContent = translate("menu.settings");
    elements.mainMenuTitle.textContent = translate("menu.title");
    syncFullscreenButton();
    updateSmokeTestButtonVisibility();
    elements.settingsLanguageSelect.value = state.language;
    elements.settingsControlSchemeSelect.value = state.settings.controlScheme || "swipe-and-click";
    renderMapTopActionButtons();
    elements.eventLogBackButton.textContent = translate("ui.back");
    elements.eventLogTitle.textContent = translate("ui.eventLog");
    elements.shopConfirmYesButton.textContent = translate("ui.yes");
    elements.shopConfirmNoButton.textContent = translate("ui.no");
    elements.surrenderText.textContent = translate("surrender.question");
    elements.surrenderConfirmButton.textContent = translate("surrender.confirm");
    elements.surrenderCancelButton.textContent = translate("surrender.cancel");
  }

  function renderTutorialButton() {
    if (!elements.tutorialButton) {
      return;
    }
    const tutorial = state.campaign?.tutorial;
    elements.tutorialButton.textContent = translate(tutorial?.buttonTextKey || "menu.tutorial");
    elements.tutorialButton.classList.toggle("hidden", !tutorial || tutorial.enabled === false);
  }

  function setupFullscreenButton() {
    const button = elements.fullscreenButton;
    if (!button || button.dataset.fullscreenReady === "true") {
      return;
    }
    button.dataset.fullscreenReady = "true";
    button.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", syncFullscreenButton);
    document.addEventListener("webkitfullscreenchange", syncFullscreenButton);
    document.addEventListener("fullscreenerror", syncFullscreenButton);
    document.addEventListener("webkitfullscreenerror", syncFullscreenButton);
    button.classList.add("is-ready");
    syncFullscreenButton();
  }

  async function toggleFullscreen() {
    try {
      if (getFullscreenElement()) {
        await exitFullscreen();
      } else {
        await enterFullscreen();
      }
    } catch (error) {
      console.warn("Fullscreen mode is unavailable.", error);
    } finally {
      syncFullscreenButton();
    }
  }

  async function enterFullscreen() {
    const target = elements.gameOrientationRoot || document.documentElement;
    const requestFullscreen = target?.requestFullscreen || target?.webkitRequestFullscreen;
    if (typeof requestFullscreen !== "function") {
      throw new Error("Fullscreen API is not supported by this browser.");
    }
    await requestFullscreen.call(target);
  }

  async function exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (typeof exit !== "function") {
      throw new Error("Fullscreen exit is not supported by this browser.");
    }
    await exit.call(document);
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function syncFullscreenButton() {
    const button = elements.fullscreenButton;
    if (!button) {
      return;
    }
    const isFullscreen = Boolean(getFullscreenElement());
    const label = translate(isFullscreen ? "ui.exitFullscreen" : "ui.enterFullscreen");
    button.classList.toggle("is-fullscreen-active", isFullscreen);
    button.setAttribute("aria-pressed", String(isFullscreen));
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function getMapTopActionButtonConfig(actionId) {
    const source =
      state.mapUiConfig?.topButtons?.[actionId] ||
      DEFAULT_MAP_TOP_ACTION_BUTTONS[actionId] ||
      {};
    return {
      textKey: source.textKey || actionId,
      icon: source.icon || "",
      iconSizePx: getPositiveNumber(source.iconSizePx, 38),
    };
  }

  function renderMapTopActionButtons() {
    const surrenderConfig = getMapTopActionButtonConfig("surrender");
    const settingsConfig = getMapTopActionButtonConfig("settings");
    const logConfig = getMapTopActionButtonConfig("log");

    applyMapTopActionButton(elements.surrenderButton, surrenderConfig);
    applyMapTopActionButton(elements.mapSettingsButton, settingsConfig);
    applyMapTopActionButton(elements.eventLogButton, logConfig);
  }

  function applyMapTopActionButton(button, config) {
    if (!button) {
      return;
    }
    const label = translate(config.textKey);
    button.classList.add("map-top-button");
    button.textContent = "";
    if (config.icon) {
      button.append(createMapTopActionButtonIcon(config.icon));
    }
    button.style.setProperty("--map-top-button-icon-size", `${config.iconSizePx}px`);
    button.append(createMapTopActionButtonLabel(label));
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function createMapTopActionButtonIcon(iconPath) {
    const icon = document.createElement("img");
    icon.className = "map-top-button-icon";
    icon.src = resolveAssetPath(iconPath);
    icon.alt = "";
    return icon;
  }

  function createMapTopActionButtonLabel(text) {
    const label = document.createElement("span");
    label.className = "map-top-button-label";
    label.textContent = text || "";
    return label;
  }

  function showSettingsPanel(source) {
    // Один и тот же overlay используется и в главном меню, и на карте. source
    // нужен, чтобы при закрытии вернуть кнопки меню только если настройки открыты
    // из меню, а не поверх карты.
    elements.settingsOverlay.dataset.source = source;
    elements.mainMenuActions.classList.add("hidden");
    elements.settingsOverlay.classList.remove("hidden");
  }

  function hideSettingsPanel() {
    const source = elements.settingsOverlay.dataset.source;
    elements.settingsOverlay.classList.add("hidden");
    if (source === "menu") {
      elements.mainMenuActions.classList.remove("hidden");
    }
  }

  function surrenderToMainMenu() {
    stopMapAnimations();
    closeShop({ complete: false });
    closeHeal({ complete: false });
    closeReward({ scrollToNext: false });
    closeMapDialogOverlay();
    closeLockpick();
    hideEventLogOverlay();
    hideSettingsPanel();
    hideSurrenderDialog();
    state.hasStartedGame = false;
    elements.mainMenu.classList.remove("hidden");
    elements.mainMenuActions.classList.remove("hidden");
    playMusic(resolveAssetPath(state.settings.audio.mainMenuMusic));
  }

  function showSurrenderDialog(callbacks = null) {
    state.pendingSurrenderCallbacks = callbacks;
    elements.surrenderText.textContent = translate("surrender.question");
    elements.surrenderConfirmButton.textContent = translate("surrender.confirm");
    elements.surrenderCancelButton.textContent = translate("surrender.cancel");
    elements.surrenderOverlay.classList.remove("hidden");
  }

  function confirmSurrender() {
    const callbacks = state.pendingSurrenderCallbacks;
    state.pendingSurrenderCallbacks = null;
    if (typeof callbacks?.onConfirm === "function") {
      callbacks.onConfirm();
    }
    surrenderToMainMenu();
  }

  function cancelSurrender() {
    const callbacks = state.pendingSurrenderCallbacks;
    state.pendingSurrenderCallbacks = null;
    if (typeof callbacks?.onCancel === "function") {
      callbacks.onCancel();
    }
    hideSurrenderDialog();
  }

  function hideSurrenderDialog() {
    elements.surrenderOverlay.classList.add("hidden");
  }

  function showEventLogOverlay() {
    elements.eventLogOverlay.classList.remove("hidden");
  }

  function hideEventLogOverlay() {
    elements.eventLogOverlay.classList.add("hidden");
  }

  function showDialog(message, onClose, eventImage = "") {
    elements.eventDialogText.textContent = message;
    setDialogEventImage(eventImage);
    if (typeof elements.eventDialog.showModal === "function") {
      if (onClose) {
        elements.eventDialog.addEventListener("close", onClose, { once: true });
      }
      elements.eventDialog.showModal();
    } else {
      alert(message);
      if (onClose) {
        onClose();
      }
    }
  }

  function setDialogEventImage(eventImage) {
    if (!elements.eventDialogImage) {
      return;
    }
    if (!eventImage) {
      elements.eventDialogImage.setAttribute("hidden", "");
      elements.eventDialogImage.removeAttribute("src");
      return;
    }
    setEventImage(elements.eventDialogImage, eventImage, "");
  }

  function addRunLogHeader(message) {
    addLog(message, "event-log-separator");
  }

  function addLog(message, className = "") {
    const entry = document.createElement("li");
    entry.textContent = message;
    if (className) {
      entry.classList.add(className);
    }
    elements.eventLog.prepend(entry);
  }

  return {
    startMenuMusicAfterInteraction,
    setupFullscreenButton,
    renderMenu,
    getLocaleUrl,
    updateLocalizedUi,
    renderMapTopActionButtons,
    showSettingsPanel,
    hideSettingsPanel,
    showSurrenderDialog,
    confirmSurrender,
    cancelSurrender,
    showEventLogOverlay,
    hideEventLogOverlay,
    showDialog,
    returnToMainMenu: surrenderToMainMenu,
    addRunLogHeader,
    addLog,
  };
}
