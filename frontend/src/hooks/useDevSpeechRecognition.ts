import { useState, useEffect, useRef, useCallback } from 'react';

interface UseDevSpeechRecognitionProps {
  onFinalSpeech?: (text: string) => void;
  lang?: string;
}

export function useDevSpeechRecognition({
  onFinalSpeech,
  lang = 'en-US'
}: UseDevSpeechRecognitionProps = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const onFinalSpeechRef = useRef(onFinalSpeech);

  // Keep latest callback ref without triggering effect re-runs
  useEffect(() => {
    onFinalSpeechRef.current = onFinalSpeech;
  }, [onFinalSpeech]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[SpeechRecognition] Web Speech API not supported in this browser.');
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        const transcript = res[0]?.transcript || '';
        if (res.isFinal) {
          const finalClean = transcript.trim();
          if (finalClean && onFinalSpeechRef.current) {
            console.log('[SpeechRecognition] Final transcript:', finalClean);
            onFinalSpeechRef.current(finalClean);
          }
          setInterimTranscript('');
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // Normal silence timeout, ignore
        return;
      }
      console.warn('[SpeechRecognition] Event error:', event.error);
      if (event.error === 'not-allowed') {
        setPermissionError('Microphone permission denied. Please allow microphone access in your browser settings.');
        setIsListening(false);
        isListeningRef.current = false;
      } else if (event.error === 'network') {
        console.warn('[SpeechRecognition] Network warning - retrying');
      }
    };

    recognition.onend = () => {
      // Auto-restart if we are supposed to be listening (browser pauses after silence)
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch {
          // Ignore if already started
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      isListeningRef.current = false;
      try {
        recognition.stop();
      } catch {}
    };
  }, [lang]); // Notice: isListening is NOT in dependency array, preventing instance recreation!

  const startListening = useCallback(async () => {
    setPermissionError(null);
    isListeningRef.current = true;
    setIsListening(true);

    // Explicitly prompt for microphone access via getUserMedia if needed
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release the test tracks immediately so SpeechRecognition has sole access
        stream.getTracks().forEach(t => t.stop());
      }
    } catch (e: any) {
      console.warn('[SpeechRecognition] getUserMedia error:', e);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setPermissionError('Microphone access blocked. Click the lock/mic icon in the browser address bar to allow.');
        setIsListening(false);
        isListeningRef.current = false;
        return;
      }
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e: any) {
        // If already started, ignore error
        if (e.name !== 'InvalidStateError') {
          console.warn('[SpeechRecognition] start error:', e);
        }
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

  return {
    isListening,
    isSupported,
    interimTranscript,
    permissionError,
    startListening,
    stopListening,
    toggleListening
  };
}
