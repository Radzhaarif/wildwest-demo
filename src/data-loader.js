export async function loadJson(url) {
  const response = await fetch(withCacheBuster(url), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`);
  }
  return parseJson(await response.text(), url);
}

export async function loadJsonc(url) {
  const response = await fetch(withCacheBuster(url), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`);
  }
  return parseJson(stripJsonComments(await response.text()), url);
}

function withCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${Date.now()}`;
}

function stripJsonComments(source) {
  return source
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
}

function parseJson(source, url) {
  const normalizedSource = source.replace(/^\uFEFF/, "");
  try {
    return JSON.parse(normalizedSource);
  } catch (error) {
    throw createJsonParseError(error, url, normalizedSource);
  }
}

function createJsonParseError(error, url, source) {
  const location = getJsonErrorLocation(error, source);
  const hint = getJsonErrorHint(error.message, getSourceLine(source, location.line), location.column);
  const details = [
    `Ошибка JSON в ${url}`,
    location.line > 0 ? `строка ${location.line}, колонка ${location.column}` : "",
    error.message,
    hint ? `Подсказка: ${hint}` : "",
    formatSourceExcerpt(source, location),
  ].filter(Boolean);
  const parseError = new SyntaxError(details.join("\n"));
  parseError.cause = error;
  parseError.fileUrl = url;
  parseError.line = location.line;
  parseError.column = location.column;
  return parseError;
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

  return {
    line: 0,
    column: 0,
  };
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

function getSourceLine(source, lineNumber) {
  if (lineNumber <= 0) {
    return "";
  }
  return source.split(/\r?\n/)[lineNumber - 1] || "";
}

function formatSourceExcerpt(source, location) {
  if (location.line <= 0) {
    return "";
  }

  const lineText = getSourceLine(source, location.line);
  const caretPadding = " ".repeat(Math.max(0, Math.min(location.column - 1, lineText.length)));
  return `Фрагмент:\n${location.line}: ${lineText}\n${" ".repeat(String(location.line).length + 2)}${caretPadding}^`;
}

function getJsonErrorHint(message, lineText, column) {
  const lowerMessage = String(message || "").toLowerCase();
  const beforeCursor = lineText.slice(0, Math.max(0, column - 1));

  if (lineText.includes("//") && !lineText.trimStart().startsWith("//")) {
    return "JSONC в проекте поддерживает комментарии только отдельной строкой через //; inline-комментарий после значения сломает парсинг.";
  }
  if (beforeCursor.includes("'") || /'[^']*'\s*:/.test(lineText)) {
    return "JSON требует двойные кавычки для ключей и строк: используйте \"...\", а не '...'.";
  }
  if (lowerMessage.includes("expected ','") || lowerMessage.includes("unexpected string")) {
    return "Скорее всего, пропущена запятая между полями или элементами массива.";
  }
  if (lowerMessage.includes("unexpected token") && lowerMessage.includes(",")) {
    return "Похоже на лишнюю запятую или пропущенное значение рядом с запятой.";
  }
  if (lowerMessage.includes("unexpected token") && (lowerMessage.includes("]") || lowerMessage.includes("}"))) {
    return "Проверьте запятую перед закрывающей скобкой и парность фигурных/квадратных скобок.";
  }
  if (lowerMessage.includes("unexpected end") || lowerMessage.includes("unterminated")) {
    return "Файл закончился раньше времени: вероятно, не закрыта строка, объект или массив.";
  }
  if (lowerMessage.includes("bad control character")) {
    return "В строке есть необработанный перенос или управляющий символ; перенос строки внутри JSON-строки нужно писать как \\n.";
  }
  if (lowerMessage.includes("property name") || lowerMessage.includes("double-quoted")) {
    return "Проверьте, что имя ключа взято в двойные кавычки.";
  }
  return "Проверьте пунктуацию рядом с отмеченной позицией: кавычки, двоеточие, запятые и закрывающие скобки.";
}
