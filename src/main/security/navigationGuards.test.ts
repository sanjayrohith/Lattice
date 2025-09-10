import { describe, expect, it } from 'vitest';
import type { WebContents } from 'electron';
import { applyNavigationGuards, isAllowedNavigationTarget } from './navigationGuards';

describe('isAllowedNavigationTarget', () => {
  it('allows file:// loads of the packaged renderer', () => {
    expect(isAllowedNavigationTarget('file:///app/out/renderer/index.html', [])).toBe(true);
  });

  it('allows an explicitly allowlisted dev server origin', () => {
    expect(isAllowedNavigationTarget('http://localhost:5173/', ['http://localhost:5173'])).toBe(
      true,
    );
  });

  it('denies an origin outside the allowlist', () => {
    expect(isAllowedNavigationTarget('https://evil.example.com/', ['http://localhost:5173'])).toBe(
      false,
    );
  });

  it('denies a malformed url', () => {
    expect(isAllowedNavigationTarget('not a url', [])).toBe(false);
  });
});

type Handler = (...args: never[]) => void;

function createMockWebContents(): WebContents {
  const listeners = new Map<string, Handler>();
  let windowOpenHandler: (() => { action: 'allow' | 'deny' }) | undefined;

  return {
    on: (event: string, handler: Handler) => {
      listeners.set(event, handler);
    },
    setWindowOpenHandler: (handler: () => { action: 'allow' | 'deny' }) => {
      windowOpenHandler = handler;
    },
    // test helpers
    __emit: (event: string, ...args: unknown[]) => {
      const handler = listeners.get(event);
      handler?.(...(args as never[]));
    },
    __callWindowOpenHandler: () => windowOpenHandler?.(),
  } as unknown as WebContents;
}

describe('applyNavigationGuards', () => {
  it('blocks navigation to disallowed origins', () => {
    const contents = createMockWebContents();
    applyNavigationGuards(contents, ['http://localhost:5173']);

    let prevented = false;
    (contents as unknown as { __emit: (e: string, ...a: unknown[]) => void }).__emit(
      'will-navigate',
      { preventDefault: () => (prevented = true) },
      'https://evil.example.com',
    );

    expect(prevented).toBe(true);
  });

  it('always denies webview attachment', () => {
    const contents = createMockWebContents();
    applyNavigationGuards(contents, []);

    let prevented = false;
    (contents as unknown as { __emit: (e: string, ...a: unknown[]) => void }).__emit(
      'will-attach-webview',
      { preventDefault: () => (prevented = true) },
    );

    expect(prevented).toBe(true);
  });

  it('denies every renderer-initiated window.open call', () => {
    const contents = createMockWebContents();
    applyNavigationGuards(contents, []);

    const result = (
      contents as unknown as { __callWindowOpenHandler: () => { action: string } | undefined }
    ).__callWindowOpenHandler();

    expect(result).toEqual({ action: 'deny' });
  });
});
