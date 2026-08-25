import { describe, expect, it } from 'vitest';
import { fileExtensionOf } from './fileExtension';

describe('fileExtensionOf', () => {
  it('returns the lowercased extension', () => {
    expect(fileExtensionOf('src/a.TS')).toBe('.ts');
  });

  it('returns "(none)" for a file with no extension', () => {
    expect(fileExtensionOf('Makefile')).toBe('(none)');
  });

  it('returns the last extension for a multi-dot filename', () => {
    expect(fileExtensionOf('a.test.ts')).toBe('.ts');
  });
});
