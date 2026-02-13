/** Auto-split from multiplayer.js */

function multiplayerCreatePeerConnection(isHost) {
  debugLog('Creating peer connection, isHost:', isHost);
  
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  });
  
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      debugLog('New ICE candidate:', e.candidate.type);
      MULTIPLAYER_STATE.outboundIceCandidates.push(e.candidate);
      if (!MULTIPLAYER_STATE.iceFlushTimer) {
        MULTIPLAYER_STATE.iceFlushTimer = setTimeout(() => {
          multiplayerFlushIceCandidates('timer');
        }, 350);
      }
    } else {
      debugLog('ICE gathering complete');
      multiplayerFlushIceCandidates('complete');
    }
  };
  
  pc.onicegatheringstatechange = () => {
    debugLog('ICE gathering state:', pc.iceGatheringState);
  };
  
  pc.oniceconnectionstatechange = () => {
    debugLog('ICE connection state:', pc.iceConnectionState);
    
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      debugLog('ICE connected!');
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
    debugLog('Connection state:', state);
    
    if (state === 'connected') {
      MULTIPLAYER_STATE.connectionState = 'connected';
      MULTIPLAYER_STATE.connectionAttempts = 0;
      debugLog('WebRTC connected successfully!');
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
      debugLog('Data channel received');
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

  debugLog('Sending ICE batch:', deduped.length, 'reason:', reason);
  await multiplayerSendSignal('ice_batch', JSON.stringify(deduped));
}

async function multiplayerStartOffer() {
  if (MULTIPLAYER_STATE.pc || MULTIPLAYER_STATE.offerSent) {
    debugLog('Offer already in progress, skipping');
    return;
  }
  
  debugLog('Starting offer creation...');
  MULTIPLAYER_STATE.offerSent = true;
  MULTIPLAYER_STATE.connectionState = 'negotiating';
  MULTIPLAYER_STATE.pc = multiplayerCreatePeerConnection(true);
  
  try {
    const offer = await MULTIPLAYER_STATE.pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false
    });
    
    debugLog('Offer created, setting local description');
    await MULTIPLAYER_STATE.pc.setLocalDescription(offer);
    MULTIPLAYER_STATE.waitingForAnswerSince = Date.now();
    MULTIPLAYER_STATE.extendedAnswerWait = false;
    
    debugLog('Sending offer to remote peer');
    await multiplayerSendSignal('offer', JSON.stringify(offer));
    
    multiplayerSetStatus('Connecting…');
    debugLog('Offer sent successfully');
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
  
  debugLog('Received offer from host');

  if (offer.sdp && offer.sdp === MULTIPLAYER_STATE.lastRemoteOfferSdp) {
    debugLog('Duplicate offer SDP received, skipping');
    return;
  }
  MULTIPLAYER_STATE.lastRemoteOfferSdp = offer.sdp || '';
  if (MULTIPLAYER_STATE.pc && MULTIPLAYER_STATE.answerSent) {
    debugLog('Already processed offer, ignoring duplicate');
    return;
  }
  
  MULTIPLAYER_STATE.connectionState = 'negotiating';
  
  if (!MULTIPLAYER_STATE.pc) {
    debugLog('Creating peer connection for answer');
    MULTIPLAYER_STATE.pc = multiplayerCreatePeerConnection(false);
  }
  
  try {
    debugLog('Setting remote description (offer)');
    await MULTIPLAYER_STATE.pc.setRemoteDescription(new RTCSessionDescription(offer));
    debugLog('Processing queued ICE candidates:', MULTIPLAYER_STATE.pendingIceCandidates.length);
    while (MULTIPLAYER_STATE.pendingIceCandidates.length > 0) {
      const candidate = MULTIPLAYER_STATE.pendingIceCandidates.shift();
      try {
        await MULTIPLAYER_STATE.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Failed to add queued ICE candidate:', err);
      }
    }
    
    debugLog('Creating answer');
    const answer = await MULTIPLAYER_STATE.pc.createAnswer();
    
    debugLog('Setting local description (answer)');
    await MULTIPLAYER_STATE.pc.setLocalDescription(answer);
    
    debugLog('Sending answer to host');
    await multiplayerSendSignal('answer', JSON.stringify(answer));
    
    MULTIPLAYER_STATE.answerSent = true;
    multiplayerSetStatus('Connecting…');
    debugLog('Answer sent successfully');
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
  
  debugLog('Received answer from client');
  
  try {
    if (MULTIPLAYER_STATE.pc.signalingState === 'stable') {
      debugLog('Already stable, ignoring answer');
      return;
    }
    
    debugLog('Setting remote description (answer)');
    await MULTIPLAYER_STATE.pc.setRemoteDescription(new RTCSessionDescription(answer));
    MULTIPLAYER_STATE.waitingForAnswerSince = 0;
    debugLog('Processing queued ICE candidates:', MULTIPLAYER_STATE.pendingIceCandidates.length);
    while (MULTIPLAYER_STATE.pendingIceCandidates.length > 0) {
      const candidate = MULTIPLAYER_STATE.pendingIceCandidates.shift();
      try {
        await MULTIPLAYER_STATE.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Failed to add queued ICE candidate:', err);
      }
    }
    
    multiplayerSetStatus('Finalizing connection…');
    debugLog('Answer processed successfully');
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
    debugLog('No peer connection yet, queueing ICE candidate');
    MULTIPLAYER_STATE.pendingIceCandidates.push(candidate);
    return;
  }
  
  try {
    if (!MULTIPLAYER_STATE.pc.remoteDescription) {
      debugLog('Remote description not set, queueing ICE candidate');
      MULTIPLAYER_STATE.pendingIceCandidates.push(candidate);
      return;
    }
    
    debugLog('Adding ICE candidate:', candidate.type || 'unknown');
    await MULTIPLAYER_STATE.pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn('Failed to add ICE candidate:', err);
  }
}

function multiplayerSetupChannel(channel) {
  debugLog('Setting up data channel');
  MULTIPLAYER_STATE.channel = channel;
  
  channel.onopen = () => {
    debugLog('Data channel opened!');
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
    debugLog('Data channel closed');
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
