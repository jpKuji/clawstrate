export type PitchStyles = Record<string, string>;

export function cx(styles: PitchStyles, ...classNames: Array<string | false | null | undefined>): string {
  return classNames
    .filter((className): className is string => Boolean(className))
    .map((className) => styles[className] ?? "")
    .filter(Boolean)
    .join(" ");
}
