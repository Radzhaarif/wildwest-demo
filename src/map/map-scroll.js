export function createMapScrollController(deps) {
  const {
    state,
    elements,
    getAvailableNodeElements,
  } = deps;

  function initDragScroll(viewport) {
    // Drag-scroll включается только при нажатии на пустую область карты. Нажатие
    // по .map-node должно активировать событие, а не восприниматься как скролл.
    let isDragging = false;
    let startY = 0;
    let startScrollTop = 0;

    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") {
        return;
      }
      if (event.target.closest(".map-node")) {
        return;
      }
      isDragging = true;
      startY = event.clientY;
      startScrollTop = viewport.scrollTop;
      viewport.classList.add("dragging");
      viewport.setPointerCapture(event.pointerId);
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!isDragging) {
        return;
      }
      event.preventDefault();
      viewport.scrollTop = startScrollTop - (event.clientY - startY);
    });

    const stopDragging = (event) => {
      if (!isDragging) {
        return;
      }
      isDragging = false;
      viewport.classList.remove("dragging");
      if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
    };

    viewport.addEventListener("pointerup", stopDragging);
    viewport.addEventListener("pointercancel", stopDragging);
    viewport.addEventListener("pointerleave", stopDragging);
  }

  function scrollAvailableNodesIntoActionZone() {
    if (state.availableNodeIds.size === 0) {
      return;
    }

    requestAnimationFrame(() => {
      const viewport = elements.mapViewport;
      const boardRect = elements.mapBoard.getBoundingClientRect();
      const availableNodes = getAvailableNodeElements();

      if (availableNodes.length === 0) {
        return;
      }

      const centerY =
        availableNodes.reduce((sum, node) => {
          const rect = node.getBoundingClientRect();
          return sum + rect.top - boardRect.top + rect.height / 2;
        }, 0) / availableNodes.length;
      const targetTop = centerY - viewport.clientHeight * 0.68;
      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
      const nextScrollTop = Math.max(0, Math.min(targetTop, maxScrollTop));

      animateViewportScroll(nextScrollTop, 1000);
    });
  }

  function animateViewportScroll(targetScrollTop, duration) {
    const viewport = elements.mapViewport;
    const startScrollTop = viewport.scrollTop;
    const distance = targetScrollTop - startScrollTop;
    const startTime = performance.now();

    if (state.scrollAnimationFrame) {
      cancelAnimationFrame(state.scrollAnimationFrame);
    }

    if (Math.abs(distance) < 1) {
      viewport.scrollTop = targetScrollTop;
      state.scrollAnimationFrame = null;
      return;
    }

    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      viewport.scrollTop = startScrollTop + distance * easeInOutCubic(progress);
      if (progress < 1) {
        state.scrollAnimationFrame = requestAnimationFrame(step);
      } else {
        state.scrollAnimationFrame = null;
      }
    }

    state.scrollAnimationFrame = requestAnimationFrame(step);
  }

  function playMapIntroScroll() {
    // При старте карты камера сначала стоит сверху и за 3 секунды плавно
    // опускается вниз. Это визуально показывает длину маршрута до первого выбора.
    requestAnimationFrame(() => {
      const viewport = elements.mapViewport;
      viewport.scrollTop = 0;
      const targetScrollTop = viewport.scrollHeight - viewport.clientHeight;
      const duration = 3000;
      const startTime = performance.now();

      function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        viewport.scrollTop = targetScrollTop * easeInOutCubic(progress);
        if (progress < 1) {
          requestAnimationFrame(step);
        }
      }

      requestAnimationFrame(step);
    });
  }

  function easeInOutCubic(value) {
    return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }

  return {
    initDragScroll,
    scrollAvailableNodesIntoActionZone,
    playMapIntroScroll,
  };
}
