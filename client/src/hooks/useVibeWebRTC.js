import { useCallback, useEffect, useRef, useState } from 'react';
import FALLBACK_RTC_CONFIG, { getIceServerConfig } from '../utils/rtcConfig.js';

/**
 * Camera capture + RTCPeerConnection negotiation over the signaling socket.
 *
 * status: 'idle' (not looking), 'searching' (in the match pool), 'connected' (matched with `peer`)
 */
export function useVibeWebRTC(socket, token) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [status, setStatus] = useState('idle');
  const [peer, setPeer] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [matchError, setMatchError] = useState(null);

  const localStreamRef = useRef(null);
  const pcRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const iceConfigRef = useRef(FALLBACK_RTC_CONFIG);
  const preferencesRef = useRef({ targetGender: 'any', targetCountry: 'ALL' });
  const statusRef = useRef(status);
  statusRef.current = status;

  // Acquire camera + microphone once
  useEffect(() => {
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
  }, []);

  // Fetch STUN/TURN credentials for this session
  useEffect(() => {
    if (!token) return;
    getIceServerConfig(token).then((config) => {
      iceConfigRef.current = config;
    });
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
    setRemoteStream(null);
    setPeer(null);
  }, []);

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

  useEffect(() => {
    if (!socket) return;

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
        if (pc.connectionState === 'failed') {
          findPartnerRef.current();
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

    const onMatchFound = logErrors(async ({ isInitiator, peer: matchedPeer }) => {
      // The user stopped searching before this match arrived: release the partner
      if (statusRef.current === 'idle') {
        socket.emit('leave');
        return;
      }

      closePeerConnection();
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

    // Partner skipped or disconnected: go straight back into the pool
    const onPartnerLeft = () => findPartnerRef.current();

    const onMatchError = ({ error }) => {
      console.error('[VibeLoop Match]', error);
      setMatchError(error);
      closePeerConnection();
      setStatus('idle');
    };

    socket.on('match_found', onMatchFound);
    socket.on('signal_offer', onOffer);
    socket.on('signal_answer', onAnswer);
    socket.on('ice_candidate', onIceCandidate);
    socket.on('partner_left', onPartnerLeft);
    socket.on('match_error', onMatchError);

    return () => {
      socket.off('match_found', onMatchFound);
      socket.off('signal_offer', onOffer);
      socket.off('signal_answer', onAnswer);
      socket.off('ice_candidate', onIceCandidate);
      socket.off('partner_left', onPartnerLeft);
      socket.off('match_error', onMatchError);
      closePeerConnection();
      setStatus('idle');
    };
  }, [socket, closePeerConnection]);

  return { localStream, remoteStream, status, peer, mediaError, matchError, findPartner, stop };
}
