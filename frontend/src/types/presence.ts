export interface DevPresence {
  id: string;
  name: string;
  role: string;
  avatar: string;
  windowFocused: boolean;
  documentVisible: boolean;
  status: 'live' | 'away' | 'in_warroom';
  lastPing: number;
  socketId?: string;
}

export interface SummonPayload {
  incident: {
    id: string;
    service: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    likelyCause?: string;
    confidence?: number;
  };
  roomId: string;
  availableDevs: DevPresence[];
  liveCount: number;
  timestamp: string;
  greeting?: string;
}

export interface WarRoomMessage {
  id: string;
  sender: string;
  role: string;
  avatar: string;
  text: string;
  timestamp: string;
  isAI?: boolean;
  isVoice?: boolean;
}

export interface WarRoomReaction {
  id: string;
  devId: string;
  name: string;
  emoji: string;
}
