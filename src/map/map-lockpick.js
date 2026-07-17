import {
  applyLockpickAction,
  generateLockpickPuzzle,
  getLockpickActionDeltas,
  hasLockpickDanger,
  isLockpickSolved,
} from "./map-lockpick-engine.js";

const LOCKPICK_MAX_LIVES = 5;
const LOCKPICK_RESERVE_COUNT = LOCKPICK_MAX_LIVES - 1;
const LOCKPICK_RING_SIZE_PCTS = [100, 85, 70, 55, 40];
const LOCKPICK_ROTATION_MS = 200;
const LOCKPICK_BREAK_MS = 500;
const LOCKPICK_RESET_MS = 300;
const LOCKPICK_OPEN_MS = 700;
const DEFAULT_KEY_ITEM_ID = "item_key";

export function createMapLockpickController(deps) {
  const {
    state,
    elements,
    translate,
    formatText,
    resolveAssetPath,
    createMapGameplayRandom,
    getInventoryQuantity,
    changeInventoryQuantity,
    getItemImagePath,
    playSoundEffect,
    addLog,
    render,
  } = deps;

  const timerIds = new Set();
  const animationFrameIds = new Set();

  function openLockpick(node, completion = {}) {
    closeLockpick();
    const puzzle = generateLockpickPuzzle({
      random: createMapGameplayRandom(
        "lockpick",
        state.campaignIndex + 1,
        node?.id || "node",
        node?.eventName || "lockpick",
      ),
    });
    state.activeLockpickNode = node;
    state.activeLockpickCompletion = completion;
    state.activeLockpickSession = {
      puzzle,
      positions: [...puzzle.startPositions],
      visualSteps: [...puzzle.startPositions],
      selectedRingIndex: 0,
      remainingLockpicks: LOCKPICK_MAX_LIVES,
      isAnimating: false,
      isConfirmingLeave: false,
      statusKey: "lockpick.status.ready",
    };

    elements.lockpickBackdrop.style.backgroundImage = `url("${resolveAssetPath(node.payload.eventImage)}")`;
    elements.lockpickPickImage.src = resolveAssetPath(node.payload.lockpickImage);
    elements.lockpickUseKeyImage.src = getItemImagePath(getKeyItemId());
    createRingElements(puzzle);
    clearOverlayStateClasses();
    elements.lockpickOverlay.classList.remove("hidden");
    renderLockpick();
    addLog(formatText("log.lockpickOpened", { node: node.id }));
  }

  function createRingElements(puzzle) {
    elements.lockpickRings.innerHTML = "";
    for (let ringIndex = 0; ringIndex < puzzle.ringCount; ringIndex += 1) {
      const ring = document.createElement("div");
      ring.className = "lockpick-ring";
      ring.dataset.ringIndex = String(ringIndex);
      ring.style.setProperty(
        "--lockpick-ring-size",
        `${LOCKPICK_RING_SIZE_PCTS[ringIndex]}%`,
      );
      ring.style.setProperty(
        "--lockpick-bump-rotation",
        `${puzzle.bumpOffsets[ringIndex] * puzzle.stepDegrees}deg`,
      );

      const surface = document.createElement("span");
      surface.className = "lockpick-ring-surface";
      const gap = document.createElement("span");
      gap.className = "lockpick-ring-gap";
      const bumpAnchor = document.createElement("span");
      bumpAnchor.className = "lockpick-ring-bump-anchor";
      const bump = document.createElement("span");
      bump.className = "lockpick-ring-bump";
      bumpAnchor.append(bump);
      ring.append(surface, gap, bumpAnchor);
      elements.lockpickRings.append(ring);
    }
  }

  function handleRingStageClick(event) {
    const session = state.activeLockpickSession;
    if (!session || session.isAnimating || session.isConfirmingLeave) {
      return;
    }
    const rect = elements.lockpickRings.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
    const normalizedRadius = distance / (Math.min(rect.width, rect.height) / 2);
    if (normalizedRadius > 1) {
      return;
    }
    selectRing(getRingIndexAtRadius(normalizedRadius, session.puzzle.ringCount));
  }

  function getRingIndexAtRadius(normalizedRadius, ringCount) {
    for (let ringIndex = 0; ringIndex < ringCount - 1; ringIndex += 1) {
      const innerBoundary = LOCKPICK_RING_SIZE_PCTS[ringIndex + 1] / 100;
      if (normalizedRadius > innerBoundary) {
        return ringIndex;
      }
    }
    return ringCount - 1;
  }

  function selectAdjacentRing(direction) {
    const session = state.activeLockpickSession;
    if (!session) {
      return;
    }
    selectRing(session.selectedRingIndex + (direction < 0 ? -1 : 1));
  }

  function selectRing(ringIndex) {
    const session = state.activeLockpickSession;
    if (!session || session.isAnimating || session.isConfirmingLeave) {
      return;
    }
    session.selectedRingIndex = Math.max(
      0,
      Math.min(session.puzzle.ringCount - 1, ringIndex),
    );
    session.statusKey = "lockpick.status.selected";
    renderLockpick();
  }

  function handleKeydown(event) {
    if (
      !state.activeLockpickSession
      || event.ctrlKey
      || event.altKey
      || event.metaKey
      || shouldIgnoreKeyTarget(event.target)
    ) {
      return;
    }
    const input = event.code || String(event.key || "").toLowerCase();
    if (input === "KeyW" || input === "w") {
      event.preventDefault();
      selectAdjacentRing(-1);
    } else if (input === "KeyS" || input === "s") {
      event.preventDefault();
      selectAdjacentRing(1);
    } else if (input === "KeyA" || input === "a") {
      event.preventDefault();
      rotateSelectedRing(-1);
    } else if (input === "KeyD" || input === "d") {
      event.preventDefault();
      rotateSelectedRing(1);
    }
  }

  function shouldIgnoreKeyTarget(target) {
    const element = target instanceof Element ? target : null;
    return Boolean(element?.closest("input, select, textarea, [contenteditable='true']"));
  }

  function rotateSelectedRing(direction) {
    const session = state.activeLockpickSession;
    if (!session || session.isAnimating || session.isConfirmingLeave) {
      return;
    }
    const action = {
      master: session.selectedRingIndex,
      direction: direction < 0 ? -1 : 1,
    };
    const deltas = getLockpickActionDeltas(
      session.puzzle.relations,
      action,
      session.puzzle.ringCount,
    );
    session.positions = applyLockpickAction(
      session.positions,
      session.puzzle.relations,
      action,
      session.puzzle.sectorCount,
    );
    const targetVisualSteps = session.visualSteps.map((step, index) => step + deltas[index]);
    session.isAnimating = true;
    session.statusKey = "lockpick.status.moving";
    elements.lockpickOverlay.classList.add("is-moving");
    playConfiguredSound("move");
    renderLockpick();
    animateRingSteps(targetVisualSteps, LOCKPICK_ROTATION_MS, finishRotation);
  }

  function finishRotation() {
    const session = state.activeLockpickSession;
    if (!session) {
      return;
    }
    elements.lockpickOverlay.classList.remove("is-moving");
    if (isLockpickSolved(session.positions)) {
      finishLockpickSuccess({ usedKey: false });
      return;
    }
    if (hasLockpickDanger(
      session.positions,
      session.puzzle.bumpOffsets,
      session.puzzle.sectorCount,
    )) {
      breakLockpick();
      return;
    }
    session.isAnimating = false;
    session.statusKey = "lockpick.status.selected";
    renderLockpick();
  }

  function breakLockpick() {
    const session = state.activeLockpickSession;
    if (!session) {
      return;
    }
    session.remainingLockpicks = Math.max(0, session.remainingLockpicks - 1);
    session.statusKey = session.remainingLockpicks > 0
      ? "lockpick.status.broken"
      : "lockpick.status.failed";
    elements.lockpickOverlay.classList.add("is-breaking");
    playConfiguredSound("break");
    addLog(formatText("log.lockpickBroken", {
      node: state.activeLockpickNode?.id || "-",
      remaining: session.remainingLockpicks,
    }));
    renderLockpick();
    schedule(() => {
      if (!state.activeLockpickSession) {
        return;
      }
      elements.lockpickOverlay.classList.remove("is-breaking");
      if (session.remainingLockpicks <= 0) {
        finishLockpickFailure("broken");
        return;
      }
      resetToStartPosition();
    }, LOCKPICK_BREAK_MS);
  }

  function resetToStartPosition() {
    const session = state.activeLockpickSession;
    if (!session) {
      return;
    }
    session.positions = [...session.puzzle.startPositions];
    const targetVisualSteps = session.visualSteps.map((visualStep, index) => (
      getNearestVisualStep(
        visualStep,
        session.puzzle.startPositions[index],
        session.puzzle.sectorCount,
      )
    ));
    session.statusKey = "lockpick.status.resetting";
    elements.lockpickOverlay.classList.add("is-resetting");
    renderLockpick();
    animateRingSteps(targetVisualSteps, LOCKPICK_RESET_MS, () => {
      if (!state.activeLockpickSession) {
        return;
      }
      elements.lockpickOverlay.classList.remove("is-resetting");
      session.isAnimating = false;
      session.statusKey = "lockpick.status.ready";
      renderLockpick();
    });
  }

  function useKey() {
    const session = state.activeLockpickSession;
    const keyItemId = getKeyItemId();
    if (
      !session
      || session.isAnimating
      || session.isConfirmingLeave
      || getInventoryQuantity(keyItemId) <= 0
    ) {
      return;
    }
    changeInventoryQuantity(keyItemId, -1);
    render();
    addLog(formatText("log.lockpickKeyUsed", {
      node: state.activeLockpickNode?.id || "-",
      remaining: getInventoryQuantity(keyItemId),
    }));
    finishLockpickSuccess({ usedKey: true });
  }

  function finishLockpickSuccess(result) {
    const session = state.activeLockpickSession;
    if (!session || session.isAnimating && elements.lockpickOverlay.classList.contains("is-opening")) {
      return;
    }
    session.isAnimating = true;
    session.statusKey = result.usedKey
      ? "lockpick.status.keyOpening"
      : "lockpick.status.opened";
    elements.lockpickOverlay.classList.remove("is-moving", "is-breaking", "is-resetting");
    elements.lockpickOverlay.classList.add("is-opening");
    playConfiguredSound("open");
    addLog(formatText("log.lockpickSucceeded", {
      node: state.activeLockpickNode?.id || "-",
    }));
    renderLockpick();
    schedule(() => {
      const completion = state.activeLockpickCompletion;
      closeLockpick();
      completion?.onSuccess?.(result);
    }, LOCKPICK_OPEN_MS);
  }

  function requestLeave() {
    const session = state.activeLockpickSession;
    if (!session || session.isAnimating) {
      return;
    }
    session.isConfirmingLeave = true;
    elements.lockpickConfirm.classList.remove("hidden");
    renderLockpick();
  }

  function cancelLeave() {
    const session = state.activeLockpickSession;
    if (!session) {
      return;
    }
    session.isConfirmingLeave = false;
    elements.lockpickConfirm.classList.add("hidden");
    renderLockpick();
  }

  function confirmLeave() {
    if (!state.activeLockpickSession) {
      return;
    }
    finishLockpickFailure("left");
  }

  function finishLockpickFailure(reason) {
    const nodeId = state.activeLockpickNode?.id || "-";
    const completion = state.activeLockpickCompletion;
    addLog(formatText(
      reason === "left" ? "log.lockpickLeft" : "log.lockpickFailed",
      { node: nodeId },
    ));
    closeLockpick();
    completion?.onFailure?.({ reason });
  }

  function closeLockpick() {
    clearTimers();
    clearAnimationFrames();
    clearOverlayStateClasses();
    elements.lockpickOverlay.classList.add("hidden");
    elements.lockpickConfirm.classList.add("hidden");
    elements.lockpickBackdrop.style.backgroundImage = "";
    elements.lockpickRings.innerHTML = "";
    state.activeLockpickNode = null;
    state.activeLockpickSession = null;
    state.activeLockpickCompletion = null;
  }

  function refreshLockpickUi() {
    if (state.activeLockpickSession) {
      renderLockpick();
    }
  }

  function renderLockpick() {
    const session = state.activeLockpickSession;
    if (!session) {
      return;
    }
    elements.lockpickTitle.textContent = translate("lockpick.title");
    elements.lockpickInstructions.textContent = translate("lockpick.instructions");
    elements.lockpickLeaveButton.textContent = translate("lockpick.leave");
    elements.lockpickSelectOuterButton.setAttribute(
      "aria-label",
      translate("lockpick.selectOuter"),
    );
    elements.lockpickSelectInnerButton.setAttribute(
      "aria-label",
      translate("lockpick.selectInner"),
    );
    elements.lockpickRotateCounterclockwiseButton.setAttribute(
      "aria-label",
      translate("lockpick.rotateCounterclockwise"),
    );
    elements.lockpickRotateClockwiseButton.setAttribute(
      "aria-label",
      translate("lockpick.rotateClockwise"),
    );
    elements.lockpickConfirmText.textContent = translate("lockpick.leaveConfirm");
    elements.lockpickConfirmYesButton.textContent = translate("ui.yes");
    elements.lockpickConfirmNoButton.textContent = translate("ui.no");
    elements.lockpickStatus.textContent = session.statusKey === "lockpick.status.selected"
      ? formatText(session.statusKey, { ring: session.selectedRingIndex + 1 })
      : translate(session.statusKey);

    const directRelations = new Map(
      session.puzzle.relations
        .filter((relation) => relation.master === session.selectedRingIndex)
        .map((relation) => [relation.slave, relation.direction]),
    );
    renderRingRotations(session);
    for (const ring of elements.lockpickRings.children) {
      const ringIndex = Number(ring.dataset.ringIndex);
      ring.classList.toggle("is-selected", ringIndex === session.selectedRingIndex);
      ring.classList.toggle("is-same", directRelations.get(ringIndex) === "same");
      ring.classList.toggle("is-opposite", directRelations.get(ringIndex) === "opposite");
      ring.dataset.position = String(session.positions[ringIndex]);
      ring.setAttribute("aria-label", formatText("lockpick.ringLabel", { ring: ringIndex + 1 }));
    }

    renderLockpickLives(session);
    renderKeyButton(session);
    const controlsDisabled = session.isAnimating || session.isConfirmingLeave;
    elements.lockpickSelectOuterButton.disabled =
      controlsDisabled || session.selectedRingIndex === 0;
    elements.lockpickSelectInnerButton.disabled =
      controlsDisabled || session.selectedRingIndex === session.puzzle.ringCount - 1;
    elements.lockpickRotateCounterclockwiseButton.disabled = controlsDisabled;
    elements.lockpickRotateClockwiseButton.disabled = controlsDisabled;
    elements.lockpickLeaveButton.disabled = session.isAnimating;
    elements.lockpickRingStage.classList.toggle("is-disabled", controlsDisabled);
    elements.lockpickRingStage.setAttribute(
      "aria-label",
      formatText("lockpick.selectedRingLabel", { ring: session.selectedRingIndex + 1 }),
    );
  }

  function renderRingRotations(session) {
    for (const ring of elements.lockpickRings.children) {
      const ringIndex = Number(ring.dataset.ringIndex);
      ring.style.setProperty(
        "--lockpick-ring-rotation",
        `${session.visualSteps[ringIndex] * session.puzzle.stepDegrees}deg`,
      );
    }
  }

  function animateRingSteps(targetVisualSteps, durationMs, onComplete) {
    const session = state.activeLockpickSession;
    if (!session) {
      return;
    }
    const startVisualSteps = [...session.visualSteps];
    let startedAt = null;

    function renderFrame(timestamp) {
      if (state.activeLockpickSession !== session) {
        return;
      }
      if (startedAt === null) {
        startedAt = timestamp;
      }
      const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / durationMs));
      const easedProgress = 1 - ((1 - progress) ** 3);
      session.visualSteps = startVisualSteps.map((step, index) => (
        step + (targetVisualSteps[index] - step) * easedProgress
      ));
      renderRingRotations(session);

      if (progress < 1) {
        requestFrame(renderFrame);
        return;
      }

      session.visualSteps = [...targetVisualSteps];
      renderRingRotations(session);
      requestFrame(() => {
        if (state.activeLockpickSession === session) {
          onComplete?.();
        }
      });
    }

    requestFrame(renderFrame);
  }

  function renderLockpickLives(session) {
    elements.lockpickLives.innerHTML = "";
    const imageSrc = resolveAssetPath(state.activeLockpickNode.payload.lockpickImage);
    const reserveCount = Math.min(
      LOCKPICK_RESERVE_COUNT,
      Math.max(0, session.remainingLockpicks - 1),
    );
    for (let index = 0; index < reserveCount; index += 1) {
      const image = document.createElement("img");
      image.src = imageSrc;
      image.alt = "";
      image.className = "lockpick-life";
      elements.lockpickLives.append(image);
    }
    elements.lockpickLives.setAttribute(
      "aria-label",
      formatText("lockpick.livesLabel", { count: reserveCount }),
    );
  }

  function renderKeyButton(session) {
    const keyQuantity = getInventoryQuantity(getKeyItemId());
    elements.lockpickUseKeyButton.disabled =
      session.isAnimating || session.isConfirmingLeave || keyQuantity <= 0;
    elements.lockpickUseKeyText.textContent = formatText("lockpick.useKey", { count: keyQuantity });
  }

  function getKeyItemId() {
    return state.activeLockpickNode?.payload?.keyItemId || DEFAULT_KEY_ITEM_ID;
  }

  function playConfiguredSound(soundId) {
    const soundPath = state.activeLockpickNode?.payload?.sounds?.[soundId];
    if (soundPath) {
      playSoundEffect(soundPath);
    }
  }

  function getNearestVisualStep(currentStep, targetPosition, sectorCount) {
    const currentPosition = ((currentStep % sectorCount) + sectorCount) % sectorCount;
    let difference = targetPosition - currentPosition;
    if (difference > sectorCount / 2) {
      difference -= sectorCount;
    } else if (difference < -sectorCount / 2) {
      difference += sectorCount;
    }
    return currentStep + difference;
  }

  function clearOverlayStateClasses() {
    elements.lockpickOverlay.classList.remove(
      "is-moving",
      "is-breaking",
      "is-resetting",
      "is-opening",
    );
  }

  function schedule(callback, delayMs) {
    const timerId = setTimeout(() => {
      timerIds.delete(timerId);
      callback();
    }, delayMs);
    timerIds.add(timerId);
    return timerId;
  }

  function requestFrame(callback) {
    const frameId = requestAnimationFrame((timestamp) => {
      animationFrameIds.delete(frameId);
      callback(timestamp);
    });
    animationFrameIds.add(frameId);
    return frameId;
  }

  function clearTimers() {
    for (const timerId of timerIds) {
      clearTimeout(timerId);
    }
    timerIds.clear();
  }

  function clearAnimationFrames() {
    for (const frameId of animationFrameIds) {
      cancelAnimationFrame(frameId);
    }
    animationFrameIds.clear();
  }

  return {
    openLockpick,
    closeLockpick,
    refreshLockpickUi,
    handleRingStageClick,
    handleKeydown,
    selectAdjacentRing,
    rotateSelectedRing,
    useKey,
    requestLeave,
    cancelLeave,
    confirmLeave,
  };
}
