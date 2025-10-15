import { describe, expect, it } from 'vitest';
import { matchesAnyGlob } from './globMatch';

describe('matchesAnyGlob', () => {
  it('matches an exact basename', () => {
    expect(matchesAnyGlob('node_modules', ['node_modules'])).toBe(true);
    expect(matchesAnyGlob('src', ['node_modules'])).toBe(false);
  });

  it('matches a wildcard suffix pattern', () => {
    expect(matchesAnyGlob('debug.log', ['*.log'])).toBe(true);
    expect(matchesAnyGlob('debug.txt', ['*.log'])).toBe(false);
  });

  it('matches if any pattern in the list matches', () => {
    expect(matchesAnyGlob('a.log', ['node_modules', '*.log'])).toBe(true);
  });

  it('returns false for an empty pattern list', () => {
    expect(matchesAnyGlob('anything', [])).toBe(false);
  });

  it('escapes regex special characters in the literal portion of a pattern', () => {
    expect(matchesAnyGlob('a.b', ['a.b'])).toBe(true);
    expect(matchesAnyGlob('axb', ['a.b'])).toBe(false);
  });
});
