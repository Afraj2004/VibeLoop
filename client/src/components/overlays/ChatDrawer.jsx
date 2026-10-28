import React from 'react';
import { X, MessageSquare } from 'lucide-react';
import ChatThread from './ChatThread.jsx';

/**
 * In-call chat. Phones: a bottom sheet over the controls, so the video stays visible above it.
 * Tablets: a floating card above the controls. Desktop (lg): docked beside the stage (App narrows the stage).
 */
export default function ChatDrawer({ isOpen, onClose, messages = [], error, onSendMessage, currentUserId, peerName, canSend }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 flex flex-col bg-[#12151E]/95 backdrop-blur-2xl shadow-2xl border-slate-800
        inset-x-0 bottom-0 h-[55vh] supports-[height:100dvh]:h-[55dvh] rounded-t-3xl border-t
        sm:inset-x-auto sm:right-4 sm:bottom-[calc(6.5rem+env(safe-area-inset-bottom))] sm:w-96 sm:h-[26rem] sm:max-h-[60vh] sm:rounded-3xl sm:border
        lg:top-0 lg:right-0 lg:bottom-0 lg:h-auto lg:max-h-none lg:rounded-none lg:border-0 lg:border-l"
    >
      {/* Grab handle (phones) */}
      <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-slate-700" />

      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
            <MessageSquare size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-bold text-sm tracking-wide truncate">
              {peerName ? `Chat with ${peerName}` : 'Live chat'}
            </h3>
            <p className="text-[10px] text-slate-400">Only the last 30 messages are kept</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <ChatThread
        messages={messages}
        currentUserId={currentUserId}
        onSend={onSendMessage}
        error={error}
        disabled={!canSend}
        emptyTitle={canSend ? 'No messages yet.' : 'Chat opens when you are matched.'}
        emptyHint={canSend ? 'Say hello to your match!' : 'Press START to meet someone.'}
        placeholder={canSend ? 'Type a message...' : 'Not in a call'}
      />
    </div>
  );
}
