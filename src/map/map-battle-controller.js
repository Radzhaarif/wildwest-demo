export function createMapBattleController(deps) {
  const {
    state,
    elements,
    dataRoot,
    battleContractVersion,
    loadJsonc,
    importBattleModule,
    exposeMapDebug,
    toProjectUrl,
    deriveDebugSeed,
    formatText,
    addLog,
    showDialog,
    showSettingsPanel,
    showSurrenderDialog,
    addLanguageChangeListener,
    startBattleMusic,
    resumeMapMusicAfterBattle,
    stopMapAnimations,
    createBattleCheatState,
    normalizePlayerHealthByInventory,
    getEdgeId,
    render,
    scrollAvailableNodesIntoActionZone,
    resolveReward,
    completeMapIfTerminalNode,
  } = deps;

  async function openBattleModule(node) {
    // Карта передает бой через BattleRequest и ждет BattleResult. Внутреннее
    // состояние боя не должно протекать обратно, кроме result.playerState/log.
    stopMapAnimations();
    try {
      const battleSeed = createBattleSeedInfo(node);
      const battleSeedMessage = formatText("log.battleSeed", {
        name: battleSeed.name,
        seed: battleSeed.seed,
      });
      addLog(battleSeedMessage);
      const request = createBattleRequest(node, battleSeed);
      exposeMapDebug({
        state,
        lastBattleRequest: request,
      });
      const { startBattle } = await importBattleModule();
      const result = await startBattle(request, {
        root: elements.gameOrientationRoot || document.body,
        loaders: { loadJsonc },
        callbacks: {
          onOpenSettings: () => {
            showSettingsPanel("map");
            return elements.settingsOverlay;
          },
          onLanguageChange: addLanguageChangeListener,
          onBattleStart: ({ enemyConfig }) => {
            if (!state.settings?.audio) {
              return;
            }
            startBattleMusic(enemyConfig?.battle_music);
          },
          onBattleEnd: () => {
            resumeMapMusicAfterBattle();
          },
          onSurrender: (callbacks) => {
            showSurrenderDialog(callbacks);
            return elements.surrenderOverlay;
          },
        },
      });
      for (const message of result.logMessages) {
        if (message === battleSeedMessage) {
          continue;
        }
        addLog(message);
      }
      addLog(`${node.id}: battle module returned ${result.outcome}`);
      if (result.outcome === "victory") {
        openBattleRewardAfterVictory(node, result);
      }
    } catch (error) {
      console.error(error);
      showDialog(error.message);
    }
  }

  function openBattleRewardAfterVictory(node, result) {
    // После победы сначала принимаем playerState из боя, затем показываем
    // battle reward. Сам battle node завершается только после claim награды.
    state.playerState = result.playerState;
    normalizePlayerHealthByInventory(state.playerState);
    if (!result.reward || !Array.isArray(result.reward.rewards) || result.reward.rewards.length === 0) {
      completeBattleNodeAfterVictory(node, result);
      return;
    }

    resolveReward(node, {
      payload: result.reward,
      source: "battle-victory",
      eventImage: result.reward.eventImage || node.payload.background,
      dialogTextKey: result.reward.dialogTextKey,
      onApplied: () => completeBattleNodeAfterVictory(node, result, { keepCurrentPlayerState: true, scrollToNext: false }),
    });
  }

  function completeBattleNodeAfterVictory(node, result, options = {}) {
    if (state.currentNodeId) {
      state.selectedPathEdges.add(getEdgeId(state.currentNodeId, node.id));
    }
    state.currentNodeId = node.id;
    state.completedNodeIds.add(node.id);
    state.availableNodeIds = new Set(node.connectedTo);
    if (!options.keepCurrentPlayerState) {
      state.playerState = result.playerState;
      normalizePlayerHealthByInventory(state.playerState);
    }
    addLog(
      formatText("log.nodeSelected", {
        node: node.id,
        event: node.eventType,
        next: node.connectedTo.length,
      }),
    );
    render();
    if (completeMapIfTerminalNode(node)) {
      return;
    }
    if (options.scrollToNext !== false) {
      scrollAvailableNodesIntoActionZone();
    }
  }

  function createBattleRequest(node, battleSeed) {
    return {
      contractVersion: battleContractVersion,
      nodeId: node.id,
      nodeType: node.eventType,
      enemyId: node.payload.enemyId,
      enemyConfigUrl: toProjectUrl(battleSeed.enemyConfigPath),
      background: node.payload.background,
      playerState: state.playerState,
      itemCatalog: state.itemCatalog,
      locale: state.locale,
      settings: state.settings,
      language: state.language,
      cheats: createBattleCheatState(),
      seed: battleSeed.seed,
      seedName: battleSeed.name,
    };
  }

  function createBattleSeedInfo(node) {
    // Attempt входит в seed-name: повтор одного боя в том же забеге получает
    // новый seed, но остается воспроизводимым внутри runSeed.
    const mapId = state.mapConfig?.id || state.campaign?.maps?.[state.campaignIndex]?.mapId || "map";
    const enemyConfigPath = getBattleEnemyConfigPath(node.payload.enemyId);
    const key = `${mapId}:${node.id}:${enemyConfigPath}`;
    const attempt = (state.battleAttemptCounts.get(key) || 0) + 1;
    state.battleAttemptCounts.set(key, attempt);
    const name = `battle:${mapId}:${node.id}:${enemyConfigPath}:${attempt}`;
    return {
      name,
      enemyConfigPath,
      seed: deriveDebugSeed(state.runSeed, name),
    };
  }

  function getBattleEnemyConfigPath(enemyId) {
    return `${dataRoot.replace(/^\.\//, "")}/enemy/${enemyId || "unknown"}.jsonc`;
  }

  return {
    openBattleModule,
    createBattleRequest,
    createBattleSeedInfo,
  };
}
