import React, { useState, useEffect, useRef, useCallback } from 'react';
import HeaderBar from './components/hud/HeaderBar.jsx';
import GiftTray from './components/overlays/GiftTray.jsx';
import ChatDrawer from './components/overlays/ChatDrawer.jsx';
import AuthModal from './components/overlays/AuthModal.jsx';
import ConsentModal, { TERMS_VERSION } from './components/overlays/ConsentModal.jsx';
import ReportModal from './components/overlays/ReportModal.jsx';
import FilterModal from './components/overlays/FilterModal.jsx';
import AccountModal from './components/overlays/AccountModal.jsx';
import HistoryBar from './components/overlays/HistoryBar.jsx';
import { useSocket } from './hooks/useSocket.js';
import { useVibeWebRTC } from './hooks/useVibeWebRTC.js';
import { apiFetch, BACKEND_URL } from './utils/api.js';
import {
  Video, VideoOff, Mic, MicOff, FastForward, Gift, MessageSquare, Sparkles, Square,
  AlertTriangle, Flag, SlidersHorizontal
} from 'lucide-react';

const DEFAULT_PREFERENCES = { targetGender: 'any', targetCountry: 'ALL' };

function loadJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => loadJson('vibeloop_user'));
  const [token, setToken] = useState(() => localStorage.getItem('vibeloop_token'));
  const [sessionError, setSessionError] = useState(null);
  const [hasConsented, setHasConsented] = useState(() => localStorage.getItem('vibeloop_consent') === TERMS_VERSION);
  const [preferences, setPreferences] = useState(() => loadJson('vibeloop_filters') || DEFAULT_PREFERENCES);

  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);

  // Overlays
  const [giftTarget, setGiftTarget] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // Chat & Economy
  const [messages, setMessages] = useState([]);
  const [chatError, setChatError] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [m2eEarned, setM2eEarned] = useState(0.0);
  const [secondsUntilReward, setSecondsUntilReward] = useState(180);
  const [gifts, setGifts] = useState([]);
  const [incomingGift, setIncomingGift] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [notice, setNotice] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const noticeTimeoutRef = useRef(null);

  const persistSession = useCallback((user, tok) => {
    localStorage.setItem('vibeloop_token', tok);
    localStorage.setItem('vibeloop_user', JSON.stringify(user));
    setCurrentUser(user);
    setToken(tok);
  }, []);

  // Clearing the session makes the effect below issue a fresh guest session
  const clearSession = useCallback(() => {
    localStorage.removeItem('vibeloop_token');
    localStorage.removeItem('vibeloop_user');
    setCurrentUser(null);
    setToken(null);
  }, []);

  const showNotice = useCallback((text, isError = false) => {
    setNotice({ text, isError });
    clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  const { socket, onlineCount } = useSocket(token, clearSession);
  const {
    localStream, remoteStream, status, peer, mediaError, matchError, findPartner, stop
  } = useVibeWebRTC(socket, token, hasConsented);
  const stageError = sessionError || matchError || mediaError;
  const isMatched = status === 'connected';

  const handleConsent = () => {
    localStorage.setItem('vibeloop_consent', TERMS_VERSION);
    setHasConsented(true);
  };

  // Instant guest access once the age/terms gate is passed
  useEffect(() => {
    if (token || !hasConsented) return;
    let cancelled = false;

    apiFetch('/api/auth/guest', { method: 'POST', body: { ageConfirmed: true, termsAccepted: true } })
      .then((data) => {
        if (!cancelled) {
          setSessionError(null);
          persistSession(data.user, data.token);
        }
      })
      .catch((err) => {
        console.error('Guest session failed:', err);
        if (!cancelled) setSessionError('Could not reach VibeLoop servers. Please try again shortly.');
      });

    return () => {
      cancelled = true;
    };
  }, [token, hasConsented, persistSession]);

  // Fetch balance for the current session
  useEffect(() => {
    if (!token) return;
    apiFetch('/api/wallet/balance', { token })
      .then((data) => {
        setWalletBalance(data.balance);
        setM2eEarned(data.m2eEarnedToday);
        setSecondsUntilReward(data.secondsUntilNextReward);
      })
      .catch(console.error);
  }, [token]);

  // Gift catalog is owned by the server
  useEffect(() => {
    apiFetch('/api/wallet/gifts')
      .then((data) => setGifts(data.gifts))
      .catch(console.error);
  }, []);

  const fetchHistory = useCallback(() => {
    if (!token) return;
    apiFetch('/api/history', { token })
      .then((data) => setContacts(data.contacts))
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Chat events
  useEffect(() => {
    if (!socket) return;
    let errorTimeout;
    const appendMessage = (msg) => setMessages((prev) => [...prev.slice(-29), msg]);
    const onChatError = ({ error }) => {
      setChatError(error);
      clearTimeout(errorTimeout);
      errorTimeout = setTimeout(() => setChatError(null), 4000);
    };
    socket.on('receive_message', appendMessage);
    socket.on('message_sent', appendMessage);
    socket.on('chat_error', onChatError);
    return () => {
      clearTimeout(errorTimeout);
      socket.off('receive_message', appendMessage);
      socket.off('message_sent', appendMessage);
      socket.off('chat_error', onChatError);
    };
  }, [socket]);

  // Each new partner starts with an empty chat
  useEffect(() => {
    setMessages([]);
  }, [peer?.id]);

  // Meet-to-Earn: ping while in a call; the server measures the actual call time
  useEffect(() => {
    if (!socket || !isMatched) return;
    const interval = setInterval(() => socket.emit('m2e_heartbeat'), 30000);
    return () => clearInterval(interval);
  }, [socket, isMatched]);

  // Wallet, history and safety events pushed by the server
  useEffect(() => {
    if (!socket) return;
    let giftTimeout;

    const onProgress = (progress) => {
      setSecondsUntilReward(progress.secondsUntilNextReward);
      if (progress.balance !== undefined) setWalletBalance(progress.balance);
      if (progress.m2eEarnedToday !== undefined) setM2eEarned(progress.m2eEarnedToday);
    };

    const onGiftReceived = (event) => {
      setIncomingGift(event);
      clearTimeout(giftTimeout);
      giftTimeout = setTimeout(() => setIncomingGift(null), 4000);
    };

    const onSafetyAck = ({ action }) => {
      showNotice(action === 'report'
        ? "Thanks for reporting. You won't be matched with them again."
        : "Blocked. You won't be matched with them again.");
    };

    const onSafetyError = ({ error }) => showNotice(error, true);

    socket.on('m2e_progress', onProgress);
    socket.on('gift_received', onGiftReceived);
    socket.on('history_updated', fetchHistory);
    socket.on('safety_ack', onSafetyAck);
    socket.on('safety_error', onSafetyError);
    return () => {
      clearTimeout(giftTimeout);
      socket.off('m2e_progress', onProgress);
      socket.off('gift_received', onGiftReceived);
      socket.off('history_updated', fetchHistory);
      socket.off('safety_ack', onSafetyAck);
      socket.off('safety_error', onSafetyError);
    };
  }, [socket, fetchHistory, showNotice]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // Close the report dialog if the partner leaves first
  useEffect(() => {
    if (!isMatched) setIsReportOpen(false);
  }, [isMatched]);

  const handleLogout = () => {
    stop();
    clearSession();
  };

  // The server already closed our sockets; a fresh guest session is created automatically
  const handleAccountDeleted = () => {
    setIsAccountOpen(false);
    clearSession();
    showNotice('Your account and data have been deleted.');
  };

  const toggleVideo = () => {
    const track = localStream?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoOn(track.enabled);
    }
  };

  const toggleAudio = () => {
    const track = localStream?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsAudioOn(track.enabled);
    }
  };

  const handlePrimaryAction = () => {
    if (status === 'searching') {
      stop();
    } else {
      findPartner(preferences);
    }
  };

  const handleSendMessage = (text) => {
    if (!socket || !isMatched) return;
    socket.emit('send_message', { messageText: text });
  };

  // Errors propagate so the gift tray can show them
  const handleSendGift = async (gift) => {
    if (!giftTarget) return;
    const data = await apiFetch('/api/wallet/send-gift', {
      token,
      method: 'POST',
      body: { recipientId: giftTarget.id, giftId: gift.id }
    });
    setWalletBalance(data.senderNewBalance);
  };

  const handleReport = (reason, details) => {
    setIsReportOpen(false);
    socket.emit('report_partner', { reason, details });
    findPartner(preferences);
  };

  const handleBlock = () => {
    setIsReportOpen(false);
    socket.emit('block_partner');
    findPartner(preferences);
  };

  const profile = {
    gender: currentUser?.gender || 'other',
    country: currentUser?.country || 'ALL'
  };

  const handleSaveFilters = async ({ preferences: nextPreferences, profile: nextProfile }) => {
    if (nextProfile.gender !== profile.gender || nextProfile.country !== profile.country) {
      // New token carries the updated profile; the socket reconnects with it
      const data = await apiFetch('/api/auth/profile', { token, method: 'PATCH', body: nextProfile });
      persistSession(data.user, data.token);
    }
    localStorage.setItem('vibeloop_filters', JSON.stringify(nextPreferences));
    setPreferences(nextPreferences);
  };

  const stageTitle = {
    idle: 'Ready to discover',
    searching: 'Connecting to next vibe...',
    connected: 'Connecting video...'
  }[status];

  const controlButton = 'p-3 sm:p-4 rounded-2xl backdrop-blur-xl transition-all shadow-lg active:scale-95 cursor-pointer';

  return (
    <div className="relative w-screen h-screen bg-[#08090D] overflow-hidden flex flex-col items-center justify-center">

      {/* Top HUD HeaderBar */}
      <HeaderBar
        onlineCount={onlineCount}
        vibeBalance={walletBalance}
        m2eEarnedToday={m2eEarned}
        m2eDailyCap={10.0}
        secondsUntilNextReward={secondsUntilReward}
        isCallActive={isMatched}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        onOpenBoostModal={() => alert('VibeBoost Modal: 1-hour priority matching unlocked with 10 VIBE!')}
        onOpenRechargeModal={() => alert('VIBE Store: Instant wallet refills coming next!')}
      />

      {/* Main Remote Video Stage */}
      <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${isMatched && remoteStream ? '' : 'hidden'}`}
        />
        {!(isMatched && remoteStream) && (
          <div className="flex flex-col items-center justify-center gap-4 text-center px-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-2 border-[#00F0FF]/30 border-t-[#00F0FF] animate-spin flex items-center justify-center shadow-[0_0_30px_rgba(0,240,255,0.2)]" />
              <Sparkles className="absolute inset-0 m-auto text-[#00F0FF] animate-pulse" size={32} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide">
                {stageTitle}
              </h2>
              <p className="text-sm text-slate-400 mt-1 max-w-sm">
                {isMatched && peer
                  ? `Matched with ${peer.username}`
                  : 'Press START to instantly meet verified people around the globe. Earn VIBE tokens as you chat.'}
              </p>
            </div>
            {stageError && (
              <div className="flex items-start gap-2 max-w-sm p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-left">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{stageError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* In-call Report / Block */}
      {isMatched && (
        <button
          onClick={() => setIsReportOpen(true)}
          title="Report or block"
          className="absolute top-20 left-4 sm:top-24 sm:left-6 z-30 flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#12151E]/80 border border-red-500/40 text-red-400 hover:bg-red-500/10 backdrop-blur-xl text-xs font-bold shadow-lg transition-colors cursor-pointer"
        >
          <Flag size={14} />
          <span>Report</span>
        </button>
      )}

      {/* Draggable/Fixed Local PIP Camera */}
      <div className="absolute top-20 right-4 sm:top-24 sm:right-6 w-32 h-44 sm:w-44 sm:h-60 rounded-3xl overflow-hidden border border-slate-700/80 shadow-2xl bg-[#12151E]/80 backdrop-blur-xl z-30 transition-all">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover scale-x-[-1] ${!isVideoOn || !localStream ? 'hidden' : ''}`}
        />
        {(!isVideoOn || !localStream) && (
          <div className="w-full h-full flex items-center justify-center text-slate-500 bg-[#08090D]">
            <VideoOff size={28} />
          </div>
        )}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-bold text-slate-300">
          YOU
        </div>
      </div>

      {/* Recent contacts (20s+ calls), shown between calls */}
      {!isMatched && (
        <HistoryBar
          contacts={contacts}
          onSelect={(contact) => setGiftTarget({ id: contact.peerId, username: contact.username })}
        />
      )}

      {/* Bottom Floating Control Bar */}
      <div className="absolute bottom-6 z-40 px-4 flex items-center gap-2 sm:gap-3 max-w-lg w-full justify-center">

        {/* Toggle Mic */}
        <button
          onClick={toggleAudio}
          className={`${controlButton} border ${
            isAudioOn
              ? 'bg-[#12151E]/90 border-slate-800 text-white hover:bg-slate-800'
              : 'bg-red-500/20 border-red-500/50 text-red-400'
          }`}
        >
          {isAudioOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Toggle Video */}
        <button
          onClick={toggleVideo}
          className={`${controlButton} border ${
            isVideoOn
              ? 'bg-[#12151E]/90 border-slate-800 text-white hover:bg-slate-800'
              : 'bg-red-500/20 border-red-500/50 text-red-400'
          }`}
        >
          {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        {/* Primary START / STOP / NEXT Button */}
        <button
          onClick={handlePrimaryAction}
          disabled={!socket || !hasConsented}
          className="flex-1 py-3 sm:py-4 px-4 sm:px-6 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] hover:opacity-95 text-slate-950 font-black text-sm tracking-wider flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(0,240,255,0.4)] active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'searching' ? (
            <>
              <span>STOP</span>
              <Square size={16} className="fill-slate-950" />
            </>
          ) : (
            <>
              <span>{isMatched ? 'NEXT' : 'START'}</span>
              <FastForward size={18} className="fill-slate-950" />
            </>
          )}
        </button>

        {/* Filters */}
        <button
          onClick={() => setIsFilterOpen(true)}
          title="Match filters"
          className={`${controlButton} relative bg-[#12151E]/90 hover:bg-slate-800 border border-slate-800 text-white`}
        >
          <SlidersHorizontal size={20} />
          {(preferences.targetGender !== 'any' || preferences.targetCountry !== 'ALL') && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#00F0FF]" />
          )}
        </button>

        {/* Chat Toggle Trigger */}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`${controlButton} relative bg-[#12151E]/90 hover:bg-slate-800 border border-[#00F0FF]/40 text-[#00F0FF]`}
        >
          <MessageSquare size={20} />
          {messages.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#FF2A7A] animate-ping" />
          )}
        </button>

        {/* Gift Trigger */}
        <button
          onClick={() => setGiftTarget(peer)}
          disabled={!isMatched}
          className={`${controlButton} bg-[#12151E]/90 hover:bg-slate-800 border border-[#FFD166]/40 text-[#FFD166] disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <Gift size={20} />
        </button>

      </div>

      {/* Toast notices (safety confirmations / errors) */}
      {notice && (
        <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-50 max-w-sm px-4 py-3 rounded-2xl backdrop-blur-xl text-xs font-semibold shadow-lg border ${
          notice.isError
            ? 'bg-red-500/10 border-red-500/40 text-red-300'
            : 'bg-[#12151E]/90 border-[#00F0FF]/40 text-slate-200'
        }`}>
          {notice.text}
        </div>
      )}

      {/* Incoming Gift Notification */}
      {incomingGift && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-3xl bg-[#12151E]/90 border border-[#FF2A7A]/40 backdrop-blur-xl shadow-[0_0_30px_rgba(255,42,122,0.3)] animate-in fade-in slide-in-from-top-4 duration-300">
          <span className="text-4xl drop-shadow-md">{incomingGift.gift.icon}</span>
          <div className="text-xs">
            <div className="text-white font-bold">
              {incomingGift.from.username} sent you a {incomingGift.gift.name}!
            </div>
            <div className="text-[#FFD166] font-semibold mt-0.5">
              +{incomingGift.recipientReceived.toFixed(2)} VIBE earned
            </div>
          </div>
        </div>
      )}

      {/* Overlays */}
      <GiftTray
        isOpen={Boolean(giftTarget)}
        onClose={() => setGiftTarget(null)}
        gifts={gifts}
        userBalance={walletBalance}
        recipientName={giftTarget?.username || 'Stranger'}
        onSendGift={handleSendGift}
      />

      <ChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={messages}
        error={chatError}
        onSendMessage={handleSendMessage}
        currentUserId={currentUser?.id}
      />

      {isReportOpen && isMatched && (
        <ReportModal
          peerName={peer?.username}
          onClose={() => setIsReportOpen(false)}
          onReport={handleReport}
          onBlock={handleBlock}
        />
      )}

      {isFilterOpen && (
        <FilterModal
          preferences={preferences}
          profile={profile}
          onClose={() => setIsFilterOpen(false)}
          onSave={handleSaveFilters}
        />
      )}

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        backendUrl={BACKEND_URL}
        onAuthSuccess={persistSession}
      />

      {isAccountOpen && (
        <AccountModal
          currentUser={currentUser}
          token={token}
          onClose={() => setIsAccountOpen(false)}
          onDeleted={handleAccountDeleted}
        />
      )}

      {/* Legal & data links */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-40 flex gap-3 text-[10px] text-slate-600 whitespace-nowrap">
        <a href="/terms" target="_blank" rel="noreferrer" className="hover:text-slate-300">Terms</a>
        <a href="/privacy" target="_blank" rel="noreferrer" className="hover:text-slate-300">Privacy</a>
        <button onClick={() => setIsAccountOpen(true)} className="hover:text-slate-300 cursor-pointer">Your account &amp; data</button>
      </div>

      {!hasConsented && <ConsentModal onAccept={handleConsent} />}

    </div>
  );
}
