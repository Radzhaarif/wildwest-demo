export function createMapDomAdapter(deps) {
  const {
    state,
    elements,
    tooltipClassName,
  } = deps;

  // Это единственный src/map/* модуль, которому разрешено искать DOM сам.
  // Остальные map-контроллеры получают готовые elements/callbacks через deps.
  function getMapUiOverlayFrames() {
    return [...document.querySelectorAll(".map-ui-overlay-frame")];
  }

  function getAvailableNodeElements() {
    return [...state.availableNodeIds]
      .map((nodeId) => elements.mapBoard.querySelector(`[data-node-id="${nodeId}"]`))
      .filter(Boolean);
  }

  function isBattleOverlayOpen() {
    return Boolean(document.querySelector(".battle-scaffold-overlay"));
  }

  function getMapItemTooltip() {
    return document.querySelector(`.${tooltipClassName}`);
  }

  function ensureMapItemTooltip() {
    const existingTooltip = getMapItemTooltip();
    if (existingTooltip) {
      return existingTooltip;
    }

    const tooltip = document.createElement("div");
    tooltip.className = tooltipClassName;
    tooltip.setAttribute("role", "status");

    const title = document.createElement("strong");
    const descriptionLine = document.createElement("p");
    tooltip.append(title, descriptionLine);
    document.body.append(tooltip);
    return tooltip;
  }

  return {
    getMapUiOverlayFrames,
    getAvailableNodeElements,
    isBattleOverlayOpen,
    getMapItemTooltip,
    ensureMapItemTooltip,
  };
}
