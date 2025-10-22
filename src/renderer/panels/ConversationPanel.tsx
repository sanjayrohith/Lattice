import { useState } from 'react';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { ConversationView } from '../conversation/ConversationView';
import { useStreamingConversation } from '../conversation/useStreamingConversation';
import { ToolCallPreviewList } from '../conversation/ToolCallPreview';
import { useToolCallPreviews } from '../conversation/useToolCallPreviews';
import { useRunProgress } from '../conversation/useRunProgress';
import { RunControls } from '../conversation/RunControls';

const DEFAULT_STEP_CAP = 25;

export default function ConversationPanel(): React.JSX.Element {
  // Set by whatever starts a run once the orchestrator assigns one; until
  // then every hook below simply has nothing to report, and Stop has
  // nothing to cancel.
  const [activeRunId] = useState<string | undefined>(undefined);
  const { messages, addUserMessage } = useStreamingConversation(activeRunId);
  const toolCallPreviews = useToolCallPreviews(activeRunId);
  const progress = useRunProgress(activeRunId);

  return (
    <div className="panel panel--conversation">
      <h2 className="conversation-panel__heading">Conversation</h2>
      <ConversationView messages={messages} />
      <ToolCallPreviewList previews={toolCallPreviews} />
      <RunControls
        onSend={(text) => addUserMessage(text)}
        onStop={() => {
          if (!activeRunId) return;
          void window.electronAPI.invoke(IPC_CHANNELS.RUN_CANCEL, { runId: activeRunId });
        }}
        running={progress.running}
        currentStep={progress.currentStep}
        stepCap={DEFAULT_STEP_CAP}
        elapsedSeconds={progress.elapsedSeconds}
        usage={progress.usage}
      />
    </div>
  );
}
