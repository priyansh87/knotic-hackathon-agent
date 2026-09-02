import { useState, useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type { DevPresence } from '../types/presence';

const DEFAULT_ME: DevPresence = {
  id: 'dev_priyansh',
  name: 'Priyansh',
  role: 'Lead SRE & Incident Commander',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  windowFocused: true,
  documentVisible: true,
  status: 'live',
  lastPing: Date.now()
};

export function useDevPresence(socket: Socket | null) {
  const [myDev, setMyDev] = useState<DevPresence>(() => {
    const saved = localStorage.getItem('sre_dev_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return DEFAULT_ME;
  });

  const [activeDevs, setActiveDevs] = useState<DevPresence[]>([]);
  const [liveCount, setLiveCount] = useState<number>(3);
  const [totalOnCall, setTotalOnCall] = useState<number>(4);
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

    // Initial state
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

    // Send immediately on connect/mount
    sendPing();
    const interval = setInterval(sendPing, 3500);

    // Also send on focus / visibility triggers
    window.addEventListener('focus', sendPing);
    document.addEventListener('visibilitychange', sendPing);

    // Listen for backend broadcast
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
      localStorage.setItem('sre_dev_profile', JSON.stringify(updated));
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
