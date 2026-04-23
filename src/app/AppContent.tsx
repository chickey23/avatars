import "../App.css";
import { useAppContentModel } from "./useAppContentModel";
import { AppContentViewProvider } from "./appContentViewContext";
import { AppHeader } from "./AppHeader";
import { PrimaryAvatarSidebar } from "./PrimaryAvatarSidebar";
import { ChatMainPanel } from "./ChatMainPanel";
import { ContextPanel } from "./ContextPanel";
import { AppOverlays } from "./AppOverlays";
import { AudioVisualPulseProvider } from "./audioVisualPulseContext";

export function AppContent() {
  const m = useAppContentModel();
  return (
    <AppContentViewProvider value={m}>
      <AudioVisualPulseProvider>
        <div className="app">
          <AppHeader />
          <PrimaryAvatarSidebar />
          <ChatMainPanel />
          <ContextPanel />
          <AppOverlays />
        </div>
      </AudioVisualPulseProvider>
    </AppContentViewProvider>
  );
}
