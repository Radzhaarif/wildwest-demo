import { createAudioController } from "../audio-module.js";

export function createMapAudioController(deps) {
  const {
    state,
    resolveAssetPath,
  } = deps;

  const audioController = createAudioController({ resolveAssetPath });

  function setupAudio() {
    // Audio-объекты создаются из путей настроек, поэтому смена JSON настроек или
    // сброс должны пересоздавать их через resolveAssetPath.
    audioController.setup(state.settings);
  }

  function applyAudioSettings() {
    audioController.applySettings(state.settings);
  }

  function playClickSound() {
    audioController.playClick(state.settings);
  }

  function playSoundEffect(src) {
    audioController.playSoundEffect(src, state.settings);
  }

  function playMusic(src) {
    // Если источник уже тот же, не пересоздаем Audio. Если поменяли меню/карту или
    // настройки звука, создаем новый объект и снова применяем громкость.
    audioController.playMusic(src, state.settings);
  }

  function resumeMapMusicAfterBattle() {
    audioController.resumeMapMusicAfterBattle(state.settings);
  }

  function startBattleMusic(battleMusicPath) {
    audioController.startBattleMusic(battleMusicPath, state.settings);
  }

  return {
    setupAudio,
    applyAudioSettings,
    playClickSound,
    playSoundEffect,
    playMusic,
    resumeMapMusicAfterBattle,
    startBattleMusic,
  };
}
