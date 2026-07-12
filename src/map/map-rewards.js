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

  function applyRewardEntry(reward) {
    if (reward.type === "gold") {
      changeInventoryQuantity("gold", reward.amount || 0);
    } else if (reward.type === "experience") {
      addExperience(reward.amount || 0);
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

  function addExperience(amount) {
    if (!state.playerState.experience) {
      state.playerState.experience = { level: 1, total: 0 };
    }
    const previousTotal = getExperienceTotal();
    const gainedExperience = Math.max(0, Number(amount) || 0);
    const nextTotal = previousTotal + gainedExperience;
    state.playerState.experience.total = nextTotal;
    state.playerState.experience.level = Math.max(1, getCurrentExperienceLevel(nextTotal).level);
    queueReachedLevelUps(previousTotal, nextTotal);
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

  function queueReachedLevelUps(previousTotal, nextTotal) {
    const levels = Array.isArray(state.experienceTable?.levels) ? state.experienceTable.levels : [];
    for (const level of levels) {
      if (level.requiredExperience <= previousTotal || level.requiredExperience > nextTotal) {
        continue;
      }
      if (!Array.isArray(level.rewards) || level.rewards.length === 0 || level.rewardCount <= 0) {
        continue;
      }
      state.pendingLevelUps.push(level);
    }
  }

  function pickLevelRewardOptions(level) {
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
    applyRewardAnimationSettings();
    elements.rewardBackdrop.style.backgroundImage = `url("${resolveAssetPath(eventImage)}")`;
    elements.rewardItems.innerHTML = "";
    for (const [index, reward] of rewards.entries()) {
      elements.rewardItems.append(createRewardItem(reward, index));
    }
    elements.rewardDialogText.textContent = message;
    elements.rewardClaimButton.textContent = translate("ui.claimReward");
    elements.rewardClaimButton.disabled = false;
    elements.rewardOverlay.classList.remove("reward-overlay--choice");
    elements.rewardOverlay.classList.remove("hidden");
  }

  function showNextLevelUpReward(options = {}) {
    while (state.pendingLevelUps.length > 0) {
      const level = state.pendingLevelUps.shift();
      const rewards = pickLevelRewardOptions(level);
      if (rewards.length === 0) {
        continue;
      }

      state.activeLevelUp = {
        level,
        rewards,
        selectedIndex: null,
        scrollToNext: options.scrollToNext !== false,
      };
      applyRewardAnimationSettings();
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
      elements.rewardDialogText.textContent = translate(level.textKey);
      elements.rewardClaimButton.textContent = translate("ui.claimReward");
      elements.rewardClaimButton.disabled = true;
      elements.rewardOverlay.classList.add("reward-overlay--choice");
      elements.rewardOverlay.classList.remove("hidden");
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
    state.activeLevelUp.selectedIndex = index;
    [...elements.rewardItems.children]
      .filter((item) => item.classList?.contains("reward-item--choice"))
      .forEach((item) => {
      const isSelected = Number(item.dataset.rewardIndex) === index;
      item.classList.toggle("is-selected", isSelected);
      item.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
    elements.rewardClaimButton.disabled = false;
  }

  function applyRewardAnimationSettings() {
    const animation = getRewardAnimationSettings();
    elements.rewardOverlay.style.setProperty("--reward-clear-ms", `${animation.clearMs}ms`);
    elements.rewardOverlay.style.setProperty("--reward-blur-ms", `${animation.blurMs}ms`);
    elements.rewardOverlay.style.setProperty("--reward-icon-zoom-ms", `${animation.iconZoomMs}ms`);
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
    elements.rewardOverlay.classList.add("hidden");
    elements.rewardOverlay.classList.remove("reward-overlay--choice");
    elements.rewardItems.innerHTML = "";
    elements.rewardBackdrop.style.backgroundImage = "";
    elements.rewardDialogText.textContent = "";
    elements.rewardClaimButton.disabled = false;
  }

  function applyPendingReward() {
    if (!state.pendingReward) {
      return;
    }

    for (const reward of state.pendingReward.entries) {
      applyRewardEntry(reward);
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
