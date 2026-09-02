import React, { useEffect, useState } from 'react';
import { Users, ArrowRight, ShieldAlert, X } from 'lucide-react';
import type { SummonPayload } from '../types/presence';

interface EmergencySummonModalProps {
  summon: SummonPayload | null;
  onJoinWarRoom: () => void;
  onDismiss: () => void;
}

export const EmergencySummonModal: React.FC<EmergencySummonModalProps> = ({
  summon,
  onJoinWarRoom,
  onDismiss
}) => {
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    if (!summon) return;
    setCountdown(4);

    // Audio chime using Web Audio API
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + start);
        osc.stop(audioCtx.currentTime + start + duration);
      };

      // Play emergency Teams-like tri-tone alert
      playTone(587.33, 0, 0.25); // D5
      playTone(880.00, 0.2, 0.35); // A5
      playTone(1174.66, 0.45, 0.4); // D6
    } catch (e) {
      // audio context blocked or unsupported
    }

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onJoinWarRoom();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [summon, onJoinWarRoom]);

  if (!summon) return null;

  const isCritical = summon.incident.severity === 'critical';

  return (
    <div className="summon-overlay">
      <div className="summon-modal-card">
        {/* Pulsing Alert Top Bar */}
        <div className={`summon-header ${isCritical ? 'critical' : 'warning'}`}>
          <div className="summon-header-left">
            <span className="beacon-pulse" />
            <ShieldAlert style={{ width: '22px', height: '22px', color: '#ff4d4f' }} />
            <div>
              <span className="summon-badge">
                {isCritical ? 'P1 - EMERGENCY WAR ROOM' : 'P2 - INCIDENT DETECTED'}
              </span>
              <h3 className="summon-title">{summon.incident.service} Outage</h3>
            </div>
          </div>
          <button onClick={onDismiss} className="summon-close-btn" title="Dismiss">
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="summon-body">
          <p className="summon-description">{summon.incident.description}</p>

          <div className="summon-trugen-box">
            <div className="trugen-avatar-mini">
              <span className="trugen-ai-dot" />
              <div className="trugen-ai-ring" />
            </div>
            <div className="trugen-box-text">
              <div className="trugen-box-header">
                <strong>TruGenAI Incident Commander</strong>
                <span className="ai-tag">Face-Time AI Active</span>
              </div>
              <p className="trugen-quote">"{summon.trugenGreeting}"</p>
            </div>
          </div>

          {/* Available Devs Detected via Open Windows */}
          <div className="summon-devs-section">
            <div className="summon-devs-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users style={{ width: '14px', height: '14px', color: '#10b981' }} />
                <span>Engineers Detected Live ({summon.liveCount} Available):</span>
              </div>
              <span className="summon-live-pill">● Live in Window</span>
            </div>

            <div className="summon-devs-list">
              {summon.availableDevs.map(dev => (
                <div key={dev.id} className="summon-dev-chip">
                  <div className="avatar-wrapper">
                    <img src={dev.avatar} alt={dev.name} className="dev-avatar-img" />
                    <span className="avatar-status-dot online" />
                  </div>
                  <div className="dev-chip-info">
                    <span className="dev-chip-name">{dev.name}</span>
                    <span className="dev-chip-role">{dev.role.split('-')[0]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Countdown & Action Buttons */}
          <div className="summon-footer">
            <div className="countdown-container">
              <div className="countdown-bar">
                <div
                  className="countdown-fill"
                  style={{ width: `${((4 - countdown) / 4) * 100}%` }}
                />
              </div>
              <span className="countdown-text">Auto-joining Teams War Room in <strong>{countdown}s</strong>...</span>
            </div>

            <div className="summon-actions">
              <button onClick={onDismiss} className="btn-secondary-dismiss">
                Stay on Current Page
              </button>
              <button onClick={onJoinWarRoom} className="btn-primary-join">
                <span>Enter War Room Now</span>
                <ArrowRight style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
