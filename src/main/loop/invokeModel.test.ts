import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { buildStreamTextParams, invokeModelStream, toSdkToolSet } from './invokeModel';
import { defineTool } from '../tools/types';
import type { InternalMessage } from '../ai/messages';

const readFileLikeTool = defineTool({
  name: 'read_file',
  description: 'reads a file',
  inputSchema: z.object({ path: z.string().describe('the file path') }),
  defaultConsent: 'always',
  execute: async () => 'unused in this test',
});

describe('toSdkToolSet', () => {
  it('converts every tool to an sdk tool definition without an execute function', () => {
    const toolSet = toSdkToolSet([readFileLikeTool]);

    expect(Object.keys(toolSet)).toEqual(['read_file']);
    expect(toolSet['read_file'].description).toBe('reads a file');
    expect(toolSet['read_file'].execute).toBeUndefined();
  });
});

describe('buildStreamTextParams', () => {
  const model = new MockLanguageModelV4();

  it('prepends the system prompt as a system message', () => {
    const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }];

    const params = buildStreamTextParams({ model, systemPrompt: 'be terse', history });

    expect(params.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('omits the system message entirely when no systemPrompt is given', () => {
    const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }];

    const params = buildStreamTextParams({ model, history });

    expect(params.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('includes the compiled toolset when tools are provided', () => {
    const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }];

    const params = buildStreamTextParams({ model, history, tools: [readFileLikeTool] });

    expect(Object.keys(params.tools ?? {})).toEqual(['read_file']);
  });

  it('carries temperature and maxOutputTokens through when provided', () => {
    const params = buildStreamTextParams({
      model,
      history: [],
      temperature: 0.3,
      maxOutputTokens: 512,
    });

    expect(params.temperature).toBe(0.3);
    expect(params.maxOutputTokens).toBe(512);
  });
});

describe('invokeModelStream', () => {
  it('streams text deltas from a mock model', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'Hello' },
          { type: 'text-delta', id: '1', delta: ', world' },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 2, text: 2, reasoning: undefined },
            },
          },
        ]),
      }),
    });

    const history: InternalMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }];
    const result = invokeModelStream({ model, history });

    const text = await result.text;
    expect(text).toBe('Hello, world');
  });
});
