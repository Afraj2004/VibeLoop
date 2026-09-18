import { io } from 'socket.io-client';

const socket = io('https://your-signal-server.com');
let peerConnection = null;
let localStream = null;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun1.l.google.com:19302' },
    // Replace with your Coturn TURN servers in production:
    // { urls: 'turn:turn.vibeloop.com:3478', username: 'user', credential: 'pwd' }
  ],
};

// 1. Initialize user and get camera
async function startSession() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById('localVideo').srcObject = localStream;

  socket.emit('init_user', {
    gender: 'male',
    country: 'US',
    targetGender: 'female',
    targetCountry: 'US',
  });
}

// 2. Click "Next"
function skipToNext() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  socket.emit('find_partner', { country: 'US', targetGender: 'female' });
}

// 3. Handle Match Found
socket.on('match_found', async ({ roomId, peerId, isInitiator }) => {
  peerConnection = new RTCPeerConnection(rtcConfig);

  // Add local camera/mic tracks to connection
  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  // Receive remote tracks and display
  peerConnection.ontrack = (event) => {
    document.getElementById('remoteVideo').srcObject = event.streams[0];
  };

  // Route ICE candidates to peer via signaling server
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice_candidate', { targetSocketId: peerId, candidate: event.candidate });
    }
  };

  // If designated as the initiator, generate the SDP Offer
  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal_offer', { targetSocketId: peerId, sdp: offer });
  }
});

// 4. Handle incoming Offer (Receiver side)
socket.on('signal_offer', async ({ senderSocketId, sdp }) => {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('signal_answer', { targetSocketId: senderSocketId, sdp: answer });
});

// 5. Handle incoming Answer (Initiator side)
socket.on('signal_answer', async ({ sdp }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
});

// 6. Handle incoming ICE candidates
socket.on('ice_candidate', async ({ candidate }) => {
  if (peerConnection && candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

// 7. Handle partner leaving
socket.on('partner_left', () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  document.getElementById('remoteVideo').srcObject = null;
  // Automatically trigger next search or show placeholder
  skipToNext();
});