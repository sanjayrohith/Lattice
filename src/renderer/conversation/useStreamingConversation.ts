import { useCallback, useEffect, useRef, useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { ConversationMessage } from './conversationTypes';

let nextMessageId = 0;
function generateMessageId(): string {
  nextMessageId += 1;
  return `msg-${nextMessageId}`;
}

export interface UseStreamingConversationResult {
  messages: ConversationMessage[];
  /** Appends a finished user message immediately (not streamed). */
  addUserMessage: (text: string) => ConversationMessage;
  /** Starts a new, empty, `streaming: true` assistant message and returns its id. */
  beginAssistantMessage: () => string;
}

/**
 * Owns the conversation's message list and appends to the in-progress
 * assistant message as `run:stream` `text-delta` events arrive for
 * `activeRunId` — the source of the "incremental text streaming" this
 * panel renders. Deltas for any other run id are ignored, so a stale
 * event from a just-cancelled run can never bleed into a new one.
 */
export function useStreamingConversation(activeRunId?: string): UseStreamingConversationResult {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const streamingMessageIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!window.electronAPI) return undefined;

    const unsubscribe = window.electronAPI.subscribe(IPC_CHANNELS.RUN_STREAM, (batch) => {
      const streamingId = streamingMessageIdRef.current;
      if (!streamingId || !activeRunId) return;

      const deltas = batch.filter(
        (event): event is { type: 'text-delta'; runId: string; delta: string } =>
          event.type === 'text-delta' && event.runId === activeRunId,
      );
      if (deltas.length === 0) return;

      const combinedDelta = deltas.map((event) => event.delta).join('');
      setMessages((prev) =>
        prev.map((message) =>
          message.id === streamingId ? { ...message, text: message.text + combinedDelta } : message,
        ),
      );
    });

    return unsubscribe;
  }, [activeRunId]);

  const addUserMessage = useCallback((text: string): ConversationMessage => {
    const message: ConversationMessage = { id: generateMessageId(), role: 'user', text };
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  const beginAssistantMessage = useCallback((): string => {
    const id = generateMessageId();
    streamingMessageIdRef.current = id;
    setMessages((prev) => [...prev, { id, role: 'assistant', text: '', streaming: true }]);
    return id;
  }, []);

  return { messages, addUserMessage, beginAssistantMessage };
}
