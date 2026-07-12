const DEBUG_GLOBAL_KEY = "__wildwestDebug";
const DEBUG_STORAGE_KEY = "wildwestDebug";
const DEBUG_QUERY_PARAMS = ["debug", "wildwestDebug"];
const LEGACY_GLOBAL_KEYS = ["context", "contex"];

export function exposeWildwestDebug(section, values = {}) {
  // Debug API существует только при ?debug=1/localStorage flag. В обычной игре
  // глобальный state не публикуется, а legacy context/contex чистятся.
  clearLegacyDebugGlobals();
  if (!isWildwestDebugEnabled()) {
    clearDebugRoot();
    return;
  }
  if (!section) {
    return;
  }

  const debugRoot = getDebugRoot();
  debugRoot.enabled = true;
  debugRoot[section] = {
    ...(debugRoot[section] || {}),
    ...values,
  };
}

export function clearWildwestDebug(section) {
  clearLegacyDebugGlobals();
  if (!isWildwestDebugEnabled()) {
    clearDebugRoot();
    return;
  }

  const debugRoot = getDebugRoot();
  if (section) {
    delete debugRoot[section];
  }
}

export function isWildwestDebugEnabled() {
  if (typeof globalThis === "undefined" || !globalThis.location) {
    return false;
  }

  const queryValue = getDebugQueryValue();
  if (queryValue !== null) {
    return isEnabledValue(queryValue);
  }

  try {
    return isEnabledValue(globalThis.localStorage?.getItem(DEBUG_STORAGE_KEY));
  } catch {
    return false;
  }
}

function getDebugRoot() {
  const current = globalThis[DEBUG_GLOBAL_KEY];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current;
  }

  const debugRoot = {};
  globalThis[DEBUG_GLOBAL_KEY] = debugRoot;
  return debugRoot;
}

function getDebugQueryValue() {
  try {
    const params = new URLSearchParams(globalThis.location.search);
    for (const param of DEBUG_QUERY_PARAMS) {
      if (params.has(param)) {
        return params.get(param);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function isEnabledValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "" || ["1", "true", "yes", "on"].includes(normalized);
}

function clearLegacyDebugGlobals() {
  for (const key of LEGACY_GLOBAL_KEYS) {
    try {
      delete globalThis[key];
    } catch {
      globalThis[key] = undefined;
    }
  }
}

function clearDebugRoot() {
  try {
    delete globalThis[DEBUG_GLOBAL_KEY];
  } catch {
    globalThis[DEBUG_GLOBAL_KEY] = undefined;
  }
}
