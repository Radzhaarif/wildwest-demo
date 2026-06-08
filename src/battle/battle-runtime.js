export function startBattleLifecycle(context) {
  cancelBattleLifecycle(context);
  const token = { cancelled: false };
  context.battleLifecycle = {
    token,
    isFinishing: false,
  };
  return token;
}

export function cancelBattleLifecycle(context) {
  if (context.battleLifecycle?.token) {
    context.battleLifecycle.token.cancelled = true;
  }
  cancelBattleAttempt(context);
}

export function isBattleLifecycleActive(context, token = context.battleLifecycle?.token) {
  return Boolean(
    token &&
    context.battleLifecycle?.token === token &&
    !token.cancelled
  );
}

export function startBattleAttemptLifecycle(context) {
  cancelBattleAttempt(context);
  const token = { cancelled: false };
  context.battleAttempt = { token };
  return token;
}

export function cancelBattleAttempt(context) {
  if (context.battleAttempt?.token) {
    context.battleAttempt.token.cancelled = true;
  }
}

export function isBattleAttemptActive(context, token = context.battleAttempt?.token) {
  if (!token) {
    return true;
  }

  return Boolean(
    context.battleAttempt?.token === token &&
    !token.cancelled
  );
}

export function shouldContinueBattle(context, renderTargets) {
  const token = renderTargets?.lifecycleToken || context.battleRenderTargets?.lifecycleToken;
  const attemptToken = renderTargets?.attemptToken || context.battleRenderTargets?.attemptToken;
  return Boolean(
    isBattleLifecycleActive(context, token) &&
    isBattleAttemptActive(context, attemptToken) &&
    (!renderTargets?.overlay || renderTargets.overlay.isConnected)
  );
}

export function startBattleRuntime(context, renderTargets, handlers) {
  context.battleRuntimePause = null;
  stopBattleRuntime(context);
  if (!shouldContinueBattle(context, renderTargets)) {
    return;
  }
  const runtimeHandlers = resolveBattleRuntimeHandlers(context, handlers, true);
  context.battleRuntimeHandlers = runtimeHandlers;
  context.battleState.ragePausedUntil = context.battleState.ragePausedUntil || 0;
  const runtimeState = {
    intervalId: null,
    idleTimeoutId: null,
    attemptToken: renderTargets.attemptToken,
    handlers: runtimeHandlers,
  };
  context.battleRuntime = runtimeState;
  const lifecycleToken = renderTargets.lifecycleToken;
  runtimeState.intervalId = window.setInterval(() => {
    if (context.battleRuntime !== runtimeState) {
      window.clearInterval(runtimeState.intervalId);
      return;
    }
    if (!isBattleLifecycleActive(context, lifecycleToken) || !isBattleAttemptActive(context, runtimeState.attemptToken)) {
      stopBattleRuntime(context);
      return;
    }
    runtimeHandlers.onTick(context, renderTargets);
  }, 1000);
  resetBattleIdleTimer(context, renderTargets, runtimeHandlers);
}

export function stopBattleRuntime(context) {
  if (context.battleRuntime?.intervalId) {
    window.clearInterval(context.battleRuntime.intervalId);
  }
  if (context.battleRuntime?.idleTimeoutId) {
    window.clearTimeout(context.battleRuntime.idleTimeoutId);
  }
  context.battleRuntime = null;
}

export function pauseBattleRuntime(context) {
  beginBattleRuntimePause(context);
  stopBattleRuntime(context);
}

export function resumeBattleRuntime(context, renderTargets, handlers) {
  finishBattleRuntimePause(context);
  if (context.battleState.isComplete || context.battleRuntime || !shouldContinueBattle(context, renderTargets)) {
    return;
  }
  startBattleRuntime(context, renderTargets, handlers || context.battleRuntimeHandlers);
}

export function resetBattleIdleTimer(context, renderTargets, handlers) {
  if (!context.battleRuntime || !renderTargets?.boardElement || !shouldContinueBattle(context, renderTargets)) {
    return;
  }

  if (context.battleRuntime.idleTimeoutId) {
    window.clearTimeout(context.battleRuntime.idleTimeoutId);
  }

  const runtimeHandlers = resolveBattleRuntimeHandlers(context, handlers || context.battleRuntime.handlers, false);
  if (!runtimeHandlers?.onIdle) {
    return;
  }

  const delayMs = runtimeHandlers.getIdleDelayMs?.(context);
  const lifecycleToken = renderTargets.lifecycleToken;
  const runtimeState = context.battleRuntime;
  context.battleRuntime.idleTimeoutId = window.setTimeout(() => {
    if (
      context.battleRuntime !== runtimeState
      || !isBattleLifecycleActive(context, lifecycleToken)
      || !isBattleAttemptActive(context, runtimeState?.attemptToken)
    ) {
      return;
    }
    runtimeHandlers.onIdle(context, renderTargets);
  }, Math.max(0, Number(delayMs) || 5000));
}

function resolveBattleRuntimeHandlers(context, handlers, requireTick) {
  const runtimeHandlers = handlers || context.battleRuntimeHandlers;
  const hasTick = typeof runtimeHandlers?.onTick === "function";
  const hasIdle = typeof runtimeHandlers?.onIdle === "function";
  if (requireTick && (!hasTick || !hasIdle)) {
    throw new Error("Battle runtime handlers are missing.");
  }
  return runtimeHandlers || null;
}

function beginBattleRuntimePause(context) {
  if (context.battleRuntimePause) {
    return;
  }
  const startedAt = Date.now();
  context.battleRuntimePause = {
    startedAt,
    ragePausedUntilAtStart: Number(context.battleState?.ragePausedUntil) || 0,
  };
}

function finishBattleRuntimePause(context) {
  const pauseState = context.battleRuntimePause;
  if (!pauseState) {
    return;
  }

  const now = Date.now();
  const elapsedMs = Math.max(0, now - pauseState.startedAt);
  const currentRagePausedUntil = Number(context.battleState?.ragePausedUntil) || 0;
  const hadActiveClockPause = pauseState.ragePausedUntilAtStart > pauseState.startedAt;
  if (hadActiveClockPause && currentRagePausedUntil > pauseState.startedAt && elapsedMs > 0) {
    context.battleState.ragePausedUntil = currentRagePausedUntil + elapsedMs;
  }
  context.battleRuntimePause = null;
}
