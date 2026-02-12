/** Auto-split from multiplayer.js */

function multiplayerResetConnectionState() {
  console.log('Resetting connection state');
  MULTIPLAYER_STATE.isConnected = false;
  MULTIPLAYER_STATE.channel = null;
  if (MULTIPLAYER_STATE.pc) {
    try { MULTIPLAYER_STATE.pc.close(); } catch (_) {}
  }
  MULTIPLAYER_STATE.pc = null;
  MULTIPLAYER_STATE.processedSignals = new Set();
  MULTIPLAYER_STATE.pendingClaim = false;
  MULTIPLAYER_STATE.pendingShuffle = false;
  MULTIPLAYER_STATE.lastStateVersion = 0;
  MULTIPLAYER_STATE.isReady = false;
  MULTIPLAYER_STATE.remoteReady = false;
  MULTIPLAYER_STATE.remoteNick = '';
  MULTIPLAYER_STATE.offerSent = false;
  MULTIPLAYER_STATE.answerSent = false;
  MULTIPLAYER_STATE.connectionAttempts = 0;
  MULTIPLAYER_STATE.connectionState = 'idle';
  MULTIPLAYER_STATE.connectionStartTime = 0;
  MULTIPLAYER_STATE.pendingIceCandidates = [];
  MULTIPLAYER_STATE.outboundIceCandidates = [];
  MULTIPLAYER_STATE.waitingForAnswerSince = 0;
  MULTIPLAYER_STATE.extendedAnswerWait = false;
  MULTIPLAYER_STATE.lastRemoteOfferSdp = '';
  MULTIPLAYER_STATE.isConnecting = false;
  
  if (MULTIPLAYER_STATE.connectionTimeout) {
    clearTimeout(MULTIPLAYER_STATE.connectionTimeout);
    MULTIPLAYER_STATE.connectionTimeout = null;
  }
  if (MULTIPLAYER_STATE.iceFlushTimer) {
    clearTimeout(MULTIPLAYER_STATE.iceFlushTimer);
    MULTIPLAYER_STATE.iceFlushTimer = null;
  }
  multiplayerSyncActionButtons();
}

function multiplayerStopPolling() {
  if (MULTIPLAYER_STATE.pollTimer) clearInterval(MULTIPLAYER_STATE.pollTimer);
  MULTIPLAYER_STATE.pollTimer = null;
  if (MULTIPLAYER_STATE.connectionTimeout) clearTimeout(MULTIPLAYER_STATE.connectionTimeout);
  MULTIPLAYER_STATE.connectionTimeout = null;
}

function multiplayerStartPolling() {
  multiplayerStopPolling();
  MULTIPLAYER_STATE.isConnecting = true;
  MULTIPLAYER_STATE.connectionStartTime = Date.now();
  MULTIPLAYER_STATE.pollTimer = setInterval(multiplayerPollLobby, 150);
  multiplayerPollLobby();
  multiplayerEnsureConnectionTimeout();
}

function multiplayerShouldTrackConnectionTimeout() {
  if (MULTIPLAYER_STATE.isConnected || !MULTIPLAYER_STATE.isConnecting) return false;
  return !!(
    MULTIPLAYER_STATE.pc ||
    MULTIPLAYER_STATE.offerSent ||
    MULTIPLAYER_STATE.answerSent ||
    MULTIPLAYER_STATE.waitingForAnswerSince ||
    MULTIPLAYER_STATE.connectionState === 'negotiating'
  );
}

function multiplayerEnsureConnectionTimeout() {
  if (MULTIPLAYER_STATE.connectionTimeout || !multiplayerShouldTrackConnectionTimeout()) return;
  MULTIPLAYER_STATE.connectionTimeout = setTimeout(multiplayerHandleConnectionTimeout, 15000);
}

function multiplayerHandleConnectionTimeout() {
  MULTIPLAYER_STATE.connectionTimeout = null;
  if (MULTIPLAYER_STATE.isConnected) return;

  if (!multiplayerShouldTrackConnectionTimeout()) {
    multiplayerEnsureConnectionTimeout();
    return;
  }

  const pc = MULTIPLAYER_STATE.pc;
  const signalingState = pc ? pc.signalingState : 'none';
  const connectionState = pc ? pc.connectionState : 'none';
  const iceState = pc ? pc.iceConnectionState : 'none';

  if (pc && signalingState === 'have-local-offer') {
    if (!MULTIPLAYER_STATE.extendedAnswerWait) {
      MULTIPLAYER_STATE.extendedAnswerWait = true;
      console.log('Waiting for answer (have-local-offer), extending timeout by 30s');
      MULTIPLAYER_STATE.connectionTimeout = setTimeout(() => {
        MULTIPLAYER_STATE.connectionTimeout = null;
        if (!MULTIPLAYER_STATE.isConnected) {
          console.log('No answer received after extension, retrying');
          multiplayerRetryConnection();
        }
      }, 30000);
      return;
    }
  }

  if (pc && (connectionState === 'connecting' || iceState === 'checking')) {
    console.log('Connection is progressing (connecting/checking), extending timeout by 20s');
    MULTIPLAYER_STATE.connectionTimeout = setTimeout(() => {
      MULTIPLAYER_STATE.connectionTimeout = null;
      if (!MULTIPLAYER_STATE.isConnected) multiplayerRetryConnection();
    }, 20000);
    return;
  }

  if (MULTIPLAYER_STATE.connectionAttempts < 4) {
    console.log('Connection timeout, retrying...', MULTIPLAYER_STATE.connectionAttempts + 1, 'state:', signalingState, connectionState, iceState);
    multiplayerRetryConnection();
  } else {
    multiplayerSetStatus('Connection failed');
    multiplayerStopPolling();
    if (typeof showToast === 'function') showToast('Failed to connect. Please try again.');
  }
}

function multiplayerSlowDownPolling() {
  if (MULTIPLAYER_STATE.pollTimer) {
    clearInterval(MULTIPLAYER_STATE.pollTimer);
    MULTIPLAYER_STATE.pollTimer = setInterval(multiplayerPollLobby, 500);
  }
  MULTIPLAYER_STATE.isConnecting = false;
  if (MULTIPLAYER_STATE.connectionTimeout) {
    clearTimeout(MULTIPLAYER_STATE.connectionTimeout);
    MULTIPLAYER_STATE.connectionTimeout = null;
  }
}

function multiplayerRetryConnection() {
  console.log('Retrying connection...');
  MULTIPLAYER_STATE.connectionAttempts++;
  if (MULTIPLAYER_STATE.pc) {
    try { MULTIPLAYER_STATE.pc.close(); } catch (_) {}
    MULTIPLAYER_STATE.pc = null;
  }
  MULTIPLAYER_STATE.channel = null;
  MULTIPLAYER_STATE.offerSent = false;
  MULTIPLAYER_STATE.answerSent = false;
  MULTIPLAYER_STATE.pendingIceCandidates = [];
  MULTIPLAYER_STATE.outboundIceCandidates = [];
  MULTIPLAYER_STATE.waitingForAnswerSince = 0;
  MULTIPLAYER_STATE.extendedAnswerWait = false;
  MULTIPLAYER_STATE.lastRemoteOfferSdp = '';
  MULTIPLAYER_STATE.connectionState = 'waiting_ready';
  
  multiplayerSetStatus('Retrying connection...');
  if (MULTIPLAYER_STATE.role === 'client') {
    multiplayerSendSignal('ready', 'true').catch(() => {});
  }
  multiplayerStartPolling();
}

async function multiplayerPollLobby() {
  if (!MULTIPLAYER_STATE.lobbyId || MULTIPLAYER_STATE.pollInFlight) return;
  MULTIPLAYER_STATE.pollInFlight = true;
  try {
    const data = await multiplayerRequest('lobby_get', { lobbyId: MULTIPLAYER_STATE.lobbyId, nickname: MULTIPLAYER_STATE.localNick });
    if (!data || !data.ok || !data.lobby) return;
    const lobby = data.lobby;
    if (Array.isArray(lobby.players)) {
      const other = lobby.players.find(p => (p.nick || p.nickname) && (String(p.nick || p.nickname).toLowerCase() !== MULTIPLAYER_STATE.localNick.toLowerCase()));
      if (other) {
        const nextRemoteNick = String(other.nick || other.nickname || '').trim();
        if (nextRemoteNick && nextRemoteNick !== MULTIPLAYER_STATE.remoteNick) {
          MULTIPLAYER_STATE.remoteNick = nextRemoteNick;
          console.log('Remote player found:', MULTIPLAYER_STATE.remoteNick);
          multiplayerSetStatus(MULTIPLAYER_STATE.statusBaseText || 'Connected');
        }
      }
    }
    if (Array.isArray(lobby.signals)) {
      multiplayerProcessSignals(lobby.signals);
    }
    if (MULTIPLAYER_STATE.role === 'host' && 
        !MULTIPLAYER_STATE.pc && 
        MULTIPLAYER_STATE.isReady && 
        MULTIPLAYER_STATE.remoteReady && 
        MULTIPLAYER_STATE.remoteNick &&
        !MULTIPLAYER_STATE.offerSent &&
        MULTIPLAYER_STATE.connectionState !== 'negotiating' &&
        MULTIPLAYER_STATE.connectionState !== 'connected') {
      
      console.log('Both peers ready, starting WebRTC negotiation');
      MULTIPLAYER_STATE.connectionState = 'negotiating';
      setTimeout(() => {
        if (!MULTIPLAYER_STATE.pc && !MULTIPLAYER_STATE.offerSent) {
          multiplayerStartOffer();
        }
      }, 300);
    }
    
  } catch (err) {
    console.warn('Poll error:', err);
  } finally {
    MULTIPLAYER_STATE.pollInFlight = false;
    multiplayerEnsureConnectionTimeout();
  }
}

async function multiplayerSendSignal(type, payload) {
  if (!MULTIPLAYER_STATE.lobbyId) return;
  try {
    await multiplayerRequest('lobby_signal', {
      lobbyId: MULTIPLAYER_STATE.lobbyId,
      nickname: MULTIPLAYER_STATE.localNick,
      signalType: type,
      payload: payload || ''
    });
  } catch (err) {
    console.warn('Failed to send signal:', type, err);
  }
}

function multiplayerProcessSignals(signals) {
  if (!Array.isArray(signals)) return;
  
  signals.forEach(sig => {
    const key = [sig.from, sig.type, sig.at, sig.payload].join('|');
    if (MULTIPLAYER_STATE.processedSignals.has(key)) return;
    MULTIPLAYER_STATE.processedSignals.add(key);
    if (sig.from && sig.from.toLowerCase() === MULTIPLAYER_STATE.localNick.toLowerCase()) return;
    
    console.log('Processing signal:', sig.type, 'from:', sig.from);
    
    try {
      if (sig.type === 'ready') {
        if (!MULTIPLAYER_STATE.remoteReady) {
          console.log('Remote peer is ready!');
          MULTIPLAYER_STATE.remoteReady = true;
          if (MULTIPLAYER_STATE.role === 'host' && 
              MULTIPLAYER_STATE.isReady && 
              !MULTIPLAYER_STATE.offerSent &&
              MULTIPLAYER_STATE.connectionState === 'idle') {
            MULTIPLAYER_STATE.connectionState = 'waiting_ready';
          }
        }
        return;
      }
      
      if (sig.type === 'offer') {
        const offer = JSON.parse(sig.payload);
        multiplayerHandleOffer(offer);
      } else if (sig.type === 'answer') {
        const answer = JSON.parse(sig.payload);
        multiplayerHandleAnswer(answer);
      } else if (sig.type === 'ice') {
        const candidate = JSON.parse(sig.payload);
        multiplayerHandleIceCandidate(candidate);
      } else if (sig.type === 'ice_batch') {
        const candidates = JSON.parse(sig.payload);
        if (Array.isArray(candidates)) {
          candidates.forEach(multiplayerHandleIceCandidate);
        }
      }
    } catch (err) {
      console.error('Failed to process signal:', sig.type, err);
    }
  });
}
