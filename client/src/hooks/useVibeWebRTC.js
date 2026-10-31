import { useCallback, useEffect, useRef, useState } from 'react';
import FALLBACK_RTC_CONFIG, { getIceServerConfig, ICE_REFRESH_MS } from '../utils/rtcConfig.js';

// A dropped call is given this long to recover before moving on
const RECONNECT_WINDOW_MS = 25000;
// While recovering, the initiator offers a fresh network path this often
const RESTART_RETRY_MS = 5000;
// 'disconnected' often heals by itself within a second or two
const DISCONNECT_SETTLE_MS = 2000;
// The partner's link dropped: wait this long before telling the user
const PARTNER_NOTICE_MS = 3000;

/**
 * Camera capture + RTCPeerConnection negotiation over the signaling socket.
 *
 * status: 'idle' (not looking), 'searching' (in the match pool), 'connected' (matched with `peer`)
 * isFriendCall: the current call was placed to/from a friend. When it ends we go idle instead of searching.
 * reconnecting: 'self' | 'partner' | null while a dropped call tries to recover (network switch, tunnel).
 *   The initiator restarts ICE; a lost signaling socket rejoins the call with 'resume_call'.
 * The camera is only requested once `mediaEnabled` is true (after the age/terms gate).
 */
export function useVibeWebRTC(socket, token, mediaEnabled = true) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [status, setStatus] = useState('idle');
  const [peer, setPeer] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [matchError, setMatchError] = useState(null);
  const [isFriendCall, setIsFriendCall] = useState(false);
  const [reconnecting, setReconnecting] = useState(null);

  const localStreamRef = useRef(null);
  const pcRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const iceConfigRef = useRef(FALLBACK_RTC_CONFIG);
  const preferencesRef = useRef({ targetGender: 'any', targetCountry: 'ALL' });
  const statusRef = useRef(status);
  statusRef.current = status;
  const isFriendCallRef = useRef(false);
  // The current call: its room (to resume it) and whether we send offers
  const roomIdRef = useRef(null);
  const isInitiatorRef = useRef(false);
  const giveUpTimerRef = useRef(null);
  const restartTimerRef = useRef(null);
  const partnerNoticeTimerRef = useRef(null);

  const stopReconnecting = useCallback(() => {
    clearTimeout(partnerNoticeTimerRef.current);
    clearTimeout(giveUpTimerRef.current);
    clearInterval(restartTimerRef.current);
    giveUpTimerRef.current = null;
    restartTimerRef.current = null;
    setReconnecting(null);
  }, []);

  // Acquire camera + microphone once allowed
  useEffect(() => {
    if (!mediaEnabled) return;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      })
      .catch((err) => {
        console.error('Camera access denied:', err);
        if (!cancelled) {
          setMediaError(
            err.name === 'NotAllowedError'
              ? 'Camera and microphone access was denied. Allow access in your browser settings to be seen and heard.'
              : 'No camera or microphone was found. You can still watch and listen.'
          );
        }
      });

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    };
  }, [mediaEnabled]);

  // Fetch STUN/TURN credentials for this session and keep them fresh (they are short-lived)
  useEffect(() => {
    if (!token) return;
    const refresh = () => getIceServerConfig(token).then((config) => {
      iceConfigRef.current = config;
    });
    refresh();
    const interval = setInterval(refresh, ICE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [token]);

  const closePeerConnection = useCallback(() => {
    const pc = pcRef.current;
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pcRef.current = null;
    }
    pendingCandidatesRef.current = [];
    roomIdRef.current = null;
    stopReconnecting();
    setRemoteStream(null);
    setPeer(null);
    isFriendCallRef.current = false;
    setIsFriendCall(false);
  }, [stopReconnecting]);

  /**
   * Enter (or re-enter) the match pool. Ends the current call if there is one.
   */
  const findPartner = useCallback((preferences) => {
    if (!socket) return;
    if (preferences) preferencesRef.current = preferences;
    closePeerConnection();
    setMatchError(null);
    setStatus('searching');
    socket.emit('find_partner', preferencesRef.current);
  }, [socket, closePeerConnection]);

  /**
   * Leave the call and the match pool entirely
   */
  const stop = useCallback(() => {
    if (!socket) return;
    closePeerConnection();
    setStatus('idle');
    socket.emit('leave');
  }, [socket, closePeerConnection]);

  const findPartnerRef = useRef(findPartner);
  findPartnerRef.current = findPartner;

  // A call ended underneath us: friend calls go idle, random calls look for the next person
  const afterCallEnded = useCallback(() => {
    if (isFriendCallRef.current) {
      closePeerConnection();
      setStatus('idle');
    } else {
      findPartnerRef.current();
    }
  }, [closePeerConnection]);
  const afterCallEndedRef = useRef(afterCallEnded);
  afterCallEndedRef.current = afterCallEnded;

  useEffect(() => {
    if (!socket) return;

    const logError = (err) => console.error('[VibeLoop RTC] Reconnect error:', err);

    // Initiator only (one side offers, so offers never collide): ask for a fresh network path
    const sendRestartOffer = async () => {
      const pc = pcRef.current;
      if (!pc || !isInitiatorRef.current || !socket.connected) return;
      if (pc.signalingState === 'have-local-offer') {
        await pc.setLocalDescription({ type: 'rollback' });
      }
      await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      socket.emit('signal_offer', { sdp: pc.localDescription });
    };

    const scheduleRestarts = () => {
      if (!isInitiatorRef.current) return;
      clearInterval(restartTimerRef.current);
      sendRestartOffer().catch(logError);
      restartTimerRef.current = setInterval(() => sendRestartOffer().catch(logError), RESTART_RETRY_MS);
    };

    // Starts the recovery window; after it, the call is treated as ended
    const startReconnecting = (who) => {
      setReconnecting(who);
      if (giveUpTimerRef.current) return;
      giveUpTimerRef.current = setTimeout(() => {
        giveUpTimerRef.current = null;
        if (pcRef.current?.connectionState !== 'connected') afterCallEndedRef.current();
      }, RECONNECT_WINDOW_MS);
    };

    // Signaling is back for both sides: recover media unless it never broke
    const onSignalingRestored = () => {
      const pc = pcRef.current;
      if (!pc) return;
      clearTimeout(partnerNoticeTimerRef.current);
      if (pc.connectionState === 'connected') stopReconnecting();
      else scheduleRestarts();
    };

    const createPeerConnection = () => {
      const pc = new RTCPeerConnection(iceConfigRef.current);
      const stream = localStreamRef.current;

      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } else {
        // No camera: still receive the partner's media
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0] || new MediaStream([event.track]));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', { candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        const state = pc.connectionState;
        if (state === 'connected') {
          stopReconnecting();
        } else if (state === 'failed') {
          startReconnecting('self');
          scheduleRestarts();
        } else if (state === 'disconnected') {
          startReconnecting('self');
          setTimeout(() => {
            if (pcRef.current === pc && pc.connectionState !== 'connected') scheduleRestarts();
          }, DISCONNECT_SETTLE_MS);
        }
      };

      pcRef.current = pc;
      return pc;
    };

    const flushPendingCandidates = async (pc) => {
      const candidates = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
      for (const candidate of candidates) {
        await pc.addIceCandidate(candidate);
      }
    };

    const logErrors = (handler) => async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        console.error('[VibeLoop RTC] Negotiation error:', err);
      }
    };

    const onMatchFound = logErrors(async ({ roomId, isInitiator, peer: matchedPeer, friendCall = false }) => {
      // The user stopped searching before this match arrived: release the partner.
      // Friend calls were explicitly accepted, so they connect from idle.
      if (statusRef.current === 'idle' && !friendCall) {
        socket.emit('leave');
        return;
      }

      closePeerConnection();
      roomIdRef.current = roomId;
      isInitiatorRef.current = Boolean(isInitiator);
      isFriendCallRef.current = friendCall;
      setIsFriendCall(friendCall);
      setPeer(matchedPeer);
      setStatus('connected');

      const pc = createPeerConnection();
      if (isInitiator) {
        await pc.setLocalDescription(await pc.createOffer());
        socket.emit('signal_offer', { sdp: pc.localDescription });
      }
    });

    const onOffer = logErrors(async ({ sdp }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(sdp);
      await flushPendingCandidates(pc);
      await pc.setLocalDescription(await pc.createAnswer());
      socket.emit('signal_answer', { sdp: pc.localDescription });
    });

    const onAnswer = logErrors(async ({ sdp }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(sdp);
      await flushPendingCandidates(pc);
    });

    const onIceCandidate = logErrors(async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc || !candidate) return;
      // Candidates can arrive before the remote description; buffer until it is set
      if (pc.remoteDescription) {
        await pc.addIceCandidate(candidate);
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
    });

    // Partner skipped or disconnected: back into the pool (or idle, after a friend call)
    const onPartnerLeft = () => afterCallEndedRef.current();

    const onMatchError = ({ error }) => {
      console.error('[VibeLoop Match]', error);
      setMatchError(error);
      closePeerConnection();
      setStatus('idle');
    };

    // Our signaling socket dropped mid-call: show it, and rejoin the call once reconnected
    const onSocketDisconnect = () => {
      if (pcRef.current) startReconnecting('self');
    };
    const onSocketConnect = () => {
      if (pcRef.current && roomIdRef.current) socket.emit('resume_call', { roomId: roomIdRef.current });
    };
    // The partner's socket dropped. A quick blip resumes within a second or two, so only say
    // so if they're still gone after PARTNER_NOTICE_MS (their video may look frozen meanwhile).
    const onPartnerReconnecting = () => {
      clearTimeout(partnerNoticeTimerRef.current);
      const pc = pcRef.current;
      partnerNoticeTimerRef.current = setTimeout(() => {
        if (pc && pcRef.current === pc) startReconnecting('partner');
      }, PARTNER_NOTICE_MS);
    };
    // Too late: the call ended while we were away
    const onResumeFailed = ({ roomId } = {}) => {
      if (roomId === roomIdRef.current) afterCallEndedRef.current();
    };

    socket.on('disconnect', onSocketDisconnect);
    socket.on('connect', onSocketConnect);
    socket.on('call_resumed', onSignalingRestored);
    socket.on('partner_reconnected', onSignalingRestored);
    socket.on('partner_reconnecting', onPartnerReconnecting);
    socket.on('call_resume_failed', onResumeFailed);
    socket.on('match_found', onMatchFound);
    socket.on('signal_offer', onOffer);
    socket.on('signal_answer', onAnswer);
    socket.on('ice_candidate', onIceCandidate);
    socket.on('partner_left', onPartnerLeft);
    socket.on('match_error', onMatchError);

    return () => {
      socket.off('disconnect', onSocketDisconnect);
      socket.off('connect', onSocketConnect);
      socket.off('call_resumed', onSignalingRestored);
      socket.off('partner_reconnected', onSignalingRestored);
      socket.off('partner_reconnecting', onPartnerReconnecting);
      socket.off('call_resume_failed', onResumeFailed);
      socket.off('match_found', onMatchFound);
      socket.off('signal_offer', onOffer);
      socket.off('signal_answer', onAnswer);
      socket.off('ice_candidate', onIceCandidate);
      socket.off('partner_left', onPartnerLeft);
      socket.off('match_error', onMatchError);
      closePeerConnection();
      setStatus('idle');
    };
  }, [socket, closePeerConnection, stopReconnecting]);

  return { localStream, remoteStream, status, peer, isFriendCall, reconnecting, mediaError, matchError, findPartner, stop };
}
