import { ConversationView } from '../conversation/ConversationView';
import { useStreamingConversation } from '../conversation/useStreamingConversation';
import { ToolCallPreviewList } from '../conversation/ToolCallPreview';
import { useToolCallPreviews } from '../conversation/useToolCallPreviews';

export default function ConversationPanel(): React.JSX.Element {
  const { messages } = useStreamingConversation();
  const toolCallPreviews = useToolCallPreviews();

  return (
    <div className="panel panel--conversation">
      <h2 className="conversation-panel__heading">Conversation</h2>
      <ConversationView messages={messages} />
      <ToolCallPreviewList previews={toolCallPreviews} />
    </div>
  );
}
