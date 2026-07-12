const LOCAL_ASSET_PREFIX_PATTERN = /^(?:\.\/)?data\/Assets\//i;
const IMAGE_ASSET_PATTERN = /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i;
const AUDIO_ASSET_PATTERN = /\.(?:mp3|ogg|wav|m4a)(?:[?#].*)?$/i;
const assetMemoryCache = new Map();

export function collectAssetPaths(...sources) {
  // Сборщик намеренно рекурсивный по любым data/config объектам: новые ассеты
  // должны попадать в preload без ручного списка в коде.
  const paths = new Set();
  for (const source of sources) {
    collectAssetPathsFromValue(source, paths);
  }
  return [...paths];
}

export async function preloadAssets(assetPaths, options = {}) {
  const uniquePaths = [...new Set((assetPaths || [])
    .map(normalizeAssetKey)
    .filter(isPreloadableAssetPath))];
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

export function getCachedAssetUrl(assetPath) {
  const entry = assetMemoryCache.get(normalizeAssetKey(assetPath));
  return entry?.status === "loaded" ? entry.url : "";
}

export function getAssetCacheSnapshot() {
  let loaded = 0;
  let loading = 0;
  let failed = 0;
  let bytes = 0;

  for (const entry of assetMemoryCache.values()) {
    if (entry.status === "loaded") {
      loaded += 1;
      bytes += entry.bytes || 0;
    } else if (entry.status === "loading") {
      loading += 1;
    } else if (entry.status === "failed") {
      failed += 1;
    }
  }

  return {
    total: assetMemoryCache.size,
    loaded,
    loading,
    failed,
    bytes,
  };
}

export function clearAssetMemoryCache() {
  for (const entry of assetMemoryCache.values()) {
    if (entry.objectUrl) {
      URL.revokeObjectURL(entry.objectUrl);
    }
  }
  assetMemoryCache.clear();
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
  // Cache хранит один promise на assetKey. Параллельные preload-запросы ждут
  // один fetch и получают один objectUrl.
  const assetKey = normalizeAssetKey(assetPath);
  const cachedEntry = assetMemoryCache.get(assetKey);
  if (cachedEntry?.status === "loaded") {
    return Promise.resolve(cachedEntry.url);
  }
  if (cachedEntry?.status === "loading" && cachedEntry.promise) {
    return cachedEntry.promise;
  }

  const resolvedPath = typeof options.resolveAssetPath === "function"
    ? options.resolveAssetPath(assetKey)
    : assetKey;

  const promise = preloadAssetToMemory(assetKey, resolvedPath)
    .then((entry) => {
      assetMemoryCache.set(assetKey, entry);
      return entry.url;
    })
    .catch((error) => {
      assetMemoryCache.set(assetKey, {
        status: "failed",
        url: resolvedPath,
        error,
      });
      throw error;
    });

  assetMemoryCache.set(assetKey, {
    status: "loading",
    url: resolvedPath,
    promise,
  });

  return promise;
}

async function preloadAssetToMemory(assetKey, resolvedPath) {
  const blob = await fetchAssetBlob(resolvedPath);
  const objectUrl = URL.createObjectURL(blob);

  if (IMAGE_ASSET_PATTERN.test(assetKey)) {
    const image = await decodeImage(objectUrl);
    return {
      status: "loaded",
      kind: "image",
      key: assetKey,
      sourceUrl: resolvedPath,
      url: objectUrl,
      objectUrl,
      blob,
      bytes: blob.size,
      image,
    };
  }

  return {
    status: "loaded",
    kind: AUDIO_ASSET_PATTERN.test(assetKey) ? "audio" : "binary",
    key: assetKey,
    sourceUrl: resolvedPath,
    url: objectUrl,
    objectUrl,
    blob,
    bytes: blob.size,
  };
}

async function fetchAssetBlob(src) {
  const response = await fetch(src, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to preload ${src} (${response.status})`);
  }
  return response.blob();
}

function decodeImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = async () => {
      try {
        if (typeof image.decode === "function") {
          await image.decode();
        }
      } catch {
        // `decode()` can reject for already-loaded SVGs in some browsers.
        // The onload event is enough for the runtime cache contract here.
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error(`Failed to preload image ${src}`));
    image.src = src;
  });
}

function isPreloadableAssetPath(path) {
  return typeof path === "string"
    && LOCAL_ASSET_PREFIX_PATTERN.test(normalizeAssetKey(path))
    && (IMAGE_ASSET_PATTERN.test(normalizeAssetKey(path)) || AUDIO_ASSET_PATTERN.test(normalizeAssetKey(path)));
}

function normalizeAssetPath(path) {
  return normalizeAssetKey(path);
}

function normalizeAssetKey(path) {
  if (typeof path !== "string") {
    return "";
  }

  const normalized = path
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
  const [withoutHash] = normalized.split("#");
  const [withoutQuery] = withoutHash.split("?");
  return withoutQuery;
}
