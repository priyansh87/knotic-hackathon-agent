import React, { useState, useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  Hand,
  Smile,
  Users,
  MessageSquare,
  PhoneOff,
  CheckCircle,
  GitPullRequest,
  Server,
  Terminal,
  Send,
  Sparkles,
  ShieldAlert,
  RotateCcw,
  Layers,
  LayoutGrid
} from 'lucide-react';
import { AIFaceTimeTile } from './AIFaceTimeTile';
import type { DevPresence, WarRoomMessage, WarRoomReaction } from '../types/presence';

interface Pod {
  name: string;
  status: string;
  restarts: number;
  ready: boolean;
  age: string;
}

interface Incident {
  id: string;
  service: string;
  status: 'active' | 'resolved';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  confidence: number;
  likelyCause: string;
  actionsTaken: string[];
  timeline: { timestamp: string; type: string; message: string }[];
  createdAt: string;
}

interface TeamsWarRoomProps {
  socket: Socket | null;
  activeIncident: Incident | null;
  pods: Pod[];
  myDev: DevPresence;
  activeDevs: DevPresence[];
  liveCount: number;
  transcripts: { sender: string; text: string; timestamp: string }[];
  isTruGenSpeaking: boolean;
  onLeaveWarRoom: () => void;
  onSendInstruction: (text: string) => void;
  onTriggerRollback: () => void;
  onTriggerScale: () => void;
  onResolveIncident: (id: string) => void;
  consoleLogs: { timestamp: string; source: string; message: string }[];
  isBrowserListening?: boolean;
  isBrowserSpeechSupported?: boolean;
  interimTranscript?: string;
  onStartListening?: () => void;
  onStopListening?: () => void;
  onToggleListening?: () => void;
}

export const TeamsWarRoom: React.FC<TeamsWarRoomProps> = ({
  socket,
  activeIncident,
  pods,
  myDev,
  activeDevs,
  liveCount,
  transcripts,
  isTruGenSpeaking,
  onLeaveWarRoom,
  onSendInstruction,
  onTriggerRollback,
  onTriggerScale,
  onResolveIncident,
  consoleLogs,
  isBrowserListening = false,
  isBrowserSpeechSupported = true,
  interimTranscript = '',
  onStartListening,
  onStopListening
}) => {
  // Meeting Controls State
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<'chat' | 'people' | 'brief' | null>('chat');
  const [viewMode, setViewMode] = useState<'gallery' | 'spotlight' | 'stage'>('gallery');
  const [stageTab, setStageTab] = useState<'k8s' | 'diff' | 'logs'>('diff');

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (nextMuted) {
      if (onStopListening) onStopListening();
    } else {
      if (onStartListening) onStartListening();
    }
  };
  
  // Floating reactions
  const [floatingReactions, setFloatingReactions] = useState<WarRoomReaction[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Real connected peers (excluding current user)
  const peerDevs = activeDevs.filter(d => d.id !== myDev.id);
  const totalTiles = 2 + peerDevs.length;

  // Chat input
  const [chatInput, setChatInput] = useState('');
  const [meetingChat, setMeetingChat] = useState<WarRoomMessage[]>([
    {
      id: 'msg_init',
      sender: 'TruGenAI Commander',
      role: 'Autonomous SRE Agent',
      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      text: 'War Room initialized. Correlation telemetry active. Ready for incident triage.',
      timestamp: new Date().toLocaleTimeString(),
      isAI: true
    }
  ]);

  // Meeting Duration Timer
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  // Webcam Video Ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // WebCam Handler
  useEffect(() => {
    if (isCameraOn) {
      navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
        .then(stream => {
          mediaStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(() => {
          // Webcam not available or denied; keep avatar
          setIsCameraOn(false);
        });
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
    }
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraOn]);

  // Socket War Room Listeners
  useEffect(() => {
    if (!socket) return;

    const handleChat = (msg: WarRoomMessage) => {
      setMeetingChat(prev => [...prev, msg]);
    };

    const handleReaction = (reaction: WarRoomReaction) => {
      setFloatingReactions(prev => [...prev, reaction]);
      setTimeout(() => {
        setFloatingReactions(prev => prev.filter(r => r.id !== reaction.id));
      }, 3500);
    };

    socket.on('warroom_chat_broadcast', handleChat);
    socket.on('warroom_reaction_broadcast', handleReaction);

    return () => {
      socket.off('warroom_chat_broadcast', handleChat);
      socket.off('warroom_reaction_broadcast', handleReaction);
    };
  }, [socket]);

  // Autoscroll chat
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [meetingChat, transcripts]);

  const sendChatMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const newMsg: WarRoomMessage = {
      id: `chat_${Date.now()}`,
      sender: myDev.name,
      role: myDev.role,
      avatar: myDev.avatar,
      text: chatInput,
      timestamp: new Date().toLocaleTimeString()
    };

    if (socket) {
      socket.emit('warroom_chat_send', newMsg);
    } else {
      setMeetingChat(prev => [...prev, newMsg]);
    }

    // Also send to AI completion loop
    onSendInstruction(chatInput);
    setChatInput('');
  };

  const triggerReaction = (emoji: string) => {
    const reaction: WarRoomReaction = {
      id: `react_${Date.now()}_${Math.random()}`,
      devId: myDev.id,
      name: myDev.name,
      emoji
    };
    if (socket) {
      socket.emit('warroom_reaction_send', reaction);
    } else {
      setFloatingReactions(prev => [...prev, reaction]);
      setTimeout(() => {
        setFloatingReactions(prev => prev.filter(r => r.id !== reaction.id));
      }, 3500);
    }
    setShowEmojiPicker(false);
  };

  const latestAgentTranscript = transcripts
    .filter(t => t.sender === 'Agent')
    .slice(-1)[0]?.text || '';

  return (
    <div className="teams-app-container">
      {/* 1. TEAMS TOP MEETING BAR */}
      <header className="teams-header-bar">
        <div className="teams-header-left">
          <div className="teams-icon-badge">
            <ShieldAlert style={{ width: '18px', height: '18px', color: '#ffffff' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="teams-p1-tag">
                {activeIncident ? activeIncident.severity.toUpperCase() : 'P1 - EMERGENCY'}
              </span>
              <h2 className="teams-meeting-title">
                {activeIncident ? activeIncident.title : 'Active Incident Triage War Room'}
              </h2>
            </div>
            <div className="teams-header-meta">
              <span className="rec-badge">
                <span className="rec-dot" /> REC
              </span>
              <span className="meta-divider">|</span>
              <span className="timer-text">{formatTimer(secondsElapsed)}</span>
              <span className="meta-divider">|</span>
              <span className="service-chip">
                Service: <strong>{activeIncident?.service || 'order-service'}</strong>
              </span>
              <span className="meta-divider">|</span>
              <span className="dev-count-chip">
                🟢 {liveCount} Engineers in Meeting
              </span>
            </div>
          </div>
        </div>

        {/* Teams View Switcher & Spotlight Mode */}
        <div className="teams-header-right">
          <div className="view-mode-selector">
            <button
              onClick={() => setViewMode('gallery')}
              className={`view-mode-btn ${viewMode === 'gallery' ? 'active' : ''}`}
              title="Gallery Grid"
            >
              <LayoutGrid style={{ width: '14px', height: '14px' }} />
              <span>Gallery</span>
            </button>
            <button
              onClick={() => setViewMode('spotlight')}
              className={`view-mode-btn ${viewMode === 'spotlight' ? 'active' : ''}`}
              title="TruGenAI Spotlight"
            >
              <Sparkles style={{ width: '14px', height: '14px' }} />
              <span>AI Spotlight</span>
            </button>
            <button
              onClick={() => setViewMode('stage')}
              className={`view-mode-btn ${viewMode === 'stage' ? 'active' : ''}`}
              title="Shared Stage"
            >
              <ScreenShare style={{ width: '14px', height: '14px' }} />
              <span>Shared Stage</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. TEAMS MAIN BODY: Video Grid + Shared Stage + Right Drawers */}
      <div className="teams-workspace">
        {/* CENTER CONTENT */}
        <main className={`teams-stage-area ${activeDrawer ? 'with-drawer' : ''}`}>
          
          {/* Floating Emoji Reactions Overlay */}
          <div className="floating-reactions-canvas">
            {floatingReactions.map(r => (
              <div key={r.id} className="reaction-particle">
                <span className="particle-emoji">{r.emoji}</span>
                <span className="particle-author">{r.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>

          {/* VIEW MODE: STAGE (Shared Screen with K8s & PR Diff) */}
          {viewMode === 'stage' ? (
            <div className="shared-stage-container">
              <div className="stage-top-bar">
                <div className="stage-tabs">
                  <button
                    onClick={() => setStageTab('diff')}
                    className={`stage-tab-btn ${stageTab === 'diff' ? 'active' : ''}`}
                  >
                    <GitPullRequest style={{ width: '14px', height: '14px' }} />
                    <span>Correlated PR #142 Diff</span>
                  </button>
                  <button
                    onClick={() => setStageTab('k8s')}
                    className={`stage-tab-btn ${stageTab === 'k8s' ? 'active' : ''}`}
                  >
                    <Server style={{ width: '14px', height: '14px' }} />
                    <span>Kubernetes Cluster Topology</span>
                  </button>
                  <button
                    onClick={() => setStageTab('logs')}
                    className={`stage-tab-btn ${stageTab === 'logs' ? 'active' : ''}`}
                  >
                    <Terminal style={{ width: '14px', height: '14px' }} />
                    <span>Live Execution Logs</span>
                  </button>
                </div>
                <div className="stage-author-pill">
                  <ScreenShare style={{ width: '13px', height: '13px', color: '#10b981' }} />
                  <span>Screen Shared by TruGenAI & On-Call Team</span>
                </div>
              </div>

              {/* Stage Content */}
              <div className="stage-main-display">
                {stageTab === 'diff' && (
                  <div className="pr-diff-viewer">
                    <div className="diff-header">
                      <span className="diff-pr-id">PR #142</span>
                      <span className="diff-pr-title">"Optimized db config for dev testing"</span>
                      <span className="diff-author">Author: priyansh-dev (Merged 15m ago)</span>
                      <span className="diff-confidence-tag">85% Root Cause Match</span>
                    </div>
                    <div className="diff-code-body">
                      <div className="diff-file-heading">
                        <span>k8s/order-service-deployment.yaml</span>
                      </div>
                      <div className="diff-lines">
                        <div className="diff-line unchanged">
                          <span className="line-no">24</span>
                          <span className="code-text">            - name: DB_HOST</span>
                        </div>
                        <div className="diff-line unchanged">
                          <span className="line-no">25</span>
                          <span className="code-text">              value: "postgres-service"</span>
                        </div>
                        <div className="diff-line removed">
                          <span className="line-no">26</span>
                          <span className="code-text">-           - name: DB_POOL_SIZE</span>
                        </div>
                        <div className="diff-line removed">
                          <span className="line-no">27</span>
                          <span className="code-text">-             value: "20"</span>
                        </div>
                        <div className="diff-line added">
                          <span className="line-no">26</span>
                          <span className="code-text">+           - name: DB_POOL_SIZE</span>
                        </div>
                        <div className="diff-line added">
                          <span className="line-no">27</span>
                          <span className="code-text">+             value: "3"  # EXHAUSTION BUG UNDER LOAD!</span>
                        </div>
                        <div className="diff-line unchanged">
                          <span className="line-no">28</span>
                          <span className="code-text">            - name: PORT</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {stageTab === 'k8s' && (
                  <div className="stage-k8s-grid">
                    {pods.length === 0 ? (
                      <div className="empty-stage-state">
                        <Server style={{ width: '32px', height: '32px', color: '#6b7280' }} />
                        <p>No active pods detected. Connect cluster or start demo services.</p>
                      </div>
                    ) : (
                      pods.map(p => {
                        const isOk = p.ready && p.status === 'Running';
                        const isCrash = p.status.includes('CrashLoop') || (p.restarts > 0 && !p.ready);
                        return (
                          <div key={p.name} className={`stage-pod-card ${isOk ? 'healthy' : isCrash ? 'crash' : 'warn'}`}>
                            <div className="stage-pod-header">
                              <span className="stage-pod-name">{p.name}</span>
                              <span className={`pod-indicator-dot ${isOk ? 'green' : 'red'}`} />
                            </div>
                            <div className="stage-pod-meta">
                              <span>Status: <strong>{p.status}</strong></span>
                              <span>Restarts: <strong>{p.restarts}</strong></span>
                              <span>Age: {p.age}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {stageTab === 'logs' && (
                  <div className="stage-terminal-stream">
                    {consoleLogs.slice(-15).map((log, idx) => (
                      <div key={idx} className="stage-log-line">
                        <span className="stage-log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className={`stage-log-src ${log.source}`}>[{log.source.toUpperCase()}]</span>
                        <span className="stage-log-msg">{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Minimized AI Incident Commander Face-Time PiP in Stage Mode */}
              <div className="stage-ai-pip">
                <AIFaceTimeTile
                  isSpeaking={isTruGenSpeaking}
                  latestTranscript={latestAgentTranscript}
                  confidence={activeIncident?.confidence || 85}
                  statusText={isTruGenSpeaking ? 'Explaining diff correlation...' : 'Spotlighting code diff'}
                />
              </div>
            </div>
          ) : (
            /* VIEW MODE: GALLERY & SPOTLIGHT VIDEO GRID */
            <div className={`teams-video-grid ${viewMode === 'spotlight' ? 'spotlight-layout' : 'grid-layout'} tiles-${Math.min(totalTiles, 4)}`}>
              
              {/* TILE 1: AUTONOMOUS AI INCIDENT COMMANDER */}
              <AIFaceTimeTile
                isSpeaking={isTruGenSpeaking}
                latestTranscript={latestAgentTranscript}
                confidence={activeIncident?.confidence || 85}
                isSpotlight={viewMode === 'spotlight'}
                onToggleSpotlight={() => setViewMode(prev => prev === 'spotlight' ? 'gallery' : 'spotlight')}
              />

              {/* TILE 2: YOU (LEAD SRE - CURRENT BROWSER WINDOW) */}
              <div className="video-tile human-tile user-tile">
                <div className="tile-header-bar">
                  <span className="window-status-badge active">
                    <span className="pulse-green-dot" />
                    LIVE IN TAB
                  </span>
                  {isBrowserListening && !isMuted && (
                    <span className="speech-listening-chip" title="Browser Web Speech Recognition Active">
                      <Mic style={{ width: '10px', height: '10px', color: '#22d3ee' }} />
                      <span>{interimTranscript ? `"${interimTranscript}..."` : 'Listening...'}</span>
                    </span>
                  )}
                  {isHandRaised && (
                    <span className="hand-raised-badge">
                      <Hand style={{ width: '12px', height: '12px' }} /> HAND RAISED
                    </span>
                  )}
                </div>

                <div className="video-tile-stage">
                  {isCameraOn ? (
                    <video ref={videoRef} autoPlay playsInline muted className="webcam-feed" />
                  ) : (
                    <div className="human-avatar-circle">
                      <img src={myDev.avatar} alt={myDev.name} className="tile-avatar-image" />
                      <div className="avatar-speaking-glow" />
                    </div>
                  )}
                </div>

                <div className="tile-bottom-bar">
                  <div className="participant-name-pill">
                    <span className="teams-avatar-dot user" />
                    <span>{myDev.name} ({myDev.role})</span>
                  </div>
                  <div className="tile-icons-group">
                    {isMuted ? (
                      <MicOff style={{ width: '13px', height: '13px', color: '#ef4444' }} />
                    ) : (
                      <div className="user-audio-meter">
                        <span /><span /><span />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* TILE 3+: REAL CONNECTED SRE PEERS (Only rendered if actual other browser sessions are open) */}
              {peerDevs.map((dev) => (
                <div key={dev.id} className="video-tile human-tile peer-tile">
                  <div className="tile-header-bar">
                    <span className={`window-status-badge ${dev.windowFocused ? 'active' : 'away'}`}>
                      <span className={dev.windowFocused ? 'pulse-green-dot' : 'away-dot'} />
                      {dev.windowFocused ? 'ACTIVE IN TAB' : 'TAB IN BACKGROUND'}
                    </span>
                    {dev.status === 'in_warroom' && (
                      <span className="peer-active-pill">In War Room</span>
                    )}
                  </div>

                  <div className="video-tile-stage">
                    <div className="human-avatar-circle">
                      <img src={dev.avatar} alt={dev.name} className="tile-avatar-image" />
                    </div>
                  </div>

                  <div className="tile-bottom-bar">
                    <div className="participant-name-pill">
                      <span className="teams-avatar-dot peer" />
                      <span>{dev.name} ({dev.role.split('-')[0]})</span>
                    </div>
                    <div className="tile-icons-group">
                      <div className="user-audio-meter">
                        <span /><span /><span />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            </div>
          )}
        </main>

        {/* 3. TEAMS RIGHT DRAWER (Chat / People / Incident Brief) */}
        {activeDrawer && (
          <aside className="teams-drawer-sidebar">
            {/* Drawer Header with Tabs */}
            <div className="drawer-header-tabs">
              <button
                onClick={() => setActiveDrawer('chat')}
                className={`drawer-tab-btn ${activeDrawer === 'chat' ? 'active' : ''}`}
              >
                <MessageSquare style={{ width: '15px', height: '15px' }} />
                <span>War Room Chat</span>
              </button>
              <button
                onClick={() => setActiveDrawer('people')}
                className={`drawer-tab-btn ${activeDrawer === 'people' ? 'active' : ''}`}
              >
                <Users style={{ width: '15px', height: '15px' }} />
                <span>Engineers ({activeDevs.length + 1})</span>
              </button>
              <button
                onClick={() => setActiveDrawer('brief')}
                className={`drawer-tab-btn ${activeDrawer === 'brief' ? 'active' : ''}`}
              >
                <ShieldAlert style={{ width: '15px', height: '15px' }} />
                <span>Incident Brief</span>
              </button>
            </div>

            {/* DRAWER TAB 1: WAR ROOM CHAT */}
            {activeDrawer === 'chat' && (
              <div className="drawer-chat-view">
                <div className="chat-messages-container">
                  {meetingChat.map(msg => (
                    <div key={msg.id} className={`chat-message-item ${msg.isAI ? 'ai-sender' : ''}`}>
                      <img src={msg.avatar} alt={msg.sender} className="chat-avatar" />
                      <div className="chat-content">
                        <div className="chat-meta">
                          <span className="chat-author">{msg.sender}</span>
                          <span className="chat-time">{msg.timestamp}</span>
                        </div>
                        <p className="chat-bubble">{msg.text}</p>
                      </div>
                    </div>
                  ))}

                  {/* Transcripts stream */}
                  {transcripts.slice(-4).map((t, idx) => (
                    <div key={`trans_${idx}`} className={`chat-message-item ${t.sender === 'Agent' ? 'ai-sender' : ''}`}>
                      <div className="chat-content" style={{ width: '100%' }}>
                        <div className="chat-meta">
                          <span className="chat-author">🎙️ {t.sender === 'Agent' ? 'TruGenAI Voice' : 'Engineer Voice'}</span>
                          <span className="chat-time">{t.timestamp}</span>
                        </div>
                        <p className="chat-bubble voice-bubble">{t.text}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatScrollRef} />
                </div>

                {/* Quick prompt pills */}
                <div className="quick-action-pills">
                  <button onClick={() => onSendInstruction('Investigate order-service logs and git PRs')} className="quick-pill">
                    🔍 Investigate Cause
                  </button>
                  <button onClick={() => onSendInstruction('Rollback the deployment now')} className="quick-pill">
                    ⏪ Rollback PR #142
                  </button>
                  <button onClick={() => onSendInstruction('Check policy constraints')} className="quick-pill">
                    🧠 Check Constraints
                  </button>
                </div>

                {/* Chat Input Bar */}
                <form onSubmit={sendChatMessage} className="teams-chat-input-bar">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Ask TruGenAI or message the team..."
                    className="teams-input-field"
                  />
                  <button type="submit" className="btn-teams-send" title="Send">
                    <Send style={{ width: '14px', height: '14px' }} />
                  </button>
                </form>
              </div>
            )}

            {/* DRAWER TAB 2: PARTICIPANTS & WINDOW PRESENCE */}
            {activeDrawer === 'people' && (
              <div className="drawer-people-view">
                <div className="people-group-title">
                  <span>IN THIS WAR ROOM ({liveCount + 1})</span>
                </div>

                {/* TruGenAI */}
                <div className="people-item ai">
                  <div className="avatar-wrapper">
                    <div className="ai-icon-circle">
                      <Sparkles style={{ width: '14px', height: '14px', color: '#38bdf8' }} />
                    </div>
                    <span className="avatar-status-dot online" />
                  </div>
                  <div className="people-info">
                    <span className="people-name">TruGenAI Commander</span>
                    <span className="people-role">Autonomous SRE Agent</span>
                  </div>
                  <span className="host-pill">HOST</span>
                </div>

                {/* You */}
                <div className="people-item">
                  <div className="avatar-wrapper">
                    <img src={myDev.avatar} alt={myDev.name} className="people-avatar" />
                    <span className="avatar-status-dot online" />
                  </div>
                  <div className="people-info">
                    <span className="people-name">{myDev.name} (You)</span>
                    <span className="people-role">{myDev.role}</span>
                  </div>
                  <span className="window-pill live">Active Tab</span>
                </div>

                {/* Active Devs */}
                {activeDevs.map(dev => (
                  <div key={dev.id} className="people-item">
                    <div className="avatar-wrapper">
                      <img src={dev.avatar} alt={dev.name} className="people-avatar" />
                      <span className={`avatar-status-dot ${dev.status === 'live' ? 'online' : 'away'}`} />
                    </div>
                    <div className="people-info">
                      <span className="people-name">{dev.name}</span>
                      <span className="people-role">{dev.role}</span>
                    </div>
                    <span className={`window-pill ${dev.status === 'live' ? 'live' : 'away'}`}>
                      {dev.status === 'live' ? 'Window Active' : 'Background'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* DRAWER TAB 3: INCIDENT BRIEF & REMEDIATION */}
            {activeDrawer === 'brief' && (
              <div className="drawer-brief-view">
                <div className="brief-section">
                  <span className="brief-label">INCIDENT SUMMARY</span>
                  <h4 className="brief-title">{activeIncident?.title || 'Cluster Outage'}</h4>
                  <p className="brief-desc">{activeIncident?.description || 'Active pod crash-loop detected in production.'}</p>
                </div>

                <div className="brief-metrics-grid">
                  <div className="brief-metric-card">
                    <span className="metric-title">LIKELY CAUSE</span>
                    <span className="metric-val text-red">
                      {activeIncident?.likelyCause ? 'PR #142 (Pool Shrinkage)' : 'Under Investigation'}
                    </span>
                  </div>
                  <div className="brief-metric-card">
                    <span className="metric-title">CALIBRATED CONFIDENCE</span>
                    <span className="metric-val text-cyan">{activeIncident?.confidence || 85}%</span>
                  </div>
                </div>

                {/* One-Click War Room Actions */}
                <div className="brief-actions-box">
                  <span className="brief-label">AUTONOMOUS WAR ROOM ACTIONS</span>
                  <button
                    onClick={onTriggerRollback}
                    className="btn-remediation-action rollback"
                  >
                    <RotateCcw style={{ width: '15px', height: '15px' }} />
                    <span>Approve & Rollback PR #142</span>
                  </button>
                  <button
                    onClick={onTriggerScale}
                    className="btn-remediation-action scale"
                  >
                    <Layers style={{ width: '15px', height: '15px' }} />
                    <span>Scale Replicas to 3</span>
                  </button>
                  {activeIncident && (
                    <button
                      onClick={() => onResolveIncident(activeIncident.id)}
                      className="btn-remediation-action resolve"
                    >
                      <CheckCircle style={{ width: '15px', height: '15px' }} />
                      <span>Mark Incident Resolved</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* 4. TEAMS FLOATING BOTTOM CONTROL DOCK */}
      <footer className="teams-bottom-dock">
        <div className="dock-left-group">
          <span className="dock-room-label">Teams War Room</span>
          <div className="voice-stack-badge" title="Developer speech recognized via Browser Web Speech API | TruGenAI speaks via Groq Cloud canopylabs/orpheus-v1-english">
            <Sparkles style={{ width: '11px', height: '11px', color: '#38bdf8' }} />
            <span>Groq Orpheus TTS & Web Speech</span>
          </div>
        </div>

        {/* Central Controls */}
        <div className="dock-center-group">
          {/* Mute Button */}
          <button
            onClick={handleToggleMute}
            className={`dock-btn ${isMuted ? 'btn-danger' : 'btn-normal'}`}
            title={!isBrowserSpeechSupported ? 'Web Speech API unavailable in this browser' : isMuted ? 'Unmute & Start Voice Listening' : 'Mute Microphone'}
          >
            {isMuted ? <MicOff style={{ width: '18px', height: '18px' }} /> : <Mic style={{ width: '18px', height: '18px' }} />}
            <span className="btn-label">{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          {/* Camera Button */}
          <button
            onClick={() => setIsCameraOn(prev => !prev)}
            className={`dock-btn ${isCameraOn ? 'btn-active' : 'btn-normal'}`}
            title={isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
          >
            {isCameraOn ? <Video style={{ width: '18px', height: '18px' }} /> : <VideoOff style={{ width: '18px', height: '18px' }} />}
            <span className="btn-label">Camera</span>
          </button>

          {/* Share Screen / Stage */}
          <button
            onClick={() => setViewMode(prev => prev === 'stage' ? 'gallery' : 'stage')}
            className={`dock-btn ${viewMode === 'stage' ? 'btn-active' : 'btn-normal'}`}
            title="Share Screen / Spotlight Stage"
          >
            <ScreenShare style={{ width: '18px', height: '18px' }} />
            <span className="btn-label">Share</span>
          </button>

          {/* Raise Hand */}
          <button
            onClick={() => setIsHandRaised(prev => !prev)}
            className={`dock-btn ${isHandRaised ? 'btn-warning' : 'btn-normal'}`}
            title="Raise Hand"
          >
            <Hand style={{ width: '18px', height: '18px' }} />
            <span className="btn-label">Hand</span>
          </button>

          {/* Emoji Reactions with Picker */}
          <div className="reaction-picker-wrapper">
            <button
              onClick={() => setShowEmojiPicker(prev => !prev)}
              className="dock-btn btn-normal"
              title="Reactions"
            >
              <Smile style={{ width: '18px', height: '18px' }} />
              <span className="btn-label">React</span>
            </button>

            {showEmojiPicker && (
              <div className="emoji-popover">
                {['👍', '❤️', '👏', '🚨', '🔥', '🚀'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => triggerReaction(emoji)}
                    className="emoji-popover-btn"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="dock-divider" />

          {/* Chat Drawer Toggle */}
          <button
            onClick={() => setActiveDrawer(prev => prev === 'chat' ? null : 'chat')}
            className={`dock-btn ${activeDrawer === 'chat' ? 'btn-active' : 'btn-normal'}`}
            title="Toggle Meeting Chat"
          >
            <MessageSquare style={{ width: '18px', height: '18px' }} />
            <span className="btn-label">Chat</span>
          </button>

          {/* People Drawer Toggle */}
          <button
            onClick={() => setActiveDrawer(prev => prev === 'people' ? null : 'people')}
            className={`dock-btn ${activeDrawer === 'people' ? 'btn-active' : 'btn-normal'}`}
            title="Participants & Presence"
          >
            <Users style={{ width: '18px', height: '18px' }} />
            <span className="btn-label">People</span>
          </button>

          {/* Incident Brief Toggle */}
          <button
            onClick={() => setActiveDrawer(prev => prev === 'brief' ? null : 'brief')}
            className={`dock-btn ${activeDrawer === 'brief' ? 'btn-active' : 'btn-normal'}`}
            title="Incident Brief"
          >
            <ShieldAlert style={{ width: '18px', height: '18px' }} />
            <span className="btn-label">Ops Brief</span>
          </button>
        </div>

        {/* Leave Meeting Button */}
        <div className="dock-right-group">
          <button onClick={onLeaveWarRoom} className="dock-btn-leave" title="Leave War Room">
            <PhoneOff style={{ width: '16px', height: '16px' }} />
            <span>Leave</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
