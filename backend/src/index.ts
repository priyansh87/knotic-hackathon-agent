import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { db } from './db';
import { k8sTools } from './k8s';
import { runAgentLoop } from './agent';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const AGORA_APP_ID = process.env.AGORA_APP_ID || '';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '';
const AGORA_CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID || '';
const AGORA_CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET || '';
const PUBLIC_TUNNEL_URL = process.env.PUBLIC_TUNNEL_URL || '';

// ----------------------------------------------------
// HELPER: Broadcast logs to UI console via Websockets
// ----------------------------------------------------
function broadcastSystemLog(message: string, source: 'system' | 'k8s' | 'github' | 'agent' = 'system') {
  console.log(`[${source.toUpperCase()}] ${message}`);
  io.emit('console_log', {
    timestamp: new Date().toISOString(),
    source,
    message
  });
}

// ----------------------------------------------------
// 1. Agora Token Generation Endpoint
// ----------------------------------------------------
app.post('/api/agora/token', (req, res) => {
  const { channelName, uid, role } = req.body;
  if (!channelName) {
    return res.status(400).json({ error: 'Channel name is required' });
  }

  const userUid = uid !== undefined ? Number(uid) : 0;
  const userRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  if (!AGORA_APP_ID) {
    broadcastSystemLog('Agora App ID not configured in .env. Returning dummy token.', 'system');
    return res.json({ token: 'dummy-token', appId: 'dummy-app-id' });
  }

  try {
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      userUid,
      userRole,
      expirationTimeInSeconds,
      expirationTimeInSeconds
    );

    res.json({ token, appId: AGORA_APP_ID });
  } catch (err) {
    res.status(500).json({ error: `Token generation failed: ${(err as Error).message}` });
  }
});

// ----------------------------------------------------
// 2. Invite Agora Voice Agent Endpoint
// ----------------------------------------------------
app.post('/api/agora/invite-agent', async (req, res) => {
  const { channelName } = req.body;
  if (!channelName) {
    return res.status(400).json({ error: 'Channel name is required' });
  }

  if (!AGORA_APP_ID || !AGORA_CUSTOMER_ID || !AGORA_CUSTOMER_SECRET) {
    broadcastSystemLog('Agora App ID or customer credentials missing. Cannot invite Agent.', 'system');
    return res.status(400).json({ error: 'Agora credentials missing' });
  }

  if (!PUBLIC_TUNNEL_URL) {
    broadcastSystemLog('PUBLIC_TUNNEL_URL missing. Agora Cloud cannot call back to this machine.', 'system');
    return res.status(400).json({ error: 'PUBLIC_TUNNEL_URL env variable is not configured' });
  }

  try {
    // Generate RTC token for the agent (Agent UID: 999)
    const agentUid = 999;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + 3600;
    const agentToken = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      agentUid,
      RtcRole.PUBLISHER,
      3600,
      3600
    );

    // Prepare API call to Agora Cloud Orchestration Service
    const authString = Buffer.from(`${AGORA_CUSTOMER_ID}:${AGORA_CUSTOMER_SECRET}`).toString('base64');
    const agoraApiUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${AGORA_APP_ID}/join`;

    const payload = {
      name: `incident_commander_${channelName}`,
      properties: {
        channel: channelName,
        token: agentToken,
        agent_rtc_uid: String(agentUid),
        remote_rtc_uids: ["*"],
        idle_timeout: 180,
        advanced_features: {
          enable_aivad: true
        },
        asr: {
          language: "en-US",
          vendor: "ares"
        },
        tts: {
          vendor: "microsoft",
          params: {
            voice_name: "en-US-AndrewMultilingualNeural"
          }
        },
        llm: {
          url: `${PUBLIC_TUNNEL_URL}/api/llm/chat/completions`,
          api_key: "dummy_key",
          params: {
            model: "llama-3.3-70b-specdec"
          }
        },
        vad: {
          mode: "interrupt"
        }
      }
    };

    broadcastSystemLog(`Inviting Agent to channel "${channelName}" at ${agoraApiUrl}...`, 'system');

    const response = await fetch(agoraApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agora API error: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    broadcastSystemLog(`Agent successfully invited to channel "${channelName}".`, 'system');
    res.json(responseData);
  } catch (err) {
    broadcastSystemLog(`Failed to invite agent: ${(err as Error).message}`, 'system');
    res.status(500).json({ error: (err as Error).message });
  }
});

// ----------------------------------------------------
// 3. OpenAI-Compatible Custom LLM Endpoint (SSE Stream)
// ----------------------------------------------------
app.post('/api/llm/chat/completions', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages must be a valid array' });
  }

  broadcastSystemLog('Received transcription completions request from Agora Cloud.', 'agent');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const emitLog = (msg: string) => {
    broadcastSystemLog(msg, 'agent');
  };

  const sendTextChunk = (text: string) => {
    const chunk = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'llama-3.3-70b-specdec',
      choices: [
        {
          index: 0,
          delta: { content: text },
          finish_reason: null
        }
      ]
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  };

  try {
    await runAgentLoop(messages, emitLog, sendTextChunk, io);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('LLM Proxy loop error:', err);
    sendTextChunk(`[Agent Error] Something went wrong executing my reasoning loop: ${(err as Error).message}`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// ----------------------------------------------------
// 4. UI Getters
// ----------------------------------------------------
app.get('/api/incidents', (req, res) => {
  res.json(db.getIncidents());
});

app.get('/api/constraints', (req, res) => {
  res.json(db.getConstraints());
});

// ----------------------------------------------------
// 5. Incident Injection & Remediation Simulation Endpoints
// ----------------------------------------------------
app.post('/api/incidents/trigger', async (req, res) => {
  const { scenario } = req.body;
  
  if (scenario === 'config_error') {
    broadcastSystemLog('Simulating Config Error Scenario (order-service pool shrinkage)...', 'system');
    
    try {
      // 1. Create incident in DB
      const incident = db.createIncident(
        'order-service',
        'Database connection timeouts on order-service',
        'critical',
        'order-service is showing CrashLoopBackOff. Pod is exiting immediately on startup.'
      );
      incident.confidence = 85;
      incident.likelyCause = 'PR #142 (reducing pool_size to 3) causing timeouts under concurrent load.';
      db.updateIncident(incident.id, incident);
      
      // 2. Inject failure in K8s (Set pool size to 3)
      broadcastSystemLog('Modifying K8s deployment "order-service" environment variable DB_POOL_SIZE to "3"...', 'k8s');
      await k8sTools.updateDeploymentEnv('order-service', 'DB_POOL_SIZE', '3');
      
      db.addTimelineEvent(incident.id, 'investigation', 'Injected pool configuration change into K8s deployment.');
      
      // Notify frontends
      io.emit('incidents_update', db.getIncidents());
      broadcastSystemLog('Scenario A failure injected successfully. Pods are crash-looping.', 'k8s');
      res.json({ success: true, incident });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
    
  } else if (scenario === 'cpu_spike') {
    broadcastSystemLog('Simulating Resource Spike Scenario (payment-service high CPU load)...', 'system');
    
    try {
      // 1. Find pod name for payment-service
      const pods = await k8sTools.listPods();
      const targetPod = pods.find(p => p.name.startsWith('payment-service'));
      
      if (!targetPod) {
        throw new Error('payment-service pod not found in cluster. Make sure manifests are applied.');
      }

      // 2. Create incident in DB
      const incident = db.createIncident(
        'payment-service',
        'High CPU saturation warning: payment-service',
        'high',
        'payment-service pod CPU load is at 96%, exceeding the warning threshold of 80%.'
      );
      
      // 3. Inject file /tmp/cpu_spike into payment-service pod to trigger warnings
      broadcastSystemLog(`Injecting CPU spike file into pod "${targetPod.name}"...`, 'k8s');
      await k8sTools.triggerCpuSpike(targetPod.name);
      
      db.addTimelineEvent(incident.id, 'investigation', `Injected CPU spike workload trigger into pod ${targetPod.name}`);
      
      // Notify frontends
      io.emit('incidents_update', db.getIncidents());
      broadcastSystemLog('Scenario B CPU load spike injected successfully.', 'k8s');
      res.json({ success: true, incident });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  } else {
    res.status(400).json({ error: 'Unknown scenario type' });
  }
});

// Resolve endpoint to clear cluster state
app.post('/api/incidents/resolve', async (req, res) => {
  const { incidentId } = req.body;
  const activeIncident = db.getIncidents().find(inc => inc.id === incidentId);
  
  if (!activeIncident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  broadcastSystemLog(`Resolving incident "${activeIncident.title}"...`, 'system');

  try {
    if (activeIncident.service === 'order-service') {
      broadcastSystemLog('Rolling back order-service deployment DB_POOL_SIZE to "20"...', 'k8s');
      await k8sTools.updateDeploymentEnv('order-service', 'DB_POOL_SIZE', '20');
    } else if (activeIncident.service === 'payment-service') {
      // Scale back to 1 replica if we scaled up, and clear the spike file
      broadcastSystemLog('Scaling payment-service back to 1 replica and clearing workload spike...', 'k8s');
      await k8sTools.scaleDeployment('payment-service', 1);
      
      const pods = await k8sTools.listPods();
      const targets = pods.filter(p => p.name.startsWith('payment-service'));
      for (const p of targets) {
        try {
          await k8sTools.clearCpuSpike(p.name);
        } catch (e) {
          // ignore failures on deleting pods
        }
      }
    }

    db.updateIncident(incidentId, { status: 'resolved' });
    db.addTimelineEvent(incidentId, 'resolution', 'Incident marked resolved. Local cluster restored to healthy state.');
    
    io.emit('incidents_update', db.getIncidents());
    broadcastSystemLog(`Incident "${activeIncident.title}" resolved successfully.`, 'system');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ----------------------------------------------------
// WebSockets connection
// ----------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  
  // Send initial data to client
  socket.emit('incidents_update', db.getIncidents());
  socket.emit('constraints_update', db.getConstraints());
  
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// K8s Pod status poller (updates UI every 4 seconds)
setInterval(async () => {
  try {
    const pods = await k8sTools.listPods();
    io.emit('k8s_pods_update', pods);
  } catch (e) {
    // Suppress console logs to avoid flooding terminal if cluster not started yet
  }
}, 4000);

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` AI Incident Commander Backend listening on Port ${PORT}`);
  console.log(` Custom LLM completions proxy at /api/llm/chat/completions`);
  console.log(`====================================================`);
});
