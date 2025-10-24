import { describe, expect, it, vi } from 'vitest';
import type { AcpConnection } from './acpConnection';
import { imageBlock, sendPrompt, textBlock } from './acpPrompt';

function fakeConnection(request: ReturnType<typeof vi.fn>): AcpConnection {
  return {
    requireInitialized: vi.fn(),
    request,
  } as unknown as AcpConnection;
}

describe('textBlock / imageBlock', () => {
  it('build the expected content block shapes', () => {
    expect(textBlock('hello')).toEqual({ type: 'text', text: 'hello' });
    expect(imageBlock('YWJj', 'image/png')).toEqual({
      type: 'image',
      data: 'YWJj',
      mimeType: 'image/png',
    });
  });
});

describe('sendPrompt', () => {
  it('sends session/prompt with sessionId and multi-part content in order', async () => {
    const request = vi.fn().mockResolvedValue({ stopReason: 'end_turn' });
    const connection = fakeConnection(request);

    const result = await sendPrompt(connection, {
      sessionId: 'sess-1',
      content: [textBlock('describe this image'), imageBlock('YWJj', 'image/png')],
    });

    expect(request).toHaveBeenCalledWith('session/prompt', {
      sessionId: 'sess-1',
      prompt: [
        { type: 'text', text: 'describe this image' },
        { type: 'image', data: 'YWJj', mimeType: 'image/png' },
      ],
    });
    expect(result).toEqual({ stopReason: 'end_turn' });
  });

  it('defaults to an empty result object when the peer returns nothing', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const connection = fakeConnection(request);
    const result = await sendPrompt(connection, { sessionId: 's', content: [textBlock('hi')] });
    expect(result).toEqual({});
  });
});
