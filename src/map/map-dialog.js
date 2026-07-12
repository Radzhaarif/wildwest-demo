export function createMapDialogController(deps) {
  const {
    state,
    elements,
    translate,
    formatText,
    getPositiveNumber,
    setEventImage,
    getMapEventCatalog,
    pickEventPayload,
    createDebugSeed,
    createSeededRandom,
    deriveDebugSeed,
    openBattleModule,
    resolveReward,
    openShop,
    openHeal,
    showDialog,
    completeMapNode,
    addLog,
  } = deps;

  function openMapDialogEvent(node) {
    state.activeDialogNode = node;
    state.activeDialogStepId = getInitialDialogStepId(node.payload);
    applyMapDialogUiSettings(node.payload);
    renderMapDialogStep();
    elements.mapDialogOverlay.classList.remove("hidden");
    addLog(formatText("log.dialogOpened", { node: node.id }));
  }

  function getInitialDialogStepId(payload) {
    if (payload?.initialStepId) {
      return payload.initialStepId;
    }
    const firstStep = Array.isArray(payload?.steps) ? payload.steps[0] : null;
    return firstStep?.stepId || "";
  }

  function applyMapDialogUiSettings(payload = {}) {
    const config = getMapDialogUiConfig();
    elements.mapDialogOverlay.style.setProperty("--map-dialog-backdrop-opacity", String(config.backdropOpacity));
    elements.mapDialogOverlay.style.setProperty("--map-dialog-backdrop-blur", `${config.backdropBlurPx}px`);
    elements.mapDialogOverlay.style.setProperty("--map-dialog-answers-fade-ms", `${config.answersFadeMs}ms`);
    if (payload.characterWidthPct !== undefined) {
      elements.mapDialogCharacter.style.setProperty("--map-dialog-character-width", `${getPositiveNumber(payload.characterWidthPct, 72)}%`);
    } else {
      elements.mapDialogCharacter.style.setProperty("--map-dialog-character-width", `${getPositiveNumber(payload.characterWidthPx, 420)}px`);
    }
    elements.mapDialogCharacter.style.setProperty("--map-dialog-character-bottom", `${getPositiveNumber(payload.characterBottomPx, 150)}px`);
    elements.mapDialogCharacter.style.setProperty("--map-dialog-character-left", `${getPositiveNumber(payload.characterCenterXPct, 50)}%`);
    elements.mapDialogCharacter.style.setProperty("--map-dialog-character-top", `${getPositiveNumber(payload.characterCenterYPct, 50)}%`);
    elements.mapDialogCharacter.classList.toggle("map-dialog-character--centered-y", payload.characterCenterYPct !== undefined);
    setEventImage(elements.mapDialogCharacter, payload.characterImage, translate(payload.characterNameTextKey || "sweety.name"));
  }

  function getMapDialogUiConfig() {
    const dialog = state.mapUiConfig?.dialog || {};
    return {
      backdropOpacity: getPositiveNumber(dialog.backdropOpacity, 0.72),
      backdropBlurPx: getPositiveNumber(dialog.backdropBlurPx, 5),
      textLetterMs: getPositiveNumber(dialog.textLetterMs, 100),
      answersFadeMs: getPositiveNumber(dialog.answersFadeMs, 1000),
    };
  }

  function renderMapDialogStep() {
    const node = state.activeDialogNode;
    const step = getDialogStep(node?.payload, state.activeDialogStepId);
    if (!node || !step) {
      finishMapDialogNode();
      return;
    }

    startMapDialogTextTyping(translate(step.textKey));
    elements.mapDialogAnswers.innerHTML = "";
    elements.mapDialogAnswers.classList.remove("is-visible");
    for (const answer of step.answers || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = translate(answer.textKey);
      if (answer.eventName) {
        button.dataset.dialogEventName = answer.eventName;
      }
      if (answer.nextStepId) {
        button.dataset.dialogNextStepId = answer.nextStepId;
      }
      if (answer.end === true) {
        button.dataset.dialogEnd = "true";
      }
      button.addEventListener("click", () => handleMapDialogAnswer(answer));
      elements.mapDialogAnswers.append(button);
    }
  }

  function startMapDialogTextTyping(text) {
    clearMapDialogTextTimer();
    state.activeDialogFullText = text || "";
    state.activeDialogVisibleTextLength = 0;
    state.isDialogTextTyping = state.activeDialogFullText.length > 0;
    elements.mapDialogText.textContent = "";
    if (!state.isDialogTextTyping) {
      showMapDialogAnswers();
      return;
    }
    scheduleNextMapDialogLetter();
  }

  function scheduleNextMapDialogLetter() {
    const { textLetterMs } = getMapDialogUiConfig();
    state.activeDialogTextTimerId = window.setTimeout(() => {
      state.activeDialogVisibleTextLength += 1;
      elements.mapDialogText.textContent = state.activeDialogFullText.slice(0, state.activeDialogVisibleTextLength);
      if (state.activeDialogVisibleTextLength >= state.activeDialogFullText.length) {
        state.isDialogTextTyping = false;
        state.activeDialogTextTimerId = null;
        showMapDialogAnswers();
        return;
      }
      scheduleNextMapDialogLetter();
    }, textLetterMs);
  }

  function completeMapDialogTextTyping() {
    clearMapDialogTextTimer();
    elements.mapDialogText.textContent = state.activeDialogFullText;
    state.activeDialogVisibleTextLength = state.activeDialogFullText.length;
    state.isDialogTextTyping = false;
    showMapDialogAnswers();
  }

  function showMapDialogAnswers() {
    if (!state.activeDialogNode) {
      return;
    }
    requestAnimationFrame(() => {
      if (!state.activeDialogNode) {
        return;
      }
      elements.mapDialogAnswers.classList.add("is-visible");
    });
  }

  function clearMapDialogTextTimer() {
    if (state.activeDialogTextTimerId !== null) {
      window.clearTimeout(state.activeDialogTextTimerId);
      state.activeDialogTextTimerId = null;
    }
  }

  function getDialogStep(payload, stepId) {
    const steps = Array.isArray(payload?.steps) ? payload.steps : [];
    return steps.find((step) => step.stepId === stepId) || steps[0] || null;
  }

  async function handleMapDialogAnswer(answer) {
    if (!state.activeDialogNode) {
      return;
    }
    if (answer.nextStepId) {
      state.activeDialogStepId = answer.nextStepId;
      renderMapDialogStep();
      return;
    }
    if (answer.eventName) {
      const dialogNode = state.activeDialogNode;
      closeMapDialogOverlay();
      await runDialogLinkedEvent(dialogNode, answer.eventName);
      return;
    }
    finishMapDialogNode();
  }

  async function runDialogLinkedEvent(dialogNode, eventName) {
    // Linked event выполняет чужую активность, но завершает исходный dialog
    // node. Это сохраняет линейный прогресс карты и не создает phantom node.
    const eventConfig = getMapEventCatalog(state.mapConfig).get(eventName);
    if (!eventConfig) {
      showDialog(`Unknown dialog event: ${eventName}`, () => finishMapDialogNode(dialogNode));
      return;
    }
    const linkedNode = {
      ...dialogNode,
      eventName: eventConfig.name,
      eventType: eventConfig.type,
      eventIcon: eventConfig.icon,
      payload: pickEventPayload(
        state.mapConfig,
        eventConfig.name,
        eventConfig.type,
        dialogNode.level,
        createDialogLinkedEventRandom(dialogNode, eventConfig.name),
      ),
    };

    if (linkedNode.eventType === "battle") {
      await openBattleModule(linkedNode);
    } else if (linkedNode.eventType === "reward") {
      resolveReward(linkedNode, {
        onApplied: () => finishMapDialogNode(dialogNode, { scrollToNext: false }),
      });
    } else if (linkedNode.eventType === "shop") {
      openShop(linkedNode, {
        onClose: () => finishMapDialogNode(dialogNode),
      });
    } else if (linkedNode.eventType === "heal") {
      openHeal(linkedNode, {
        onClose: () => finishMapDialogNode(dialogNode),
      });
    } else if (linkedNode.eventType === "skip") {
      const message = translate(linkedNode.payload.textKey);
      showDialog(message, () => finishMapDialogNode(dialogNode));
      addLog(formatText("log.skipResolved", { node: dialogNode.id, message }));
    } else if (linkedNode.eventType === "dialog") {
      openMapDialogEvent(linkedNode);
    } else {
      finishMapDialogNode(dialogNode);
    }
  }

  function createDialogLinkedEventRandom(dialogNode, eventName) {
    // Payload linked event выбирается отдельным stream, чтобы ответы диалога
    // не зависели от декоративных random-вызовов или порядка render().
    const seedSource = state.currentMapSeed?.seed || state.runSeed || createDebugSeed();
    const seedName = `dialog:${dialogNode?.id || "node"}:${eventName}`;
    return createSeededRandom(deriveDebugSeed(seedSource, seedName));
  }

  function finishMapDialogNode(node = state.activeDialogNode, options = {}) {
    closeMapDialogOverlay();
    if (!node || state.completedNodeIds.has(node.id)) {
      return;
    }
    completeMapNode(node, "dialog", options);
    addLog(formatText("log.dialogResolved", { node: node.id }));
  }

  function closeMapDialogOverlay() {
    if (!elements.mapDialogOverlay) {
      return;
    }
    clearMapDialogTextTimer();
    elements.mapDialogOverlay.classList.add("hidden");
    elements.mapDialogAnswers.innerHTML = "";
    elements.mapDialogAnswers.classList.remove("is-visible");
    elements.mapDialogText.textContent = "";
    state.activeDialogNode = null;
    state.activeDialogStepId = null;
    state.activeDialogFullText = "";
    state.activeDialogVisibleTextLength = 0;
    state.isDialogTextTyping = false;
  }

  return {
    openMapDialogEvent,
    completeMapDialogTextTyping,
    closeMapDialogOverlay,
    finishMapDialogNode,
  };
}
