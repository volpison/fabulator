/** Small helpers for comma-separated lists in the Cast and Notes forms. */

export function traitsToString(traits: string[]): string {
  return traits.join(", ");
}

export function stringToTraits(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
