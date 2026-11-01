import React, { useState, useEffect, useRef, useCallback } from 'react';
import HeaderBar from './components/hud/HeaderBar.jsx';
import GiftTray from './components/overlays/GiftTray.jsx';
import ChatDrawer from './components/overlays/ChatDrawer.jsx';
import AuthModal from './components/overlays/AuthModal.jsx';
import ConsentModal, { TERMS_VERSION } from './components/overlays/ConsentModal.jsx';
import ReportModal from './components/overlays/ReportModal.jsx';
import FilterModal from './components/overlays/FilterModal.jsx';
import AccountModal from './components/overlays/AccountModal.jsx';
import WalletModal from './components/overlays/WalletModal.jsx';
import BoostModal, { minutesLeft } from './components/overlays/BoostModal.jsx';
import TopUpModal from './components/overlays/TopUpModal.jsx';
import ProfileModal from './components/overlays/ProfileModal.jsx';
import FriendsPanel from './components/overlays/FriendsPanel.jsx';
import CallOverlay from './components/overlays/CallOverlay.jsx';
import HistoryBar from './components/overlays/HistoryBar.jsx';
import BirthDateModal from './components/overlays/BirthDateModal.jsx';
import LeaderboardModal, { MEDALS } from './components/overlays/LeaderboardModal.jsx';
import InviteModal from './components/overlays/InviteModal.jsx';
import SharePrompt from './components/overlays/SharePrompt.jsx';
import { getInviteCode, clearInviteCode } from './utils/referral.js';
import { ageRangeLabel, FILTER_MIN_AGE, FILTER_MAX_AGE } from './utils/age.js';
import { useSocket } from './hooks/useSocket.js';
import { useVibeWebRTC } from './hooks/useVibeWebRTC.js';
import { useFriends } from './hooks/useFriends.js';
import { apiFetch, BACKEND_URL } from './utils/api.js';
import SelfView from './components/hud/SelfView.jsx';
import ControlBar from './components/hud/ControlBar.jsx';
import LikeBurst from './components/hud/LikeBurst.jsx';
import GenderLabel, { genderText } from './components/hud/GenderLabel.jsx';
import { COUNTRIES, flagEmoji } from './utils/countries.js';
import { Sparkles, AlertTriangle, Flag, UserPlus, Users, Heart, Loader2 } from 'lucide-react';

// After a call this long, suggest sharing VibeLoop (at most once per SHARE_PROMPT_EVERY_MS)
const SHARE_PROMPT_MIN_CALL_MS = 2 * 60 * 1000;
const SHARE_PROMPT_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

const DEFAULT_PREFERENCES = { targetGender: 'any', targetCountry: 'ALL', minAge: FILTER_MIN_AGE, maxAge: FILTER_MAX_AGE };

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
  // Saved filters from before the age filter existed get the full age range
  const [preferences, setPreferences] = useState(() => ({ ...DEFAULT_PREFERENCES, ...loadJson('vibeloop_filters') }));
  // The token whose profile has been refreshed from the server (stored copies can predate new fields)
  const [checkedToken, setCheckedToken] = useState(null);
  // Date of birth from the first-visit screen, used when the guest session is created
  const pendingBirthDateRef = useRef(null);

  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [selfViewSide, setSelfViewSide] = useState(() => (localStorage.getItem('vibeloop_pip_side') === 'left' ? 'left' : 'right'));

  // Overlays
  const [giftTarget, setGiftTarget] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [inviterReward, setInviterReward] = useState(5);
  const [authMode, setAuthMode] = useState('login');
  const [boostUntil, setBoostUntil] = useState(null);
  const [boostPrice, setBoostPrice] = useState(10);
  const [rewards, setRewards] = useState({ SIGNUP: 5, PROFILE_PHOTO: 1 });

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

  // Likes: the partner's lifetime total, whether we liked this chat, and burst animations
  const [peerLikes, setPeerLikes] = useState(null); // { userId, likes }
  const [hasLiked, setHasLiked] = useState(false);
  const [likeBurst, setLikeBurst] = useState(null); // { id, received }

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
    localStream, remoteStream, status, peer, isFriendCall, reconnecting, mediaError, matchError, findPartner, stop
  } = useVibeWebRTC(socket, token, hasConsented);
  const stageError = sessionError || matchError || mediaError;
  const isMatched = status === 'connected';

  const isRegistered = Boolean(currentUser && !currentUser.isGuest);
  const friends = useFriends(socket, token, currentUser?.id, isRegistered, showNotice);
  const isFriendCallRef = useRef(isFriendCall);
  isFriendCallRef.current = isFriendCall;

  const handleConsent = ({ birthDate } = {}) => {
    localStorage.setItem('vibeloop_consent', TERMS_VERSION);
    setHasConsented(true);
    if (!birthDate) return;
    if (!token) {
      pendingBirthDateRef.current = birthDate;
    } else if (currentUser && !currentUser.birthDate) {
      // Existing session without one: save it now (the one-time prompt shows if this fails)
      apiFetch('/api/profile/birth-date', { token, method: 'PATCH', body: { birthDate } })
        .then((data) => persistSession(data.user, data.token))
        .catch((err) => showNotice(err.message, true));
    }
  };

  // Instant guest access once the age/terms gate is passed
  useEffect(() => {
    if (token || !hasConsented) return;
    let cancelled = false;

    const birthDate = pendingBirthDateRef.current;
    apiFetch('/api/auth/guest', {
      method: 'POST',
      body: { ageConfirmed: true, termsAccepted: true, ...(birthDate && { birthDate }), ref: getInviteCode() || undefined }
    })
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

  // Refresh the stored profile once per session token (e.g. a birth date added on another device)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch('/api/auth/me', { token })
      .then((data) => {
        if (cancelled) return;
        // A replacement token means ours predates the stored birth date; this effect reruns with it
        if (data.token) return persistSession(data.user, data.token);
        localStorage.setItem('vibeloop_user', JSON.stringify(data.user));
        setCurrentUser(data.user);
        setCheckedToken(token);
      })
      .catch((err) => console.error('Profile refresh failed:', err.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Sessions from before birth dates were asked add one once, before matching
  const needsBirthDate = hasConsented && Boolean(currentUser) && checkedToken === token && !currentUser.birthDate;

  // Fetch balance for the current session
  useEffect(() => {
    if (!token) return;
    apiFetch('/api/wallet/balance', { token })
      .then((data) => {
        setWalletBalance(data.balance);
        setBoostUntil(data.boostUntil);
        if (data.boostPrice) setBoostPrice(data.boostPrice);
        if (data.rewards) setRewards(data.rewards);
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

  // Each new partner starts with an empty chat and a fresh like
  useEffect(() => {
    setMessages([]);
    setHasLiked(false);
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

    const onPeerLikes = (counts) => setPeerLikes(counts);
    const onLiked = ({ by, likes }) => {
      setLikeBurst({ id: Date.now(), received: true });
      showNotice(`❤️ ${by} liked you!`);
      // Our own total, shown in Profile
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const next = { ...prev, likes };
        localStorage.setItem('vibeloop_user', JSON.stringify(next));
        return next;
      });
    };
    const onLikeError = ({ error }) => {
      setHasLiked(false);
      showNotice(error, true);
    };

    // The hook goes idle when a friend hangs up; say so instead of silently resetting
    const onPartnerLeft = () => {
      if (isFriendCallRef.current) showNotice('Call ended.');
    };

    // Top-ups confirmed by the payment webhook (e.g. after the checkout window closed)
    const onWalletUpdated = ({ balance }) => {
      if (typeof balance === 'number') setWalletBalance(balance);
    };

    const onReferralReward = ({ amount, role, friend }) => {
      showNotice(role === 'inviter'
        ? `🎁 ${friend} joined with your invite: +${amount} VIBE!`
        : `🎁 +${amount} VIBE for joining with a friend's invite!`);
    };

    socket.on('m2e_progress', onProgress);
    socket.on('gift_received', onGiftReceived);
    socket.on('history_updated', fetchHistory);
    socket.on('safety_ack', onSafetyAck);
    socket.on('safety_error', onSafetyError);
    socket.on('wallet_updated', onWalletUpdated);
    socket.on('referral_reward', onReferralReward);
    socket.on('partner_left', onPartnerLeft);
    socket.on('peer_likes', onPeerLikes);
    socket.on('like_update', onPeerLikes);
    socket.on('liked', onLiked);
    socket.on('like_error', onLikeError);
    return () => {
      clearTimeout(giftTimeout);
      socket.off('m2e_progress', onProgress);
      socket.off('gift_received', onGiftReceived);
      socket.off('history_updated', fetchHistory);
      socket.off('safety_ack', onSafetyAck);
      socket.off('safety_error', onSafetyError);
      socket.off('wallet_updated', onWalletUpdated);
      socket.off('referral_reward', onReferralReward);
      socket.off('partner_left', onPartnerLeft);
      socket.off('peer_likes', onPeerLikes);
      socket.off('like_update', onPeerLikes);
      socket.off('liked', onLiked);
      socket.off('like_error', onLikeError);
    };
  }, [socket, fetchHistory, showNotice]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // A long call just ended: a good moment to suggest sharing
  const callStartedAtRef = useRef(null);
  useEffect(() => {
    if (isMatched) {
      callStartedAtRef.current = Date.now();
      return;
    }
    const startedAt = callStartedAtRef.current;
    callStartedAtRef.current = null;
    if (!startedAt || Date.now() - startedAt < SHARE_PROMPT_MIN_CALL_MS) return;
    try {
      const last = Number(localStorage.getItem('vibeloop_share_prompt_at')) || 0;
      if (Date.now() - last < SHARE_PROMPT_EVERY_MS) return;
      localStorage.setItem('vibeloop_share_prompt_at', String(Date.now()));
    } catch {
      return;
    }
    setShowSharePrompt(true);
  }, [isMatched]);

  // The invite reward shown on the prompt comes from the server
  useEffect(() => {
    apiFetch('/api/referrals')
      .then((data) => setInviterReward(data.rewards.inviter))
      .catch(() => {});
  }, []);

  const openInvite = useCallback(() => {
    setShowSharePrompt(false);
    if (isRegistered) {
      setIsInviteOpen(true);
    } else {
      setAuthMode('register');
      setIsAuthModalOpen(true);
    }
  }, [isRegistered]);
  const closeSharePrompt = useCallback(() => setShowSharePrompt(false), []);

  // Close the report dialog if the partner leaves first
  useEffect(() => {
    if (!isMatched) setIsReportOpen(false);
  }, [isMatched]);

  const handleLogout = () => {
    stop();
    setIsProfileOpen(false);
    setIsFriendsOpen(false);
    setIsLeaderboardOpen(false);
    setIsInviteOpen(false);
    clearSession();
  };

  const handleAuthSuccess = (user, tok, upgraded, bonus) => {
    persistSession(user, tok);
    // The invite (if any) is now recorded on the account
    if (!user.isGuest) clearInviteCode();
    const bonusText = bonus > 0 ? ` +${bonus} VIBE welcome bonus added.` : '';
    if (upgraded) showNotice(`Account created. Your VIBE and history came with you.${bonusText}`);
    else if (bonus > 0) showNotice(`Welcome to VibeLoop!${bonusText}`);
  };

  // Profile edits: a new token (country change) reconnects the socket with the updated claims
  const handleProfileUpdated = (user, tok) => persistSession(user, tok || token);

  const openAuth = (mode) => {
    setAuthMode(mode);
    setIsAuthModalOpen(true);
  };

  // Calling a friend leaves random matchmaking first
  const handleCallFriend = (friend) => {
    if (status !== 'idle') stop();
    setIsFriendsOpen(false);
    friends.callFriend(friend);
  };

  const handleAddPartner = async () => {
    try {
      const data = await friends.sendRequest({ userId: peer.id });
      showNotice(data.status === 'accepted'
        ? `You and ${data.friend.username} are now friends!`
        : `Friend request sent to ${data.friend.username}.`);
    } catch (err) {
      showNotice(err.message, true);
    }
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

  // Gender filters are a VibeBoost perk (the server enforces this too); saved choices return with a boost
  const isBoosted = minutesLeft(boostUntil) > 0;
  const searchPreferences = isBoosted ? preferences : { ...preferences, targetGender: 'any' };

  // Start enters matchmaking; Stop leaves it (ending any call). Next skips to someone new.
  const handleStartStop = () => {
    if (friends.outgoingCall) friends.cancelCall();
    if (status === 'idle') {
      findPartner(searchPreferences);
    } else {
      stop();
    }
  };

  const handleNext = () => {
    if (isMatched) findPartner(searchPreferences);
  };

  // One like per chat; the count updates right away and the server confirms the total
  const handleLike = () => {
    if (!socket || !isMatched || !peer || hasLiked) return;
    setHasLiked(true);
    setLikeBurst({ id: Date.now(), received: false });
    setPeerLikes((prev) => (prev?.userId === peer.id ? { ...prev, likes: prev.likes + 1 } : prev));
    socket.emit('like_partner');
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
    findPartner(searchPreferences);
  };

  const handleBlock = () => {
    setIsReportOpen(false);
    socket.emit('block_partner');
    findPartner(searchPreferences);
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
    searching: 'Finding someone...',
    connected: 'Connecting video...'
  }[status];

  const handleSelfViewSide = (side) => {
    localStorage.setItem('vibeloop_pip_side', side);
    setSelfViewSide(side);
  };

  const partnerRelation = peer && (
    friends.friends.some((f) => f.id === peer.id) ? 'friend'
      : friends.outgoing.some((f) => f.id === peer.id) ? 'requested'
        : friends.incoming.some((f) => f.id === peer.id) ? 'incoming'
          : null
  );
  const callingFriend = friends.incomingCall
    ? friends.friends.find((f) => f.id === friends.incomingCall.from.id) || friends.incomingCall.from
    : friends.outgoingCall?.friend;

  // Partner info sits on the side away from your camera tile
  const partnerSide = selfViewSide === 'right' ? 'left-3 sm:left-6 items-start' : 'right-3 sm:right-6 items-end';
  const ageLabel = ageRangeLabel(preferences.minAge, preferences.maxAge);
  const filterSummary = [
    isBoosted && preferences.targetGender !== 'any' ? genderText(preferences.targetGender, { plural: true }) : null,
    preferences.targetCountry !== 'ALL'
      ? `${flagEmoji(preferences.targetCountry)} ${COUNTRIES.find((c) => c.code === preferences.targetCountry)?.name || preferences.targetCountry}`
      : null,
    ageLabel !== 'Any age' ? `Age ${ageLabel}` : null
  ].filter(Boolean);

  // On wide screens the chat drawer docks beside the stage instead of covering it
  return (
    <div className={`relative w-screen ${isChatOpen ? 'lg:w-[calc(100vw-24rem)]' : ''} h-screen supports-[height:100dvh]:h-dvh bg-[#08090D] overflow-hidden flex flex-col items-center justify-center`}>

      {/* Top HUD HeaderBar */}
      <HeaderBar
        onlineCount={onlineCount}
        vibeBalance={walletBalance}
        m2eEarnedToday={m2eEarned}
        m2eDailyCap={10.0}
        secondsUntilNextReward={secondsUntilReward}
        isCallActive={isMatched && !isFriendCall}
        currentUser={currentUser}
        onOpenAuthModal={() => openAuth('login')}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenFriends={() => setIsFriendsOpen(true)}
        friendsBadge={friends.badge}
        onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
        showLeaderboard={status === 'idle'}
        onOpenBoostModal={() => setIsBoostOpen(true)}
        boostMinutesLeft={minutesLeft(boostUntil)}
        onOpenRechargeModal={() => setIsWalletOpen(true)}
      />

      {/* Main Remote Video Stage */}
      <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black">
        {/* Ambient glow behind the idle / searching states */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,240,255,0.08),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(255,42,122,0.08),transparent_55%)]" />

        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`relative w-full h-full object-cover ${isMatched && remoteStream ? '' : 'hidden'}`}
        />
        {!(isMatched && remoteStream) && (
          <div className="relative flex flex-col items-center justify-center gap-5 text-center px-6 -mt-10 sm:mt-0">
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center">
              {status === 'idle' ? (
                <div className="absolute inset-0 rounded-full border-2 border-[#00F0FF]/30 border-t-[#00F0FF] animate-spin-slow shadow-[0_0_30px_rgba(0,240,255,0.2)]" />
              ) : (
                <>
                  <span className="absolute inset-0 rounded-full border border-[#00F0FF]/50 animate-ping" />
                  <span className="absolute inset-3 rounded-full border border-[#FF2A7A]/40 animate-ping [animation-delay:400ms]" />
                  <div className="absolute inset-0 rounded-full border-2 border-[#00F0FF]/20 border-t-[#00F0FF] animate-spin shadow-[0_0_30px_rgba(0,240,255,0.25)]" />
                </>
              )}
              <Sparkles className="text-[#00F0FF] animate-pulse" size={32} />
            </div>

            <div>
              <h2 className="text-xl sm:text-3xl font-extrabold text-white tracking-wide">
                {stageTitle}
              </h2>
              <p className="text-sm text-slate-400 mt-1.5 max-w-sm mx-auto">
                {isMatched && peer
                  ? <>Matched with {peer.username}{peer.gender && <> · <GenderLabel gender={peer.gender} /></>}{peer.age && <> · {peer.age}</>}</>
                  : status === 'searching'
                    ? 'Looking for someone who matches your filters.'
                    : 'Press START to meet new people around the globe. Earn VIBE tokens as you chat.'}
              </p>
            </div>

            {/* On phones the Recent vibes strip needs this space */}
            {status === 'idle' && !stageError && (
              <div className={`${contacts.length > 0 ? 'hidden sm:flex' : 'flex'} flex-wrap justify-center gap-2 max-w-sm`}>
                <span className="px-3 py-1.5 rounded-full bg-[#12151E]/80 border border-slate-800 text-[11px] font-semibold text-slate-300">⏱ 0.10 VIBE every 3 min</span>
                <span className="px-3 py-1.5 rounded-full bg-[#12151E]/80 border border-slate-800 text-[11px] font-semibold text-slate-300">🎁 Send gifts</span>
                <span className="px-3 py-1.5 rounded-full bg-[#12151E]/80 border border-slate-800 text-[11px] font-semibold text-slate-300">🛡️ Report &amp; block</span>
              </div>
            )}

            {status === 'searching' && filterSummary.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {filterSummary.map((label) => (
                  <span key={label} className="px-3 py-1.5 rounded-full bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[11px] font-semibold text-[#00F0FF]">{label}</span>
                ))}
              </div>
            )}

            {stageError && (
              <div className="flex items-start gap-2 max-w-sm p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-left">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{stageError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* A dropped call trying to recover (network switch, tunnel) */}
      {isMatched && reconnecting && (
        <div
          role="status"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex items-center gap-2.5 max-w-[85vw] px-4 py-3 rounded-2xl bg-black/70 border border-[#FFD166]/40 backdrop-blur-xl text-xs font-bold text-white shadow-xl"
        >
          <Loader2 size={16} className="shrink-0 animate-spin text-[#FFD166]" />
          <span>
            {reconnecting === 'partner'
              ? `${peer?.username || 'Your partner'}'s connection dropped. Waiting for them...`
              : 'Connection lost. Reconnecting...'}
          </span>
        </div>
      )}

      {/* Partner: name, badges and Report / Block */}
      {isMatched && peer && (
        <div className={`absolute top-24 ${partnerSide} z-30 flex flex-col gap-1.5 max-w-[45%]`}>
          <span className="max-w-full truncate px-3 py-1.5 rounded-2xl bg-black/50 border border-white/10 backdrop-blur-xl text-xs font-bold text-white">
            {peer.country && peer.country !== 'ALL' ? `${flagEmoji(peer.country)} ` : ''}{peer.username}
            {MEDALS[peer.champion] && (
              <span title={`#${peer.champion} on last week's leaderboard`} aria-label={`#${peer.champion} on last week's leaderboard`} className="ml-1">
                {MEDALS[peer.champion]}
              </span>
            )}
          </span>
          {isFriendCall && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 backdrop-blur-xl text-[11px] font-bold">
              <Users size={12} /> Friend call
            </span>
          )}
          {isRegistered && !isFriendCall && partnerRelation !== 'friend' && (
            <button
              onClick={partnerRelation === 'requested' ? undefined : handleAddPartner}
              disabled={partnerRelation === 'requested'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#12151E]/80 border border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF]/10 backdrop-blur-xl text-xs font-bold shadow-lg transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default"
            >
              <UserPlus size={13} />
              <span>{partnerRelation === 'requested' ? 'Request sent' : partnerRelation === 'incoming' ? 'Accept friend' : 'Add friend'}</span>
            </button>
          )}
          {peer.boosted && (
            <span
              title="VibeBoost active"
              aria-label="VibeBoost active"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-br from-[#FF2A7A] to-[#FF9E00] text-lg shadow-[0_0_18px_rgba(255,122,0,0.45)]"
            >
              🔥
            </span>
          )}
          {peerLikes?.userId === peer.id && (
            <span
              key={peerLikes.likes}
              aria-label={`${peerLikes.likes} likes`}
              className="like-pop flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/50 border border-[#FF2A7A]/40 backdrop-blur-xl text-xs font-bold text-white"
            >
              <Heart size={13} className="text-[#FF2A7A] fill-[#FF2A7A]" />
              {peerLikes.likes.toLocaleString()}
            </span>
          )}
          {(peer.gender || peer.age) && (
            <span
              aria-label={peer.age ? `Age ${peer.age}` : undefined}
              className={`h-9 min-w-9 flex items-center justify-center gap-1 rounded-full bg-black/50 border border-white/15 backdrop-blur-xl font-bold leading-none ${peer.age ? 'px-3' : ''}`}
            >
              {peer.gender && <GenderLabel gender={peer.gender} symbolOnly className="text-xl" />}
              {peer.age && <span className="text-sm text-white">{peer.age}</span>}
            </span>
          )}
          <button
            onClick={() => setIsReportOpen(true)}
            title="Report or block"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#12151E]/80 border border-red-500/40 text-red-400 hover:bg-red-500/10 backdrop-blur-xl text-xs font-bold shadow-lg transition-colors cursor-pointer"
          >
            <Flag size={13} />
            <span>Report</span>
          </button>
        </div>
      )}

      <SelfView
        videoRef={localVideoRef}
        showVideo={isVideoOn && Boolean(localStream)}
        side={selfViewSide}
        onSideChange={handleSelfViewSide}
        isAudioOn={isAudioOn}
        isVideoOn={isVideoOn}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
      />

      {/* Recent contacts (20s+ calls), only while idle: before START or after STOP */}
      {status === 'idle' && (
        <HistoryBar
          contacts={contacts}
          onSelect={(contact) => setGiftTarget({ id: contact.peerId, username: contact.username })}
        />
      )}

      <ControlBar
        status={status}
        canStart={Boolean(socket) && hasConsented}
        onStartStop={handleStartStop}
        onNext={handleNext}
        isAudioOn={isAudioOn}
        isVideoOn={isVideoOn}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onOpenFilters={() => setIsFilterOpen(true)}
        filtersActive={preferences.targetGender !== 'any' || preferences.targetCountry !== 'ALL' || ageLabel !== 'Any age'}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        hasUnreadChat={messages.length > 0 && !isChatOpen}
        onGift={() => setGiftTarget(peer)}
        onLike={handleLike}
        hasLiked={hasLiked}
        likePulse={likeBurst && !likeBurst.received ? likeBurst.id : 0}
      />

      {/* Hearts rise from the like button when you like, from the middle of the screen when you are liked */}
      {likeBurst && (
        <LikeBurst
          key={likeBurst.id}
          className={likeBurst.received
            ? 'left-1/2 bottom-1/3'
            : 'left-1/2 bottom-[calc(6rem+env(safe-area-inset-bottom))]'}
        />
      )}

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
        peerName={isMatched ? peer?.username : null}
        canSend={isMatched}
      />

      <FriendsPanel
        isOpen={isFriendsOpen}
        onClose={() => setIsFriendsOpen(false)}
        isGuest={!isRegistered}
        onRequireAccount={() => {
          setIsFriendsOpen(false);
          openAuth('register');
        }}
        friends={friends}
        contacts={contacts}
        currentUserId={currentUser?.id}
        onCall={handleCallFriend}
        inCall={isMatched}
      />

      {callingFriend && (
        <CallOverlay
          incoming={Boolean(friends.incomingCall)}
          who={callingFriend}
          inCall={isMatched}
          onAccept={() => {
            setIsFriendsOpen(false);
            friends.answerCall(true);
          }}
          onDecline={() => friends.answerCall(false)}
          onCancel={friends.cancelCall}
        />
      )}

      {isProfileOpen && isRegistered && (
        <ProfileModal
          currentUser={currentUser}
          token={token}
          photoReward={rewards.PROFILE_PHOTO}
          onClose={() => setIsProfileOpen(false)}
          onUpdated={handleProfileUpdated}
          onReward={(balance, amount) => {
            setWalletBalance(balance);
            showNotice(`+${amount} VIBE for adding a profile photo!`);
          }}
          onOpenAccount={() => {
            setIsProfileOpen(false);
            setIsAccountOpen(true);
          }}
          onOpenInvite={() => {
            setIsProfileOpen(false);
            setIsInviteOpen(true);
          }}
          inviterReward={inviterReward}
          onLogout={handleLogout}
        />
      )}

      {isInviteOpen && isRegistered && (
        <InviteModal token={token} onClose={() => setIsInviteOpen(false)} />
      )}

      {showSharePrompt && !isMatched && (
        <SharePrompt
          isRegistered={isRegistered}
          inviterReward={inviterReward}
          onInvite={openInvite}
          onClose={closeSharePrompt}
        />
      )}

      {isLeaderboardOpen && (
        <LeaderboardModal
          token={token}
          isRegistered={isRegistered}
          onClose={() => setIsLeaderboardOpen(false)}
          onRequireAccount={() => {
            setIsLeaderboardOpen(false);
            openAuth('register');
          }}
        />
      )}

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
          genderLocked={!isBoosted}
          ownGenderFixed={Boolean(currentUser && !currentUser.isGuest)}
          onUnlockGender={() => {
            setIsFilterOpen(false);
            setIsBoostOpen(true);
          }}
        />
      )}

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        backendUrl={BACKEND_URL}
        token={token}
        isGuest={!currentUser || currentUser.isGuest}
        knownBirthDate={currentUser?.isGuest ? currentUser.birthDate : null}
        initialMode={authMode}
        signupBonus={rewards.SIGNUP}
        onAuthSuccess={handleAuthSuccess}
      />

      {isWalletOpen && token && (
        <WalletModal
          token={token}
          onClose={() => setIsWalletOpen(false)}
          onOpenBoost={() => {
            setIsWalletOpen(false);
            setIsBoostOpen(true);
          }}
          onOpenTopUp={() => {
            setIsWalletOpen(false);
            setIsTopUpOpen(true);
          }}
          onOpenInvite={() => {
            setIsWalletOpen(false);
            openInvite();
          }}
          inviterReward={inviterReward}
        />
      )}

      {isTopUpOpen && token && (
        <TopUpModal
          token={token}
          currentUser={currentUser}
          onClose={() => setIsTopUpOpen(false)}
          onPurchased={(balance, vibe) => {
            setWalletBalance(balance);
            showNotice(`+${vibe} VIBE added to your wallet. Thank you!`);
          }}
          onRequireAccount={() => {
            setIsTopUpOpen(false);
            setAuthMode('register');
            setIsAuthModalOpen(true);
          }}
        />
      )}

      {isBoostOpen && token && (
        <BoostModal
          token={token}
          balance={walletBalance}
          boostUntil={boostUntil}
          price={boostPrice}
          onClose={() => setIsBoostOpen(false)}
          onActivated={({ balance, boostUntil: until }) => {
            setWalletBalance(balance);
            setBoostUntil(until);
            showNotice('VibeBoost active! You get priority on your next matches.');
          }}
        />
      )}

      {isAccountOpen && (
        <AccountModal
          currentUser={currentUser}
          token={token}
          onClose={() => setIsAccountOpen(false)}
          onDeleted={handleAccountDeleted}
        />
      )}

      {/* Legal & data links */}
      <div className="absolute bottom-[calc(0.25rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 flex gap-3 text-[10px] text-slate-400 whitespace-nowrap">
        <a href="/terms" target="_blank" rel="noreferrer" className="hover:text-slate-300">Terms</a>
        <a href="/privacy" target="_blank" rel="noreferrer" className="hover:text-slate-300">Privacy</a>
        <button onClick={() => setIsAccountOpen(true)} className="hover:text-slate-300 cursor-pointer">Your account &amp; data</button>
      </div>

      {!hasConsented && <ConsentModal onAccept={handleConsent} askBirthDate={!currentUser?.birthDate} />}

      {needsBirthDate && (
        <BirthDateModal
          token={token}
          isGuest={!isRegistered}
          onSaved={(user, tok) => persistSession(user, tok)}
          onSignOut={handleLogout}
        />
      )}

    </div>
  );
}
