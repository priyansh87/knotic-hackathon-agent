import React, { useState } from 'react';
import { Sparkles, Volume2, ShieldCheck, Eye, RefreshCw } from 'lucide-react';

interface AIFaceTimeTileProps {
  isSpeaking: boolean;
  latestTranscript: string;
  confidence?: number;
  statusText?: string;
  isSpotlight?: boolean;
  onToggleSpotlight?: () => void;
}

interface AvatarPersona {
  id: string;
  name: string;
  title: string;
  image: string;
}

const PERSONAS: AvatarPersona[] = [
  {
    id: 'anya',
    name: 'Anya Sharma',
    title: 'Autonomous AI Incident Commander',
    image: '/avatars/trugen_anya.jpg'
  },
  {
    id: 'elias',
    name: 'Elias Thorne',
    title: 'Platform Resilience & SRE Commander',
    image: '/avatars/trugen_elias.jpg'
  }
];

export const AIFaceTimeTile: React.FC<AIFaceTimeTileProps> = ({
  isSpeaking,
  latestTranscript,
  confidence = 85,
  statusText,
  isSpotlight = false,
  onToggleSpotlight
}) => {
  const [currentPersonaIndex, setCurrentPersonaIndex] = useState(0);
  const persona = PERSONAS[currentPersonaIndex];

  const switchPersona = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPersonaIndex(prev => (prev + 1) % PERSONAS.length);
  };

  return (
    <div className={`video-tile trugen-face-tile ai-face-tile ${isSpeaking ? 'speaking-active' : ''} ${isSpotlight ? 'spotlight' : ''}`}>
      {/* 1. Full-tile background video feed */}
      <div className="trugen-video-bg-layer">
        <img
          src={persona.image}
          alt={persona.name}
          className={`trugen-avatar-img ${isSpeaking ? 'speaking-motion' : 'idle-breathing'}`}
        />
        <div className="video-vignette-overlay" />
      </div>

      {/* 2. Floating Top Header Bar */}
      <div className="tile-floating-top">
        <div className="ai-badge-group">
          <span className="trugen-logo-chip" title="Autonomous AI SRE Incident Commander">
            <Sparkles style={{ width: '12px', height: '12px', color: '#38bdf8' }} />
            <span>AI Commander</span>
            <span className="huma-tag">Neural SRE</span>
          </span>

          <span className={`ai-status-pill ${isSpeaking ? 'speaking' : 'ready'}`}>
            <span className="status-ping-dot" />
            {isSpeaking ? 'SPEAKING' : 'LISTENING'}
          </span>

          <span className="hawkeye-vision-chip" title="Real-time Engineer Vision & Attendance Tracking">
            <Eye style={{ width: '10px', height: '10px', color: '#10b981' }} />
            <span>Vision Active</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {confidence > 0 && (
            <div className="confidence-chip" title="Calibrated Root Cause Confidence">
              <ShieldCheck style={{ width: '11px', height: '11px', color: '#10b981' }} />
              <span>{confidence}% CONFIDENCE</span>
            </div>
          )}

          <button
            onClick={switchPersona}
            className="btn-persona-switch"
            title="Switch AI SRE Persona"
          >
            <RefreshCw style={{ width: '10px', height: '10px' }} />
            <span>Switch Face</span>
          </button>
        </div>
      </div>

      {/* 3. Center Speech Energy Indicator (when speaking) */}
      {isSpeaking && (
        <div className="center-speech-ripple">
          <span className="speech-pulse-circle p1" />
          <span className="speech-pulse-circle p2" />
        </div>
      )}

      {/* 4. Floating Bottom Info & Subtitles */}
      <div className="tile-floating-bottom">
        {/* Dynamic Action Subtext */}
        {statusText && (
          <div className="trugen-action-banner">
            <span className="action-text">{statusText}</span>
          </div>
        )}

        {/* Live Subtitles */}
        {latestTranscript && (
          <div className="floating-captions-box">
            <span className="caption-tag">{persona.name}:</span>
            <p className="caption-text">{latestTranscript}</p>
          </div>
        )}

        {/* Audio Visualizer Spectrum */}
        <div className="floating-audio-spectrum">
          {[40, 75, 95, 60, 85, 100, 70, 90, 50, 80, 65, 95, 45, 85, 60, 75, 50, 80].map((h, i) => (
            <div
              key={i}
              className={`spectrum-bar ${isSpeaking ? 'active' : ''}`}
              style={{
                height: isSpeaking ? `${Math.max(3, (h * ((i % 3) + 1)) % 14)}px` : '2px',
                animationDelay: `${i * 0.04}s`
              }}
            />
          ))}
        </div>

        {/* Participant Name Pill */}
        <div className="tile-name-footer">
          <div className="participant-name-pill">
            <span className="teams-avatar-dot ai" />
            <span className="trugen-display-name">{persona.name} (AI Incident Commander)</span>
          </div>

          <div className="tile-icons-group">
            <div className="mic-active-pill" title="AI Voice Active">
              <Volume2 style={{ width: '12px', height: '12px', color: '#38bdf8' }} />
            </div>
            {onToggleSpotlight && (
              <button
                onClick={onToggleSpotlight}
                className="btn-tile-spotlight"
                title={isSpotlight ? 'Exit Spotlight' : 'Spotlight AI Commander'}
              >
                {isSpotlight ? 'Unpin' : 'Pin'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
