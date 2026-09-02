// Helper utility to play AI Incident Commander voice using Groq Cloud canopylabs/orpheus-v1-english model
// with seamless fallback to browser Web SpeechSynthesis

let currentAudio: HTMLAudioElement | null = null;

export async function playGroqTTS(
  text: string,
  voice: string = 'diana',
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  if (!text || !text.trim()) return;

  // Stop any currently playing audio
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}
    currentAudio = null;
  }

  // Cancel any ongoing browser speech synthesis
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  try {
    const cleanText = text
      .replace(/[*#`_~>]/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 800);

    const response = await fetch('http://localhost:5000/api/tts/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText, voice })
    });

    if (!response.ok) {
      throw new Error(`TTS server responded with ${response.status}`);
    }

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    audio.onplay = () => {
      if (onStart) onStart();
    };

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      if (onEnd) onEnd();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      fallbackWebSpeech(cleanText, onStart, onEnd);
    };

    await audio.play();
  } catch (err) {
    console.warn('[TTS] Groq orpheus-v1-english playback fallback:', err);
    fallbackWebSpeech(text, onStart, onEnd);
  }
}

function fallbackWebSpeech(text: string, onStart?: () => void, onEnd?: () => void) {
  if (!('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return;
  }

  const cleanText = text.replace(/[*#`_~>]/g, '').trim().slice(0, 500);
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
  if (naturalVoice) {
    utterance.voice = naturalVoice;
  }

  utterance.onstart = () => {
    if (onStart) onStart();
  };

  utterance.onend = () => {
    if (onEnd) onEnd();
  };

  utterance.onerror = () => {
    if (onEnd) onEnd();
  };

  window.speechSynthesis.speak(utterance);
}
