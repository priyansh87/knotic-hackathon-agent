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
  const recognitionRef = useRef<any>(null);
  const isManuallyStoppedRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            const finalClean = transcript.trim();
            if (finalClean && onFinalSpeech) {
              onFinalSpeech(finalClean);
            }
            setInterimTranscript('');
          } else {
            interim += transcript;
          }
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('[SpeechRecognition] Error:', event.error);
        }
      };

      recognition.onend = () => {
        // Auto-restart if still set to listening and not manually stopped
        if (!isManuallyStoppedRef.current && isListening) {
          try {
            recognition.start();
          } catch {}
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
    } else {
      console.warn('[SpeechRecognition] Browser API not supported in this browser.');
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [lang, onFinalSpeech, isListening]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    isManuallyStoppedRef.current = false;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (e) {
      console.warn('[SpeechRecognition] Could not start recognition:', e);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    isManuallyStoppedRef.current = true;
    try {
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimTranscript('');
    } catch (e) {
      console.warn('[SpeechRecognition] Could not stop recognition:', e);
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isSupported,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening
  };
}
