const DEFAULT_TOOLTIP_FALLBACK_MS = 3000;

export function createMapTooltipController(deps) {
  const {
    state,
    resolveAssetPath,
    translate,
    renderInlineRichText,
    ensureMapItemTooltip,
    getMapItemTooltip,
    fallbackMs = DEFAULT_TOOLTIP_FALLBACK_MS,
    tooltipClassName = "item-tooltip",
  } = deps;

  let tooltipHideTimeoutId = null;
  let tooltipShowTimeoutId = null;

  function getMapTooltipDelayMs() {
    const settingsValue = Number(state.settings?.battleTooltipDelayMs);
    if (Number.isFinite(settingsValue) && settingsValue >= 0) {
      return settingsValue;
    }
    return fallbackMs;
  }

  function getMapTooltipDurationMs() {
    const settingsValue = Number(state.settings?.battleTooltipMs);
    if (Number.isFinite(settingsValue) && settingsValue >= 0) {
      return settingsValue;
    }
    return fallbackMs;
  }

  function attachMapItemTooltip(element, { name, description, icon }) {
    // Tooltip контент создается лениво, потому что HUD/reward/shop часто
    // перерендеривают элементы. Сами обработчики остаются на свежем DOM node.
    const onContextMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      scheduleMapItemTooltip(event, false);
    };

    const onPointerMove = (event) => {
      const tooltip = ensureMapItemTooltip();
      if (!tooltip.classList.contains("is-visible")) {
        return;
      }
      const tooltipRect = tooltip.getBoundingClientRect();
      const margin = 12;
      const x = Math.max(margin, Math.min(event.clientX + 14, window.innerWidth - tooltipRect.width - margin));
      const y = Math.max(margin, Math.min(event.clientY + 14, window.innerHeight - tooltipRect.height - margin));
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    };

    const onPointerEnter = (event) => {
      scheduleMapItemTooltip(event, false);
    };

    const onPointerLeave = () => {
      clearMapItemTooltipShowTimeout();
      hideMapItemTooltip();
    };

    function setTooltipContent() {
      const tooltip = ensureMapItemTooltip();
      const title = tooltip.firstElementChild;
      const descriptionLine = title?.nextElementSibling;
      if (title) {
        title.textContent = name || "";
      }
      renderInlineRichText(descriptionLine, description || "", {
        itemCatalogById: state.itemCatalogById,
        resolveAssetPath,
        translateTextKey: translate,
      });
    }

    function clearMapItemTooltipShowTimeout() {
      if (tooltipShowTimeoutId) {
        window.clearTimeout(tooltipShowTimeoutId);
        tooltipShowTimeoutId = null;
      }
    }

    function clearMapItemTooltipHideTimeout() {
      if (tooltipHideTimeoutId) {
        window.clearTimeout(tooltipHideTimeoutId);
        tooltipHideTimeoutId = null;
      }
    }

    function hideMapItemTooltip() {
      clearMapItemTooltipHideTimeout();
      const tooltip = getMapItemTooltip();
      if (tooltip) {
        tooltip.classList.remove("is-visible");
      }
    }

    const showMapItemTooltip = (event) => {
      const tooltip = ensureMapItemTooltip();
      setTooltipContent();
      tooltip.className = `${tooltipClassName} is-visible`;
      onPointerMove(event);
      clearMapItemTooltipHideTimeout();
      const hideDelay = getMapTooltipDurationMs();
      if (hideDelay > 0) {
        tooltipHideTimeoutId = window.setTimeout(() => {
          hideMapItemTooltip();
        }, hideDelay);
      }
    };

    const scheduleMapItemTooltip = (event, immediate = false) => {
      clearMapItemTooltipShowTimeout();
      if (immediate || getMapTooltipDelayMs() <= 0) {
        showMapItemTooltip(event);
        return;
      }
      tooltipShowTimeoutId = window.setTimeout(() => {
        showMapItemTooltip(event);
      }, getMapTooltipDelayMs());
    };

    const supportsPointer = typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";
    if (supportsPointer) {
      element.addEventListener("pointerenter", onPointerEnter);
      element.addEventListener("pointermove", onPointerMove);
      element.addEventListener("pointerleave", onPointerLeave);
      element.addEventListener("pointercancel", onPointerLeave);
    } else {
      element.addEventListener("mouseenter", onPointerEnter);
      element.addEventListener("mousemove", onPointerMove);
      element.addEventListener("mouseleave", onPointerLeave);
    }
    element.addEventListener("contextmenu", onContextMenu);
  }

  return {
    attachMapItemTooltip,
  };
}
