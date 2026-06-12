const APP_VERSION_GLOBAL_KEY = "__ROGUELITE_MATCH3_VERSION__";
const DEFAULT_APP_VERSION = "dev";

export function getAppVersion() {
  return normalizeAppVersion(globalThis?.[APP_VERSION_GLOBAL_KEY]) || DEFAULT_APP_VERSION;
}

export function appendVersionParam(url, version = getAppVersion()) {
  const rawUrl = String(url || "");
  if (!rawUrl || /^(?:blob:|data:|https?:)/i.test(rawUrl)) {
    return rawUrl;
  }

  const normalizedVersion = normalizeAppVersion(version) || DEFAULT_APP_VERSION;
  const [pathWithoutHash, hash = ""] = rawUrl.split("#");
  const separator = pathWithoutHash.includes("?") ? "&" : "?";
  return `${pathWithoutHash}${separator}v=${encodeURIComponent(normalizedVersion)}${hash ? `#${hash}` : ""}`;
}

function normalizeAppVersion(value) {
  return typeof value === "string" ? value.trim() : "";
}
