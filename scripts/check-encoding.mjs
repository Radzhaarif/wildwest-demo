import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".jsonc", ".md", ".mjs"]);
const SKIP_DIRECTORIES = new Set([".git", "artifacts"]);

const CP1251_UTF8_CONTINUATION_CHARS = new Set([
  "\u0402", "\u0403", "\u201A", "\u0453", "\u201E", "\u2026", "\u2020", "\u2021",
  "\u20AC", "\u2030", "\u0409", "\u2039", "\u040A", "\u040C", "\u040B", "\u040F",
  "\u0452", "\u2018", "\u2019", "\u201C", "\u201D", "\u2022", "\u2013", "\u2014",
  "\u0098", "\u2122", "\u0459", "\u203A", "\u045A", "\u045C", "\u045B", "\u045F",
  "\u00A0", "\u040E", "\u045E", "\u0408", "\u00A4", "\u0490", "\u00A6", "\u00A7",
  "\u0401", "\u00A9", "\u0404", "\u00AB", "\u00AC", "\u00AD", "\u00AE", "\u0407",
  "\u00B0", "\u00B1", "\u0406", "\u0456", "\u0491", "\u00B5", "\u00B6", "\u00B7",
  "\u0451", "\u2116", "\u0454", "\u00BB", "\u0458", "\u0405", "\u0455", "\u0457",
]);
const CP1251_UTF8_SHORT_FRAGMENT_CHARS_BY_PREFIX = new Map([
  [
    "\u0412",
    new Set([
      "\u00A0", "\u00A7", "\u00AB", "\u00B0", "\u00B1", "\u00B7", "\u00BB",
    ]),
  ],
  [
    "\u0432",
    new Set([
      "\u0402", "\u0404", "\u0405", "\u0406", "\u0407",
      "\u201A", "\u201E", "\u2020", "\u2021", "\u20AC",
      "\u2018", "\u2019", "\u201C", "\u201D", "\u2022", "\u2013", "\u2014",
    ]),
  ],
]);

const findings = [];

for (const filePath of walk(".")) {
  const text = readFileSync(filePath, "utf8");
  text.split(/\r?\n/).forEach((line, index) => {
    if (hasEncodingDamage(line)) {
      findings.push(`${filePath}:${index + 1}: ${line.slice(0, 160)}`);
    }
  });
}

if (findings.length > 0) {
  console.error("Possible mojibake/encoding damage found:");
  console.error(findings.slice(0, 80).join("\n"));
  if (findings.length > 80) {
    console.error(`...and ${findings.length - 80} more`);
  }
  process.exit(1);
}

console.log("encoding check passed");

function hasEncodingDamage(line) {
  if (line.includes("\uFFFD")) {
    return true;
  }

  for (let index = 0; index < line.length - 1; index += 1) {
    const current = line[index];
    const next = line[index + 1];
    if ((current === "\u0420" || current === "\u0421") && CP1251_UTF8_CONTINUATION_CHARS.has(next)) {
      return true;
    }
    if (CP1251_UTF8_SHORT_FRAGMENT_CHARS_BY_PREFIX.get(current)?.has(next)) {
      return true;
    }
  }

  return false;
}

function walk(directory, result = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, result);
      continue;
    }

    if (TEXT_EXTENSIONS.has(extname(entry.name))) {
      result.push(fullPath);
    }
  }

  return result;
}
