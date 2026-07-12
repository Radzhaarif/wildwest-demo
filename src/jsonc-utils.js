export function stripJsonLineComments(source) {
  // JSONC в проекте поддерживает только комментарии отдельной строкой. Inline
  // комментарии запрещены намеренно, чтобы не писать хрупкий JSON-парсер.
  return String(source || "")
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");
}
