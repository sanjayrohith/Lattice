/** Converts a simple `*`-wildcard glob (matched against a basename) into a `RegExp`. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** Whether `name` matches any of `patterns`, each a simple `*`-wildcard basename glob. */
export function matchesAnyGlob(name: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(name));
}
