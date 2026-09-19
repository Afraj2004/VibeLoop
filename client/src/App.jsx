import React, { useState, useEffect, useRef } from 'react';
import HeaderBar from './components/hud/HeaderBar.jsx';
import GiftTray from './components/overlays/GiftTray.jsx';
import ChatDrawer from './components/overlays/ChatDrawer.jsx';
import AuthModal from './components/overlays/AuthModal.jsx';
import { Video, VideoOff, Mic, MicOff, FastForward, Gift, MessageSquare, Sparkles } from 'lucide-react';
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_SIGNALING_SERVER || 'https://vibeloop-1kps.onrender.com';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);

  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isMatched, setIsMatched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
  // Overlays
  const [isGiftTrayOpen, setIsGiftTrayOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Chat & Economy
  const [messages, setMessages] = useState([]);
  const [walletBalance, setWalletBalance] = useState(10.0);
  const [m2eEarned, setM2eEarned] = useState(0.0);
  const [secondsUntilReward, setSecondsUntilReward] = useState(180);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const socketRef = useRef(null);

  // Load auth from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('vibeloop_token');
    const savedUser = localStorage.getItem('vibeloop_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setCurrentUser(JSON.parse(savedUser));
    }
  }, []);

  // Initialize camera and socket connection
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Camera access denied:', err);
      }
    }

    startCamera();

    // Connect to Socket server with Auth Token if available
    const socketOptions = token ? { auth: { token } } : {};
    socketRef.current = io(BACKEND_URL, socketOptions);

    socketRef.current.on('receive_message', (msg) => {
      setMessages((prev) => [...prev.slice(-29), msg]);
    });

    socketRef.current.on('message_sent', (msg) => {
      setMessages((prev) => [...prev.slice(-29), msg]);
    });

    // Fetch initial balance
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${BACKEND_URL}/api/wallet/balance`, { headers })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setWalletBalance(data.balance);
          setM2eEarned(data.m2eEarnedToday);
        }
      })
      .catch(console.error);

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('vibeloop_token');
    localStorage.removeItem('vibeloop_user');
    setToken(null);
    setCurrentUser(null);
    window.location.reload();
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsVideoOn(track.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsAudioOn(track.enabled);
      }
    }
  };

  const handleNext = () => {
    setIsSearching(true);
    setIsMatched(false);
    setMessages([]);
    setTimeout(() => {
      setIsSearching(false);
      setIsMatched(true);
    }, 1500);
  };

  const handleSendMessage = (text) => {
    if (!socketRef.current) return;
    socketRef.current.emit('send_message', {
      recipientId: 'guest_peer',
      messageText: text
    });
  };

  const handleSendGift = async (gift) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${BACKEND_URL}/api/wallet/send-gift`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          recipientId: 'guest_peer',
          giftId: gift.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setWalletBalance(data.senderNewBalance);
      }
    } catch (err) {
      console.error('Failed to send gift:', err);
    }
  };

  return (
    <div className="relative w-screen h-screen bg-[#08090D] overflow-hidden flex flex-col items-center justify-center">
      
      {/* Top HUD HeaderBar */}
      <HeaderBar 
        onlineCount={1240}
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
        {isMatched ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 text-center px-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-2 border-[#00F0FF]/30 border-t-[#00F0FF] animate-spin flex items-center justify-center shadow-[0_0_30px_rgba(0,240,255,0.2)]" />
              <Sparkles className="absolute inset-0 m-auto text-[#00F0FF] animate-pulse" size={32} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide">
                {isSearching ? 'Connecting to next vibe...' : 'Ready to discover'}
              </h2>
              <p className="text-sm text-slate-400 mt-1 max-w-sm">
                Press NEXT to instantly meet verified people around the globe. Earn VIBE tokens as you chat.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Draggable/Fixed Local PIP Camera */}
      <div className="absolute top-20 right-4 sm:top-24 sm:right-6 w-32 h-44 sm:w-44 sm:h-60 rounded-3xl overflow-hidden border border-slate-700/80 shadow-2xl bg-[#12151E]/80 backdrop-blur-xl z-30 transition-all">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover scale-x-[-1] ${!isVideoOn ? 'hidden' : ''}`}
        />
        {!isVideoOn && (
          <div className="w-full h-full flex items-center justify-center text-slate-500 bg-[#08090D]">
            <VideoOff size={28} />
          </div>
        )}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-bold text-slate-300">
          YOU
        </div>
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="absolute bottom-6 z-40 px-4 flex items-center gap-3 max-w-lg w-full justify-center">
        
        {/* Toggle Mic */}
        <button 
          onClick={toggleAudio}
          className={`p-4 rounded-2xl border backdrop-blur-xl transition-all shadow-lg ${
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
          className={`p-4 rounded-2xl border backdrop-blur-xl transition-all shadow-lg ${
            isVideoOn 
              ? 'bg-[#12151E]/90 border-slate-800 text-white hover:bg-slate-800' 
              : 'bg-red-500/20 border-red-500/50 text-red-400'
          }`}
        >
          {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        {/* Primary NEXT Button */}
        <button 
          onClick={handleNext}
          className="flex-1 py-4 px-6 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] hover:opacity-95 text-slate-950 font-black text-sm tracking-wider flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(0,240,255,0.4)] active:scale-95 transition-all cursor-pointer"
        >
          <span>NEXT</span>
          <FastForward size={18} className="fill-slate-950" />
        </button>

        {/* Chat Toggle Trigger */}
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="p-4 rounded-2xl bg-[#12151E]/90 hover:bg-slate-800 border border-[#00F0FF]/40 text-[#00F0FF] backdrop-blur-xl transition-all shadow-lg active:scale-95 cursor-pointer relative"
        >
          <MessageSquare size={20} />
          {messages.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#FF2A7A] animate-ping" />
          )}
        </button>

        {/* Gift Trigger */}
        <button 
          onClick={() => setIsGiftTrayOpen(true)}
          className="p-4 rounded-2xl bg-[#12151E]/90 hover:bg-slate-800 border border-[#FFD166]/40 text-[#FFD166] backdrop-blur-xl transition-all shadow-lg active:scale-95 cursor-pointer"
        >
          <Gift size={20} />
        </button>

      </div>

      {/* Overlays */}
      <GiftTray 
        isOpen={isGiftTrayOpen}
        onClose={() => setIsGiftTrayOpen(false)}
        userBalance={walletBalance}
        recipientName="Stranger"
        onSendGift={handleSendGift}
      />

      <ChatDrawer 
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={messages}
        onSendMessage={handleSendMessage}
        currentUserId={currentUser?.id || 'guest'}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        backendUrl={BACKEND_URL}
        onAuthSuccess={(user, tok) => {
          setCurrentUser(user);
          setToken(tok);
        }}
      />

    </div>
  );
}
