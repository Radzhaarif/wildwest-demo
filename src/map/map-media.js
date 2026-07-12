export function createMapMediaHelpers(deps) {
  const {
    resolveAssetPath,
  } = deps;

  function setEventImage(image, sourcePath, altText) {
    // Новый стандарт для JSON: eventImage и похожие поля пишутся полным путем
    // от data/. Тогда код не должен знать, в какой именно подпапке лежит ассет.
    const resolvedPath = resolveAssetPath(sourcePath);
    image.alt = altText;
    image.removeAttribute("hidden");
    image.onerror = () => {
      console.error(`Failed to load character image: ${sourcePath} -> ${resolvedPath}`);
      image.setAttribute("hidden", "");
    };
    image.onload = () => {
      image.removeAttribute("hidden");
    };
    image.src = resolvedPath;
  }

  return {
    setEventImage,
  };
}
