export function createMapRenderer(deps) {
  const {
    state,
    elements,
    dataRoot,
    translate,
    resolveAssetPath,
    toProjectUrl,
    getPositiveNumber,
    getMapHeight,
    getNodePositions,
    getEdgeId,
    ensureMapEffectsLayer,
    activateNode,
  } = deps;

  function renderMap() {
    // Полный перерендер визуального слоя карты: фон, SVG-дороги и кнопки-точки.
    // HUD и анимации остаются у вызывающего кода, потому что завязаны на flow.
    elements.mapBoard.style.backgroundImage = `url("${resolveAssetPath(
      state.mapConfig.mapImage,
    )}")`;
    elements.mapBoard.innerHTML = "";
    ensureMapEffectsLayer();
    elements.mapBoard.style.minHeight = `${getMapHeight()}px`;
    applyMapNodeVisualSettings();

    const nodePositions = getNodePositions();
    renderPaths(nodePositions);
    renderNodes(nodePositions);
  }

  function applyMapNodeVisualSettings() {
    const config = getMapNodeVisualConfig();
    elements.mapBoard.style.setProperty("--map-node-hover-scale", String(config.hoverScale));
    elements.mapBoard.style.setProperty("--map-node-active-light-size", `${config.activeLightSizePx}px`);
    elements.mapBoard.style.setProperty("--map-node-hover-light-size", `${config.hoverLightSizePx}px`);
  }

  function getMapNodeVisualConfig() {
    const source = state.mapUiConfig?.nodes || {};
    return {
      hoverScale: getPositiveNumber(source.hoverScale, 1.5),
      activeLightIcon: source.activeLightIcon || "data/Assets/icons/light_white.png",
      activeLightSizePx: getPositiveNumber(source.activeLightSizePx, 96),
      hoverLightIcon: source.hoverLightIcon || "data/Assets/icons/light_gold.png",
      hoverLightSizePx: getPositiveNumber(source.hoverLightSizePx, 88),
    };
  }

  function renderPaths(positions) {
    // Цвет дороги зависит только от state:
    // completed-path зеленый и никогда не бледнеет;
    // available-path желтый только от текущей точки к доступным следующим;
    // остальные линии остаются бледными.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("path-layer");

    for (const { node, x, y } of positions.values()) {
      for (const targetId of node.connectedTo) {
        const target = positions.get(targetId);
        if (!target) {
          continue;
        }
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", `${x}%`);
        line.setAttribute("y1", `${y}%`);
        line.setAttribute("x2", `${target.x}%`);
        line.setAttribute("y2", `${target.y}%`);
        line.classList.add("path-line");
        if (state.selectedPathEdges.has(getEdgeId(node.id, targetId))) {
          line.classList.add("completed-path");
        } else if (node.id === state.currentNodeId && state.availableNodeIds.has(targetId)) {
          line.classList.add("available-path");
        }
        svg.append(line);
      }
    }

    elements.mapBoard.append(svg);
  }

  function renderNodes(positions) {
    // Точки - это button, а не div: disabled блокирует недоступные переходы.
    // Иконка берется по типу события из data/Assets/icons/<eventType>.png.
    const nodeVisualConfig = getMapNodeVisualConfig();
    for (const { node, x, y } of positions.values()) {
      const isAvailable = state.availableNodeIds.has(node.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = getNodeClassName(node);
      button.dataset.nodeId = node.id;
      button.style.left = `${x}%`;
      button.style.top = `${y}%`;
      button.disabled = !isAvailable;
      button.setAttribute("aria-label", getNodeTitle(node));
      button.addEventListener("click", () => {
        void activateNode(node);
      });

      if (isAvailable && nodeVisualConfig.activeLightIcon) {
        const activeLight = document.createElement("img");
        activeLight.className = "node-active-light";
        activeLight.src = resolveAssetPath(nodeVisualConfig.activeLightIcon);
        activeLight.alt = "";
        activeLight.setAttribute("aria-hidden", "true");
        button.append(activeLight);
      }

      if (isAvailable && nodeVisualConfig.hoverLightIcon) {
        const light = document.createElement("img");
        light.className = "node-hover-light";
        light.src = resolveAssetPath(nodeVisualConfig.hoverLightIcon);
        light.alt = "";
        light.setAttribute("aria-hidden", "true");
        button.append(light);
      }

      const icon = document.createElement("img");
      icon.className = "node-icon";
      icon.src = getNodeIconPath(node);
      icon.alt = node.eventType;
      button.append(icon);
      elements.mapBoard.append(button);
    }
  }

  function getNodeClassName(node) {
    const classes = ["map-node", node.eventType];
    if (node.eventName === "boss") {
      classes.push("boss");
    }
    if (state.availableNodeIds.has(node.id)) {
      classes.push("available");
    } else {
      classes.push("locked");
    }
    if (state.completedNodeIds.has(node.id)) {
      classes.push("completed");
    }
    return classes.join(" ");
  }

  function getNodeIconPath(node) {
    if (node.eventIcon) {
      return resolveAssetPath(toProjectUrl(node.eventIcon));
    }
    return resolveAssetPath(`${dataRoot}/Assets/icons/${node.eventType}.png`);
  }

  function getNodeTitle(node) {
    if (node.payload?.nodeTitleTextKey) {
      return translate(node.payload.nodeTitleTextKey);
    }
    if (node.eventType === "skip") {
      return translate(node.payload.textKey);
    }
    return node.eventType;
  }

  function getNodeDescription(node) {
    const payload = node?.payload || {};
    const keys = [
      node.eventType === "skip" ? payload.textKey : null,
      payload.dialogTextKey,
      payload.nodeTitleTextKey,
    ].filter(Boolean);
    for (const key of keys) {
      const text = translate(key);
      if (text && text !== key) {
        return text;
      }
    }
    return "";
  }

  return {
    renderMap,
    getNodeDescription,
  };
}
