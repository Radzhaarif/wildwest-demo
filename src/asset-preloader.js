const LOCAL_ASSET_PREFIX_PATTERN = /^(?:\.\/)?data\/Assets\//i;
const IMAGE_ASSET_PATTERN = /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i;
const AUDIO_ASSET_PATTERN = /\.(?:mp3|ogg|wav|m4a)(?:[?#].*)?$/i;

export function collectAssetPaths(...sources) {
  const paths = new Set();
  for (const source of sources) {
    collectAssetPathsFromValue(source, paths);
  }
  return [...paths];
}

export async function preloadAssets(assetPaths, options = {}) {
  const uniquePaths = [...new Set((assetPaths || []).filter(isPreloadableAssetPath))];
  const total = uniquePaths.length;
  const failed = [];
  let loaded = 0;

  if (total === 0) {
    options.onProgress?.({ loaded: 0, total: 0, current: "", failed });
    return { loaded: 0, total: 0, failed };
  }

  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 8, 16));
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < uniquePaths.length) {
      const assetPath = uniquePaths[nextIndex];
      nextIndex += 1;
      try {
        await preloadAsset(assetPath, options);
      } catch (error) {
        failed.push({ path: assetPath, message: error?.message || String(error) });
      } finally {
        loaded += 1;
        options.onProgress?.({ loaded, total, current: assetPath, failed });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { loaded, total, failed };
}

function collectAssetPathsFromValue(value, paths) {
  if (typeof value === "string") {
    const normalized = normalizeAssetPath(value);
    if (isPreloadableAssetPath(normalized)) {
      paths.add(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectAssetPathsFromValue(entry, paths);
    }
    return;
  }

  if (value instanceof Map || value instanceof Set) {
    for (const entry of value.values()) {
      collectAssetPathsFromValue(entry, paths);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectAssetPathsFromValue(entry, paths);
    }
  }
}

function preloadAsset(assetPath, options) {
  const resolvedPath = typeof options.resolveAssetPath === "function"
    ? options.resolveAssetPath(assetPath)
    : assetPath;

  if (IMAGE_ASSET_PATTERN.test(assetPath)) {
    return preloadImage(resolvedPath);
  }

  if (AUDIO_ASSET_PATTERN.test(assetPath)) {
    return preloadFetch(resolvedPath);
  }

  return preloadFetch(resolvedPath);
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(src);
    image.onerror = () => reject(new Error(`Failed to preload image ${src}`));
    image.src = src;
  });
}

async function preloadFetch(src) {
  const response = await fetch(src, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to preload ${src} (${response.status})`);
  }
}

function isPreloadableAssetPath(path) {
  return typeof path === "string"
    && LOCAL_ASSET_PREFIX_PATTERN.test(path)
    && (IMAGE_ASSET_PATTERN.test(path) || AUDIO_ASSET_PATTERN.test(path));
}

function normalizeAssetPath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}
