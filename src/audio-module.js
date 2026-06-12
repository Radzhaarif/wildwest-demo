import { appendVersionParam } from "./app-version.js";

export function createAudioController({ resolveAssetPath }) {
  const audioState = {
    click: null,
    music: null,
    musicTrack: "",
    battleMusic: null,
    battleMusicTrack: "",
    battleState: null,
    musicTransitionFrameId: null,
  };

  function setup(settings) {
    stopMusicTransition();
    if (audioState.music) {
      audioState.music.pause();
    }
    if (audioState.battleMusic) {
      audioState.battleMusic.pause();
      audioState.battleMusic.currentTime = 0;
    }

    audioState.battleMusic = null;
    audioState.battleMusicTrack = "";
    audioState.battleState = null;
    audioState.click = new Audio(resolveAssetPath(settings.audio.click));
    audioState.musicTrack = resolveMusicTrackId(settings.audio.mainMenuMusic);
    audioState.music = new Audio(resolveMusicUrl(audioState.musicTrack));
    audioState.music.loop = true;
  }

  function applySettings(settings) {
    if (audioState.click) {
      audioState.click.volume = settings.soundVolume;
    }
    if (audioState.music) {
      audioState.music.volume = settings.musicVolume;
    }
    if (audioState.battleMusic) {
      audioState.battleMusic.volume = settings.musicVolume;
    }
  }

  function playClick(settings) {
    if (!audioState.click || settings.soundVolume <= 0) {
      return;
    }
    audioState.click.currentTime = 0;
    audioState.click.play().catch(() => {});
  }

  function playMusic(src, settings) {
    const trackId = resolveMusicTrackId(src);
    if (!trackId) {
      return;
    }
    if (!audioState.music || audioState.musicTrack !== trackId) {
      audioState.music = new Audio(resolveMusicUrl(trackId));
      audioState.music.loop = true;
      audioState.musicTrack = trackId;
    }
    applySettings(settings);
    audioState.music.play().catch(() => {});
  }

  function startBattleMusic(battleMusicPath, settings) {
    pauseMapMusicForBattle(settings);
    if (!battleMusicPath) {
      return;
    }

    stopMusicTransition();
    audioState.battleMusicTrack = resolveMusicTrackId(battleMusicPath);
    if (!audioState.battleMusicTrack) {
      return;
    }
    audioState.battleMusic = new Audio(resolveMusicUrl(audioState.battleMusicTrack));
    audioState.battleMusic.loop = true;
    if (!audioState.battleMusic) {
      return;
    }
    const mapMusic = audioState.music;
    const mapState = audioState.battleState || { wasPlaying: false };
    const mapStartVolume = mapMusic ? clampVolume(mapMusic.volume) : 0;
    const targetVolume = clampVolume(settings.musicVolume);
    audioState.battleMusic.volume = 0;
    audioState.battleMusic.currentTime = 0;
    audioState.battleMusic.play().catch(() => {});

    if (mapMusic && mapState.wasPlaying) {
      animateMusicCrossfade({
        fadeOutAudio: mapMusic,
        fadeInAudio: audioState.battleMusic,
        fadeOutStartVolume: mapStartVolume,
        fadeOutTargetVolume: 0,
        fadeInStartVolume: 0,
        fadeInTargetVolume: targetVolume,
        durationMs: getBattleMusicCrossfadeMs(settings),
        onComplete: () => {
          if (mapMusic) {
            mapMusic.pause();
          }
          audioState.battleMusic.volume = targetVolume;
        },
      });
      return;
    }
    audioState.battleMusic.volume = targetVolume;
  }

  function resumeMapMusicAfterBattle(settings) {
    const battleState = audioState.battleState;
    audioState.battleState = null;
    const crossfadeMs = getBattleMusicCrossfadeMs(settings);
    stopMusicTransition();

    const battleMusic = audioState.battleMusic;
    const mapMusic = audioState.music;

    if (!battleState || !mapMusic) {
      if (battleMusic) {
        battleMusic.pause();
        battleMusic.currentTime = 0;
        audioState.battleMusic = null;
      }
      return;
    }

    if (!battleState.previousTrack) {
      if (battleMusic) {
        battleMusic.pause();
        battleMusic.currentTime = 0;
        audioState.battleMusic = null;
      }
      return;
    }

    if (audioState.musicTrack !== battleState.previousTrack) {
      mapMusic.src = resolveMusicUrl(battleState.previousTrack);
      audioState.musicTrack = battleState.previousTrack;
    }

    mapMusic.volume = 0;
    const mapTargetVolume = battleState.wasPlaying ? clampVolume(settings.musicVolume) : 0;
    const wasMapVisible = mapMusic.currentTime >= 0;
    const currentMapTime = wasMapVisible ? mapMusic.currentTime : 0;

    if (battleState.wasPlaying) {
      mapMusic.currentTime = currentMapTime;
      mapMusic.play().catch(() => {});
      animateMusicCrossfade({
        fadeOutAudio: null,
        fadeInAudio: mapMusic,
        fadeOutStartVolume: 0,
        fadeOutTargetVolume: 0,
        fadeInStartVolume: 0,
        fadeInTargetVolume: mapTargetVolume,
        durationMs: crossfadeMs,
        onComplete: () => {
          mapMusic.volume = mapTargetVolume;
        },
      });
    } else {
      mapMusic.volume = 0;
      mapMusic.pause();
    }

    if (battleMusic) {
      animateMusicCrossfade({
        fadeOutAudio: battleMusic,
        fadeInAudio: null,
        fadeOutStartVolume: clampVolume(battleMusic.volume),
        fadeOutTargetVolume: 0,
        fadeInStartVolume: 0,
        fadeInTargetVolume: 0,
        durationMs: crossfadeMs,
        onComplete: () => {
          battleMusic.pause();
          battleMusic.currentTime = 0;
          audioState.battleMusic = null;
        },
      });
    }
  }

  function pauseMapMusicForBattle(settings) {
    if (!audioState.music) {
      return;
    }
    stopMusicTransition();
    audioState.battleState = {
      wasPlaying: !audioState.music.paused,
      previousTrack: audioState.musicTrack || resolveMusicTrackId(settings.audio.mapMusic),
    };
    if (!audioState.battleState.wasPlaying || audioState.music.volume === 0) {
      audioState.music.pause();
      return;
    }

    animateMusicCrossfade({
      fadeOutAudio: audioState.music,
      fadeInAudio: null,
      fadeOutStartVolume: clampVolume(audioState.music.volume),
      fadeOutTargetVolume: 0,
      fadeInStartVolume: 0,
      fadeInTargetVolume: 0,
      durationMs: getBattleMusicCrossfadeMs(settings),
      onComplete: () => {
        audioState.music.pause();
      },
    });
  }

  function stopMusicTransition() {
    if (audioState.musicTransitionFrameId !== null) {
      cancelAnimationFrame(audioState.musicTransitionFrameId);
      audioState.musicTransitionFrameId = null;
    }
  }

  function animateMusicCrossfade({
    fadeOutAudio,
    fadeInAudio,
    fadeOutStartVolume,
    fadeOutTargetVolume,
    fadeInStartVolume,
    fadeInTargetVolume,
    durationMs,
    onComplete,
  }) {
    const duration = Math.max(0, Number(durationMs) || 0);
    const hasFadeOut = !!fadeOutAudio;
    const hasFadeIn = !!fadeInAudio;
    const targetOutVolume = clampVolume(fadeOutTargetVolume);
    const targetInVolume = clampVolume(fadeInTargetVolume);
    if (!hasFadeOut && !hasFadeIn) {
      if (typeof onComplete === "function") {
        onComplete();
      }
      return;
    }
    if (duration <= 0) {
      if (hasFadeOut) {
        fadeOutAudio.volume = targetOutVolume;
        if (targetOutVolume === 0) {
          fadeOutAudio.pause();
        }
      }
      if (hasFadeIn) {
        fadeInAudio.volume = targetInVolume;
        fadeInAudio.play().catch(() => {});
      }
      if (typeof onComplete === "function") {
        onComplete();
      }
      return;
    }

    const fromOut = clampVolume(fadeOutStartVolume);
    const fromIn = clampVolume(fadeInStartVolume);
    const startTime = performance.now();
    const onFadeOutFrame = (outVolume) => {
      if (!fadeOutAudio) {
        return;
      }
      const volume = clampVolume(outVolume);
      fadeOutAudio.volume = volume;
      if (volume === 0) {
        fadeOutAudio.pause();
      }
    };
    const onFadeInFrame = (inVolume) => {
      if (!fadeInAudio) {
        return;
      }
      const volume = clampVolume(inVolume);
      fadeInAudio.volume = volume;
      if (volume > 0 && fadeInAudio.paused) {
        fadeInAudio.play().catch(() => {});
      }
    };
    const onFadeComplete = () => {
      if (hasFadeOut) {
        fadeOutAudio.volume = targetOutVolume;
        if (targetOutVolume === 0) {
          fadeOutAudio.pause();
        }
      }
      if (hasFadeIn) {
        fadeInAudio.volume = targetInVolume;
        if (targetInVolume > 0 && fadeInAudio.paused) {
          fadeInAudio.play().catch(() => {});
        }
      }
      if (typeof onComplete === "function") {
        onComplete();
      }
    };

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const outVolume = fromOut + (targetOutVolume - fromOut) * t;
      const inVolume = fromIn + (targetInVolume - fromIn) * t;

      onFadeOutFrame(outVolume);
      onFadeInFrame(inVolume);

      if (t >= 1) {
        audioState.musicTransitionFrameId = null;
        onFadeComplete();
        return;
      }
      audioState.musicTransitionFrameId = requestAnimationFrame(animate);
    };

    audioState.musicTransitionFrameId = requestAnimationFrame(animate);
  }

  function getBattleMusicCrossfadeMs(settings) {
    const value = settings?.battleMusicCrossfadeMs;
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 2000;
    }
    return Math.max(0, value);
  }

  function resolveMusicTrackId(path) {
    const resolved = resolveAssetPath(path);
    if (!resolved) {
      return "";
    }
    try {
      return new URL(resolved, location.href).href.split(/[?#]/)[0];
    } catch {
      return resolved;
    }
  }

  function resolveMusicUrl(path) {
    const trackId = resolveMusicTrackId(path);
    if (!trackId) {
      return "";
    }
    if (/^(?:blob:|data:)/i.test(trackId)) {
      return trackId;
    }
    return appendVersionParam(trackId);
  }

  return {
    setup,
    applySettings,
    playClick,
    playMusic,
    startBattleMusic,
    resumeMapMusicAfterBattle,
  };
}

function clampVolume(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return 0;
  }
  return Math.min(1, Math.max(0, numeric));
}
