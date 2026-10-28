import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/api.js';

const EMPTY = { friends: [], incoming: [], outgoing: [] };

/**
 * Friends list with live presence, direct-message conversations and friend-call ringing.
 * Only active for registered accounts (`enabled`). `notify(text, isError)` shows a toast.
 */
export function useFriends(socket, token, userId, enabled, notify) {
  const [lists, setLists] = useState(EMPTY);
  const [conversation, setConversation] = useState(null); // { friendId, messages, loading, error }
  const [incomingCall, setIncomingCall] = useState(null); // { callId, from }
  const [outgoingCall, setOutgoingCall] = useState(null); // { callId?, friend }

  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const openFriendIdRef = useRef(null);
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Mirrors of the call state, so handlers and actions read the latest value without side effects in updaters
  const outgoingRef = useRef(null);
  const incomingRef = useRef(null);
  const setOutgoing = useCallback((value) => {
    outgoingRef.current = value;
    setOutgoingCall(value);
  }, []);
  const setIncoming = useCallback((value) => {
    incomingRef.current = value;
    setIncomingCall(value);
  }, []);

  const refresh = useCallback(() => {
    if (!enabled || !token) return Promise.resolve();
    return apiFetch('/api/friends', { token })
      .then(({ friends, incoming, outgoing }) => {
        // An open conversation is being read as messages arrive
        setLists({
          friends: friends.map((f) => (f.id === openFriendIdRef.current ? { ...f, unread: 0 } : f)),
          incoming,
          outgoing
        });
      })
      .catch(console.error);
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled) {
      setLists(EMPTY);
      setConversation(null);
      openFriendIdRef.current = null;
      return;
    }
    refresh();
  }, [enabled, refresh]);

  // Socket events
  useEffect(() => {
    if (!socket || !enabled) return;

    const onFriendsUpdated = (event = {}) => {
      refresh();
      if (event.type === 'request') notifyRef.current?.(`${event.from.username} sent you a friend request`);
      if (event.type === 'accepted') notifyRef.current?.(`${event.by.username} accepted your friend request`);
    };

    const onPresence = ({ userId, online }) => {
      setLists((prev) => ({
        ...prev,
        friends: prev.friends.map((f) => (f.id === userId ? { ...f, online } : f))
      }));
    };

    const onDirectMessage = (message) => {
      const otherId = message.sender_id === userIdRef.current ? message.recipient_id : message.sender_id;

      if (otherId === openFriendIdRef.current) {
        setConversation((prev) => (prev && prev.friendId === otherId
          ? { ...prev, messages: [...prev.messages.slice(-29), message] }
          : prev));
        if (message.sender_id === otherId) {
          apiFetch(`/api/friends/${otherId}/read`, { token, method: 'POST' }).catch(() => {});
        }
        return;
      }

      // Only messages they sent count as unread (our own echo comes back from other tabs too)
      if (message.sender_id !== otherId) return;
      const friend = listsRef.current.friends.find((f) => f.id === otherId);
      setLists((prev) => ({
        ...prev,
        friends: prev.friends.map((f) => (f.id === otherId ? { ...f, unread: (f.unread || 0) + 1 } : f))
      }));
      if (friend) notifyRef.current?.(`💬 ${friend.username}: ${message.body.slice(0, 60)}`);
    };

    const onDirectMessageError = ({ friendId, error }) => {
      setConversation((prev) => (prev && prev.friendId === friendId ? { ...prev, error } : prev));
    };

    const onIncomingCall = (call) => setIncoming(call);
    const onCallCancelled = ({ callId }) => {
      if (incomingRef.current?.callId === callId) setIncoming(null);
    };
    const onCallRinging = ({ callId }) => {
      // Hung up before the server confirmed the ring
      if (!outgoingRef.current) {
        socket.emit('cancel_call', { callId });
        return;
      }
      setOutgoing({ ...outgoingRef.current, callId });
    };
    const onCallEnded = ({ reason }) => {
      const call = outgoingRef.current;
      if (call) {
        notifyRef.current?.(reason === 'declined'
          ? `${call.friend.username} can't talk right now`
          : `${call.friend.username} didn't answer`);
      }
      setOutgoing(null);
    };
    const onCallError = ({ error }) => {
      setOutgoing(null);
      notifyRef.current?.(error, true);
    };
    // Any connected call clears the ringing UI
    const onMatchFound = () => {
      setOutgoing(null);
      setIncoming(null);
    };

    socket.on('friends_updated', onFriendsUpdated);
    socket.on('friend_presence', onPresence);
    socket.on('direct_message', onDirectMessage);
    socket.on('direct_message_error', onDirectMessageError);
    socket.on('incoming_call', onIncomingCall);
    socket.on('call_cancelled', onCallCancelled);
    socket.on('call_ringing', onCallRinging);
    socket.on('call_ended', onCallEnded);
    socket.on('call_error', onCallError);
    socket.on('match_found', onMatchFound);
    // Presence may have changed while disconnected
    socket.on('connect', refresh);
    return () => {
      socket.off('friends_updated', onFriendsUpdated);
      socket.off('friend_presence', onPresence);
      socket.off('direct_message', onDirectMessage);
      socket.off('direct_message_error', onDirectMessageError);
      socket.off('incoming_call', onIncomingCall);
      socket.off('call_cancelled', onCallCancelled);
      socket.off('call_ringing', onCallRinging);
      socket.off('call_ended', onCallEnded);
      socket.off('call_error', onCallError);
      socket.off('match_found', onMatchFound);
      socket.off('connect', refresh);
    };
  }, [socket, enabled, token, refresh, setOutgoing, setIncoming]);

  // Requests (errors propagate to the caller's form)
  const sendRequest = useCallback(async (target) => {
    const data = await apiFetch('/api/friends/requests', { token, method: 'POST', body: target });
    await refresh();
    return data;
  }, [token, refresh]);

  const accept = useCallback(async (userId) => {
    await apiFetch(`/api/friends/${userId}/accept`, { token, method: 'POST' });
    await refresh();
  }, [token, refresh]);

  const remove = useCallback(async (userId) => {
    await apiFetch(`/api/friends/${userId}`, { token, method: 'DELETE' });
    if (openFriendIdRef.current === userId) {
      openFriendIdRef.current = null;
      setConversation(null);
    }
    await refresh();
  }, [token, refresh]);

  // Conversations
  const openConversation = useCallback((friendId) => {
    openFriendIdRef.current = friendId;
    setConversation({ friendId, messages: [], loading: true, error: null });
    setLists((prev) => ({
      ...prev,
      friends: prev.friends.map((f) => (f.id === friendId ? { ...f, unread: 0 } : f))
    }));
    apiFetch(`/api/friends/${friendId}/messages`, { token })
      .then(({ messages }) => {
        setConversation((prev) => (prev?.friendId === friendId
          ? { ...prev, loading: false, messages: [...messages, ...prev.messages.filter((m) => !messages.some((x) => x.id === m.id))] }
          : prev));
      })
      .catch((err) => {
        setConversation((prev) => (prev?.friendId === friendId ? { ...prev, loading: false, error: err.message } : prev));
      });
  }, [token]);

  const closeConversation = useCallback(() => {
    openFriendIdRef.current = null;
    setConversation(null);
  }, []);

  const sendMessage = useCallback((text) => {
    const friendId = openFriendIdRef.current;
    if (!socket || !friendId) return;
    setConversation((prev) => (prev ? { ...prev, error: null } : prev));
    socket.emit('send_direct_message', { friendId, messageText: text });
  }, [socket]);

  // Calls
  const callFriend = useCallback((friend) => {
    if (!socket || outgoingRef.current) return;
    setOutgoing({ friend });
    socket.emit('call_friend', { friendId: friend.id });
  }, [socket, setOutgoing]);

  const cancelCall = useCallback(() => {
    const call = outgoingRef.current;
    if (call?.callId) socket?.emit('cancel_call', { callId: call.callId });
    setOutgoing(null);
  }, [socket, setOutgoing]);

  const answerCall = useCallback((accept) => {
    const call = incomingRef.current;
    if (call) socket?.emit('answer_call', { callId: call.callId, accept });
    setIncoming(null);
  }, [socket, setIncoming]);

  const unread = lists.friends.reduce((sum, f) => sum + (f.unread || 0), 0);

  return {
    ...lists,
    badge: unread + lists.incoming.length,
    refresh,
    sendRequest,
    accept,
    remove,
    conversation,
    openConversation,
    closeConversation,
    sendMessage,
    incomingCall,
    outgoingCall,
    callFriend,
    cancelCall,
    answerCall
  };
}
