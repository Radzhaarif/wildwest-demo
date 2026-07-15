import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripJsonLineComments } from "../src/jsonc-utils.js";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDirs = ["src", "scripts"];
const dataDir = resolve(rootDir, "data");
const skipDirectories = new Set([".git", ".codex", ".agents", "artifacts", "node_modules"]);
const sourceExtensions = new Set([".js", ".mjs"]);
const dataExtensions = new Set([".json", ".jsonc"]);
let options;

try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`[check-project] ${error.message}`);
  printUsage();
  process.exit(1);
}

if (options.help) {
  printUsage();
  process.exit(0);
}

const checks = [
  ["JavaScript syntax", checkJavaScriptSyntax],
  ["app version manifest", checkAppVersionManifest],
  ["legacy battle-ui fallback", checkLegacyBattleUiFallback],
  ["JSON and JSONC parsing", checkDataParsing],
  ["game data validation", checkGameDataValidation],
  ["asset references", checkAssetReferences],
  ["active locale parity", checkLocaleParity],
  ["CSS brace balance", checkCssBraces],
  ["lockpick generator checks", () => runNodeScript("scripts/check-lockpick.mjs")],
  ["battle engine checks", () => runNodeScript("scripts/check-battle-engine.mjs")],
  ["encoding check", () => runNodeScript("scripts/check-encoding.mjs")],
];

if (options.withSmoke) {
  // --with-smoke делает быстрый structural check полноценным браузерным
  // прогоном SmokeTest-карты. Без флага скрипт остается легким для частого запуска.
  checks.push(["browser smoke", runBrowserSmokeCheck]);
}

const failures = [];

console.log(`[check-project] root: ${rootDir}`);
if (options.withSmoke) {
  console.log("[check-project] browser smoke enabled (--with-smoke)");
}

for (const [name, check] of checks) {
  await runCheck(name, check);
}

if (failures.length > 0) {
  console.error("");
  console.error(`[check-project] failed checks: ${failures.length}`);
  for (const failure of failures) {
    console.error(`\n--- ${failure.name} ---`);
    console.error(formatError(failure.error));
  }
  process.exitCode = 1;
} else {
  console.log("[check-project] all checks passed");
}

async function runCheck(name, check) {
  process.stdout.write(`[check-project] ${name}... `);
  try {
    const details = await check();
    console.log(`ok${details ? ` (${details})` : ""}`);
  } catch (error) {
    console.log("failed");
    failures.push({ name, error });
  }
}

function checkJavaScriptSyntax() {
  const files = sourceDirs.flatMap((directory) => (
    walk(resolve(rootDir, directory)).filter((filePath) => sourceExtensions.has(extname(filePath)))
  ));
  const issues = [];

  for (const filePath of files) {
    const result = spawnSync(process.execPath, ["--check", filePath], {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });

    if (result.status !== 0) {
      issues.push(formatCommandFailure([process.execPath, "--check", toProjectPath(filePath)], result));
    }
  }

  if (issues.length > 0) {
    throw new Error(issues.join("\n\n"));
  }

  return `${files.length} files`;
}

function checkDataParsing() {
  const files = getDataFiles();
  const issues = [];
  let jsonCount = 0;
  let jsoncCount = 0;

  for (const filePath of files) {
    try {
      parseDataFile(filePath);
      if (extname(filePath) === ".json") {
        jsonCount += 1;
      } else {
        jsoncCount += 1;
      }
    } catch (error) {
      issues.push(error.message);
    }
  }

  if (issues.length > 0) {
    throw new Error(limitLines(issues, 80).join("\n"));
  }

  return `${jsonCount} JSON, ${jsoncCount} JSONC`;
}

function checkAppVersionManifest() {
  const versionPath = resolve(rootDir, "version.json");
  const manifest = parseDataFile(versionPath);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("version.json: expected object with a single version field");
  }

  const keys = Object.keys(manifest);
  if (keys.length !== 1 || keys[0] !== "version") {
    throw new Error("version.json: only the version field is allowed");
  }

  if (typeof manifest.version !== "string" || manifest.version.trim() === "") {
    throw new Error("version.json: version must be a non-empty string");
  }

  return manifest.version;
}

function checkLegacyBattleUiFallback() {
  const sourcePath = resolve(rootDir, "src/battle/battle-data.js");
  const source = readFileSync(sourcePath, "utf8");
  const legacyMarkers = [
    "BATTLE_UI_CONFIG_URL_LEGACY",
    "./data/battle/battle-ui.jsonc",
    "data/battle/battle-ui.jsonc",
  ];
  const found = legacyMarkers.filter((marker) => source.includes(marker));
  if (found.length > 0) {
    throw new Error(`src/battle/battle-data.js still contains legacy battle-ui fallback markers: ${found.join(", ")}`);
  }
  return "disabled";
}

async function checkGameDataValidation() {
  globalThis.fetch = createLocalFetch();

  const loaderUrl = pathToFileURL(resolve(rootDir, "src/data-loader.js")).href;
  const validationUrl = pathToFileURL(resolve(rootDir, "src/data-validation.js")).href;
  const { loadJson, loadJsonc } = await import(loaderUrl);
  const { validateGameData } = await import(validationUrl);

  const defaultSettings = await loadJson("./data/settings/default-settings.json");
  const currentSettings = await loadJson("./data/settings/current-settings.json");
  const settings = { ...defaultSettings, ...currentSettings };
  const campaign = await loadJsonc("./data/settings/campaign.jsonc");
  const itemCatalog = await loadJsonc("./data/settings/items.jsonc");
  const experienceTable = await loadJsonc("./data/player/experience-table.jsonc");
  const cheatConfig = await loadJson("./data/player/cheats.json");

  const result = await validateGameData(campaign, itemCatalog, experienceTable, {
    cheatConfig,
    languages: getActiveLanguages(settings),
  });

  return [
    `${result.mapConfigCache.size} maps`,
    `${result.battleConfigCache.enemyConfigCache.size} enemies`,
    `${getActiveLanguages(settings).length} locales`,
  ].join(", ");
}

function checkAssetReferences() {
  const files = getDataFiles();
  const missingAssets = [];
  const references = new Set();

  for (const filePath of files) {
    collectAssetReferences(parseDataFile(filePath), references);
  }

  for (const assetPath of references) {
    const absolutePath = resolveProjectPath(assetPath);
    if (!existsSync(absolutePath)) {
      missingAssets.push(`${assetPath} referenced file is missing`);
    }
  }

  if (missingAssets.length > 0) {
    throw new Error(limitLines(missingAssets, 80).join("\n"));
  }

  return `${references.size} unique references`;
}

function checkLocaleParity() {
  const settings = {
    ...parseDataFile(resolve(rootDir, "data/settings/default-settings.json")),
    ...parseDataFile(resolve(rootDir, "data/settings/current-settings.json")),
  };
  const languages = getActiveLanguages(settings);
  const locales = new Map();
  const allKeys = new Set();

  for (const language of languages) {
    const localePath = resolve(rootDir, "data/locales", `${language}.json`);
    const locale = parseDataFile(localePath);
    if (!locale || typeof locale !== "object" || Array.isArray(locale)) {
      throw new Error(`${toProjectPath(localePath)}: locale must be an object`);
    }

    locales.set(language, locale);
    for (const key of Object.keys(locale)) {
      allKeys.add(key);
    }
  }

  const issues = [];
  for (const [language, locale] of locales) {
    for (const key of allKeys) {
      if (!Object.hasOwn(locale, key)) {
        issues.push(`data/locales/${language}.json: missing "${key}"`);
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(limitLines(issues, 120).join("\n"));
  }

  return `${languages.length} locales, ${allKeys.size} keys`;
}

function checkCssBraces() {
  const cssFiles = walk(resolve(rootDir, "src")).filter((filePath) => extname(filePath) === ".css");
  const issues = [];

  for (const filePath of cssFiles) {
    try {
      assertBalancedCssBraces(filePath);
    } catch (error) {
      issues.push(error.message);
    }
  }

  if (issues.length > 0) {
    throw new Error(issues.join("\n"));
  }

  return `${cssFiles.length} files`;
}

function runNodeScript(scriptPath) {
  const absoluteScriptPath = resolve(rootDir, scriptPath);
  const result = spawnSync(process.execPath, [absoluteScriptPath], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(formatCommandFailure([process.execPath, toProjectPath(absoluteScriptPath)], result));
  }

  return getLastOutputLine(result.stdout || result.stderr);
}

function runBrowserSmokeCheck() {
  const absoluteScriptPath = resolve(rootDir, "scripts/browser-smoke.mjs");
  const smokeArgs = [absoluteScriptPath, "--start=smoke-test"];
  const result = spawnSync(process.execPath, smokeArgs, {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(formatCommandFailure([process.execPath, toProjectPath(absoluteScriptPath), "--start=smoke-test"], result));
  }

  return getBrowserSmokeDetails(result.stdout || result.stderr);
}

function getDataFiles() {
  return walk(dataDir).filter((filePath) => dataExtensions.has(extname(filePath)));
}

function parseDataFile(filePath) {
  const source = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const parsedSource = extname(filePath) === ".jsonc" ? stripJsonLineComments(source) : source;

  try {
    return JSON.parse(parsedSource);
  } catch (error) {
    throw createDataParseError(filePath, parsedSource, error);
  }
}

function createDataParseError(filePath, source, error) {
  const location = getJsonErrorLocation(error, source);
  const suffix = location.line > 0 ? ` at ${location.line}:${location.column}` : "";
  return new Error(`${toProjectPath(filePath)}${suffix}: ${error.message}`);
}

function getJsonErrorLocation(error, source) {
  const message = String(error?.message || "");
  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColumnMatch) {
    return {
      line: Number(lineColumnMatch[1]),
      column: Number(lineColumnMatch[2]),
    };
  }

  const positionMatch = message.match(/position\s+(\d+)/i);
  if (positionMatch) {
    return getLineColumnFromPosition(source, Number(positionMatch[1]));
  }

  return { line: 0, column: 0 };
}

function getLineColumnFromPosition(source, position) {
  const safePosition = Math.max(0, Math.min(Number(position) || 0, source.length));
  let line = 1;
  let column = 1;

  for (let index = 0; index < safePosition; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function collectAssetReferences(value, references) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAssetReferences(item, references);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const child of Object.values(value)) {
      collectAssetReferences(child, references);
    }
    return;
  }

  if (typeof value !== "string") {
    return;
  }

  const normalized = normalizeProjectPath(value);
  if (normalized.startsWith("data/Assets/")) {
    references.add(normalized);
  }
}

function createLocalFetch() {
  return async (url) => {
    const filePath = resolveProjectPath(String(url).split("#")[0].split("?")[0]);
    const relativePath = relative(rootDir, filePath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return createFetchResponse(false, 403, `Forbidden local fetch path: ${url}`);
    }

    try {
      return createFetchResponse(true, 200, readFileSync(filePath, "utf8"));
    } catch (error) {
      const status = error?.code === "ENOENT" ? 404 : 500;
      return createFetchResponse(false, status, error.message);
    }
  };
}

function createFetchResponse(ok, status, body) {
  return {
    ok,
    status,
    async text() {
      return body;
    },
  };
}

function getActiveLanguages(settings) {
  const languages = [];
  for (const language of [settings.language, ...(Array.isArray(settings.languages) ? settings.languages : [])]) {
    if (typeof language === "string" && language.trim() !== "" && !languages.includes(language)) {
      languages.push(language);
    }
  }
  return languages.length > 0 ? languages : ["en"];
}

function assertBalancedCssBraces(filePath) {
  const source = readFileSync(filePath, "utf8");
  const stack = [];
  let line = 1;
  let column = 0;
  let inComment = false;
  let inString = "";
  let isEscaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
        column += 1;
      }
      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === inString) {
        inString = "";
      }
      continue;
    }

    if (char === "/" && next === "*") {
      inComment = true;
      index += 1;
      column += 1;
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = char;
      continue;
    }

    if (char === "{") {
      stack.push({ line, column });
      continue;
    }

    if (char === "}") {
      if (stack.length === 0) {
        throw new Error(`${toProjectPath(filePath)}:${line}:${column}: unexpected "}"`);
      }
      stack.pop();
    }
  }

  if (inComment) {
    throw new Error(`${toProjectPath(filePath)}:${line}:${column}: unclosed CSS comment`);
  }
  if (inString) {
    throw new Error(`${toProjectPath(filePath)}:${line}:${column}: unclosed CSS string`);
  }
  if (stack.length > 0) {
    const opening = stack.at(-1);
    throw new Error(`${toProjectPath(filePath)}:${opening.line}:${opening.column}: unclosed "{"`);
  }
}

function walk(directory, result = []) {
  if (!existsSync(directory)) {
    return result;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirectories.has(entry.name) && !entry.name.startsWith("back_")) {
        walk(join(directory, entry.name), result);
      }
      continue;
    }

    result.push(join(directory, entry.name));
  }

  return result;
}

function resolveProjectPath(projectPath) {
  const normalized = normalizeProjectPath(projectPath);
  return resolve(rootDir, normalized);
}

function normalizeProjectPath(projectPath) {
  return String(projectPath)
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function toProjectPath(filePath) {
  return normalizeProjectPath(relative(rootDir, filePath));
}

function formatCommandFailure(command, result) {
  return [
    `$ ${command.join(" ")}`,
    result.stdout?.trim(),
    result.stderr?.trim(),
    typeof result.status === "number" ? `exit code: ${result.status}` : "",
    result.error ? `error: ${result.error.message}` : "",
  ].filter(Boolean).join("\n");
}

function getLastOutputLine(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) || "";
}

function getBrowserSmokeDetails(output) {
  const text = String(output || "");
  const jsonStart = text.indexOf("{\n");
  if (jsonStart >= 0) {
    try {
      const summary = JSON.parse(text.slice(jsonStart));
      if (summary.summary?.smokeTest) {
        return [
          `map ${summary.summary.smokeTest.mapId}`,
          Number.isFinite(summary.summary.smokeTest.final?.completed)
            ? `${summary.summary.smokeTest.final.completed} nodes`
            : "",
          Number.isFinite(summary.resources?.unversionedProjectResources)
            ? `${summary.resources.unversionedProjectResources} unversioned resources`
            : "",
        ].filter(Boolean).join(", ");
      }
      return [
        summary.summary?.battle?.enemyId ? `enemy ${summary.summary.battle.enemyId}` : "",
        Number.isFinite(summary.summary?.battle?.cells) ? `${summary.summary.battle.cells} cells` : "",
        Number.isFinite(summary.resources?.unversionedProjectResources)
          ? `${summary.resources.unversionedProjectResources} unversioned resources`
          : "",
      ].filter(Boolean).join(", ");
    } catch {
      // Fall through to the last output line.
    }
  }
  return getLastOutputLine(text);
}

function formatError(error) {
  return error?.stack || error?.message || String(error);
}

function limitLines(lines, limit) {
  if (lines.length <= limit) {
    return lines;
  }
  return [
    ...lines.slice(0, limit),
    `...and ${lines.length - limit} more`,
  ];
}

function parseArgs(args) {
  const parsed = {
    help: false,
    withSmoke: false,
  };
  const unknown = [];

  for (const arg of args) {
    if (arg === "--with-smoke") {
      parsed.withSmoke = true;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      unknown.push(arg);
    }
  }

  if (unknown.length > 0) {
    throw new Error(`Unknown check-project option(s): ${unknown.join(", ")}`);
  }

  return parsed;
}

function printUsage() {
  console.log([
    "Usage: node scripts/check-project.mjs [options]",
    "",
    "Options:",
    "  --with-smoke  Also run scripts/browser-smoke.mjs --start=smoke-test after structural checks.",
    "  -h, --help    Show this help.",
  ].join("\n"));
}
