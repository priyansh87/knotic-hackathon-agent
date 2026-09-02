import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(__dirname, '..', 'db.json');

export interface Constraint {
  id: string;
  scope: string;       // e.g. "payment-service" or "global"
  trigger: string;     // e.g. "restart" or "scale"
  rule: string;        // e.g. "Do not restart between 10:00-18:00 without draining"
  incidentId: string;
  createdAt: string;
}

export interface TimelineEvent {
  timestamp: string;
  type: 'alert' | 'investigation' | 'proposal' | 'action' | 'resolution' | 'constraint_applied' | 'escalation';
  message: string;
}

export interface Incident {
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

interface DatabaseSchema {
  constraints: Constraint[];
  incidents: Incident[];
}

const defaultDb: DatabaseSchema = {
  constraints: [],
  incidents: []
};

// Helper to load database
function loadDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2));
      return defaultDb;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load database, resetting:', err);
    return defaultDb;
  }
}

// Helper to save database
function saveDb(data: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save database:', err);
  }
}

export const db = {
  // Constraints API
  saveConstraint(scope: string, trigger: string, rule: string, incidentId: string): Constraint {
    const data = loadDb();
    const newConstraint: Constraint = {
      id: `c_${Date.now()}`,
      scope: scope.toLowerCase().trim(),
      trigger: trigger.toLowerCase().trim(),
      rule,
      incidentId,
      createdAt: new Date().toISOString()
    };
    data.constraints.push(newConstraint);
    saveDb(data);
    return newConstraint;
  },

  getConstraints(): Constraint[] {
    return loadDb().constraints;
  },

  getRelevantConstraints(scope: string, trigger: string): Constraint[] {
    const data = loadDb();
    const targetScope = scope.toLowerCase().trim();
    const targetTrigger = trigger.toLowerCase().trim();

    return data.constraints.filter(c => {
      const scopeMatch = c.scope === 'global' || c.scope === targetScope;
      const triggerMatch = targetTrigger.includes(c.trigger) || c.trigger.includes(targetTrigger);
      return scopeMatch && triggerMatch;
    });
  },

  // Incidents API
  createIncident(service: string, title: string, severity: 'low' | 'medium' | 'high' | 'critical', description: string): Incident {
    const data = loadDb();
    // Auto-resolve any previous active incidents so there is never a stale ghost incident
    data.incidents.forEach(inc => {
      if (inc.status === 'active') {
        inc.status = 'resolved';
      }
    });

    const newIncident: Incident = {
      id: `inc_${Date.now()}`,
      service,
      status: 'active',
      severity,
      title,
      description,
      confidence: 0,
      likelyCause: '',
      actionsTaken: [],
      timeline: [
        {
          timestamp: new Date().toISOString(),
          type: 'alert',
          message: `Incident started: ${title}`
        }
      ],
      createdAt: new Date().toISOString()
    };
    data.incidents.unshift(newIncident);
    saveDb(data);
    return newIncident;
  },

  getIncidents(): Incident[] {
    return loadDb().incidents;
  },

  getActiveIncident(): Incident | null {
    const data = loadDb();
    return data.incidents.find(inc => inc.status === 'active') || null;
  },

  resolveAllIncidents(reason: string = 'Cluster restored to healthy state'): Incident[] {
    const data = loadDb();
    let resolvedAny = false;
    data.incidents.forEach(inc => {
      if (inc.status === 'active') {
        inc.status = 'resolved';
        inc.timeline.push({
          timestamp: new Date().toISOString(),
          type: 'resolution',
          message: reason
        });
        resolvedAny = true;
      }
    });
    if (resolvedAny) {
      saveDb(data);
    }
    return data.incidents;
  },

  updateIncident(id: string, updates: Partial<Omit<Incident, 'id' | 'createdAt'>>): Incident | null {
    const data = loadDb();
    const idx = data.incidents.findIndex(inc => inc.id === id);
    if (idx === -1) return null;

    data.incidents[idx] = {
      ...data.incidents[idx],
      ...updates
    };
    saveDb(data);
    return data.incidents[idx];
  },

  addTimelineEvent(incidentId: string, type: TimelineEvent['type'], message: string): Incident | null {
    const data = loadDb();
    const idx = data.incidents.findIndex(inc => inc.id === incidentId);
    if (idx === -1) return null;

    data.incidents[idx].timeline.push({
      timestamp: new Date().toISOString(),
      type,
      message
    });
    saveDb(data);
    return data.incidents[idx];
  }
};
