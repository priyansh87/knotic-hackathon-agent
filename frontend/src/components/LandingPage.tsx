import React from 'react';
import {
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Server,
  GitPullRequest,
  Users,
  Video,
  Database,
  Activity,
  CheckCircle2,
  Play
} from 'lucide-react';
import type { DevPresence } from '../types/presence';

interface LandingPageProps {
  onEnterWarRoom: () => void;
  onOpenDashboard: () => void;
  onTriggerScenario: (scenario: 'config_error' | 'cpu_spike') => void;
  myDev: DevPresence;
  activeDevs: DevPresence[];
  liveCount: number;
  totalOnCall: number;
  windowFocused: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterWarRoom,
  onOpenDashboard,
  onTriggerScenario,
  myDev,
  activeDevs,
  liveCount,
  totalOnCall,
  windowFocused
}) => {
  return (
    <div className="landing-container">
      {/* 1. NAVBAR */}
      <nav className="landing-navbar">
        <div className="landing-brand">
          <div className="brand-logo-hex">
            <Sparkles style={{ width: '20px', height: '20px', color: '#38bdf8' }} />
          </div>
          <div>
            <span className="brand-text">TruGen<span className="brand-highlight">AI</span></span>
            <span className="brand-badge">SRE War Room</span>
          </div>
        </div>

        <div className="landing-nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#scenarios" className="nav-link">Interactive Scenarios</a>
          <a href="#presence" className="nav-link">Dev Presence</a>
          <a href="#architecture" className="nav-link">Architecture</a>
        </div>

        <div className="landing-nav-actions">
          <div className="on-call-presence-pill" title="Live Devs Detected via Open Windows">
            <span className="pulse-green-dot" />
            <span>{liveCount} of {totalOnCall} SREs Live</span>
          </div>

          <button onClick={onOpenDashboard} className="btn-nav-outline">
            <Server style={{ width: '14px', height: '14px' }} />
            <span>K8s Dashboard</span>
          </button>

          <button onClick={onEnterWarRoom} className="btn-nav-primary">
            <Video style={{ width: '14px', height: '14px' }} />
            <span>Enter Teams War Room</span>
          </button>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section className="landing-hero">
        <div className="hero-glow-bg" />
        
        <div className="hero-announcement">
          <span className="hero-chip">
            <Sparkles style={{ width: '13px', height: '13px', color: '#38bdf8' }} />
            Agora Conversational AI × Autonomous SRE
          </span>
          <span className="hero-announcement-text">
            Teams War Room with TruGenAI Face-Time Agent
          </span>
        </div>

        <h1 className="hero-headline">
          Autonomous SRE War Rooms with <br />
          <span className="text-gradient">Face-Time AI Incident Commander</span>
        </h1>

        <p className="hero-subheadline">
          When production Kubernetes incidents trigger, TruGenAI automatically detects active engineers in open browser windows, summons the entire on-call team into a Microsoft Teams-style War Room, correlates GitHub PR diffs, and orchestrates zero-downtime rollback in seconds.
        </p>

        {/* Hero CTA Group */}
        <div className="hero-cta-group">
          <button onClick={onEnterWarRoom} className="hero-btn-primary">
            <Video style={{ width: '18px', height: '18px' }} />
            <span>Launch Teams War Room</span>
            <ArrowRight style={{ width: '16px', height: '16px' }} />
          </button>

          <button onClick={() => onTriggerScenario('config_error')} className="hero-btn-alert">
            <ShieldAlert style={{ width: '18px', height: '18px' }} />
            <span>Trigger P1 Auto-Summon Demo</span>
          </button>
        </div>

        {/* Hero Interactive Preview Card */}
        <div className="hero-preview-wrapper">
          <div className="hero-mockup-card">
            <div className="mockup-header">
              <div className="mockup-dots">
                <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
              </div>
              <span className="mockup-title">Microsoft Teams - [WAR ROOM P1-CRITICAL] order-service Database Connection Outage</span>
              <span className="mockup-rec">● REC 04:15</span>
            </div>

            <div className="mockup-body">
              {/* Left: TruGen AI Face-Time Mockup */}
              <div className="mockup-ai-tile">
                <div className="mockup-ai-badge">
                  <Sparkles style={{ width: '12px', height: '12px', color: '#38bdf8' }} />
                  <span>TruGen AI (Huma-2)</span>
                </div>
                <div className="mockup-trugen-face-wrapper">
                  <img
                    src="/avatars/trugen_anya.jpg"
                    alt="Anya Sharma - TruGen AI"
                    className="mockup-trugen-face-img"
                  />
                  <span className="mockup-speaking-pill">● SPEAKING</span>
                </div>
                <div className="mockup-speech-bubble">
                  "I correlated the crash-loop with PR #142 merged 15m ago. DB_POOL_SIZE reduced from 20 to 3. 85% confidence. Ready to rollback."
                </div>
              </div>

              {/* Center: PR Diff Mockup */}
              <div className="mockup-diff-tile">
                <div className="mockup-diff-header">
                  <GitPullRequest style={{ width: '13px', height: '13px', color: '#10b981' }} />
                  <span>Correlated GitHub PR #142 (priyansh-dev)</span>
                  <span className="badge-match">85% Root Cause Match</span>
                </div>
                <div className="mockup-diff-code">
                  <div className="code-line unchanged">            - name: DB_HOST</div>
                  <div className="code-line unchanged">              value: "postgres-service"</div>
                  <div className="code-line removed">-           - name: DB_POOL_SIZE: "20"</div>
                  <div className="code-line added">+           - name: DB_POOL_SIZE: "3"  # BUG TRIGGER</div>
                </div>
                <div className="mockup-actions-bar">
                  <button onClick={() => onTriggerScenario('config_error')} className="mockup-btn-rollback">
                    <Play style={{ width: '13px', height: '13px' }} />
                    Test Incident Auto-Summon
                  </button>
                </div>
              </div>

              {/* Right: Team Tiles Mockup */}
              <div className="mockup-team-column">
                <div className="mockup-user-tile">
                  <img src={myDev.avatar} alt="You" className="mockup-avatar" />
                  <span className="mockup-user-label">{myDev.name} (You)</span>
                  <span className="mockup-live-indicator">🟢 Live in Window</span>
                </div>
                {activeDevs.slice(0, 2).map(dev => (
                  <div key={dev.id} className="mockup-user-tile">
                    <img src={dev.avatar} alt={dev.name} className="mockup-avatar" />
                    <span className="mockup-user-label">{dev.name}</span>
                    <span className="mockup-live-indicator">🟢 Active</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. DEV PRESENCE DETECTION SHOWCASE */}
      <section id="presence" className="presence-section">
        <div className="section-header">
          <span className="section-eyebrow">PATENTED PRESENCE ENGINE</span>
          <h2 className="section-title">Zero-Lag Developer Window Focus Detection</h2>
          <p className="section-subtitle">
            Never wait for on-call engineers to check their phones. TruGenAI tracks open browser windows and tabs in real-time. When an incident strikes, all live engineers are instantly alerted and placed into the room.
          </p>
        </div>

        <div className="presence-grid">
          {/* Your Real Window State */}
          <div className="presence-card highlight">
            <div className="presence-card-header">
              <div className="presence-dev-info">
                <img src={myDev.avatar} alt={myDev.name} className="presence-avatar" />
                <div>
                  <h4 className="dev-name">{myDev.name} (Your Current Browser)</h4>
                  <span className="dev-role">{myDev.role}</span>
                </div>
              </div>
              <span className={`presence-status-chip ${windowFocused ? 'live' : 'away'}`}>
                <span className="pulse-green-dot" />
                {windowFocused ? 'WINDOW FOCUSED (LIVE)' : 'TAB INACTIVE / BACKGROUND'}
              </span>
            </div>
            <p className="presence-card-desc">
              {windowFocused
                ? 'Your window is active and focused. If a P1 incident fires, you will receive an immediate emergency incoming call chime and auto-transfer into the Teams War Room.'
                : 'Your window is currently in the background or unfocused. The presence engine updates your state to "Away" automatically.'}
            </p>
            <div className="presence-metrics-row">
              <span className="metric-item">Heartbeat: <strong>Active (every 3.5s)</strong></span>
              <span className="metric-item">Summon Eligibility: <strong className="text-green">Immediate</strong></span>
            </div>
          </div>

          {/* On-Call Teammates */}
          {activeDevs.map(dev => (
            <div key={dev.id} className="presence-card">
              <div className="presence-card-header">
                <div className="presence-dev-info">
                  <img src={dev.avatar} alt={dev.name} className="presence-avatar" />
                  <div>
                    <h4 className="dev-name">{dev.name}</h4>
                    <span className="dev-role">{dev.role}</span>
                  </div>
                </div>
                <span className={`presence-status-chip ${dev.status === 'live' ? 'live' : 'away'}`}>
                  <span className={`pulse-dot ${dev.status === 'live' ? 'green' : 'amber'}`} />
                  {dev.status === 'live' ? 'LIVE' : 'AWAY'}
                </span>
              </div>
              <p className="presence-card-desc">
                Connected via WebSockets. Ready to collaborate with TruGenAI inside the War Room.
              </p>
              <div className="presence-metrics-row">
                <span className="metric-item">Status: <strong>{dev.status.toUpperCase()}</strong></span>
                <span className="metric-item">On-Call Tier: <strong>Primary</strong></span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. INTERACTIVE SCENARIOS PLAYGROUND */}
      <section id="scenarios" className="scenarios-section">
        <div className="section-header">
          <span className="section-eyebrow">LIVE SIMULATION</span>
          <h2 className="section-title">Experience the Emergency Auto-Summon</h2>
          <p className="section-subtitle">
            Click either scenario below to inject real cluster failures. Watch the emergency incoming call chime trigger and auto-join into the Teams War Room.
          </p>
        </div>

        <div className="scenarios-grid">
          {/* Scenario A Card */}
          <div className="scenario-card card-a">
            <div className="scenario-card-header">
              <div className="scenario-tag p1">
                <ShieldAlert style={{ width: '14px', height: '14px' }} />
                <span>P1 CRITICAL - CODE ROOT CAUSE</span>
              </div>
              <h3 className="scenario-title">Scenario A: The Config Error (order-service)</h3>
            </div>
            <p className="scenario-desc">
              Simulates a developer merging PR #142 which inadvertently shrinks <code>DB_POOL_SIZE</code> from 20 to 3. The pod enters <code>CrashLoopBackOff</code>. TruGenAI correlates the git diff, determines 85% root cause confidence, and auto-summons the team.
            </p>
            <div className="scenario-features">
              <div className="feature-item"><CheckCircle2 style={{ width: '14px', height: '14px', color: '#10b981' }} /> Automatic Window Presence Summon</div>
              <div className="feature-item"><CheckCircle2 style={{ width: '14px', height: '14px', color: '#10b981' }} /> Line-by-line GitHub PR Diff Correlation</div>
              <div className="feature-item"><CheckCircle2 style={{ width: '14px', height: '14px', color: '#10b981' }} /> TruGenAI Face-Time Voice Dialogue & Rollback</div>
            </div>
            <button
              onClick={() => onTriggerScenario('config_error')}
              className="btn-trigger-scenario red"
            >
              <ShieldAlert style={{ width: '16px', height: '16px' }} />
              <span>Simulate Config Error & Auto-Summon</span>
            </button>
          </div>

          {/* Scenario B Card */}
          <div className="scenario-card card-b">
            <div className="scenario-card-header">
              <div className="scenario-tag p2">
                <Activity style={{ width: '14px', height: '14px' }} />
                <span>P2 HIGH - CONSTRAINT LEARNING</span>
              </div>
              <h3 className="scenario-title">Scenario B: CPU Saturation (payment-service)</h3>
            </div>
            <p className="scenario-desc">
              Simulates a sudden traffic surge pushing CPU utilization to 96%. When the agent proposes restarting, the team teaches a policy: <em>"Never restart payment-service during high-traffic hours without draining."</em> TruGenAI stores the constraint permanently.
            </p>
            <div className="scenario-features">
              <div className="feature-item"><CheckCircle2 style={{ width: '14px', height: '14px', color: '#10b981' }} /> Inference-Time Policy Constraint Storage</div>
              <div className="feature-item"><CheckCircle2 style={{ width: '14px', height: '14px', color: '#10b981' }} /> Autonomous Scaling to 3 Replicas</div>
              <div className="feature-item"><CheckCircle2 style={{ width: '14px', height: '14px', color: '#10b981' }} /> Slack Escalation Webhook Handoff</div>
            </div>
            <button
              onClick={() => onTriggerScenario('cpu_spike')}
              className="btn-trigger-scenario yellow"
            >
              <Activity style={{ width: '16px', height: '16px' }} />
              <span>Simulate CPU Saturation & Auto-Summon</span>
            </button>
          </div>
        </div>
      </section>

      {/* 5. CORE FEATURES GRID */}
      <section id="features" className="features-section">
        <div className="section-header">
          <span className="section-eyebrow">CAPABILITIES</span>
          <h2 className="section-title">Built for High-Stakes Incident Management</h2>
        </div>

        <div className="features-grid">
          <div className="feature-box">
            <div className="feature-icon cyan">
              <Sparkles style={{ width: '24px', height: '24px' }} />
            </div>
            <h3 className="feature-box-title">Face-Time AI SRE Agent</h3>
            <p className="feature-box-desc">
              Audiovisual presence powered by Agora Conversational AI and Llama 3.3. TruGenAI speaks directly to engineers in the War Room with calibrated confidence scoring.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon purple">
              <Video style={{ width: '24px', height: '24px' }} />
            </div>
            <h3 className="feature-box-title">Microsoft Teams Meeting UI</h3>
            <p className="feature-box-desc">
              Authentic Teams war room experience with floating bottom control dock, real webcam video feeds, stage screen share, live reactions, and drawer panels.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon green">
              <GitPullRequest style={{ width: '24px', height: '24px' }} />
            </div>
            <h3 className="feature-box-title">PR-Diff Anomaly Correlation</h3>
            <p className="feature-box-desc">
              Cross-references Kubernetes CrashLoopBackOff container logs against recent GitHub pull requests to highlight the exact lines of code or yaml causing the failure.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon amber">
              <Database style={{ width: '24px', height: '24px' }} />
            </div>
            <h3 className="feature-box-title">Inference-Time Constraint Memory</h3>
            <p className="feature-box-desc">
              Learns human operational judgment ("Lessons Learned") during live conversation to avoid repeating dangerous mistakes in future incidents.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon red">
              <Users style={{ width: '24px', height: '24px' }} />
            </div>
            <h3 className="feature-box-title">Browser Window Focus Detection</h3>
            <p className="feature-box-desc">
              Monitors active window focus and visibility. Automatically summons live engineers into emergency triage without manual paging or phone tag.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-icon blue">
              <Server style={{ width: '24px', height: '24px' }} />
            </div>
            <h3 className="feature-box-title">Direct Kubernetes Remediation</h3>
            <p className="feature-box-desc">
              Executes calibrated safe operations: pod restarts, deployment rollbacks, environment variable patches, and horizontal pod scaling directly from the meeting dock.
            </p>
          </div>
        </div>
      </section>

      {/* 6. ARCHITECTURE WORKFLOW */}
      <section id="architecture" className="architecture-section">
        <div className="section-header">
          <span className="section-eyebrow">SYSTEM ARCHITECTURE</span>
          <h2 className="section-title">How TruGenAI Coordinates Incidents</h2>
        </div>

        <div className="arch-flow-wrapper">
          <div className="arch-step">
            <div className="step-number">01</div>
            <h4 className="step-title">Incident Detection</h4>
            <p className="step-desc">Kubernetes pod CrashLoopBackOff or Prometheus CPU saturation alert triggers.</p>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-step">
            <div className="step-number">02</div>
            <h4 className="step-title">Window Presence Check</h4>
            <p className="step-desc">Backend identifies active on-call developers with open, focused browser windows.</p>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-step">
            <div className="step-number">03</div>
            <h4 className="step-title">Teams War Room Summon</h4>
            <p className="step-desc">Emergency alarm rings; developers and TruGenAI Face-Time agent join the room.</p>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-step">
            <div className="step-number">04</div>
            <h4 className="step-title">AI Root-Cause & Diff</h4>
            <p className="step-desc">TruGenAI correlates logs with GitHub PRs, spotlights the diff on the shared stage.</p>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-step">
            <div className="step-number">05</div>
            <h4 className="step-title">Autonomous Remediation</h4>
            <p className="step-desc">Engineer approves calibrated rollback or scale command via voice or one-click dock.</p>
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="brand-text">TruGen<span className="brand-highlight">AI</span></span>
            <p className="footer-subtext">Built for the EchoSphere (Agora Conversational AI) Hackathon.</p>
          </div>
          <div className="footer-actions">
            <button onClick={onEnterWarRoom} className="btn-footer-primary">
              Launch Teams War Room
            </button>
            <button onClick={onOpenDashboard} className="btn-footer-secondary">
              Open SRE Dashboard
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
