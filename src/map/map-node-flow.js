export function createMapNodeFlowController(deps) {
  const {
    state,
    elements,
    translate,
    formatText,
    addLog,
    showDialog,
    render,
    scrollAvailableNodesIntoActionZone,
    getEdgeId,
    openBattleModule,
    openMapDialogEvent,
    resolveReward,
    openShop,
    openHeal,
    completeMap,
  } = deps;

  async function activateNode(node) {
    // Node-flow маршрутизирует только тип активности. Сами активности должны
    // завершать node через completeMapNode/коллбэки, когда их UI реально закрыт.
    if (node.eventType === "battle") {
      await openBattleModule(node);
      elements.selectionStatus.textContent = `${node.id} · ${node.eventType}`;
      render();
      return;
    }
    if (node.eventType === "dialog") {
      openMapDialogEvent(node);
      elements.selectionStatus.textContent = `${node.id} · ${node.eventType}`;
      render();
      return;
    }
    // Выбор точки одновременно продвигает игрока по графу и открывает нужный
    // модуль события. selectedPathEdges хранит уже пройденные ребра для зеленой
    // подсветки, availableNodeIds становится списком разрешенных следующих точек.
    if (state.currentNodeId) {
      state.selectedPathEdges.add(getEdgeId(state.currentNodeId, node.id));
    }
    state.currentNodeId = node.id;
    state.completedNodeIds.add(node.id);
    state.availableNodeIds = new Set(node.connectedTo);
    addLog(
      formatText("log.nodeSelected", {
        node: node.id,
        event: node.eventType,
        next: node.connectedTo.length,
      }),
    );

    if (node.eventType === "skip") {
      const message = translate(node.payload.textKey);
      showDialog(message, () => {
        if (!completeMapIfTerminalNode(node)) {
          scrollAvailableNodesIntoActionZone();
        }
      });
      addLog(formatText("log.skipResolved", { node: node.id, message }));
    } else if (node.eventType === "reward") {
      resolveReward(node, { onApplied: () => completeMapIfTerminalNode(node) });
    } else if (node.eventType === "shop") {
      openShop(node, { onClose: () => completeMapIfTerminalNode(node) });
    } else if (node.eventType === "heal") {
      openHeal(node, { onClose: () => completeMapIfTerminalNode(node) });
    } else {
      addLog(`${node.id}: ${node.eventType}`);
    }

    elements.selectionStatus.textContent = `${node.id} · ${node.eventType}`;
    render();
  }

  function completeMapNode(node, eventType = node.eventType, options = {}) {
    // Завершение node - единственное место, где меняются current/completed/
    // available path-состояния для обычных map activities.
    if (state.currentNodeId) {
      state.selectedPathEdges.add(getEdgeId(state.currentNodeId, node.id));
    }
    state.currentNodeId = node.id;
    state.completedNodeIds.add(node.id);
    state.availableNodeIds = new Set(node.connectedTo);
    addLog(
      formatText("log.nodeSelected", {
        node: node.id,
        event: eventType,
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

  function completeMapIfTerminalNode(node) {
    if (!node || node.connectedTo.length > 0) {
      return false;
    }
    if (state.activeLevelUp || state.pendingLevelUps.length > 0) {
      // Финальный node может выдать опыт. Победный экран карты ждет, пока
      // игрок заберет все level-up награды.
      state.pendingMapCompletion = true;
      return true;
    }
    completeMap();
    return true;
  }

  function completePendingMapIfReady() {
    if (!state.pendingMapCompletion || state.activeLevelUp || state.pendingLevelUps.length > 0) {
      return false;
    }
    state.pendingMapCompletion = false;
    completeMap();
    return true;
  }

  return {
    activateNode,
    completeMapNode,
    completeMapIfTerminalNode,
    completePendingMapIfReady,
  };
}
