import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { subscribeAudioVisualCue, type AudioVisualAnchor } from "../services/audio/audioVisualBus";

export type AudioVisualPulseState = {
  anchor: AudioVisualAnchor;
  avatarId?: string;
  token: number;
} | null;

const AudioVisualPulseContext = createContext<AudioVisualPulseState>(null);

export function AudioVisualPulseProvider({ children }: { children: ReactNode }) {
  const [pulse, setPulse] = useState<AudioVisualPulseState>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeAudioVisualCue((p) => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      setPulse({
        anchor: p.anchor,
        avatarId: p.avatarId,
        token: p.atMs,
      });
      clearTimerRef.current = setTimeout(() => {
        clearTimerRef.current = null;
        setPulse(null);
      }, 450);
    });
  }, []);

  return (
    <AudioVisualPulseContext.Provider value={pulse}>
      {children}
    </AudioVisualPulseContext.Provider>
  );
}

export function useAudioVisualPulse(): AudioVisualPulseState {
  return useContext(AudioVisualPulseContext);
}
