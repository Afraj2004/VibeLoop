import React, { useState } from 'react';
import { X, Send, MessageSquare } from 'lucide-react';

export default function ChatDrawer({ isOpen, onClose, messages = [], onSendMessage, currentUserId }) {
  const [inputText, setInputText] = useState('');

  if (!isOpen) return null;

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[#12151E]/95 border-l border-slate-800 shadow-2xl backdrop-blur-2xl flex flex-col animate-in slide-in-from-right duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
            <MessageSquare size={18} />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm tracking-wide">Live Ephemeral Chat</h3>
            <p className="text-[10px] text-slate-400">Strictly capped at last 30 messages</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs px-4">
            <MessageSquare size={32} className="mb-2 opacity-30" />
            <p>No messages yet in this session.</p>
            <p className="mt-1">Say hello to your match!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <div 
                key={msg.id || index}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                    isMe 
                      ? 'bg-gradient-to-r from-[#00F0FF] to-[#7B2CBF] text-slate-950 font-medium rounded-tr-none shadow-md' 
                      : 'bg-[#08090D] border border-slate-800 text-slate-200 rounded-tl-none'
                  }`}
                >
                  {msg.body}
                </div>
                <span className="text-[9px] text-slate-500 mt-1 px-1">
                  {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-800/80 bg-[#08090D]/50 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message (max 500 chars)..."
          maxLength={500}
          className="flex-1 bg-[#12151E] border border-slate-800 focus:border-[#00F0FF] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition-colors"
        />
        <button
          type="submit"
          className="p-2.5 rounded-xl bg-[#00F0FF] text-slate-950 hover:opacity-90 transition-opacity flex items-center justify-center cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.3)]"
        >
          <Send size={16} />
        </button>
      </form>

    </div>
  );
}
