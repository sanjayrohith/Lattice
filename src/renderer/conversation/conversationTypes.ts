export type ConversationRole = 'user' | 'assistant' | 'system';

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  /** Markdown text; may be partial while `streaming` is true. */
  text: string;
  /** True while an assistant message is still receiving text-delta chunks. */
  streaming?: boolean;
}
