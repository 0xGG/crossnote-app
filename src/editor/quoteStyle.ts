/** Quote borders measured from the outermost quote's left edge. */
export function quoteBackground(borders: readonly number[]) {
  if (!borders.length) return "none";
  const stops = borders.flatMap((border) => {
    const x = border - borders[0];
    return [
      `transparent ${x}px`,
      `var(--preview-border) ${x}px ${x + 4}px`,
      `transparent ${x + 4}px`,
    ];
  });
  return `linear-gradient(to right, ${stops.join(",")})`;
}
