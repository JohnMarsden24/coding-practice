import { useCallback, useEffect, useRef, useState } from 'react';

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => Recognition;

const Constructor: RecognitionConstructor | undefined =
  (window as unknown as { SpeechRecognition?: RecognitionConstructor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition;

export const speechSupported = Boolean(Constructor);

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings to use voice.',
  'service-not-allowed': 'Speech recognition is turned off in this browser.',
  'audio-capture': 'No microphone was found.',
  network: "Speech recognition couldn't reach its service.",
};

/**
 * Push to talk with the browser's Web Speech API. `onText` gets the transcript so far while you speak,
 * and `onDone` gets the final transcript once recognition stops.
 */
export function useSpeech({ onText, onDone }: { onText: (text: string) => void; onDone: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const transcript = useRef('');
  const callbacks = useRef({ onText, onDone });
  callbacks.current = { onText, onDone };

  const start = useCallback(() => {
    if (!Constructor || recognition.current) return;
    const rec = new Constructor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-GB';
    transcript.current = '';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      transcript.current = text.trim();
      callbacks.current.onText(transcript.current);
    };
    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') setError(ERRORS[e.error] ?? `Voice input failed (${e.error}).`);
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      callbacks.current.onDone(transcript.current);
    };
    setError(null);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  useEffect(() => () => recognition.current?.abort(), []);

  return { listening, error, start, stop };
}
