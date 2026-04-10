/**
 * Speech-to-text hook. Uses Web Speech API as fallback.
 * Phase 5: can be extended for Whisper/local STT when offline.
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface UseSpeechToTextResult {
  transcript: string;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  error: string | null;
}

export function useSpeechToText(): UseSpeechToTextResult {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const SpeechRecognition =
    typeof window !== "undefined" &&
    (
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition
    );

  useEffect(() => {
    if (!SpeechRecognition) setError("Speech recognition not supported");
    return () => {
      recognitionRef.current?.stop();
    };
  }, [SpeechRecognition]);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) return;
    setError(null);
    interface RecEvent {
      results: { length: number } & Record<number, Record<number, { transcript: string }>>;
    }
    const Recognition = SpeechRecognition as new () => {
      start: () => void;
      stop: () => void;
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: (e: RecEvent) => void;
      onerror: (e: { error: string }) => void;
    };
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: RecEvent) => {
      const len = event.results.length;
      const result = event.results[len - 1];
      const t = result?.[0]?.transcript ?? "";
      setTranscript(t);
    };
    recognition.onerror = (e: { error: string }) => setError(e.error);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [SpeechRecognition]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => setTranscript(""), []);

  return {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
    error,
  };
}
