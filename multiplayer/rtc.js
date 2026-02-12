/** Auto-split from multiplayer.js */

function multiplayerCreatePeerConnection(isHost) {
  console.log('Creating peer connection, isHost:', isHost);
  
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  });
  
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      console.log('New ICE candidate:', e.candidate.type);
      MULTIPLAYER_STATE.outboundIceCandidates.push(e.candidate);
      if (!MULTIPLAYER_STATE.iceFlushTimer) {
        MULTIPLAYER_STATE.iceFlushTimer = setTimeout(() => {
          multiplayerFlushIceCandidates('timer');
        }, 350);
      }
    } else {
      console.log('ICE gathering complete');
      multiplayerFlushIceCandidates('complete');
    }
  };
  
  pc.onicegatheringstatechange = () => {
    console.log('ICE gathering state:', pc.iceGatheringState);
  };
  
  pc.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', pc.iceConnectionState);
    
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      console.log('ICE connected!');
      MULTIPLAYER_STATE.connectionAttempts = 0;
    } else if (pc.iceConnectionState === 'failed') {
      console.error('ICE connection failed');
      if (MULTIPLAYER_STATE.connectionAttempts < 3) {
        setTimeout(() => multiplayerRetryConnection(), 1000);
      }
    }
  };
  
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    console.log('Connection state:', state);
    
    if (state === 'connected') {
      MULTIPLAYER_STATE.connectionState = 'connected';
      MULTIPLAYER_STATE.connectionAttempts = 0;
      console.log('WebRTC connected successfully!');
    } else if (state === 'disconnected' || state === 'failed') {
      console.error('Connection state error:', state);
      multiplayerSetStatus('Connection lost');
      
      if (state === 'failed' && MULTIPLAYER_STATE.connectionAttempts < 3) {
        setTimeout(() => multiplayerRetryConnection(), 1000);
      }
    }
  };
  
  if (isHost) {
    const channel = pc.createDataChannel('set-mp', {
      ordered: true
    });
    multiplayerSetupChannel(channel);
  } else {
    pc.ondatachannel = (e) => {
      console.log('Data channel received');
      multiplayerSetupChannel(e.channel);
    };
  }
  
  return pc;
}

async function multiplayerFlushIceCandidates(reason) {
  if (MULTIPLAYER_STATE.iceFlushTimer) {
    clearTimeout(MULTIPLAYER_STATE.iceFlushTimer);
    MULTIPLAYER_STATE.iceFlushTimer = null;
  }
  if (!MULTIPLAYER_STATE.outboundIceCandidates.length) return;

  const batch = MULTIPLAYER_STATE.outboundIceCandidates.splice(0, MULTIPLAYER_STATE.outboundIceCandidates.length);
  const deduped = [];
  const seen = new Set();
  for (const candidate of batch) {
    const key = [candidate.candidate, candidate.sdpMid, candidate.sdpMLineIndex].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  console.log('Sending ICE batch:', deduped.length, 'reason:', reason);
  await multiplayerSendSignal('ice_batch', JSON.stringify(deduped));
}

async function multiplayerStartOffer() {
  if (MULTIPLAYER_STATE.pc || MULTIPLAYER_STATE.offerSent) {
    console.log('Offer already in progress, skipping');
    return;
  }
  
  console.log('Starting offer creation...');
  MULTIPLAYER_STATE.offerSent = true;
  MULTIPLAYER_STATE.connectionState = 'negotiating';
  MULTIPLAYER_STATE.pc = multiplayerCreatePeerConnection(true);
  
  try {
    const offer = await MULTIPLAYER_STATE.pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false
    });
    
    console.log('Offer created, setting local description');
    await MULTIPLAYER_STATE.pc.setLocalDescription(offer);
    MULTIPLAYER_STATE.waitingForAnswerSince = Date.now();
    MULTIPLAYER_STATE.extendedAnswerWait = false;
    
    console.log('Sending offer to remote peer');
    await multiplayerSendSignal('offer', JSON.stringify(offer));
    
    multiplayerSetStatus('Connecting…');
    console.log('Offer sent successfully');
  } catch (err) {
    console.error('Failed to create/send offer:', err);
    MULTIPLAYER_STATE.offerSent = false;
    MULTIPLAYER_STATE.connectionState = 'failed';
    multiplayerSetStatus('Connection failed');
    if (MULTIPLAYER_STATE.connectionAttempts < 3) {
      setTimeout(() => multiplayerRetryConnection(), 2000);
    }
  }
}

async function multiplayerHandleOffer(offer) {
  if (!offer) {
    console.error('Invalid offer received');
    return;
  }
  
  console.log('Received offer from host');

  if (offer.sdp && offer.sdp === MULTIPLAYER_STATE.lastRemoteOfferSdp) {
    console.log('Duplicate offer SDP received, skipping');
    return;
  }
  MULTIPLAYER_STATE.lastRemoteOfferSdp = offer.sdp || '';
  if (MULTIPLAYER_STATE.pc && MULTIPLAYER_STATE.answerSent) {
    console.log('Already processed offer, ignoring duplicate');
    return;
  }
  
  MULTIPLAYER_STATE.connectionState = 'negotiating';
  
  if (!MULTIPLAYER_STATE.pc) {
    console.log('Creating peer connection for answer');
    MULTIPLAYER_STATE.pc = multiplayerCreatePeerConnection(false);
  }
  
  try {
    console.log('Setting remote description (offer)');
    await MULTIPLAYER_STATE.pc.setRemoteDescription(new RTCSessionDescription(offer));
    console.log('Processing queued ICE candidates:', MULTIPLAYER_STATE.pendingIceCandidates.length);
    while (MULTIPLAYER_STATE.pendingIceCandidates.length > 0) {
      const candidate = MULTIPLAYER_STATE.pendingIceCandidates.shift();
      try {
        await MULTIPLAYER_STATE.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Failed to add queued ICE candidate:', err);
      }
    }
    
    console.log('Creating answer');
    const answer = await MULTIPLAYER_STATE.pc.createAnswer();
    
    console.log('Setting local description (answer)');
    await MULTIPLAYER_STATE.pc.setLocalDescription(answer);
    
    console.log('Sending answer to host');
    await multiplayerSendSignal('answer', JSON.stringify(answer));
    
    MULTIPLAYER_STATE.answerSent = true;
    multiplayerSetStatus('Connecting…');
    console.log('Answer sent successfully');
  } catch (err) {
    console.error('Failed to handle offer:', err);
    MULTIPLAYER_STATE.connectionState = 'failed';
    multiplayerSetStatus('Connection failed');
    if (MULTIPLAYER_STATE.connectionAttempts < 3) {
      setTimeout(() => multiplayerRetryConnection(), 2000);
    }
  }
}

async function multiplayerHandleAnswer(answer) {
  if (!MULTIPLAYER_STATE.pc || !answer) {
    console.error('Cannot handle answer: no peer connection or invalid answer');
    return;
  }
  
  console.log('Received answer from client');
  
  try {
    if (MULTIPLAYER_STATE.pc.signalingState === 'stable') {
      console.log('Already stable, ignoring answer');
      return;
    }
    
    console.log('Setting remote description (answer)');
    await MULTIPLAYER_STATE.pc.setRemoteDescription(new RTCSessionDescription(answer));
    MULTIPLAYER_STATE.waitingForAnswerSince = 0;
    console.log('Processing queued ICE candidates:', MULTIPLAYER_STATE.pendingIceCandidates.length);
    while (MULTIPLAYER_STATE.pendingIceCandidates.length > 0) {
      const candidate = MULTIPLAYER_STATE.pendingIceCandidates.shift();
      try {
        await MULTIPLAYER_STATE.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Failed to add queued ICE candidate:', err);
      }
    }
    
    multiplayerSetStatus('Finalizing connection…');
    console.log('Answer processed successfully');
  } catch (err) {
    console.error('Failed to handle answer:', err);
  }
}

async function multiplayerHandleIceCandidate(candidate) {
  if (!candidate) {
    console.warn('Invalid ICE candidate received');
    return;
  }
  
  if (!MULTIPLAYER_STATE.pc) {
    console.log('No peer connection yet, queueing ICE candidate');
    MULTIPLAYER_STATE.pendingIceCandidates.push(candidate);
    return;
  }
  
  try {
    if (!MULTIPLAYER_STATE.pc.remoteDescription) {
      console.log('Remote description not set, queueing ICE candidate');
      MULTIPLAYER_STATE.pendingIceCandidates.push(candidate);
      return;
    }
    
    console.log('Adding ICE candidate:', candidate.type || 'unknown');
    await MULTIPLAYER_STATE.pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn('Failed to add ICE candidate:', err);
  }
}

function multiplayerSetupChannel(channel) {
  console.log('Setting up data channel');
  MULTIPLAYER_STATE.channel = channel;
  
  channel.onopen = () => {
    console.log('Data channel opened!');
    MULTIPLAYER_STATE.isConnected = true;
    MULTIPLAYER_STATE.connectionAttempts = 0;
    MULTIPLAYER_STATE.connectionState = 'connected';
    multiplayerSetStatus('Connected');
    multiplayerSlowDownPolling();
    
    multiplayerSend({ type: 'hello', nick: MULTIPLAYER_STATE.localNick });
    multiplayerRenderHud();
    multiplayerSyncActionButtons();
    multiplayerStopLobbyListPolling();
    closeMultiplayerModal();
    closeSettingsPanel();
    
    if (MULTIPLAYER_STATE.role === 'host') {
      setTimeout(() => multiplayerStartMatch(), 300);
    }
  };
  
  channel.onmessage = (e) => {
    let msg = null;
    try { 
      msg = JSON.parse(e.data); 
    } catch (err) { 
      console.error('Failed to parse message:', err);
      return; 
    }
    if (!msg || !msg.type) return;
    multiplayerHandleMessage(msg);
  };
  
  channel.onclose = () => {
    console.log('Data channel closed');
    multiplayerHandlePeerDisconnect();
  };
  
  channel.onerror = (err) => {
    console.error('Data channel error:', err);
  };
}

function multiplayerSend(payload) {
  if (!MULTIPLAYER_STATE.channel || MULTIPLAYER_STATE.channel.readyState !== 'open') return;
  try {
    MULTIPLAYER_STATE.channel.send(JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to send message:', err);
  }
}
