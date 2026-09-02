import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { ILocalAudioTrack, IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Terminal,
  Volume2,
  VolumeX,
  Database,
  PhoneCall,
  Server,
  ArrowRight,
  ShieldAlert,
  Home,
  Users,
  LayoutGrid
} from 'lucide-react';
import { LandingPage } from './components/LandingPage';
import { TeamsWarRoom } from './components/TeamsWarRoom';
import { EmergencySummonModal } from './components/EmergencySummonModal';
import { useDevPresence } from './hooks/useDevPresence';
import type { SummonPayload } from './types/presence';
import { playGroqTTS } from './utils/playGroqTTS';
import { useDevSpeechRecognition } from './hooks/useDevSpeechRecognition';

const BACKEND_URL = 'http://localhost:5000';
let rtcClient: IAgoraRTCClient | null = null;
let localMicTrack: ILocalAudioTrack | null = null;

interface Pod {
  name: string;
  status: string;
  restarts: number;
  ready: boolean;
  age: string;
}

interface TimelineEvent {
  timestamp: string;
  type: string;
  message: string;
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
  timeline: TimelineEvent[];
  createdAt: string;
}

interface Constraint {
  id: string;
  scope: string;
  trigger: string;
  rule: string;
  createdAt: string;
}

interface TranscriptMessage {
  sender: 'Human' | 'Agent' | 'System';
  text: string;
  timestamp: string;
}

interface ConsoleLog {
  timestamp: string;
  source: 'system' | 'k8s' | 'github' | 'agent';
  message: string;
}

export default function App() {
  // Navigation View State: 'landing' (Product Showcase) | 'teams' (Teams War Room) | 'dashboard' (K8s Ops Console)
  const [currentView, setCurrentView] = useState<'landing' | 'teams' | 'dashboard'>('landing');

  // Emergency Summon State
  const [summonData, setSummonData] = useState<SummonPayload | null>(null);

  // Cluster & Incident State
  const [pods, setPods] = useState<Pod[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  
  // Voice Call States
  const [channelName] = useState('incident-room');
  const [isJoined, setIsJoined] = useState(false);
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [agoraStatus, setAgoraStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [voiceActive, setVoiceActive] = useState(false);
  const [typingInput, setTypingInput] = useState('');

  const activeIncident = incidents.find(inc => inc.status === 'active') || null;
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Developer Presence Tracker Hook (tracks window focus & visibility)
  const {
    myDev,
    activeDevs,
    liveCount,
    totalOnCall,
    windowFocused
  } = useDevPresence(socketRef.current);

  // Browser Speech-to-Text Recognition for Dev's Voice (fallback or direct)
  const {
    isListening: isBrowserListening,
    isSupported: isBrowserSpeechSupported,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening
  } = useDevSpeechRecognition({
    onFinalSpeech: (spokenText) => {
      addConsoleLog('agent', `[Browser Speech API] Heard developer voice: "${spokenText}"`);
      sendInstructionToAgent(spokenText);
    }
  });

  // Initialize WebSockets
  useEffect(() => {
    const socket = io(BACKEND_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      addConsoleLog('system', 'Connected to Incident Commander backend server via WebSockets.');
    });

    socket.on('k8s_pods_update', (updatedPods: Pod[]) => {
      setPods(updatedPods);
    });

    socket.on('incidents_update', (updatedIncidents: Incident[]) => {
      setIncidents(updatedIncidents);
    });

    socket.on('constraints_update', (updatedConstraints: Constraint[]) => {
      setConstraints(updatedConstraints);
    });

    socket.on('console_log', (log: ConsoleLog) => {
      setConsoleLogs(prev => [...prev, log]);
    });

    socket.on('voice_transcript', (data: { sender: 'Human' | 'Agent'; text: string }) => {
      setTranscripts(prev => [
        ...prev,
        {
          sender: data.sender,
          text: data.text,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      // Play TruGenAI voice with Groq Cloud canopylabs/orpheus-v1-english TTS!
      if (data.sender === 'Agent' && data.text) {
        playGroqTTS(
          data.text,
          'diana',
          () => setVoiceActive(true),
          () => setVoiceActive(false)
        );
      }
    });

    // Auto-summon incoming emergency call
    socket.on('incident_auto_summon', (payload: SummonPayload) => {
      addConsoleLog('system', `🚨 [EMERGENCY PROTOCOL] Available engineers summoned to War Room for ${payload.incident.service}!`);
      setSummonData(payload);
    });

    socket.on('warroom_resolved', (data: { incidentId: string; title: string }) => {
      addConsoleLog('system', `Incident "${data.title}" marked resolved by War Room.`);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Autoscroll terminal and transcripts
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Helper log function
  const addConsoleLog = (source: ConsoleLog['source'], message: string) => {
    setConsoleLogs(prev => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        source,
        message
      }
    ]);
  };

  // ----------------------------------------------------
  // Trigger Demo Scenarios
  // ----------------------------------------------------
  const triggerScenario = async (type: 'config_error' | 'cpu_spike') => {
    addConsoleLog('system', `Requesting trigger for scenario: ${type}`);
    try {
      const response = await fetch(`${BACKEND_URL}/api/incidents/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: type })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      addConsoleLog('system', `Failure injected successfully for: ${type}`);
    } catch (e) {
      addConsoleLog('system', `Error triggering scenario: ${(e as Error).message}`);
    }
  };

  const resolveIncident = async (incidentId: string) => {
    addConsoleLog('system', `Requesting manual cleanup for incident ${incidentId}`);
    try {
      const response = await fetch(`${BACKEND_URL}/api/incidents/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      addConsoleLog('system', `Incident successfully resolved and cleaned up.`);
    } catch (e) {
      addConsoleLog('system', `Error resolving incident: ${(e as Error).message}`);
    }
  };

  // ----------------------------------------------------
  // Agora WebRTC Call Control
  // ----------------------------------------------------
  const joinVoiceChannel = async () => {
    setAgoraStatus('connecting');
    addConsoleLog('system', `Initiating Agora WebRTC voice engine for channel: ${channelName}`);
    
    try {
      const tokenRes = await fetch(`${BACKEND_URL}/api/agora/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, uid: 0, role: 'publisher' })
      });
      
      if (!tokenRes.ok) {
        throw new Error('Failed to fetch Agora token from backend');
      }

      const { token, appId } = await tokenRes.json();

      if (token === 'dummy-token') {
        addConsoleLog('system', 'Agora credentials not set in backend .env. Enabling interactive simulation mode.');
        setIsSimulationMode(true);
        setAgoraStatus('connected');
        setIsJoined(true);
        
        setTranscripts([
          {
            sender: 'System',
            text: `Conversation initialized in simulator mode. Speak or type to converse with TruGenAI.`,
            timestamp: new Date().toLocaleTimeString()
          },
          {
            sender: 'Agent',
            text: `Agent joined. Hello, I am your TruGenAI Incident Commander. I've joined channel "${channelName}". Alert me when anything is wrong.`,
            timestamp: new Date().toLocaleTimeString()
          }
        ]);
        return;
      }

      if (!rtcClient) {
        rtcClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      }

      await rtcClient.join(appId, channelName, token, null);
      
      localMicTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await rtcClient.publish([localMicTrack]);

      rtcClient.on('user-published', async (user, mediaType) => {
        await rtcClient!.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack?.play();
          setVoiceActive(true);
          addConsoleLog('agent', 'Playing speech audio feed from voice agent.');
        }
      });

      rtcClient.on('user-unpublished', () => {
        setVoiceActive(false);
      });

      // Try inviting Agora Cloud Bot if cloud credentials exist, but don't fail RTC channel if missing
      try {
        const inviteRes = await fetch(`${BACKEND_URL}/api/agora/invite-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelName })
        });
        const inviteData = await inviteRes.json();
        if (inviteData.success) {
          addConsoleLog('system', `Agora Cloud Bot joined channel "${channelName}"!`);
        } else {
          addConsoleLog('system', `Agora WebRTC Voice Channel active with App ID (${appId}). TruGenAI agent ready in War Room.`);
        }
      } catch {
        addConsoleLog('system', 'Agora WebRTC Voice Channel active. TruGenAI agent ready in War Room.');
      }

      setAgoraStatus('connected');
      setIsJoined(true);
      setIsSimulationMode(false);
      addConsoleLog('system', `Agora WebRTC stream connected! Microphone is active in channel "${channelName}"`);
      
      setTranscripts([
        {
          sender: 'System',
          text: `Agora WebRTC voice link established. Speak directly into your microphone or chat with TruGenAI in the War Room.`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

    } catch (err) {
      console.error(err);
      setAgoraStatus('error');
      addConsoleLog('system', `Agora WebRTC init error: ${(err as Error).message}. Falling back to simulation mode.`);
      
      setIsSimulationMode(true);
      setAgoraStatus('connected');
      setIsJoined(true);
      setTranscripts([
        {
          sender: 'System',
          text: `Agora token failed. Simulated keyboard-input conversation activated.`,
          timestamp: new Date().toLocaleTimeString()
        },
        {
          sender: 'Agent',
          text: `Hello! I am your TruGenAI Incident Commander. Type your instructions below or in the War Room chat.`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    }
  };

  const disconnectVoice = async () => {
    addConsoleLog('system', 'Closing Agora voice streams...');
    try {
      if (localMicTrack) {
        localMicTrack.stop();
        localMicTrack.close();
        localMicTrack = null;
      }
      if (rtcClient) {
        await rtcClient.leave();
      }
    } catch (e) {
      console.error(e);
    }
    
    setIsJoined(false);
    setIsSimulationMode(false);
    setAgoraStatus('disconnected');
    setVoiceActive(false);
    addConsoleLog('system', 'Agora audio channel disconnected.');
  };

  // ----------------------------------------------------
  // Send Instruction to TruGenAI Completion Loop
  // ----------------------------------------------------
  const sendInstructionToAgent = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    setTranscripts(prev => [
      ...prev,
      {
        sender: 'Human',
        text: textToSend,
        timestamp: new Date().toLocaleTimeString()
      }
    ]);

    addConsoleLog('system', `Sent instruction: "${textToSend}"`);

    try {
      const messagesPayload = transcripts
        .filter(t => t.sender === 'Human' || t.sender === 'Agent')
        .map(t => ({
          role: t.sender === 'Human' ? 'user' : 'assistant',
          content: t.text
        }));

      messagesPayload.push({ role: 'user', content: textToSend });

      addConsoleLog('agent', 'Requesting completions from TruGenAI proxy endpoint...');
      
      const response = await fetch(`${BACKEND_URL}/api/llm/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesPayload })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          decoder.decode(value);
        }
      }

    } catch (err) {
      addConsoleLog('agent', `TruGenAI proxy error: ${(err as Error).message}`);
    }
  };

  const handleTypingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typingInput.trim()) return;
    const text = typingInput;
    setTypingInput('');
    sendInstructionToAgent(text);
  };

  // War Room Quick Remediations
  const handleWarRoomRollback = () => {
    if (socketRef.current && activeIncident) {
      socketRef.current.emit('warroom_trigger_action', {
        action: 'rollback',
        service: activeIncident.service,
        triggeredBy: myDev.name
      });
    } else {
      sendInstructionToAgent('Rollback the deployment now to resolve the incident');
    }
  };

  const handleWarRoomScale = () => {
    if (socketRef.current && activeIncident) {
      socketRef.current.emit('warroom_trigger_action', {
        action: 'scale',
        service: activeIncident.service,
        triggeredBy: myDev.name
      });
    } else {
      sendInstructionToAgent('Scale the deployment replicas to 3 to resolve the load spike');
    }
  };

  return (
    <div className={`app-container ${currentView === 'teams' ? 'teams-mode' : ''}`}>
      
      {/* 1. TOP GLOBAL HEADER WITH UNIFIED VIEW TABS */}
      <header className="app-header">
        <div className="header-left">
          <div className="brand-section">
            <Activity style={{ width: '20px', height: '20px', color: '#22d3ee', flexShrink: 0 }} />
            <div>
              <h1 className="brand-title">TruGenAI Incident Commander</h1>
              <p className="brand-subtitle">Agora Voice & Teams War Room</p>
            </div>
          </div>
        </div>

        {/* Center: View Switcher Tabs + Presence Badge */}
        <div className="header-center">
          <div className="unified-nav-tabs">
            <button
              onClick={() => setCurrentView('landing')}
              className={`nav-tab-btn ${currentView === 'landing' ? 'active' : ''}`}
            >
              <Home style={{ width: '13px', height: '13px' }} />
              <span>Showcase</span>
            </button>
            
            <button
              onClick={() => setCurrentView('teams')}
              className={`nav-tab-btn ${currentView === 'teams' ? 'active' : ''}`}
            >
              {activeIncident && <span className="tab-incident-dot" />}
              <Users style={{ width: '13px', height: '13px' }} />
              <span>Teams War Room</span>
            </button>

            <button
              onClick={() => setCurrentView('dashboard')}
              className={`nav-tab-btn ${currentView === 'dashboard' ? 'active dashboard' : ''}`}
            >
              <LayoutGrid style={{ width: '13px', height: '13px' }} />
              <span>Ops Console</span>
            </button>
          </div>

          <div className="presence-live-chip" title="Live Devs Detected via Open Windows">
            <span className="pulse-green-dot" />
            <span>{liveCount} of {totalOnCall} Live</span>
          </div>
        </div>

        {/* Right: Quick Scenario Injections + Voice Status */}
        <div className="header-right">
          <div className="scenario-injector-bar">
            <button
              onClick={() => triggerScenario('config_error')}
              disabled={activeIncident !== null}
              className="btn-inject-red"
              title="Simulate CrashLoopBackOff & Auto-Summon Team"
            >
              <ShieldAlert style={{ width: '13px', height: '13px' }} />
              <span>Config Error</span>
            </button>
            <button
              onClick={() => triggerScenario('cpu_spike')}
              disabled={activeIncident !== null}
              className="btn-inject-yellow"
              title="Simulate 96% CPU Saturation & Constraint Test"
            >
              <AlertTriangle style={{ width: '13px', height: '13px' }} />
              <span>CPU Spike</span>
            </button>
          </div>

          <div className="call-status-section">
            <div className="agora-indicator">
              <span className={`status-dot ${
                agoraStatus === 'connected' ? (isSimulationMode ? 'yellow' : 'cyan') :
                agoraStatus === 'connecting' ? 'cyan' :
                agoraStatus === 'error' ? 'red' : 'offline'
              }`} />
              <span className="status-label-text">
                {agoraStatus === 'connected' ? (isSimulationMode ? 'SIMULATOR' : 'VOICE') : agoraStatus.toUpperCase()}
              </span>
            </div>

            {!isJoined ? (
              <button
                onClick={joinVoiceChannel}
                className="btn-join-call"
              >
                <PhoneCall style={{ width: '12px', height: '12px' }} />
                <span>Join</span>
              </button>
            ) : (
              <button
                onClick={disconnectVoice}
                className="btn-leave-call"
              >
                <VolumeX style={{ width: '12px', height: '12px' }} />
                <span>Leave</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. BODY CONTENT ROUTED BY currentView */}
      {currentView === 'landing' && (
        <LandingPage
          onEnterWarRoom={() => setCurrentView('teams')}
          onOpenDashboard={() => setCurrentView('dashboard')}
          onTriggerScenario={triggerScenario}
          myDev={myDev}
          activeDevs={activeDevs}
          liveCount={liveCount}
          totalOnCall={totalOnCall}
          windowFocused={windowFocused}
        />
      )}

      {currentView === 'teams' && (
        <TeamsWarRoom
          socket={socketRef.current}
          activeIncident={activeIncident}
          pods={pods}
          myDev={myDev}
          activeDevs={activeDevs}
          liveCount={liveCount}
          transcripts={transcripts}
          isTruGenSpeaking={voiceActive}
          onLeaveWarRoom={() => setCurrentView('dashboard')}
          onSendInstruction={sendInstructionToAgent}
          onTriggerRollback={handleWarRoomRollback}
          onTriggerScale={handleWarRoomScale}
          onResolveIncident={resolveIncident}
          consoleLogs={consoleLogs}
          isBrowserListening={isBrowserListening}
          isBrowserSpeechSupported={isBrowserSpeechSupported}
          interimTranscript={interimTranscript}
          onStartListening={startListening}
          onStopListening={stopListening}
          onToggleListening={toggleListening}
        />
      )}

      {currentView === 'dashboard' && (
        <>
          <div className="workspace-grid">
            
            {/* LEFT COLUMN: K8s Pods Status Sidebar */}
            <aside className="sidebar-panel">
              <div className="panel-header">
                <div className="panel-header-title">
                  <Server style={{ width: '15px', height: '15px', color: '#22d3ee' }} />
                  <h2>Kubernetes Cluster</h2>
                </div>
                <span className="panel-tag">namespace: default</span>
              </div>
              
              <div className="pod-list-container">
                {pods.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    No active pods. Deploy K8s cluster services to begin tracking.
                  </div>
                ) : (
                  pods.map(pod => {
                    const isHealthy = pod.ready && pod.status === 'Running';
                    const isCrashLoop = pod.status.includes('CrashLoop') || (pod.restarts > 0 && !pod.ready);
                    
                    return (
                      <div
                        key={pod.name}
                        className={`pod-card ${isHealthy ? 'healthy' : isCrashLoop ? 'unhealthy' : ''}`}
                      >
                        <div className="pod-card-header">
                          <span className="pod-name" title={pod.name}>
                            {pod.name}
                          </span>
                          <span className={`status-dot ${isHealthy ? 'green' : isCrashLoop ? 'red' : 'yellow'}`} />
                        </div>
                        
                        <div className="pod-card-header" style={{ marginBottom: 0 }}>
                          <span className="pod-metrics-row">Status: {pod.status}</span>
                          <span className="pod-metrics-row">Restarts: {pod.restarts}</span>
                          <span className="pod-metrics-row">Age: {pod.age}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            {/* CENTER COLUMN: Terminal console logs */}
            <main className="console-panel">
              <div className="panel-header">
                <div className="panel-header-title">
                  <Terminal style={{ width: '15px', height: '15px', color: '#22d3ee' }} />
                  <h2>Execution Stream</h2>
                </div>
                <span className="panel-tag" style={{ color: '#9ca3af', borderColor: 'transparent' }}>Local API logs</span>
              </div>

              <div className="terminal-console">
                {consoleLogs.map((log, idx) => {
                  let sourceClass = 'terminal-source-system';
                  if (log.source === 'k8s') sourceClass = 'terminal-source-k8s';
                  if (log.source === 'github') sourceClass = 'terminal-source-github';
                  if (log.source === 'agent') sourceClass = 'terminal-source-agent';
                  
                  return (
                    <div key={idx} className="terminal-line">
                      <span className="terminal-timestamp">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className={sourceClass}>[{log.source.toUpperCase()}]</span>{' '}
                      <span style={{ color: '#f3f4f6' }}>{log.message}</span>
                    </div>
                  );
                })}
                <div ref={terminalEndRef} />
              </div>
            </main>

            {/* RIGHT COLUMN: Voice call transcript and Constraints List */}
            <section className="right-rail">
              
              {/* Top-Right: Transcripts */}
              <div className="transcript-panel">
                <div className="panel-header">
                  <div className="panel-header-title">
                    <Volume2 style={{ width: '15px', height: '15px', color: '#22d3ee' }} />
                    <h2>Conversational Transcripts</h2>
                  </div>
                  
                  <div className={`soundwave-container ${voiceActive ? 'soundwave-active' : ''}`} style={{ display: 'flex', alignItems: 'flex-end', height: '16px' }}>
                    <div className="soundwave-bar" />
                    <div className="soundwave-bar" />
                    <div className="soundwave-bar" />
                    <div className="soundwave-bar" />
                    <div className="soundwave-bar" />
                    <div className="soundwave-bar" />
                  </div>
                </div>

                <div className="transcript-scroll">
                  {transcripts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Transcript will display here once you converse with TruGenAI.
                    </div>
                  ) : (
                    transcripts.map((t, idx) => {
                      const isAgent = t.sender === 'Agent';
                      const isSys = t.sender === 'System';
                      
                      return (
                        <div
                          key={idx}
                          className={`msg-bubble ${isSys ? 'system' : isAgent ? 'agent' : 'human'}`}
                        >
                          <span className="bubble-sender">
                            {t.sender}
                          </span>
                          <span>{t.text}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={transcriptEndRef} />
                </div>

                <form onSubmit={handleTypingSubmit} className="chat-input-bar">
                  <input
                    type="text"
                    value={typingInput}
                    onChange={e => setTypingInput(e.target.value)}
                    placeholder="Type instruction to simulate voice input..."
                    className="chat-input"
                  />
                  <button type="submit" className="btn-send-chat">
                    <ArrowRight style={{ width: '15px', height: '15px' }} />
                  </button>
                </form>
              </div>

              {/* Bottom-Right: Lessons Learned (Constraint Memory) */}
              <div className="constraints-panel">
                <div className="panel-header">
                  <div className="panel-header-title" style={{ color: '#34d399' }}>
                    <Database style={{ width: '15px', height: '15px', color: '#10b981' }} />
                    <h2>Lessons Learned (Constraint Memory)</h2>
                  </div>
                </div>
                
                <div className="constraints-scroll">
                  {constraints.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      No stored constraints yet.
                    </div>
                  ) : (
                    constraints.map(c => (
                      <div key={c.id} className="constraint-card">
                        <div className="constraint-card-header">
                          <span className="constraint-scope">SCOPE: {c.scope.toUpperCase()}</span>
                          <span className="constraint-id">id: {c.id}</span>
                        </div>
                        <p className="constraint-rule">"{c.rule}"</p>
                        <p className="constraint-trigger">Trigger context: {c.trigger}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </section>

          </div>

          {/* 3. ACTIVE INCIDENT TIMELINE FOOTER */}
          {activeIncident && (
            <footer className="incident-footer">
              <div className="incident-info-column">
                <AlertTriangle style={{ width: '28px', height: '28px', color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                <div className="incident-metadata">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="incident-severity-badge">
                      {activeIncident.severity}
                    </span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      ID: {activeIncident.id}
                    </span>
                  </div>
                  <h3 className="incident-title">{activeIncident.title}</h3>
                  <p className="incident-service-tag">
                    Service: <span style={{ fontFamily: 'var(--font-mono)', color: '#22d3ee' }}>{activeIncident.service}</span>
                  </p>
                </div>
              </div>

              <div className="incident-details-column">
                <div className="incident-row">
                  <div>
                    <span className="likely-cause-label">Likely Cause:</span>{' '}
                    <span className="likely-cause-text">{activeIncident.likelyCause || 'Investigating...'}</span>
                  </div>
                  {activeIncident.confidence > 0 && (
                    <div className="confidence-score">
                      CONFIDENCE: {activeIncident.confidence}%
                    </div>
                  )}
                </div>

                <div className="timeline-list">
                  {activeIncident.timeline.map((event, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {index > 0 && <ArrowRight style={{ width: '12px', height: '12px', color: '#374151' }} />}
                      <div className="timeline-bubble">
                        <span className="timeline-bubble-time">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="timeline-bubble-msg" title={event.message}>
                          {event.message}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="resolve-column">
                <button
                  onClick={() => resolveIncident(activeIncident.id)}
                  className="btn-force-resolve"
                >
                  <CheckCircle style={{ width: '14px', height: '14px' }} />
                  Force Resolve
                </button>
              </div>
            </footer>
          )}
        </>
      )}

      {/* 3. GLOBAL EMERGENCY AUTO-SUMMON MODAL OVERLAY */}
      <EmergencySummonModal
        summon={summonData}
        onJoinWarRoom={() => {
          setCurrentView('teams');
          setSummonData(null);
        }}
        onDismiss={() => setSummonData(null)}
      />

    </div>
  );
}
