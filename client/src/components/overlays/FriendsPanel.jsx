import React, { useState } from 'react';
import { X, ArrowLeft, Users, UserPlus, MessageSquare, Video, UserMinus, Check, Loader2 } from 'lucide-react';
import Avatar from '../hud/Avatar.jsx';
import ChatThread from './ChatThread.jsx';
import { flagEmoji } from '../../utils/countries.js';

const ICON_BUTTON = 'p-2 rounded-xl border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

function Flag({ country }) {
  return country && country !== 'ALL' ? <span className="text-xs">{flagEmoji(country)}</span> : null;
}

/**
 * Friends: list with presence, requests, add by username or from people you've met,
 * and per-friend conversations with a call button. Full screen on phones, a side panel above that.
 */
export default function FriendsPanel({ isOpen, onClose, isGuest, onRequireAccount, friends, contacts = [], currentUserId, onCall, inCall }) {
  const [tab, setTab] = useState('friends');
  const [username, setUsername] = useState('');
  const [formState, setFormState] = useState({ busy: false, error: '', success: '' });
  const [pendingId, setPendingId] = useState(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  if (!isOpen) return null;

  const { conversation } = friends;
  const activeFriend = conversation && friends.friends.find((f) => f.id === conversation.friendId);

  const close = () => {
    friends.closeConversation();
    onClose();
  };

  // Runs a request action for one row, showing a spinner on it
  const runFor = async (id, action) => {
    setPendingId(id);
    setFormState({ busy: false, error: '', success: '' });
    try {
      await action();
    } catch (err) {
      setFormState({ busy: false, error: err.message, success: '' });
    } finally {
      setPendingId(null);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    setFormState({ busy: true, error: '', success: '' });
    try {
      const data = await friends.sendRequest({ username: username.trim() });
      setUsername('');
      setFormState({
        busy: false,
        error: '',
        success: data.status === 'accepted'
          ? `You and ${data.friend.username} are now friends`
          : `Request sent to ${data.friend.username}`
      });
    } catch (err) {
      setFormState({ busy: false, error: err.message, success: '' });
    }
  };

  const knownIds = new Set([...friends.friends, ...friends.incoming, ...friends.outgoing].map((f) => f.id));
  const suggestions = contacts.filter((c) => !knownIds.has(c.peerId));
  const sortedFriends = [...friends.friends].sort((a, b) => (b.unread || 0) - (a.unread || 0) || Number(b.online) - Number(a.online));

  const panel = 'fixed inset-0 sm:left-auto sm:w-[26rem] z-50 flex flex-col bg-[#12151E]/95 backdrop-blur-2xl sm:border-l border-slate-800 shadow-2xl';

  if (isGuest) {
    return (
      <div className={panel} role="dialog" aria-label="Friends">
        <PanelHeader title="Friends" onClose={close} />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4">
          <div className="p-4 rounded-3xl bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF]">
            <Users size={32} />
          </div>
          <div>
            <h3 className="text-white font-bold">Keep the people you vibe with</h3>
            <p className="text-xs text-slate-400 mt-1.5">Create a free account to add friends, message them and call them any time.</p>
          </div>
          <button
            onClick={onRequireAccount}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] text-slate-950 text-xs font-extrabold tracking-wider cursor-pointer"
          >
            CREATE ACCOUNT
          </button>
        </div>
      </div>
    );
  }

  // Conversation view
  if (conversation) {
    return (
      <div className={panel} role="dialog" aria-label={`Chat with ${activeFriend?.username || 'friend'}`}>
        <div className="flex items-center gap-2 px-3 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] border-b border-slate-800/80">
          <button onClick={friends.closeConversation} aria-label="Back to friends" className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer">
            <ArrowLeft size={18} />
          </button>
          <Avatar user={activeFriend} size={36} online={activeFriend?.online} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">
              {activeFriend?.username} <Flag country={activeFriend?.country} />
            </div>
            <div className={`text-[10px] ${activeFriend?.online ? 'text-emerald-400' : 'text-slate-500'}`}>
              {activeFriend?.online ? 'Online' : 'Offline'}
            </div>
          </div>
          <button
            onClick={() => activeFriend && onCall(activeFriend)}
            disabled={!activeFriend?.online}
            aria-label={`Video call ${activeFriend?.username}`}
            title={activeFriend?.online ? 'Video call' : 'Calls work when they are online'}
            className={`${ICON_BUTTON} bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20`}
          >
            <Video size={18} />
          </button>
          <button onClick={close} aria-label="Close" className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {conversation.loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-500"><Loader2 className="animate-spin" size={20} /></div>
        ) : (
          <ChatThread
            messages={conversation.messages}
            currentUserId={currentUserId}
            onSend={friends.sendMessage}
            error={conversation.error}
            emptyTitle={`Say hi to ${activeFriend?.username || 'your friend'}!`}
            emptyHint="Only your last 30 messages are kept."
          />
        )}
      </div>
    );
  }

  return (
    <div className={panel} role="dialog" aria-label="Friends">
      <PanelHeader title="Friends" onClose={close} />

      {/* Add by username */}
      <form onSubmit={handleAdd} className="px-4 pt-4 flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Add by username"
          maxLength={32}
          aria-label="Username to add"
          className="flex-1 min-w-0 bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-xl px-3 py-2.5 text-sm sm:text-xs text-white placeholder-slate-500 outline-none"
        />
        <button
          type="submit"
          disabled={formState.busy || !username.trim()}
          className="flex items-center gap-1.5 px-3.5 rounded-xl bg-[#00F0FF] text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {formState.busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          <span>Add</span>
        </button>
      </form>
      {(formState.error || formState.success) && (
        <p className={`px-4 pt-2 text-[11px] ${formState.error ? 'text-red-400' : 'text-emerald-400'}`}>
          {formState.error || formState.success}
        </p>
      )}

      {/* Tabs */}
      <div className="mx-4 mt-4 flex bg-[#08090D] p-1 rounded-2xl border border-slate-800">
        {[
          { id: 'friends', label: `Friends (${friends.friends.length})` },
          { id: 'requests', label: 'Requests', count: friends.incoming.length }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              tab === t.id ? 'bg-[#12151E] text-[#00F0FF] shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
            {t.count > 0 && <span className="px-1.5 rounded-full bg-[#FF2A7A] text-white text-[10px]">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-5">
        {tab === 'friends' ? (
          <>
            {sortedFriends.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-6">
                No friends yet. Add someone you've met below, or by their username.
              </p>
            ) : (
              <ul className="space-y-2">
                {sortedFriends.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#08090D]/60 border border-slate-800">
                    <button onClick={() => friends.openConversation(f.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer">
                      <Avatar user={f} size={40} online={f.online} />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{f.username} <Flag country={f.country} /></div>
                        <div className={`text-[10px] ${f.unread ? 'text-[#FF2A7A] font-bold' : f.online ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {f.unread ? `${f.unread} new message${f.unread > 1 ? 's' : ''}` : f.online ? 'Online' : 'Offline'}
                        </div>
                      </div>
                    </button>

                    {confirmRemoveId === f.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => runFor(f.id, () => friends.remove(f.id)).then(() => setConfirmRemoveId(null))}
                          className="px-2.5 py-1.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-[11px] font-bold cursor-pointer"
                        >
                          Remove
                        </button>
                        <button onClick={() => setConfirmRemoveId(null)} className="px-2 py-1.5 text-[11px] text-slate-400 cursor-pointer">Keep</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => friends.openConversation(f.id)}
                          aria-label={`Message ${f.username}`}
                          title="Message"
                          className={`${ICON_BUTTON} relative bg-[#12151E] border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10`}
                        >
                          <MessageSquare size={16} />
                          {f.unread > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#FF2A7A]" />}
                        </button>
                        <button
                          onClick={() => onCall(f)}
                          disabled={!f.online}
                          aria-label={`Video call ${f.username}`}
                          title={f.online ? (inCall ? 'Call (ends your current call)' : 'Video call') : 'Calls work when they are online'}
                          className={`${ICON_BUTTON} bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20`}
                        >
                          <Video size={16} />
                        </button>
                        <button
                          onClick={() => setConfirmRemoveId(f.id)}
                          aria-label={`Remove ${f.username}`}
                          title="Remove friend"
                          className={`${ICON_BUTTON} hidden min-[360px]:block bg-transparent border-transparent text-slate-500 hover:text-red-400`}
                        >
                          <UserMinus size={16} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {suggestions.length > 0 && (
              <section>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">People you've met</h4>
                <ul className="space-y-2">
                  {suggestions.map((c) => (
                    <li key={c.peerId} className="flex items-center gap-3 p-2.5 rounded-2xl border border-slate-800/70">
                      <Avatar user={{ id: c.peerId, username: c.username }} size={34} />
                      <div className="flex-1 min-w-0 text-sm font-semibold text-slate-200 truncate">
                        {c.username} <Flag country={c.country} />
                      </div>
                      <button
                        onClick={() => runFor(c.peerId, () => friends.sendRequest({ userId: c.peerId }))}
                        disabled={pendingId === c.peerId}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/40 text-[#00F0FF] text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        {pendingId === c.peerId ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <>
            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Received</h4>
              {friends.incoming.length === 0 ? (
                <p className="text-xs text-slate-500">No pending requests.</p>
              ) : (
                <ul className="space-y-2">
                  {friends.incoming.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#08090D]/60 border border-slate-800">
                      <Avatar user={r} size={36} />
                      <div className="flex-1 min-w-0 text-sm font-bold text-white truncate">{r.username} <Flag country={r.country} /></div>
                      <button
                        onClick={() => runFor(r.id, () => friends.accept(r.id))}
                        disabled={pendingId === r.id}
                        aria-label={`Accept ${r.username}`}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        <Check size={12} /> Accept
                      </button>
                      <button
                        onClick={() => runFor(r.id, () => friends.remove(r.id))}
                        disabled={pendingId === r.id}
                        aria-label={`Decline ${r.username}`}
                        className="p-1.5 rounded-xl text-slate-500 hover:text-red-400 cursor-pointer"
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Sent</h4>
              {friends.outgoing.length === 0 ? (
                <p className="text-xs text-slate-500">No requests waiting on someone else.</p>
              ) : (
                <ul className="space-y-2">
                  {friends.outgoing.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 p-2.5 rounded-2xl border border-slate-800/70">
                      <Avatar user={r} size={34} />
                      <div className="flex-1 min-w-0 text-sm font-semibold text-slate-300 truncate">{r.username}</div>
                      <button
                        onClick={() => runFor(r.id, () => friends.remove(r.id))}
                        disabled={pendingId === r.id}
                        className="px-3 py-1.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function PanelHeader({ title, onClose }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] border-b border-slate-800/80">
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
          <Users size={16} />
        </div>
        <h3 className="text-white font-bold text-sm tracking-wide">{title}</h3>
      </div>
      <button onClick={onClose} aria-label="Close friends" className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer">
        <X size={18} />
      </button>
    </div>
  );
}
