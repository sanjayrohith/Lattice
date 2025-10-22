import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ConversationMessage } from './conversationTypes';

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

function CodeBlock({ className, children }: CodeBlockProps): React.JSX.Element {
  const languageMatch = /language-(\w+)/.exec(className ?? '');
  const code = String(children ?? '').replace(/\n$/, '');

  if (!languageMatch) {
    return <code className={className}>{code}</code>;
  }

  return (
    <SyntaxHighlighter language={languageMatch[1]} style={oneDark} PreTag="div">
      {code}
    </SyntaxHighlighter>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }): React.JSX.Element {
  return (
    <li
      className={`conversation-message conversation-message--${message.role}`}
      data-testid={`message-${message.id}`}
      data-streaming={message.streaming ? 'true' : 'false'}
    >
      <span className="conversation-message__role">{message.role}</span>
      <div className="conversation-message__content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: (props) => <CodeBlock {...props} />,
          }}
        >
          {message.text}
        </ReactMarkdown>
      </div>
    </li>
  );
}

export interface ConversationViewProps {
  messages: readonly ConversationMessage[];
}

/**
 * Renders the message history: markdown text (including GitHub-flavored
 * tables, lists, and strikethrough via `remark-gfm`) with fenced code
 * blocks syntax-highlighted per their declared language. A message with
 * `streaming: true` renders its currently-received partial text exactly
 * like a finished one — the incremental update comes from the caller
 * re-rendering with progressively more text, not from anything special
 * this component does.
 */
export function ConversationView({ messages }: ConversationViewProps): React.JSX.Element {
  return (
    <ul className="conversation-view">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </ul>
  );
}
