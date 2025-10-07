/**
 * The single point through which the main process touches the Vercel AI
 * SDK core and its provider packages. Later modules (the model catalog,
 * the credential-resolving provider factory, and the agent loop) import
 * exclusively from here rather than reaching into `ai` or an `@ai-sdk/*`
 * package directly, so the set of installed providers stays centrally
 * visible and swappable.
 */
export { generateText, streamText, tool, type ModelMessage, type LanguageModel } from 'ai';
export { createAnthropic } from '@ai-sdk/anthropic';
export { createOpenAI } from '@ai-sdk/openai';
export { createGoogleGenerativeAI } from '@ai-sdk/google';
