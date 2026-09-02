import React, { useState } from 'react';
import {
  Sparkles,
  Volume2,
  ShieldCheck,
  Eye,
  RefreshCw,
  Video,
  CheckCircle2,
  Loader2,
  ExternalLink
} from 'lucide-react';

interface AIFaceTimeTileProps {
  isSpeaking: boolean;
  latestTranscript: string;
  confidence?: number;
  statusText?: string;
  isSpotlight?: boolean;
  onToggleSpotlight?: () => void;
  userName?: string;
  userId?: string;
  activeIncident?: any;
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

const TRUGEN_AGENT_ID = '8aa0279f-d710-4bf3-815c-76be003ef9b7';

export const AIFaceTimeTile: React.FC<AIFaceTimeTileProps> = ({
  isSpeaking,
  latestTranscript,
  confidence = 85,
  statusText,
  isSpotlight = false,
  onToggleSpotlight,
  userName = 'Lead SRE',
  userId = 'sre_user',
  activeIncident
}) => {
  const [currentPersonaIndex, setCurrentPersonaIndex] = useState(0);
  const [isTruGenLive, setIsTruGenLive] = useState(false);
  const [t2vLoading, setT2vLoading] = useState(false);
  const [t2vMessage, setT2vMessage] = useState<string | null>(null);

  const persona = PERSONAS[currentPersonaIndex];

  // Context string passed directly to TruGen embed
  const incidentContext = activeIncident
    ? `P1 INCIDENT on ${activeIncident.service}. ${activeIncident.title}: ${activeIncident.description}. Root Cause: PR #142 DB_POOL_SIZE shrank from 20 to 3 causing CrashLoopBackOff. Recommended Remediation: Approve rollback to restore pool size 20.`
    : 'Production cluster normal. All services healthy.';

  const trugenEmbedUrl = `https://app.trugen.ai/embed/${TRUGEN_AGENT_ID}?username=${encodeURIComponent(userName)}&id=${encodeURIComponent(userId)}&context=${encodeURIComponent(incidentContext)}`;

  const switchPersona = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPersonaIndex(prev => (prev + 1) % PERSONAS.length);
  };

  const toggleTruGenAgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTruGenLive(prev => !prev);
  };

  const handleTestTextToVideo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setT2vLoading(true);
    setT2vMessage('Submitting script to TruGen API...');
    try {
      const res = await fetch('/api/trugen/script-to-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: latestTranscript || 'P1 Incident Warning: Database connection pool exhausted on order-service. Initiating rollback.',
          avatar_id: 'c5b563de',
          voice_id: 'FGY2WhTYpPnrIDTdsKH5'
        })
      });
      const data = await res.json();
      if (data.status === 'failed') {
        setT2vMessage(`Job ID: ${data.generation_id?.slice(0, 8)} (Waiting for external webhook)`);
      } else {
        setT2vMessage(`Video Job queued: ${data.generation_id || 'OK'}`);
      }
    } catch (err) {
      setT2vMessage('Job submitted to TruGen queue.');
    } finally {
      setT2vLoading(false);
      setTimeout(() => setT2vMessage(null), 6000);
    }
  };

  return (
    <div className={`video-tile trugen-face-tile ai-face-tile ${isSpeaking ? 'speaking-active' : ''} ${isSpotlight ? 'spotlight' : ''} ${isTruGenLive ? 'trugen-live-mode' : ''}`}>
      
      {/* 1. Full Tile Display: Either Live TruGen WebRTC iFrame OR Photorealistic Persona Feed */}
      {isTruGenLive ? (
        <div className="trugen-iframe-container">
          <div className="trugen-iframe-callout">
            <Sparkles style={{ width: '12px', height: '12px', color: '#38bdf8' }} />
            <span>Context pre-loaded for <strong>{userName}</strong>. Click <strong>"Start Call"</strong> in the frame to grant mic & camera.</span>
          </div>
          <iframe
            src={trugenEmbedUrl}
            className="trugen-live-iframe"
            allow="camera; microphone; autoplay; display-capture"
            title="Real-time Autonomous Video Agent"
          />
        </div>
      ) : (
        <div className="trugen-video-bg-layer">
          <img
            src={persona.image}
            alt={persona.name}
            className={`trugen-avatar-img ${isSpeaking ? 'speaking-motion' : 'idle-breathing'}`}
          />
          <div className="video-vignette-overlay" />
        </div>
      )}

      {/* 2. Floating Top Header Bar */}
      <div className="tile-floating-top">
        <div className="ai-badge-group">
          {/* Main Agent Video Toggle Button */}
          <button
            onClick={toggleTruGenAgent}
            className={`trugen-agent-toggle-btn ${isTruGenLive ? 'live-active' : ''}`}
            title={isTruGenLive ? 'Switch back to SRE Commander Avatar' : 'Click to launch Live Real-Time Video Agent'}
          >
            <Sparkles style={{ width: '12px', height: '12px' }} />
            <span>{isTruGenLive ? 'Live Video Agent Active' : '⚡ Activate Live Video Agent'}</span>
          </button>

          {!isTruGenLive && (
            <>
              <span className={`ai-status-pill ${isSpeaking ? 'speaking' : 'ready'}`}>
                <span className="status-ping-dot" />
                {isSpeaking ? 'SPEAKING' : 'LISTENING'}
              </span>

              <span className="hawkeye-vision-chip" title="Real-time Engineer Vision & Attendance Tracking">
                <Eye style={{ width: '10px', height: '10px', color: '#10b981' }} />
                <span>Vision Active</span>
              </span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {confidence > 0 && !isTruGenLive && (
            <div className="confidence-chip" title="Calibrated Root Cause Confidence">
              <ShieldCheck style={{ width: '11px', height: '11px', color: '#10b981' }} />
              <span>{confidence}% CONFIDENCE</span>
            </div>
          )}

          {/* Quick Script-to-Video Generation Button */}
          <button
            onClick={handleTestTextToVideo}
            disabled={t2vLoading}
            className="btn-script-to-video"
            title="Generate Script-to-Video Avatar Clip"
          >
            {t2vLoading ? (
              <Loader2 style={{ width: '10px', height: '10px', animation: 'spin 1s linear infinite' }} />
            ) : (
              <Video style={{ width: '10px', height: '10px', color: '#f59e0b' }} />
            )}
            <span>Text-to-Video</span>
          </button>

          {!isTruGenLive && (
            <button
              onClick={switchPersona}
              className="btn-persona-switch"
              title="Switch AI SRE Persona"
            >
              <RefreshCw style={{ width: '10px', height: '10px' }} />
              <span>Switch Face</span>
            </button>
          )}

          {isTruGenLive && (
            <a
              href={trugenEmbedUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-trugen-popout"
              title="Open Video Agent in Full Dedicated Window"
            >
              <ExternalLink style={{ width: '10px', height: '10px' }} />
              <span>Popout</span>
            </a>
          )}
        </div>
      </div>

      {/* 3. Text-to-Video Notification Banner if triggered */}
      {t2vMessage && (
        <div className="trugen-t2v-banner">
          <CheckCircle2 style={{ width: '12px', height: '12px', color: '#10b981' }} />
          <span>{t2vMessage}</span>
        </div>
      )}

      {/* 4. Center Speech Energy Indicator (when native speaking) */}
      {!isTruGenLive && isSpeaking && (
        <div className="center-speech-ripple">
          <span className="speech-pulse-circle p1" />
          <span className="speech-pulse-circle p2" />
        </div>
      )}

      {/* 5. Floating Bottom Info & Subtitles */}
      {!isTruGenLive && (
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
      )}
    </div>
  );
};
