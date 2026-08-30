import { Groq } from 'groq-sdk';
import { db, Incident, Constraint } from './db';
import { k8sTools } from './k8s';
import { githubTools } from './github';
import { slackTools } from './slack';
import dotenv from 'dotenv';

dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY || 'mock_key';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-specdec';

const groq = new Groq({ apiKey: GROQ_API_KEY });

// System prompt builder with dynamic constraint injection
export function buildSystemPrompt(activeIncident: Incident | null): string {
  let constraintContext = '';
  
  if (activeIncident) {
    const service = activeIncident.service;
    const searchTrigger = activeIncident.title + ' ' + activeIncident.description;
    
    // Retrieve constraints matching the service or global scope
    const constraints = db.getRelevantConstraints(service, searchTrigger);
    
    if (constraints.length > 0) {
      constraintContext = `\n[CRITICAL - STORED HUMAN CONSTRAINTS DETECTED]
We found the following rules previously set by engineers for this service/scenario. You MUST strictly adhere to them:
${constraints.map((c, i) => `${i+1}. Rule: "${c.rule}" (Scope: ${c.scope}, Triggered by: ${c.trigger})`).join('\n')}
Make sure to explicitly mention the active constraints to the engineer when proposing actions.`;
    }
  }

  return `You are "Incident Commander", a voice-native AI assistant sitting on top of a Kubernetes cluster.
Your job is to investigate incidents, correlate root causes with GitHub PRs, propose calibrated actions, and execute whitelisted tools.

Guidelines:
1. **Explain what you are doing in plain language**. Since this is a voice channel, keep explanations concise, clear, and direct.
2. **Never claim absolute causation**. Use calibrated language, stating confidence percentages (e.g. "I am 80% confident that PR #142 caused this memory leak because...").
3. **Calibrated Action Proposing**:
   - Before taking ANY destructive or critical action (restarts, scale changes, rollbacks), state your confidence level and ASK the engineer for explicit confirmation.
   - For safe read-only actions (listing pods, checking logs, fetching PRs), you can run them automatically to answer questions.
4. **Constraint Recall**: If a constraint is active (listed below), you must obey it and state it out loud (e.g., "We learned a constraint not to restart payment-service during high traffic, so instead I propose...").
5. **No Raw Shell/Exec**: You must ONLY use the provided tools. Never assume you can execute arbitrary bash commands.

Active Incident Context:
${activeIncident ? JSON.stringify(activeIncident, null, 2) : 'No active incident right now.'}
${constraintContext}
`;
}

// Tool definitions schema in OpenAI format
const agentTools = [
  {
    type: 'function' as const,
    function: {
      name: 'list_pods',
      description: 'List pods and their status in a given namespace',
      parameters: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'K8s namespace, defaults to "default"' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_pod_logs',
      description: 'Fetch logs from a specific pod',
      parameters: {
        type: 'object',
        properties: {
          podName: { type: 'string', description: 'Name of the pod' },
          namespace: { type: 'string', description: 'Defaults to "default"' },
          tailLines: { type: 'integer', description: 'Number of lines to tail, defaults to 50' }
        },
        required: ['podName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'restart_pod',
      description: 'Triggers a pod restart by deleting it, allowing replica controller to create a fresh one. Ask for human confirmation first if this is a high-traffic hour or sensitive pod.',
      parameters: {
        type: 'object',
        properties: {
          podName: { type: 'string', description: 'Name of the pod' },
          namespace: { type: 'string', description: 'Defaults to "default"' }
        },
        required: ['podName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'scale_deployment',
      description: 'Scale replica count of a deployment',
      parameters: {
        type: 'object',
        properties: {
          deploymentName: { type: 'string', description: 'Name of the deployment' },
          replicas: { type: 'integer', description: 'Target number of replica pods' },
          namespace: { type: 'string', description: 'Defaults to "default"' }
        },
        required: ['deploymentName', 'replicas']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'rollback_deployment',
      description: 'Rolls back a deployment to previous configuration, reverting recent changes.',
      parameters: {
        type: 'object',
        properties: {
          deploymentName: { type: 'string', description: 'Name of the deployment' },
          namespace: { type: 'string', description: 'Defaults to "default"' }
        },
        required: ['deploymentName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_recent_prs',
      description: 'Fetch pull requests or commits merged in the last 24 hours touching a service.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: 'Name of the service (e.g. order-service)' },
          hours: { type: 'integer', description: 'Lookback window in hours, defaults to 24' }
        },
        required: ['serviceName']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_pr_diff',
      description: 'Fetch the line-by-line diff of changes made in a specific PR',
      parameters: {
        type: 'object',
        properties: {
          prId: { type: 'integer', description: 'ID of the PR' }
        },
        required: ['prId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_constraint',
      description: 'Persist a human constraint/policy learned during conversation to avoid repeating incorrect actions.',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', description: 'Scope of constraint, e.g. service name "payment-service"' },
          trigger: { type: 'string', description: 'Condition that triggers the rule, e.g. "restart" or "CPU threshold"' },
          rule: { type: 'string', description: 'Description of rule, e.g. "Do not restart between 10:00-18:00 without draining"' }
        },
        required: ['scope', 'trigger', 'rule']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'escalate_to_human',
      description: 'Escalate the incident to human on-call engineers via Slack webhook.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: 'Service experiencing issues' },
          reason: { type: 'string', description: 'Reason for escalation' }
        },
        required: ['serviceName', 'reason']
      }
    }
  }
];

// Execute a tool locally by name
async function executeTool(name: string, args: any, activeIncident: Incident | null, emitLog: (msg: string) => void): Promise<string> {
  emitLog(`[Tool Call] Running tool "${name}" with args: ${JSON.stringify(args)}`);
  
  try {
    switch (name) {
      case 'list_pods': {
        const pods = await k8sTools.listPods(args.namespace);
        return JSON.stringify(pods, null, 2);
      }
      case 'get_pod_logs': {
        const logs = await k8sTools.getPodLogs(args.podName, args.namespace, args.tailLines);
        return logs;
      }
      case 'restart_pod': {
        const result = await k8sTools.restartPod(args.podName, args.namespace);
        if (activeIncident) {
          db.addTimelineEvent(activeIncident.id, 'action', `Restarted pod: ${args.podName}`);
        }
        return result;
      }
      case 'scale_deployment': {
        const result = await k8sTools.scaleDeployment(args.deploymentName, args.replicas, args.namespace);
        if (activeIncident) {
          db.addTimelineEvent(activeIncident.id, 'action', `Scaled deployment ${args.deploymentName} to ${args.replicas} replicas`);
          if (args.deploymentName === 'payment-service' && args.replicas === 3) {
            db.updateIncident(activeIncident.id, { 
              status: 'resolved',
              likelyCause: 'Workload load spike (RECOVERY: SCALED REPLICAS TO 3)'
            });
            db.addTimelineEvent(activeIncident.id, 'resolution', 'Deployment replicas scaled to 3. Incident resolved.');
          }
        }
        return result;
      }
      case 'rollback_deployment': {
        const result = await k8sTools.rollbackDeployment(args.deploymentName, args.namespace);
        if (activeIncident) {
          db.addTimelineEvent(activeIncident.id, 'action', `Rolled back deployment: ${args.deploymentName}`);
          if (args.deploymentName === 'order-service') {
            db.updateIncident(activeIncident.id, { 
              status: 'resolved',
              confidence: 100,
              likelyCause: 'PR #142 Connection Pool Reduction (RESOLVED: BUMPED TO 20)'
            });
            db.addTimelineEvent(activeIncident.id, 'resolution', 'Deployment rolled back to pool size 20. Incident resolved.');
          }
        }
        return result;
      }
      case 'get_recent_prs': {
        const prs = await githubTools.getRecentPRs(args.serviceName, args.hours);
        return JSON.stringify(prs, null, 2);
      }
      case 'get_pr_diff': {
        const diff = await githubTools.getPRDiff(args.prId);
        return diff;
      }
      case 'save_constraint': {
        if (!activeIncident) {
          return 'No active incident context to link this constraint to.';
        }
        const constraint = db.saveConstraint(args.scope, args.trigger, args.rule, activeIncident.id);
        db.addTimelineEvent(activeIncident.id, 'constraint_applied', `Learned new constraint: "${args.rule}"`);
        emitLog(`[Constraint Learned] Scope: ${args.scope}, Rule: "${args.rule}"`);
        return `Constraint successfully saved in persistent store: ${JSON.stringify(constraint)}`;
      }
      case 'escalate_to_human': {
        const likelyCause = activeIncident?.likelyCause || 'Under investigation';
        const confidence = activeIncident?.confidence || 50;
        const constraints = activeIncident ? db.getRelevantConstraints(args.serviceName, activeIncident.title) : [];
        const constraintRules = constraints.map(c => c.rule);
        
        const result = await slackTools.sendEscalation(args.serviceName, args.reason, likelyCause, confidence, constraintRules);
        if (activeIncident) {
          db.addTimelineEvent(activeIncident.id, 'escalation', `Escalated to Slack: ${args.reason}`);
        }
        return result;
      }
      default:
        return `Unknown tool name: ${name}`;
    }
  } catch (err) {
    emitLog(`[Tool Error] "${name}" failed: ${(err as Error).message}`);
    return `Error executing tool ${name}: ${(err as Error).message}`;
  }
}

// Master agent completion loop
export async function runAgentLoop(
  chatMessages: any[],
  emitLog: (msg: string) => void,
  sendTextChunk: (chunk: string) => void,
  ioSocket: any
) {
  // 1. Get active incident details
  const activeIncident = db.getActiveIncident();
  const systemPrompt = buildSystemPrompt(activeIncident);

  // Broadcast the last user question as a transcript
  const lastUserMsg = chatMessages.filter(m => m.role === 'user').pop();
  if (lastUserMsg && ioSocket) {
    ioSocket.emit('voice_transcript', { sender: 'Human', text: lastUserMsg.content });
  }

  // Detect fallback simulation mode if keys are missing
  const isMockKey = GROQ_API_KEY === 'mock_key' || GROQ_API_KEY === 'your_groq_api_key' || !GROQ_API_KEY || GROQ_API_KEY.trim() === '';
  if (isMockKey) {
    emitLog('[Agent Proxy] GROQ_API_KEY is missing/placeholder. Activating keyless local simulation agent.');
    return await runSimulatedAgentLoop(chatMessages, emitLog, sendTextChunk, ioSocket);
  }

  // Filter messages to match OpenAI standard and inject system prompt at top
  const messagesToSend = [
    { role: 'system', content: systemPrompt },
    ...chatMessages.filter(m => m.role !== 'system')
  ];

  let currentLoop = 0;
  const maxLoops = 5;

  while (currentLoop < maxLoops) {
    currentLoop++;
    emitLog(`[Agent Loop] Requesting LLM inference... (Run #${currentLoop})`);

    // Call Groq
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: messagesToSend as any,
      tools: agentTools,
      tool_choice: 'auto'
    });

    const choice = response.choices[0];
    const message = choice.message;

    // Save message back to senders list for future context
    messagesToSend.push(message);

    // Check if tool calls exist
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);
        
        // Execute tool
        const toolResult = await executeTool(toolName, toolArgs, activeIncident, emitLog);
        
        // Push result to history
        messagesToSend.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: toolResult
        });

        // Push real-time event updates to UI
        if (ioSocket) {
          ioSocket.emit('console_log', {
            timestamp: new Date().toISOString(),
            source: 'agent',
            message: `Executed tool "${toolName}" with args: ${JSON.stringify(toolArgs)}`
          });
          ioSocket.emit('console_log', {
            timestamp: new Date().toISOString(),
            source: 'system',
            message: `Tool response: ${toolResult.slice(0, 300)}${toolResult.length > 300 ? '...' : ''}`
          });
          
          // Re-broadcast updated DB items
          ioSocket.emit('constraints_update', db.getConstraints());
          ioSocket.emit('incidents_update', db.getIncidents());
        }
      }
      
      // Continue loop to process tool output
      continue;
    }

    // No tool calls: this is the final verbal response
    const finalReply = message.content || '';
    if (finalReply) {
      emitLog(`[Agent Voice] Streaming response: "${finalReply}"`);
      
      if (ioSocket) {
        ioSocket.emit('voice_transcript', { sender: 'Agent', text: finalReply });
      }

      // Stream final reply to frontend and Agora via chunk simulation (Agora expects SSE formatting)
      const words = finalReply.split(' ');
      for (const word of words) {
        sendTextChunk(word + ' ');
        // Small delay to simulate natural stream playback
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      
      // Update timeline with agent response
      if (activeIncident && ioSocket) {
        db.addTimelineEvent(activeIncident.id, 'proposal', finalReply);
        ioSocket.emit('incidents_update', db.getIncidents());
      }
    }
    
    break; // Break loop
  }
}

// ----------------------------------------------------
// LOCAL SIMULATED AGENT LOOP (KEYLESS OFFLINE MODE)
// ----------------------------------------------------
async function runSimulatedAgentLoop(
  chatMessages: any[],
  emitLog: (msg: string) => void,
  sendTextChunk: (chunk: string) => void,
  ioSocket: any
) {
  const activeIncident = db.getActiveIncident();
  const lastUserMsg = chatMessages.filter(m => m.role === 'user').pop();
  const userText = lastUserMsg ? lastUserMsg.content.toLowerCase() : '';

  let finalReply = "I am ready. Tell me what needs to be investigated or resolved.";

  if (!activeIncident) {
    if (userText.includes('list') || userText.includes('pod')) {
      let toolResult = 'Mock Pods:\n- order-service-67fb9-xx (Healthy)\n- payment-service-ff98-xx (Healthy)';
      try {
        toolResult = await executeTool('list_pods', {}, activeIncident, emitLog);
      } catch (e) {
        emitLog('[Simulated Agent] K8s query failed (Offline Mode). Using mock pods list.');
      }
      if (ioSocket) {
        ioSocket.emit('console_log', {
          timestamp: new Date().toISOString(),
          source: 'system',
          message: `Simulated Pod State:\n${toolResult}`
        });
      }
      finalReply = "I have listed the cluster pods. All pods are currently healthy and reporting running status.";
    } else {
      finalReply = "The cluster is currently healthy. Please trigger a failure scenario to begin the demo.";
    }
  } else {
    const service = activeIncident.service;

    if (service === 'order-service') {
      // Scenario A
      if (userText.includes('investigate') || userText.includes('log') || userText.includes('check') || userText.includes('why') || userText.includes('cause')) {
        emitLog('[Simulated Agent] Reading order-service logs...');
        let logs = '[ERROR] ConnectionTimeoutException: Database connection pool exhausted after 3000ms. Active: 3/3. request queue: 45';
        
        try {
          const pods = await k8sTools.listPods();
          const orderPod = pods.find(p => p.name.startsWith('order-service'));
          if (orderPod) {
            logs = await k8sTools.getPodLogs(orderPod.name, 'default', 5);
          }
        } catch (e) {
          emitLog('[Simulated Agent] K8s pod logs query failed (Offline Mode). Using mock log trace.');
        }

        emitLog('[Simulated Agent] Fetching recent GitHub PR commits...');
        const diff = await githubTools.getPRDiff(142);

        if (ioSocket) {
          ioSocket.emit('console_log', {
            timestamp: new Date().toISOString(),
            source: 'k8s',
            message: `Pod Logs:\n${logs}`
          });
          ioSocket.emit('console_log', {
            timestamp: new Date().toISOString(),
            source: 'github',
            message: `PR Diff (#142):\n${diff}`
          });
        }

        finalReply = "I've checked the logs and correlated them with GitHub. The logs show connection exhaustion timeouts. PR #142 was merged 15 minutes ago by priyansh-dev, reducing DB_POOL_SIZE from 20 to 3. I am 85% confident this is the root cause. I propose rolling back the deployment to the previous config. Should I proceed?";
      } else if (userText.includes('yes') || userText.includes('rollback') || userText.includes('proceed') || userText.includes('fix') || userText.includes('revert')) {
        emitLog('[Simulated Agent] Triggering rollback...');
        await executeTool('rollback_deployment', { deploymentName: 'order-service' }, activeIncident, emitLog);
        
        db.updateIncident(activeIncident.id, {
          confidence: 100,
          likelyCause: 'PR #142 Connection Pool Reduction (RESOLVED: BUMPED TO 20)',
          status: 'resolved'
        });
        db.addTimelineEvent(activeIncident.id, 'resolution', 'Deployment rolled back to pool size 20. Incident resolved.');

        if (ioSocket) {
          ioSocket.emit('incidents_update', db.getIncidents());
        }

        finalReply = "Rolling back order-service deployment to pool size 20... Rollback complete and pods are stabilizing. The incident is now resolved.";
      } else {
        finalReply = "I have detected order-service is crash-looping. Please ask me to 'investigate' to check logs and PR diffs.";
      }

    } else if (service === 'payment-service') {
      // Scenario B
      const constraints = db.getRelevantConstraints('payment-service', 'CPU restart');
      const hasConstraint = constraints.length > 0;

      if (userText.includes('investigate') || userText.includes('log') || userText.includes('check') || userText.includes('why') || userText.includes('cause')) {
        emitLog('[Simulated Agent] Inspecting resource metrics...');
        if (hasConstraint) {
          finalReply = "Incident investigation complete. payment-service CPU is at 96%. Normally, I would recommend restarting the pod to clear resources. However, we learned a constraint: 'Do not restart payment-service during high traffic hours (10:00-18:00) without draining first'. Since it is currently 14:00, I will not restart. Instead, I propose scaling up our replicas to 3. Proceed?";
        } else {
          finalReply = "Incident investigation complete. payment-service CPU usage is at 96%, exceeding the safe threshold. I propose restarting the payment-service pod to clear resources. Should I proceed?";
        }
      } else if (userText.includes('no') || userText.includes('don\'t restart') || userText.includes('dont restart') || userText.includes('drain') || userText.includes('constraint')) {
        emitLog('[Simulated Agent] Human rejected restart. Saving constraint policy...');
        await executeTool('save_constraint', {
          scope: 'payment-service',
          trigger: 'CPU restart',
          rule: 'Do not restart payment-service during high traffic hours (10:00 - 18:00) without draining first'
        }, activeIncident, emitLog);

        emitLog('[Simulated Agent] Escalating load alerts to Slack webhook channel...');
        await executeTool('escalate_to_human', {
          serviceName: 'payment-service',
          reason: 'High CPU load (Restart vetoed - Traffic policy constraint stored)'
        }, activeIncident, emitLog);

        finalReply = "Understood. I have recorded a new constraint: 'Do not restart payment-service during high traffic hours (10:00 - 18:00) without draining first'. I have also escalated the incident details to Slack for on-call engineers.";
      } else if (userText.includes('yes') || userText.includes('scale') || userText.includes('proceed') || userText.includes('restart')) {
        if (hasConstraint) {
          emitLog('[Simulated Agent] Scaling deployment based on policy constraint...');
          await executeTool('scale_deployment', { deploymentName: 'payment-service', replicas: 3 }, activeIncident, emitLog);
          
          db.updateIncident(activeIncident.id, {
            status: 'resolved',
            likelyCause: 'Workload load spike (RECOVERY: SCALED REPLICAS TO 3)'
          });
          db.addTimelineEvent(activeIncident.id, 'resolution', 'Deployment replicas scaled to 3. Incident resolved.');

          if (ioSocket) {
            ioSocket.emit('incidents_update', db.getIncidents());
          }

          finalReply = "Understood. Scaling payment-service replicas to 3. Scaling complete, load has stabilized. Incident resolved.";
        } else {
          emitLog('[Simulated Agent] Restarting payment-service pod...');
          try {
            const pods = await k8sTools.listPods();
            const targetPod = pods.find(p => p.name.startsWith('payment-service'));
            if (targetPod) {
              await executeTool('restart_pod', { podName: targetPod.name }, activeIncident, emitLog);
            }
          } catch (e) {
            emitLog('[Simulated Agent] K8s pod query failed (Offline Mode). Bypassing physical restart.');
          }
          finalReply = "Understood. Restarting the payment-service pod. Please monitor the pod list in the sidebar.";
        }
      } else {
        finalReply = "I have detected high CPU load on payment-service. Please ask me to 'investigate' to check CPU thresholds.";
      }
    }
  }

  // Stream simulated final reply
  emitLog(`[Agent Voice] Streaming simulated response: "${finalReply}"`);
  if (ioSocket) {
    ioSocket.emit('voice_transcript', { sender: 'Agent', text: finalReply });
  }

  const words = finalReply.split(' ');
  for (const word of words) {
    sendTextChunk(word + ' ');
    await new Promise(resolve => setTimeout(resolve, 80));
  }

  if (activeIncident && ioSocket) {
    db.addTimelineEvent(activeIncident.id, 'proposal', finalReply);
    ioSocket.emit('incidents_update', db.getIncidents());
  }
}

