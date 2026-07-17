export function createMapRewardsController(deps) {
  const {
    state,
    elements,
    translate,
    formatText,
    resolveAssetPath,
    seededRandomInt,
    createMapGameplayRandom,
    getPositiveNumber,
    getItemName,
    getItemDescription,
    getItemImagePath,
    getItemBigImagePath,
    getInventoryQuantity,
    attachMapItemTooltip,
    isItemBlockedByInventoryLimit,
    isRewardBlockedByInventoryLimit,
    changeInventoryQuantity,
    addLog,
    render,
    scrollAvailableNodesIntoActionZone,
    completePendingMapIfReady,
  } = deps;
  let rewardAnimationFrameId = null;
  let rewardAnimationToken = 0;

  function resolveReward(node, options = {}) {
    const payload = options.payload || node.payload || {};
    const source = options.source || "map";
    const grantedRewards = pickRewardEntries(payload, createRewardRandom(node, source));
    const grantedItems = grantedRewards.map(createGrantedRewardItem).filter(Boolean);
    const rewardText = getRewardLogText(grantedItems);

    // Награда сначала становится pending: UI показывает, что игрок получит,
    // а инвентарь меняется только после явного claim/close.
    state.pendingReward = {
      nodeId: node.id,
      entries: grantedRewards,
      logText: rewardText,
      levelUpTutorial: options.levelUpTutorial || node.payload?.levelUpTutorial || null,
      onApplied: options.onApplied,
    };
    showRewardOverlay({
      eventImage: options.eventImage || payload.eventImage,
      message: options.message !== undefined
        ? options.message
        : translate(options.dialogTextKey || payload.dialogTextKey),
      rewards: grantedItems,
    });
  }

  function createRewardRandom(node, source) {
    // Источник включен в seed-name, чтобы награда из боя и награда карты
    // не конкурировали за один и тот же deterministic random stream.
    return createMapGameplayRandom(
      "reward",
      source,
      state.campaignIndex + 1,
      node?.id || "node",
      node?.eventName || node?.eventType || "event",
    );
  }

  function pickRewardEntries(payload, random) {
    const rewardRandom = typeof random === "function"
      ? random
      : createMapGameplayRandom("reward", "fallback");
    const rewards = Array.isArray(payload.rewards)
      ? [...payload.rewards]
      : [];
    const count = Math.min(payload.itemCount || rewards.length, rewards.length);
    const selected = [];

    while (selected.length < count && rewards.length > 0) {
      const index = seededRandomInt(0, rewards.length - 1, rewardRandom);
      selected.push(rewards.splice(index, 1)[0]);
    }

    return selected;
  }

  function createGrantedRewardItem(reward) {
    if (reward.type === "gold") {
      const amount = reward.amount || 0;
      return {
        itemId: "gold",
        amount,
        label: `${amount}x ${getItemName("gold")}`,
      };
    }

    if (reward.type === "experience") {
      const amount = reward.amount || 0;
      return {
        itemId: "exp",
        amount,
        label: `${amount}x ${getItemName("exp")}`,
      };
    }

    if (reward.type === "health") {
      const amount = reward.amount || 0;
      return {
        itemId: "health",
        amount,
        label: `${amount}x ${getItemName("health")}`,
      };
    }

    if (reward.type === "item") {
      const amount = reward.amount || 1;
      return {
        itemId: reward.itemId,
        amount,
        isInventoryLimitBlocked: isItemBlockedByInventoryLimit(reward.itemId),
        label: `${amount}x ${getItemName(reward.itemId)}`,
      };
    }

    return null;
  }

  function getRewardLogText(items) {
    const labels = items.map((item) => (
      item.isInventoryLimitBlocked ? `${item.label} ${translate("ui.itemMax")}` : item.label
    ));
    return labels.length > 0 ? labels.join(", ") : "-";
  }

  function applyRewardEntry(reward, levelUpTutorial = null) {
    if (reward.type === "gold") {
      changeInventoryQuantity("gold", reward.amount || 0);
    } else if (reward.type === "experience") {
      addExperience(reward.amount || 0, levelUpTutorial);
    } else if (reward.type === "health") {
      state.playerState.health.current = Math.min(
        state.playerState.health.max,
        state.playerState.health.current + (reward.amount || 0),
      );
    } else if (reward.type === "item") {
      if (isItemBlockedByInventoryLimit(reward.itemId)) {
        return;
      }
      changeInventoryQuantity(reward.itemId, reward.amount || 1);
    }
  }

  function addExperience(amount, levelUpTutorial = null) {
    if (!state.playerState.experience) {
      state.playerState.experience = { level: 1, total: 0 };
    }
    const previousTotal = getExperienceTotal();
    const gainedExperience = Math.max(0, Number(amount) || 0);
    const nextTotal = previousTotal + gainedExperience;
    state.playerState.experience.total = nextTotal;
    state.playerState.experience.level = Math.max(1, getCurrentExperienceLevel(nextTotal).level);
    queueReachedLevelUps(previousTotal, nextTotal, levelUpTutorial);
  }

  function getExperienceTotal() {
    return Math.max(0, Number(state.playerState.experience?.total) || 0);
  }

  function getCurrentExperienceLevel(totalExperience) {
    const levels = Array.isArray(state.experienceTable?.levels) ? state.experienceTable.levels : [];
    return [...levels]
      .reverse()
      .find((level) => level.requiredExperience <= totalExperience) || { level: 1 };
  }

  function queueReachedLevelUps(previousTotal, nextTotal, levelUpTutorial = null) {
    const levels = Array.isArray(state.experienceTable?.levels) ? state.experienceTable.levels : [];
    let queuedTutorial = levelUpTutorial;
    for (const level of levels) {
      if (level.requiredExperience <= previousTotal || level.requiredExperience > nextTotal) {
        continue;
      }
      if (!Array.isArray(level.rewards) || level.rewards.length === 0 || level.rewardCount <= 0) {
        continue;
      }
      state.pendingLevelUps.push({ level, tutorial: queuedTutorial });
      queuedTutorial = null;
    }
  }

  function pickLevelRewardOptions(level, tutorial = null) {
    if (tutorial?.enabled === true && Array.isArray(tutorial.rewards)) {
      return tutorial.rewards
        .map((tutorialReward) => {
          const levelReward = level?.rewards?.find((reward) => reward.itemId === tutorialReward.itemId);
          return {
            ...(levelReward || { itemId: tutorialReward.itemId, amount: 1 }),
            tutorialTextKey: tutorialReward.textKey,
          };
        })
        .filter((reward) => !isRewardBlockedByInventoryLimit(reward));
    }

    // Level-up выбор фиксируется при открытии оверлея. Повторный render не
    // должен менять варианты, иначе один и тот же seed перестанет быть честным.
    const rewardRandom = createLevelRewardRandom(level);
    const rewards = Array.isArray(level?.rewards)
      ? level.rewards.filter((reward) => !isRewardBlockedByInventoryLimit(reward))
      : [];
    const count = Math.min(level.rewardCount || rewards.length, rewards.length);
    const selected = [];

    while (selected.length < count && rewards.length > 0) {
      const totalWeight = rewards.reduce((sum, reward) => sum + getLevelRewardEffectiveWeight(reward), 0);
      let roll = rewardRandom() * totalWeight;
      let selectedIndex = 0;

      if (totalWeight <= 0) {
        selectedIndex = seededRandomInt(0, rewards.length - 1, rewardRandom);
      } else {
        for (let index = 0; index < rewards.length; index += 1) {
          roll -= getLevelRewardEffectiveWeight(rewards[index]);
          if (roll <= 0) {
            selectedIndex = index;
            break;
          }
        }
      }

      selected.push(rewards.splice(selectedIndex, 1)[0]);
    }

    return selected;
  }

  function createLevelRewardRandom(level) {
    return createMapGameplayRandom(
      "level-up",
      state.campaignIndex + 1,
      level?.level ?? "level",
      level?.requiredExperience ?? "experience",
    );
  }

  function getLevelRewardEffectiveWeight(reward) {
    const baseWeight = Math.max(0, Number(reward?.weight) || 0);
    if (baseWeight <= 0 || !reward?.itemId) {
      return 0;
    }
    const reductionPercent = getLevelRewardInventoryWeightReductionPercent();
    if (reductionPercent <= 0) {
      return Math.ceil(baseWeight);
    }
    const quantity = Math.max(0, Number(getInventoryQuantity(reward.itemId)) || 0);
    const multiplier = Math.max(0, 1 - (quantity * reductionPercent) / 100);
    return Math.ceil(baseWeight * multiplier);
  }

  function getLevelRewardInventoryWeightReductionPercent() {
    const configured = Number(state.experienceTable?.rewardWeightReductionPercentPerInventoryItem);
    return Number.isFinite(configured) ? Math.max(0, configured) : 0;
  }

  function applyLevelReward(reward) {
    if (!reward) {
      return;
    }
    changeInventoryQuantity(reward.itemId, reward.amount || 1);
  }

  function showRewardOverlay({ eventImage, message, rewards }) {
    state.activeLevelUp = null;
    const animation = applyRewardAnimationSettings();
    elements.rewardBackdrop.style.backgroundImage = `url("${resolveAssetPath(eventImage)}")`;
    elements.rewardItems.innerHTML = "";
    for (const [index, reward] of rewards.entries()) {
      elements.rewardItems.append(createRewardItem(reward, index));
    }
    elements.rewardDialogText.textContent = message;
    elements.rewardClaimButton.textContent = translate("ui.claimReward");
    elements.rewardClaimButton.disabled = false;
    elements.rewardOverlay.classList.remove("reward-overlay--choice");
    elements.rewardOverlay.classList.remove("reward-overlay--tutorial-level-up");
    elements.rewardOverlay.classList.remove("reward-overlay--tutorial-ready");
    elements.rewardOverlay.classList.remove("hidden");
    startRewardAnimation(animation);
  }

  function showNextLevelUpReward(options = {}) {
    while (state.pendingLevelUps.length > 0) {
      const pendingLevelUp = state.pendingLevelUps.shift();
      const level = typeof pendingLevelUp?.level === "object" ? pendingLevelUp.level : pendingLevelUp;
      const tutorial = typeof pendingLevelUp?.level === "object" ? pendingLevelUp.tutorial : null;
      const rewards = pickLevelRewardOptions(level, tutorial);
      if (rewards.length === 0) {
        continue;
      }

      state.activeLevelUp = {
        level,
        rewards,
        selectedIndex: null,
        tutorial: tutorial?.enabled === true
          ? { config: tutorial, inspectedIndices: new Set() }
          : null,
        scrollToNext: options.scrollToNext !== false,
      };
      const animation = applyRewardAnimationSettings();
      elements.rewardBackdrop.style.backgroundImage = `url("${resolveAssetPath(level.eventImage)}")`;
      elements.rewardItems.innerHTML = "";
      for (const [index, reward] of rewards.entries()) {
        elements.rewardItems.append(createRewardItem(
          {
            itemId: reward.itemId,
            amount: reward.amount || 1,
          },
          index,
          { selectable: true },
        ));
      }
      elements.rewardDialogText.textContent = translate(tutorial?.introTextKey || level.textKey);
      elements.rewardClaimButton.textContent = translate(
        tutorial?.enabled === true ? "ui.inspectLevelRewards" : "ui.claimReward",
      );
      elements.rewardClaimButton.disabled = true;
      elements.rewardOverlay.classList.add("reward-overlay--choice");
      elements.rewardOverlay.classList.toggle("reward-overlay--tutorial-level-up", tutorial?.enabled === true);
      elements.rewardOverlay.classList.remove("reward-overlay--tutorial-ready");
      elements.rewardOverlay.classList.remove("hidden");
      startRewardAnimation(animation);
      return true;
    }

    return false;
  }

  function createRewardItem(reward, index, options = {}) {
    const animation = getRewardAnimationSettings();
    const item = document.createElement(options.selectable ? "button" : "article");
    const isInventoryLimitBlocked =
      reward.isInventoryLimitBlocked === true || isItemBlockedByInventoryLimit(reward.itemId);
    item.className = "reward-item";
    item.dataset.itemId = reward.itemId || "";
    item.dataset.itemAmount = String(reward.amount || 0);
    if (isInventoryLimitBlocked) {
      item.classList.add("reward-item--maxed");
      item.dataset.inventoryLimitBlocked = "true";
    }
    if (options.selectable) {
      item.type = "button";
      item.classList.add("reward-item--choice");
      item.dataset.rewardIndex = String(index);
      item.setAttribute("aria-pressed", "false");
      item.disabled = isInventoryLimitBlocked;
      item.addEventListener("click", () => selectLevelReward(index));
    }
    item.style.setProperty("--reward-delay-ms", `${animation.iconDelayMs + index * animation.iconStaggerMs}ms`);

    const image = document.createElement("img");
    image.src = getItemBigImagePath(reward.itemId) || getItemImagePath(reward.itemId);
    image.alt = getItemName(reward.itemId);

    const name = document.createElement("strong");
    name.textContent = getItemName(reward.itemId);

    const amount = document.createElement("span");
    amount.textContent = `x${reward.amount}`;

    const maxBadge = document.createElement("b");
    maxBadge.className = "item-max-badge";
    maxBadge.textContent = translate("ui.itemMax");

    attachMapItemTooltip(item, {
      name: getItemName(reward.itemId),
      description: getItemDescription(reward.itemId),
      icon: getItemImagePath(reward.itemId),
    });
    item.append(image);
    if (isInventoryLimitBlocked) {
      item.append(maxBadge);
    }
    item.append(name, amount);
    return item;
  }

  function selectLevelReward(index) {
    if (!state.activeLevelUp || !state.activeLevelUp.rewards[index]) {
      return;
    }
    const tutorial = state.activeLevelUp.tutorial;
    const tutorialWasReady = tutorial
      && tutorial.inspectedIndices.size >= state.activeLevelUp.rewards.length;
    if (tutorial) {
      tutorial.inspectedIndices.add(index);
      elements.rewardDialogText.textContent = translate(
        state.activeLevelUp.rewards[index].tutorialTextKey,
      );
      updateLevelUpTutorialState();
      if (!tutorialWasReady) {
        return;
      }
    }
    state.activeLevelUp.selectedIndex = index;
    [...elements.rewardItems.children]
      .filter((item) => item.classList?.contains("reward-item--choice"))
      .forEach((item) => {
      const isSelected = Number(item.dataset.rewardIndex) === index;
      item.classList.toggle("is-selected", isSelected);
      item.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
    elements.rewardClaimButton.textContent = translate("ui.claimReward");
    elements.rewardClaimButton.disabled = false;
  }

  function updateLevelUpTutorialState() {
    const activeLevelUp = state.activeLevelUp;
    const tutorial = activeLevelUp?.tutorial;
    if (!tutorial) {
      return;
    }
    [...elements.rewardItems.children]
      .filter((item) => item.classList?.contains("reward-item--choice"))
      .forEach((item) => {
        item.classList.toggle(
          "is-inspected",
          tutorial.inspectedIndices.has(Number(item.dataset.rewardIndex)),
        );
      });
    const isReady = tutorial.inspectedIndices.size >= activeLevelUp.rewards.length;
    elements.rewardOverlay.classList.toggle("reward-overlay--tutorial-ready", isReady);
    elements.rewardClaimButton.textContent = translate(
      isReady ? "ui.chooseLevelReward" : "ui.inspectLevelRewards",
    );
  }

  function applyRewardAnimationSettings() {
    const animation = getRewardAnimationSettings();
    elements.rewardOverlay.style.setProperty("--reward-clear-ms", `${animation.clearMs}ms`);
    elements.rewardOverlay.style.setProperty("--reward-blur-ms", `${animation.blurMs}ms`);
    elements.rewardOverlay.style.setProperty("--reward-icon-zoom-ms", `${animation.iconZoomMs}ms`);
    return animation;
  }

  function getRewardAnimationSettings() {
    const defaults = state.defaultSettings?.rewardAnimationMs || {};
    const settings = state.settings?.rewardAnimationMs || {};
    return {
      clearMs: getPositiveNumber(settings.clearMs, defaults.clearMs || 1000),
      blurMs: getPositiveNumber(settings.blurMs, defaults.blurMs || 2000),
      iconDelayMs: getPositiveNumber(settings.iconDelayMs, defaults.iconDelayMs || 1000),
      iconZoomMs: getPositiveNumber(settings.iconZoomMs, defaults.iconZoomMs || 4000),
      iconStaggerMs: getPositiveNumber(settings.iconStaggerMs, defaults.iconStaggerMs || 160),
    };
  }

  function startRewardAnimation(animation) {
    cancelRewardAnimation();
    const animationToken = rewardAnimationToken;
    const rewardWindow = elements.rewardOverlay.querySelector(".reward-window");
    const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches === true;
    const itemPlans = [...elements.rewardItems.children].map((item, index) => ({
      item,
      image: item.querySelector("img"),
      startMs: animation.iconDelayMs + (index * animation.iconStaggerMs),
    }));
    const totalDurationMs = Math.max(
      360,
      animation.clearMs + animation.blurMs,
      ...itemPlans.map((plan) => plan.startMs + animation.iconZoomMs + 360),
    );
    const renderFrame = (elapsedMs) => {
      const windowProgress = easeOutCubic(getTimelineProgress(elapsedMs, 0, 360));
      rewardWindow.style.opacity = String(windowProgress);
      rewardWindow.style.transform = [
        `translate(-50%, calc(-50% + ${18 * (1 - windowProgress)}px))`,
        `scale(${0.96 + (0.04 * windowProgress)})`,
      ].join(" ");

      const backdropProgress = easeInOutQuad(
        getTimelineProgress(elapsedMs, animation.clearMs, animation.blurMs),
      );
      const blurPx = coarsePointer ? 0 : 12 * backdropProgress;
      const brightness = coarsePointer ? 0.45 : 0.96 - (0.51 * backdropProgress);
      const saturation = coarsePointer ? 0.82 : 1.08 - (0.26 * backdropProgress);
      elements.rewardBackdrop.style.filter = [
        `blur(${blurPx}px)`,
        `brightness(${brightness})`,
        `saturate(${saturation})`,
      ].join(" ");
      elements.rewardBackdrop.style.transform = `scale(${1 + (0.06 * backdropProgress)})`;

      for (const plan of itemPlans) {
        const iconProgress = getTimelineProgress(
          elapsedMs,
          plan.startMs,
          animation.iconZoomMs,
        );
        if (plan.image) {
          plan.image.style.opacity = String(Math.min(1, iconProgress / 0.08));
          plan.image.style.transform = `scale(${0.16 + (0.84 * iconProgress)})`;
        }
        const infoProgress = easeOutCubic(getTimelineProgress(
          elapsedMs,
          plan.startMs + animation.iconZoomMs,
          360,
        ));
        plan.item.style.setProperty("--reward-info-opacity", String(infoProgress));
        plan.item.style.setProperty("--reward-info-y", `${8 * (1 - infoProgress)}px`);
      }
    };

    rewardWindow.style.willChange = "transform, opacity";
    elements.rewardBackdrop.style.willChange = "transform, filter";
    for (const plan of itemPlans) {
      if (plan.image) {
        plan.image.style.willChange = "transform, opacity";
      }
    }
    elements.rewardOverlay.dataset.frameAnimation = "running";
    renderFrame(0);

    let startTimestamp = null;
    const runFrame = (timestamp) => {
      if (
        animationToken !== rewardAnimationToken
        || elements.rewardOverlay.classList.contains("hidden")
      ) {
        return;
      }
      if (startTimestamp === null) {
        startTimestamp = timestamp;
      }
      const elapsedMs = Math.min(totalDurationMs, timestamp - startTimestamp);
      renderFrame(elapsedMs);
      if (elapsedMs < totalDurationMs) {
        rewardAnimationFrameId = window.requestAnimationFrame(runFrame);
        return;
      }

      rewardAnimationFrameId = window.requestAnimationFrame(() => {
        if (animationToken !== rewardAnimationToken) {
          return;
        }
        rewardAnimationFrameId = null;
        rewardWindow.style.removeProperty("will-change");
        elements.rewardBackdrop.style.removeProperty("will-change");
        for (const plan of itemPlans) {
          plan.image?.style.removeProperty("will-change");
        }
        elements.rewardOverlay.dataset.frameAnimation = "complete";
      });
    };
    rewardAnimationFrameId = window.requestAnimationFrame(runFrame);
  }

  function cancelRewardAnimation() {
    rewardAnimationToken += 1;
    if (rewardAnimationFrameId !== null) {
      window.cancelAnimationFrame(rewardAnimationFrameId);
      rewardAnimationFrameId = null;
    }
    delete elements.rewardOverlay.dataset.frameAnimation;
  }

  function getTimelineProgress(elapsedMs, startMs, durationMs) {
    if (elapsedMs <= startMs) {
      return 0;
    }
    if (durationMs <= 0) {
      return 1;
    }
    return Math.min(1, (elapsedMs - startMs) / durationMs);
  }

  function easeOutCubic(progress) {
    return 1 - ((1 - progress) ** 3);
  }

  function easeInOutQuad(progress) {
    return progress < 0.5
      ? 2 * progress * progress
      : 1 - (((-2 * progress) + 2) ** 2) / 2;
  }

  function handleRewardClaim() {
    if (state.activeLevelUp) {
      claimSelectedLevelReward();
      return;
    }
    closeReward();
  }

  function claimSelectedLevelReward() {
    if (!state.activeLevelUp) {
      return;
    }
    const selectedReward = state.activeLevelUp.rewards[state.activeLevelUp.selectedIndex];
    if (!selectedReward) {
      return;
    }

    const scrollToNext = state.activeLevelUp.scrollToNext !== false;
    applyLevelReward(selectedReward);
    state.activeLevelUp = null;
    hideRewardOverlay();
    render();

    if (showNextLevelUpReward({ scrollToNext })) {
      return;
    }
    if (completePendingMapIfReady()) {
      return;
    }
    if (scrollToNext) {
      scrollAvailableNodesIntoActionZone();
    }
  }

  function closeReward(options = {}) {
    if (!elements.rewardOverlay) {
      return;
    }
    if (state.activeLevelUp) {
      state.activeLevelUp = null;
      state.pendingLevelUps = [];
    }
    const scrollToNext = options.scrollToNext !== false;
    hideRewardOverlay();
    // Порядок важен: сначала применяем текущую награду, затем показываем
    // queued level-up, и только после пустой очереди завершаем карту.
    applyPendingReward();
    if (showNextLevelUpReward({ scrollToNext })) {
      return;
    }
    if (completePendingMapIfReady()) {
      return;
    }
    if (scrollToNext) {
      scrollAvailableNodesIntoActionZone();
    }
  }

  function hideRewardOverlay() {
    cancelRewardAnimation();
    elements.rewardOverlay.classList.add("hidden");
    elements.rewardOverlay.classList.remove("reward-overlay--choice");
    elements.rewardOverlay.classList.remove("reward-overlay--tutorial-level-up");
    elements.rewardOverlay.classList.remove("reward-overlay--tutorial-ready");
    elements.rewardItems.innerHTML = "";
    const rewardWindow = elements.rewardOverlay.querySelector(".reward-window");
    rewardWindow.style.removeProperty("opacity");
    rewardWindow.style.removeProperty("transform");
    rewardWindow.style.removeProperty("will-change");
    elements.rewardBackdrop.style.backgroundImage = "";
    elements.rewardBackdrop.style.removeProperty("filter");
    elements.rewardBackdrop.style.removeProperty("transform");
    elements.rewardBackdrop.style.removeProperty("will-change");
    elements.rewardDialogText.textContent = "";
    elements.rewardClaimButton.disabled = false;
  }

  function applyPendingReward() {
    if (!state.pendingReward) {
      return;
    }

    for (const reward of state.pendingReward.entries) {
      applyRewardEntry(reward, state.pendingReward.levelUpTutorial);
    }
    addLog(
      formatText("log.rewardResolved", {
        node: state.pendingReward.nodeId,
        rewards: state.pendingReward.logText,
      }),
    );
    if (typeof state.pendingReward.onApplied === "function") {
      state.pendingReward.onApplied();
    }
    state.pendingReward = null;
    render();
  }

  function getNextExperienceLevel(totalExperience) {
    const levels = Array.isArray(state.experienceTable?.levels) ? state.experienceTable.levels : [];
    return levels.find((level) => level.requiredExperience > totalExperience) || null;
  }

  return {
    resolveReward,
    handleRewardClaim,
    closeReward,
    hideRewardOverlay,
    showNextLevelUpReward,
    addExperience,
    getExperienceTotal,
    getNextExperienceLevel,
  };
}
