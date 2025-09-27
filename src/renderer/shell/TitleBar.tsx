import { IPC_CHANNELS } from '@shared/ipc/channels';

type WindowControlChannel =
  | typeof IPC_CHANNELS.WINDOW_MINIMIZE
  | typeof IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE
  | typeof IPC_CHANNELS.WINDOW_CLOSE;

function callWindowControl(channel: WindowControlChannel): void {
  void window.electronAPI.invoke(channel, undefined);
}

export function TitleBar(): React.JSX.Element {
  return (
    <header className="title-bar">
      <div className="title-bar__drag-region">
        <span className="title-bar__title">Lattice</span>
      </div>
      <div className="title-bar__controls">
        <button
          type="button"
          aria-label="Minimize window"
          className="title-bar__button"
          onClick={() => callWindowControl(IPC_CHANNELS.WINDOW_MINIMIZE)}
        >
          &#x2013;
        </button>
        <button
          type="button"
          aria-label="Maximize or restore window"
          className="title-bar__button"
          onClick={() => callWindowControl(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE)}
        >
          &#x25A1;
        </button>
        <button
          type="button"
          aria-label="Close window"
          className="title-bar__button title-bar__button--close"
          onClick={() => callWindowControl(IPC_CHANNELS.WINDOW_CLOSE)}
        >
          &#x2715;
        </button>
      </div>
    </header>
  );
}
