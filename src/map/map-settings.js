export function createMapSettingsController(deps) {
  const {
    state,
    elements,
    dataRoot,
    defaultSettingsUrl,
    currentSettingsUrl,
    settingsStorageKey,
    loadJson,
    setupAudio,
    applyAudioSettings,
    updateLocalizedUi,
    renderMenu,
    render,
  } = deps;

  const languageChangeListeners = new Set();

  async function setLanguage(language) {
    state.language = language;
    state.settings.language = language;
    elements.settingsLanguageSelect.value = language;
    state.locale = await loadJson(getLocaleUrl(state.language));
    saveSettings();
    updateLocalizedUi();
    render();
    notifyLanguageChangeListeners();
  }

  function addLanguageChangeListener(listener) {
    languageChangeListeners.add(listener);
    return () => {
      languageChangeListeners.delete(listener);
    };
  }

  function notifyLanguageChangeListeners() {
    for (const listener of languageChangeListeners) {
      listener({
        language: state.language,
        locale: state.locale,
      });
    }
  }

  async function loadSettings() {
    // Приоритет настроек: default-settings.json как база, current-settings.json
    // как стартовое текущее значение, затем localStorage поверх пользовательских
    // полей. Структурные списки и rewardAnimationMs специально берутся из файлов,
    // чтобы правки JSON сразу управляли игрой без очистки localStorage.
    state.defaultSettings = await loadJson(defaultSettingsUrl);
    const currentSettings = await loadJson(currentSettingsUrl);
    const storedSettings = loadStoredSettings();
    const fileSettings = currentSettings || state.defaultSettings;
    state.settings = mergeSettings({
      ...fileSettings,
      ...(storedSettings || {}),
      languages: fileSettings.languages || state.defaultSettings.languages,
      rewardAnimationMs: fileSettings.rewardAnimationMs || state.defaultSettings.rewardAnimationMs,
    });
    state.settings.audio = {
      ...state.defaultSettings.audio,
      ...(fileSettings.audio || {}),
    };
    state.language = state.settings.language;
    applyVisualSettings();
  }

  function mergeSettings(settings) {
    // Глубоко объединяем вложенные настройки: иначе добавление нового звука или
    // параметра анимации в default-settings.json могло бы потеряться из-за старых сохраненных настроек.
    return {
      ...structuredClone(state.defaultSettings),
      ...structuredClone(settings),
      audio: {
        ...state.defaultSettings.audio,
        ...(settings.audio || {}),
      },
      rewardAnimationMs: {
        ...state.defaultSettings.rewardAnimationMs,
        ...(settings.rewardAnimationMs || {}),
      },
      languages: settings.languages || state.defaultSettings.languages || ["en"],
    };
  }

  function loadStoredSettings() {
    const raw = localStorage.getItem(settingsStorageKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveSettings() {
    localStorage.setItem(settingsStorageKey, JSON.stringify(state.settings));
  }

  async function resetSettings() {
    // Сброс копирует именно дефолтный JSON в runtime/localStorage, после чего
    // заново загружает локаль и аудио по дефолтному language/audio.
    state.settings = structuredClone(state.defaultSettings);
    state.language = state.settings.language;
    saveSettings();
    state.locale = await loadJson(getLocaleUrl(state.language));
    setupAudio();
    applyAudioSettings();
    applyVisualSettings();
    updateLocalizedUi();
    renderMenu();
    notifyLanguageChangeListeners();
  }

  function setMusicVolume(value) {
    state.settings.musicVolume = Number(value);
    applyAudioSettings();
    saveSettings();
  }

  function setSoundVolume(value) {
    state.settings.soundVolume = Number(value);
    applyAudioSettings();
    saveSettings();
  }

  function applyVisualSettings() {
    const iconSize = Number(state.settings?.inlineItemIconEm);
    const safeIconSize = Number.isFinite(iconSize) && iconSize > 0 ? iconSize : 2.1;
    const tooltipFontSize = Number(state.settings?.tooltipFontSizePx);
    const safeTooltipFontSize = Number.isFinite(tooltipFontSize) && tooltipFontSize > 0 ? tooltipFontSize : 16;
    const tooltipMaxWidth = Number(state.settings?.tooltipMaxWidthPx);
    const safeTooltipMaxWidth = Number.isFinite(tooltipMaxWidth) && tooltipMaxWidth > 0 ? tooltipMaxWidth : 360;
    document.documentElement.style.setProperty("--inline-item-icon-size", `${safeIconSize}em`);
    document.documentElement.style.setProperty("--tooltip-font-size", `${safeTooltipFontSize}px`);
    document.documentElement.style.setProperty("--tooltip-max-width", `${safeTooltipMaxWidth}px`);
  }

  function getLocaleUrl(language) {
    return `${dataRoot}/locales/${language}.json`;
  }

  return {
    setLanguage,
    addLanguageChangeListener,
    loadSettings,
    resetSettings,
    saveSettings,
    setMusicVolume,
    setSoundVolume,
    applyVisualSettings,
    getLocaleUrl,
  };
}
