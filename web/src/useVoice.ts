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

const BrowserRecognition: RecognitionConstructor | undefined =
  (window as unknown as { SpeechRecognition?: RecognitionConstructor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition;

const canRecord = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings to use voice.',
  'service-not-allowed': 'Speech recognition is turned off in this browser.',
  'audio-capture': 'No microphone was found.',
  network: "The browser's speech recognition couldn't reach its service.",
};

let whisperCheck: Promise<boolean> | undefined;
const checkWhisper = () =>
  (whisperCheck ??= fetch('/api/voice')
    .then((r) => r.json())
    .then((d) => Boolean(d.whisper))
    .catch(() => false));

// Keeping the microphone open between presses stops the first word getting clipped.
let micStream: MediaStream | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

async function openMic(): Promise<MediaStream> {
  clearTimeout(releaseTimer);
  if (micStream?.active) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  return micStream;
}

function releaseMicLater() {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
  }, 60000);
}

export type VoiceState = 'idle' | 'listening' | 'transcribing';

/**
 * Push to talk. While you speak, the browser's speech recognition shows a rough transcript through `onText`.
 * When you let go, Whisper on the local server transcribes the recording, and `onDone` gets the final text.
 * Without Whisper, the browser's transcript is the final text.
 */
export function useVoice({
  sessionId,
  onText,
  onDone,
}: {
  sessionId: string;
  onText: (text: string) => void;
  onDone: (text: string) => void;
}) {
  const [whisper, setWhisper] = useState<boolean | null>(null);
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const phase = useRef<VoiceState>('idle');
  const mode = useRef<'whisper' | 'browser'>('browser');
  const recognition = useRef<Recognition | null>(null);
  const recognitionEnded = useRef(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const preview = useRef('');
  const startedAt = useRef(0);
  const stopRequested = useRef(false);
  const mounted = useRef(true);
  const callbacks = useRef({ onText, onDone });
  callbacks.current = { onText, onDone };

  useEffect(() => {
    void checkWhisper().then(setWhisper);
  }, []);

  const setPhase = (next: VoiceState) => {
    phase.current = next;
    setState(next);
  };

  const finish = useCallback((text: string) => {
    if (phase.current === 'idle' || !mounted.current) return;
    setPhase('idle');
    callbacks.current.onText(text);
    callbacks.current.onDone(text);
  }, []);

  const transcribe = useCallback(
    async (audio: Blob) => {
      releaseMicLater();
      if (performance.now() - startedAt.current < 400 || audio.size === 0) {
        finish(preview.current);
        return;
      }
      setPhase('transcribing');
      try {
        const res = await fetch(`/api/sessions/${sessionId}/transcribe`, {
          method: 'POST',
          headers: { 'content-type': audio.type || 'application/octet-stream' },
          body: audio,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `status ${res.status}`);
        finish(data.text || preview.current);
      } catch (e) {
        setError(`Whisper failed, so the browser's transcript was used (${(e as Error).message}).`);
        finish(preview.current);
      }
    },
    [finish, sessionId],
  );

  const start = useCallback(async () => {
    if (phase.current !== 'idle') return;
    setError(null);
    preview.current = '';
    stopRequested.current = false;
    startedAt.current = performance.now();
    mode.current = whisper && canRecord ? 'whisper' : 'browser';
    setPhase('listening');

    if (BrowserRecognition) {
      const rec = new BrowserRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || 'en-GB';
      rec.onresult = (e) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        preview.current = text.trim();
        if (phase.current === 'listening') callbacks.current.onText(preview.current);
      };
      rec.onerror = (e) => {
        if (mode.current === 'browser' && e.error !== 'no-speech' && e.error !== 'aborted') {
          setError(ERRORS[e.error] ?? `Voice input failed (${e.error}).`);
        }
      };
      rec.onend = () => {
        recognition.current = null;
        recognitionEnded.current = true;
        if (mode.current === 'browser') finish(preview.current);
      };
      recognitionEnded.current = false;
      recognition.current = rec;
      rec.start();
    }

    if (mode.current !== 'whisper') {
      if (!BrowserRecognition) setPhase('idle');
      return;
    }
    try {
      const stream = await openMic();
      if (stopRequested.current) throw new Error('released before the microphone opened');
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => void transcribe(new Blob(chunks, { type: rec.mimeType }));
      recorder.current = rec;
      rec.start();
    } catch (e) {
      mode.current = 'browser';
      if ((e as Error).name === 'NotAllowedError') setError(ERRORS['not-allowed']);
      if (recognitionEnded.current) finish(preview.current);
    }
  }, [finish, transcribe, whisper]);

  const stop = useCallback(() => {
    if (phase.current !== 'listening') return;
    stopRequested.current = true;
    recognition.current?.stop();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recorder.current = null;
  }, []);

  useEffect(() => {
    // React's development mode mounts, unmounts and remounts each component, so set this on every mount.
    mounted.current = true;
    return () => {
      mounted.current = false;
      recognition.current?.abort();
      if (recorder.current?.state === 'recording') recorder.current.stop();
    };
  }, []);

  return {
    state,
    error,
    start,
    stop,
    engine: whisper && canRecord ? ('whisper' as const) : BrowserRecognition ? ('browser' as const) : null,
    supported: Boolean(BrowserRecognition) || Boolean(whisper && canRecord),
  };
}
