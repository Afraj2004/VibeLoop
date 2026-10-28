import React, { useEffect, useRef, useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';

/**
 * Message list + composer, shared by the in-call chat and friend conversations
 */
export default function ChatThread({
  messages = [], currentUserId, onSend, error, disabled = false,
  emptyTitle = 'No messages yet.', emptyHint, placeholder = 'Type a message...'
}) {
  const [inputText, setInputText] = useState('');
  const listRef = useRef(null);

  // Keep the newest message in view
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim() || disabled) return;
    onSend(inputText);
    setInputText('');
  };

  return (
    <>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs px-4">
            <MessageSquare size={28} className="mb-2 opacity-30" />
            <p>{emptyTitle}</p>
            {emptyHint && <p className="mt-1">{emptyHint}</p>}
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <div key={msg.id || index} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words ${
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

      {error && (
        <div className="mx-3 mb-2 p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] rounded-xl">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-3 border-t border-slate-800/80 bg-[#08090D]/50 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          disabled={disabled}
          aria-label="Message"
          className="flex-1 min-w-0 bg-[#12151E] border border-slate-800 focus:border-[#00F0FF] rounded-xl px-3 py-2.5 text-sm sm:text-xs text-white placeholder-slate-500 outline-none transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled}
          aria-label="Send"
          className="p-2.5 rounded-xl bg-[#00F0FF] text-slate-950 hover:opacity-90 transition-opacity flex items-center justify-center cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={16} />
        </button>
      </form>
    </>
  );
}
