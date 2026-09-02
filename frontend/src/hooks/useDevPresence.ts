import { useState, useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type { DevPresence } from '../types/presence';

function getSessionDev(): DevPresence {
  let sessionId = sessionStorage.getItem('sre_session_dev_id');
  if (!sessionId) {
    // Generate a unique per-tab session ID
    sessionId = `sre_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    sessionStorage.setItem('sre_session_dev_id', sessionId);
  }

  // Allow custom name in sessionStorage, or default to Priyansh for tab 1
  const savedName = sessionStorage.getItem('sre_dev_name');
  const isSecondTab = window.name === 'tab_2' || (document.referrer && window.location.href === document.referrer);

  const defaultProfiles = [
    {
      name: savedName || 'Priyansh',
      role: 'Lead SRE (You)',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'
    },
    {
      name: savedName || 'On-Call SRE (Peer)',
      role: 'Platform Operations',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'
    }
  ];

  const profile = isSecondTab ? defaultProfiles[1] : defaultProfiles[0];

  return {
    id: sessionId,
    name: profile.name,
    role: profile.role,
    avatar: profile.avatar,
    windowFocused: true,
    documentVisible: true,
    status: 'live',
    lastPing: Date.now()
  };
}

export function useDevPresence(socket: Socket | null) {
  const [myDev, setMyDev] = useState<DevPresence>(() => getSessionDev());
  const [activeDevs, setActiveDevs] = useState<DevPresence[]>([]);
  const [liveCount, setLiveCount] = useState<number>(1);
  const [totalOnCall, setTotalOnCall] = useState<number>(1);
  const [windowFocused, setWindowFocused] = useState<boolean>(true);
  const [documentVisible, setDocumentVisible] = useState<boolean>(true);

  const myDevRef = useRef(myDev);
  myDevRef.current = myDev;

  // Window Focus & Document Visibility tracking
  useEffect(() => {
    const handleFocus = () => {
      setWindowFocused(true);
      setDocumentVisible(true);
    };

    const handleBlur = () => {
      setWindowFocused(false);
    };

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      setDocumentVisible(isVisible);
      if (!isVisible) {
        setWindowFocused(false);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    setWindowFocused(document.hasFocus());
    setDocumentVisible(document.visibilityState === 'visible');

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Heartbeat to backend socket
  useEffect(() => {
    if (!socket) return;

    const sendPing = () => {
      const isFocused = document.hasFocus();
      const isVisible = document.visibilityState === 'visible';
      const status: 'live' | 'away' = (isFocused || isVisible) ? 'live' : 'away';

      socket.emit('dev_presence_ping', {
        devId: myDevRef.current.id,
        name: myDevRef.current.name,
        role: myDevRef.current.role,
        avatar: myDevRef.current.avatar,
        windowFocused: isFocused,
        documentVisible: isVisible,
        status
      });
    };

    // Send immediately
    sendPing();
    const interval = setInterval(sendPing, 3000);

    window.addEventListener('focus', sendPing);
    document.addEventListener('visibilitychange', sendPing);

    // Listen for backend presence updates
    const handlePresenceUpdate = (data: { devs: DevPresence[]; liveCount: number; totalOnCall: number }) => {
      setActiveDevs(data.devs);
      setLiveCount(data.liveCount);
      setTotalOnCall(data.totalOnCall);
    };

    socket.on('dev_presence_update', handlePresenceUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', sendPing);
      document.removeEventListener('visibilitychange', sendPing);
      socket.off('dev_presence_update', handlePresenceUpdate);
    };
  }, [socket]);

  const updateDevProfile = (updates: Partial<DevPresence>) => {
    setMyDev(prev => {
      const updated = { ...prev, ...updates };
      if (updates.name) {
        sessionStorage.setItem('sre_dev_name', updates.name);
      }
      return updated;
    });
  };

  return {
    myDev,
    activeDevs,
    liveCount,
    totalOnCall,
    windowFocused,
    documentVisible,
    updateDevProfile
  };
}
