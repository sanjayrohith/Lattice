import { ConversationView } from '../conversation/ConversationView';
import { useStreamingConversation } from '../conversation/useStreamingConversation';

export default function ConversationPanel(): React.JSX.Element {
  const { messages } = useStreamingConversation();

  return (
    <div className="panel panel--conversation">
      <h2 className="conversation-panel__heading">Conversation</h2>
      <ConversationView messages={messages} />
    </div>
  );
}
