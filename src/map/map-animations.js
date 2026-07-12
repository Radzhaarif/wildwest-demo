export function createMapAnimationController(deps) {
  // Анимации карты декоративные. Их random не участвует в gameplay RNG, чтобы
  // птицы/эффекты не меняли карту, награды, level-up или бой при том же seed.
  const {
    state,
    elements,
    ensureMapEffectsLayer,
    getMapHeight,
    resolveAssetPath,
    randomNumberInRange,
    pickRandomItem,
    getPositiveNumber,
  } = deps;

  const mapAnimationState = {
    active: false,
    rafId: 0,
    lastTime: 0,
    birds: [],
    nextSpawnByType: new Map(),
  };

  function startMapAnimations() {
    ensureMapEffectsLayer();
    if (!shouldRunMapAnimations()) {
      stopMapAnimations();
      return;
    }
    if (mapAnimationState.active) {
      return;
    }

    elements.mapEffects.innerHTML = "";
    mapAnimationState.active = true;
    mapAnimationState.lastTime = performance.now();
    mapAnimationState.birds = [];
    mapAnimationState.nextSpawnByType = createInitialMapAnimationSpawnSchedule(mapAnimationState.lastTime);
    mapAnimationState.rafId = requestAnimationFrame(updateMapAnimations);
  }

  function stopMapAnimations() {
    if (mapAnimationState.rafId) {
      cancelAnimationFrame(mapAnimationState.rafId);
    }
    mapAnimationState.active = false;
    mapAnimationState.rafId = 0;
    mapAnimationState.lastTime = 0;
    mapAnimationState.birds = [];
    mapAnimationState.nextSpawnByType.clear();
    if (elements.mapEffects) {
      elements.mapEffects.innerHTML = "";
    }
  }

  function shouldRunMapAnimations() {
    return Boolean(
      state.hasStartedGame &&
        state.generatedMap &&
        elements.mapEffects &&
        getMapAnimationConfig()?.enabled !== false,
    );
  }

  function createInitialMapAnimationSpawnSchedule(now) {
    const schedule = new Map();
    for (const countConfig of getMapAnimationCountConfigs()) {
      schedule.set(countConfig.type, now);
    }
    return schedule;
  }

  function updateMapAnimations(now) {
    if (!shouldRunMapAnimations()) {
      stopMapAnimations();
      return;
    }

    const deltaMs = Math.max(0, now - mapAnimationState.lastTime);
    mapAnimationState.lastTime = now;
    spawnMapAnimations(now);
    updateMapBirds(now, deltaMs);
    mapAnimationState.rafId = requestAnimationFrame(updateMapAnimations);
  }

  function spawnMapAnimations(now) {
    for (const countConfig of getMapAnimationCountConfigs()) {
      const activeCount = mapAnimationState.birds.filter((bird) => bird.type === countConfig.type).length;
      if (activeCount >= countConfig.maxActive) {
        continue;
      }
      const nextSpawnAt = mapAnimationState.nextSpawnByType.get(countConfig.type) || now;
      if (now < nextSpawnAt) {
        continue;
      }
      if (countConfig.type === "bird") {
        spawnMapBird();
      }
      mapAnimationState.nextSpawnByType.set(
        countConfig.type,
        now + randomNumberInRange(countConfig.spawnIntervalMs),
      );
    }
  }

  function spawnMapBird() {
    const definition = pickRandomItem(getEnabledMapAnimationDefinitions("bird"));
    if (!definition || !elements.mapEffects) {
      return;
    }

    const visibleRect = getVisibleMapAnimationRect();
    if (!visibleRect || visibleRect.width <= 0 || visibleRect.height <= 0) {
      return;
    }

    const size = getPositiveNumber(definition.sizePx, 72);
    const spawnEdge = pickRandomItem(definition.spawnEdges || ["right"]);
    const heading = randomNumberInRange(definition.headingDegrees);
    const radians = (heading * Math.PI) / 180;
    const speed = getPositiveNumber(definition.movementSpeedPxPerSecond, 120);
    const dx = Math.sin(radians) * speed;
    const dy = -Math.cos(radians) * speed;
    const start = getMapAnimationSpawnPoint(spawnEdge, visibleRect, size, { dx, dy });
    const frameIntervalMs = getPositiveNumber(definition.frameIntervalMs, 120);
    const element = document.createElement("img");

    element.className = "map-animation-bird";
    element.src = resolveAssetPath(definition.glideFrame || definition.frames?.[0] || "");
    element.alt = "";
    element.style.setProperty("--map-bird-size", `${size}px`);
    elements.mapEffects.append(element);

    const bird = {
      type: "bird",
      element,
      definition,
      x: start.x,
      y: start.y,
      dx,
      dy,
      heading,
      size,
      phase: "glide",
      nextPhaseAt: performance.now() + randomNumberInRange(definition.glideDurationMs),
      nextFrameAt: 0,
      frameIndex: 0,
      frameIntervalMs,
    };

    positionMapBird(bird);
    mapAnimationState.birds.push(bird);
  }

  function updateMapBirds(now, deltaMs) {
    const mapBounds = getMapAnimationBoundsRect();
    if (!mapBounds) {
      return;
    }
    const liveBirds = [];

    for (const bird of mapAnimationState.birds) {
      bird.x += (bird.dx * deltaMs) / 1000;
      bird.y += (bird.dy * deltaMs) / 1000;
      updateMapBirdFrame(bird, now);
      positionMapBird(bird);

      if (isMapBirdOutOfBounds(bird, mapBounds)) {
        bird.element.remove();
      } else {
        liveBirds.push(bird);
      }
    }

    mapAnimationState.birds = liveBirds;
  }

  function updateMapBirdFrame(bird, now) {
    const frames = Array.isArray(bird.definition.frames) ? bird.definition.frames : [];
    if (frames.length === 0) {
      return;
    }

    if (bird.phase === "glide" && now >= bird.nextPhaseAt) {
      bird.phase = "flap";
      bird.frameIndex = 0;
      bird.nextFrameAt = now;
    }

    if (bird.phase !== "flap" || now < bird.nextFrameAt) {
      return;
    }

    bird.element.src = resolveAssetPath(frames[bird.frameIndex]);
    bird.frameIndex += 1;
    if (bird.frameIndex >= frames.length) {
      bird.phase = "glide";
      bird.element.src = resolveAssetPath(bird.definition.glideFrame || frames[0]);
      bird.nextPhaseAt = now + randomNumberInRange(bird.definition.glideDurationMs);
      return;
    }
    bird.nextFrameAt = now + bird.frameIntervalMs;
  }

  function positionMapBird(bird) {
    const offset = Number(bird.definition.spriteAngleOffsetDegrees);
    const shouldRotateWithHeading = bird.definition.rotateWithHeading === true;
    const rotation = (shouldRotateWithHeading ? bird.heading : 0) + (Number.isFinite(offset) ? offset : 0);
    bird.element.style.transform = `translate(${bird.x}px, ${bird.y}px) translate(-50%, -50%) rotate(${rotation}deg)`;
  }

  function isMapBirdOutOfBounds(bird, rect) {
    const margin = bird.size * 1.5;
    return (
      bird.x < rect.left - margin ||
      bird.x > rect.left + rect.width + margin ||
      bird.y < rect.top - margin ||
      bird.y > rect.top + rect.height + margin
    );
  }

  function getMapAnimationSpawnPoint(edge, rect, size, direction = { dx: 0, dy: 0 }) {
    const margin = size * 0.8;
    if (edge === "left") {
      return {
        x: rect.left - margin,
        y: getMapAnimationCrossingCoordinate(rect.top, rect.height, direction.dy, margin),
      };
    }
    if (edge === "top") {
      return {
        x: getMapAnimationCrossingCoordinate(rect.left, rect.width, direction.dx, margin),
        y: rect.top - margin,
      };
    }
    if (edge === "bottom") {
      return {
        x: getMapAnimationCrossingCoordinate(rect.left, rect.width, direction.dx, margin),
        y: rect.top + rect.height + margin,
      };
    }
    return {
      x: rect.left + rect.width + margin,
      y: getMapAnimationCrossingCoordinate(rect.top, rect.height, direction.dy, margin),
    };
  }

  function getMapAnimationCrossingCoordinate(start, size, velocity, margin) {
    if (velocity > 0) {
      return randomNumberInRange({ min: start - margin, max: start + size * 0.55 });
    }
    if (velocity < 0) {
      return randomNumberInRange({ min: start + size * 0.45, max: start + size + margin });
    }
    return randomNumberInRange({ min: start, max: start + size });
  }

  function getVisibleMapAnimationRect() {
    if (!elements.mapViewport || !elements.mapBoard) {
      return null;
    }
    const viewportRect = elements.mapViewport.getBoundingClientRect();
    const boardRect = elements.mapBoard.getBoundingClientRect();
    return {
      left: viewportRect.left - boardRect.left,
      top: viewportRect.top - boardRect.top,
      width: viewportRect.width,
      height: viewportRect.height,
    };
  }

  function getMapAnimationBoundsRect() {
    if (!elements.mapBoard) {
      return null;
    }
    const width = Math.max(elements.mapBoard.offsetWidth, elements.mapBoard.clientWidth);
    const height = Math.max(elements.mapBoard.offsetHeight, elements.mapBoard.clientHeight, getMapHeight());
    return {
      left: 0,
      top: 0,
      width,
      height,
    };
  }

  function getMapAnimationConfig() {
    return state.mapUiConfig?.animation || null;
  }

  function getMapAnimationCountConfigs() {
    const counts = getMapAnimationConfig()?.counts;
    return Array.isArray(counts) ? counts.filter((entry) => entry.maxActive > 0) : [];
  }

  function getEnabledMapAnimationDefinitions(type) {
    const definitions = getMapAnimationConfig()?.definitions;
    if (!Array.isArray(definitions)) {
      return [];
    }
    return definitions.filter((definition) => definition.type === type && definition.enabled !== false);
  }

  return {
    startMapAnimations,
    stopMapAnimations,
  };
}
