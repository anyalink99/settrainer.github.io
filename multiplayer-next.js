/**
 * Multiplayer Module - WebRTC P2P Connection
 * 
 * Uses Perfect Negotiation Pattern for reliable connections:
 * - Polite peer (client): Rolls back on conflicts
 * - Impolite peer (host): Always wins on conflicts
 * - Automatic offer/answer handling via negotiationneeded event
 * - No manual offer/answer state management needed
 * 
 * Connection flow:
 * 1. Both peers join lobby
 * 2. Both send 'ready' signal via polling
 * 3. When both ready, peer connections are created
 * 4. negotiationneeded event triggers automatic offer/answer
 * 5. ICE candidates exchanged via polling
 * 6. Data channel opens -> game starts
 * 
 * Polling intervals:
 * - During connection: 100ms (fast signaling)
 * - After connected: 1000ms (maintenance)
 * 
 * Retry logic: Up to 3 attempts with 20s timeout each
 */

const MULTIPLAYER_STATE = {
  role: null,
  lobbyId: '',
  pc: null,
  channel: null,
  pollTimer: null,
  pollInFlight: false,
  processedSignals: new Set(),
  isConnected: false,
  statusText: 'Not connected',
  localNick: '',
  remoteNick: '',
  scores: {},
  timestampsByNick: {},
  lastSetTimeByNick: {},
  startEpoch: 0,
  pendingClaim: false,
  preferRemote: false,
  prevGameMode: null,
  lastStateVersion: 0,
  isApplyingState: false,
  // Perfect Negotiation Pattern
  makingOffer: false,
  ignoreOffer: false,
  isSettingRemoteAnswerPending: false,
  // Connection tracking
  isReady: false,
  remoteReady: false,
  connectionAttempts: 0,
  connectionStartTime: 0,
  connectionTimeout: null,
  isConnecting: false,
  lastSignalCheck: 0,
  pendingIceCandidates: []
};


function multiplayerIsHost() {
  return MULTIPLAYER_STATE.role === 'host' && MULTIPLAYER_STATE.isConnected;
}

function multiplayerIsClient() {
  return MULTIPLAYER_STATE.role === 'client' && MULTIPLAYER_STATE.isConnected;
}

function multiplayerShouldUseRemoteState() {
  return isMultiplayerModeActive() && (MULTIPLAYER_STATE.role === 'client' || MULTIPLAYER_STATE.preferRemote);
}

function multiplayerGetNickname() {
  if (typeof ensureOnlineNickname === 'function') return ensureOnlineNickname();
  const raw = (config && config.onlineNickname) ? String(config.onlineNickname) : '';
  return raw.trim() || 'Player';
}

function multiplayerGetBaseUrl() {
  if (typeof ONLINE_LOBBY_URL === 'string' && ONLINE_LOBBY_URL.trim()) {
    const lobbyUrl = ONLINE_LOBBY_URL.trim();
    return /\/exec\/?$/i.test(lobbyUrl) ? lobbyUrl : (lobbyUrl.replace(/\/?$/, '') + '/exec');
  }
  if (typeof getLeaderboardBaseUrl === 'function') return getLeaderboardBaseUrl();
  const url = typeof ONLINE_LEADERBOARD_URL === 'string' ? ONLINE_LEADERBOARD_URL.trim() : '';
  if (!url) return '';
  return /\/exec\/?$/i.test(url) ? url : (url.replace(/\/?$/, '') + '/exec');
}

function multiplayerSetStatus(text) {
  MULTIPLAYER_STATE.statusText = text || '';
  const statusEl = document.getElementById('multiplayer-status-text');
  if (statusEl) statusEl.textContent = text || '';
  multiplayerRenderHud();
}

function multiplayerRenderHud() {
  const hud = document.getElementById('multiplayer-hud');
  if (!hud) return;
  const shouldShow = isMultiplayerModeActive();
  hud.style.display = shouldShow ? '' : 'none';
  if (!shouldShow) return;

  const statusEl = document.getElementById('multiplayer-hud-status');
  if (statusEl) statusEl.textContent = MULTIPLAYER_STATE.statusText || 'Multiplayer';

  const board = document.getElementById('multiplayer-scoreboard');
  if (!board) return;
  board.innerHTML = '';
  const scores = MULTIPLAYER_STATE.scores || {};
  const local = MULTIPLAYER_STATE.localNick;
  const entries = Object.keys(scores);
  if (entries.length === 0) return;
  entries.sort((a, b) => (a === local ? -1 : b === local ? 1 : 0));
  entries.forEach(nick => {
    const row = document.createElement('div');
    row.className = 'mp-score-row';
    const name = document.createElement('div');
    name.className = 'mp-score-name';
    name.textContent = nick === local ? 'You' : nick;
    const val = document.createElement('div');
    val.className = 'mp-score-val';
    val.textContent = String(scores[nick] ?? 0);
    row.appendChild(name);
    row.appendChild(val);
    board.appendChild(row);
  });
}

function multiplayerSyncModal() {
  const nickEl = document.getElementById('multiplayer-nick');
  if (nickEl) nickEl.textContent = multiplayerGetNickname();
  const lobbyEl = document.getElementById('multiplayer-lobby-id');
  if (lobbyEl) {
    lobbyEl.textContent = MULTIPLAYER_STATE.lobbyId ? ('Lobby: ' + MULTIPLAYER_STATE.lobbyId) : '';
  }
  multiplayerSetStatus(MULTIPLAYER_STATE.statusText || 'Not connected');
}

function multiplayerClearBoard() {
  deck = [];
  board = new Array(12).fill(null);
  selected = [];
  for (let i = 0; i < 12; i++) updateSlot(i, false);
  updateUI();
}

function openMultiplayerModal() {
  MULTIPLAYER_STATE.localNick = multiplayerGetNickname();
  MULTIPLAYER_STATE.preferRemote = true;
  if (MULTIPLAYER_STATE.prevGameMode == null) {
    MULTIPLAYER_STATE.prevGameMode = config.gameMode === GAME_MODES.MULTIPLAYER ? DEFAULT_GAME_MODE : config.gameMode;
  }
  if (config.gameMode !== GAME_MODES.MULTIPLAYER) {
    setGameMode(GAME_MODES.MULTIPLAYER);
    multiplayerClearBoard();
  } else {
    syncSettingsUI();
    updateUI();
  }
  multiplayerSyncModal();
  openModal('multiplayer-modal');
}

function closeMultiplayerModal() {
  closeModal('multiplayer-modal');
}

async function multiplayerRequest(action, params) {
  const base = multiplayerGetBaseUrl();
  if (!base) throw new Error('Online endpoint not configured');
  const q = Object.keys(params || {}).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'action=' + encodeURIComponent(action) + (q ? '&' + q : '');
  if (typeof jsonpRequest === 'function') {
    const res = await jsonpRequest(url);
    if (Array.isArray(res)) {
      throw new Error('Lobby API not supported by endpoint');
    }
    return res;
  }
  const res = await fetch(url);
  const json = await res.json();
  if (Array.isArray(json)) {
    throw new Error('Lobby API not supported by endpoint');
  }
  return json;
}

async function multiplayerHostLobby() {
  const nick = multiplayerGetNickname();
  MULTIPLAYER_STATE.localNick = nick;
  multiplayerSetStatus('Creating lobby…');
  
  try {
    const data = await multiplayerRequest('lobby_create', { nickname: nick });
    if (!data || !data.ok || !data.lobbyId) {
      throw new Error((data && data.error) || 'Failed to create lobby');
    }
    
    multiplayerResetConnectionState();
    MULTIPLAYER_STATE.role = 'host';
    MULTIPLAYER_STATE.lobbyId = data.lobbyId;
    MULTIPLAYER_STATE.isReady = true;
    
    console.log('Lobby created:', data.lobbyId);
    multiplayerSetStatus('Lobby created. Waiting for player…');
    multiplayerSyncModal();
    multiplayerStartPolling();
    
  } catch (err) {
    console.error('Failed to create lobby:', err);
    multiplayerSetStatus('Failed to create lobby');
    if (typeof showToast === 'function') showToast(err.message || 'Failed to create lobby');
  }
}

async function multiplayerJoinLobby() {
  const input = document.getElementById('multiplayer-join-id');
  const lobbyId = input ? input.value.trim() : '';
  
  if (!lobbyId) {
    if (typeof showToast === 'function') showToast('Enter lobby ID');
    return;
  }
  
  const nick = multiplayerGetNickname();
  MULTIPLAYER_STATE.localNick = nick;
  multiplayerSetStatus('Joining lobby…');
  
  try {
    const data = await multiplayerRequest('lobby_join', { lobbyId: lobbyId, nickname: nick });
    if (!data || !data.ok) {
      throw new Error((data && data.error) || 'Failed to join lobby');
    }
    
    multiplayerResetConnectionState();
    MULTIPLAYER_STATE.role = 'client';
    MULTIPLAYER_STATE.lobbyId = lobbyId;
    
    console.log('Joined lobby:', lobbyId);
    multiplayerSetStatus('Joined. Preparing connection…');
    multiplayerSyncModal();
    multiplayerStartPolling();
    
    // Клиент посылает сигнал готовности и создает соединение
    setTimeout(async () => {
      MULTIPLAYER_STATE.isReady = true;
      
      try {
        await multiplayerSendSignal('ready', 'true');
        console.log('Ready signal sent');
        multiplayerSetStatus('Ready. Waiting for host…');
      } catch (err) {
        console.error('Failed to send ready signal:', err);
      }
    }, 500);
    
  } catch (err) {
    console.error('Failed to join lobby:', err);
    multiplayerSetStatus('Failed to join lobby');
    if (typeof showToast === 'function') showToast(err.message || 'Failed to join lobby');
  }
}

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
  MULTIPLAYER_STATE.lastStateVersion = 0;
  
  // Perfect Negotiation Pattern fields
  MULTIPLAYER_STATE.makingOffer = false;
  MULTIPLAYER_STATE.ignoreOffer = false;
  MULTIPLAYER_STATE.isSettingRemoteAnswerPending = false;
  
  // Connection tracking
  MULTIPLAYER_STATE.isReady = false;
  MULTIPLAYER_STATE.remoteReady = false;
  MULTIPLAYER_STATE.connectionAttempts = 0;
  MULTIPLAYER_STATE.connectionStartTime = 0;
  MULTIPLAYER_STATE.isConnecting = false;
  MULTIPLAYER_STATE.lastSignalCheck = 0;
  MULTIPLAYER_STATE.pendingIceCandidates = [];
  
  if (MULTIPLAYER_STATE.connectionTimeout) {
    clearTimeout(MULTIPLAYER_STATE.connectionTimeout);
    MULTIPLAYER_STATE.connectionTimeout = null;
  }
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
  
  // ОЧЕНЬ быстрый polling во время подключения - 100ms
  MULTIPLAYER_STATE.pollTimer = setInterval(multiplayerPollLobby, 100);
  multiplayerPollLobby();
  
  // Первый таймаут 40 секунд - дать время на полный handshake
  MULTIPLAYER_STATE.connectionTimeout = setTimeout(() => {
    if (!MULTIPLAYER_STATE.isConnected && MULTIPLAYER_STATE.connectionAttempts < 3) {
      console.log('Connection timeout, retrying...', MULTIPLAYER_STATE.connectionAttempts + 1);
      multiplayerRetryConnection();
    } else if (!MULTIPLAYER_STATE.isConnected) {
      multiplayerSetStatus('Connection failed');
      multiplayerStopPolling();
      if (typeof showToast === 'function') showToast('Failed to connect. Please try again.');
    }
  }, 40000); // 40 секунд на первую попытку
}

function multiplayerSlowDownPolling() {
  // После подключения замедляем polling до 1000ms
  if (MULTIPLAYER_STATE.pollTimer) {
    clearInterval(MULTIPLAYER_STATE.pollTimer);
    MULTIPLAYER_STATE.pollTimer = setInterval(multiplayerPollLobby, 1000);
  }
  MULTIPLAYER_STATE.isConnecting = false;
  if (MULTIPLAYER_STATE.connectionTimeout) {
    clearTimeout(MULTIPLAYER_STATE.connectionTimeout);
    MULTIPLAYER_STATE.connectionTimeout = null;
  }
}

function multiplayerRetryConnection() {
  const attempt = MULTIPLAYER_STATE.connectionAttempts + 1;
  console.log('Retrying connection, attempt:', attempt);
  
  // Максимум 3 попытки
  if (attempt > 3) {
    console.error('✗✗✗ Max connection attempts reached');
    multiplayerSetStatus('Connection failed');
    multiplayerStopPolling();
    if (typeof showToast === 'function') showToast('Failed to connect after 3 attempts');
    return;
  }
  
  MULTIPLAYER_STATE.connectionAttempts = attempt;
  
  // Проверяем состояние - может уже подключаемся
  if (MULTIPLAYER_STATE.pc) {
    const state = MULTIPLAYER_STATE.pc.connectionState;
    const iceState = MULTIPLAYER_STATE.pc.iceConnectionState;
    const sigState = MULTIPLAYER_STATE.pc.signalingState;
    console.log('Current connection state:', state, 'ICE:', iceState, 'Signaling:', sigState);
    
    // Если data channel уже открыт - всё ок
    if (MULTIPLAYER_STATE.isConnected) {
      console.log('✓ Already connected, canceling retry');
      return;
    }
    
    // НЕ делаем retry если идет активное подключение
    if (state === 'connecting' || iceState === 'checking' || iceState === 'connected') {
      console.log('⏳ Connection in progress (state:', state, 'ICE:', iceState, '), extending timeout by 30s');
      if (MULTIPLAYER_STATE.connectionTimeout) {
        clearTimeout(MULTIPLAYER_STATE.connectionTimeout);
      }
      // Даем еще 30 секунд
      MULTIPLAYER_STATE.connectionTimeout = setTimeout(() => {
        if (!MULTIPLAYER_STATE.isConnected) {
          console.log('Still not connected after extension, forcing retry');
          multiplayerRetryConnection();
        }
      }, 30000);
      return;
    }
    
    // НЕ делаем retry если ждем answer (have-local-offer)
    if (sigState === 'have-local-offer') {
      console.log('⏳ Waiting for answer (have-local-offer), extending timeout by 30s');
      if (MULTIPLAYER_STATE.connectionTimeout) {
        clearTimeout(MULTIPLAYER_STATE.connectionTimeout);
      }
      MULTIPLAYER_STATE.connectionTimeout = setTimeout(() => {
        if (!MULTIPLAYER_STATE.isConnected) {
          console.log('No answer received after extension, retrying');
          multiplayerRetryConnection();
        }
      }, 30000);
      return;
    }
    
    // Если ICE connected но data channel не открывается > 10 секунд - это проблема
    if ((iceState === 'connected' || iceState === 'completed') && !MULTIPLAYER_STATE.isConnected) {
      const timeSinceStart = Date.now() - MULTIPLAYER_STATE.connectionStartTime;
      if (timeSinceStart < 15000) {
        console.log('⏳ ICE connected, waiting for data channel (', Math.round(timeSinceStart/1000), 's )');
        if (MULTIPLAYER_STATE.connectionTimeout) {
          clearTimeout(MULTIPLAYER_STATE.connectionTimeout);
        }
        MULTIPLAYER_STATE.connectionTimeout = setTimeout(() => {
          if (!MULTIPLAYER_STATE.isConnected) multiplayerRetryConnection();
        }, 10000);
        return;
      }
      console.warn('⚠ ICE connected but data channel not opening after 15s, forcing reconnect');
      // Продолжаем с reconnect
    }
  }
  
  // Сброс состояния WebRTC
  if (MULTIPLAYER_STATE.pc) {
    try { 
      MULTIPLAYER_STATE.pc.close(); 
      console.log('Closed old peer connection');
    } catch (_) {}
    MULTIPLAYER_STATE.pc = null;
  }
  
  if (MULTIPLAYER_STATE.channel) {
    try {
      MULTIPLAYER_STATE.channel.close();
      console.log('Closed old data channel');
    } catch (_) {}
    MULTIPLAYER_STATE.channel = null;
  }
  
  MULTIPLAYER_STATE.makingOffer = false;
  MULTIPLAYER_STATE.ignoreOffer = false;
  MULTIPLAYER_STATE.pendingIceCandidates = [];
  MULTIPLAYER_STATE.connectionStartTime = Date.now(); // Сбрасываем счетчик времени
  
  multiplayerSetStatus(`Retrying connection (${attempt}/3)...`);
  
  // Отправляем сигнал готовности заново
  if (MULTIPLAYER_STATE.role === 'client') {
    multiplayerSendSignal('ready', 'true').catch(() => {});
  }
  
  // Создаем новое соединение если обе стороны готовы
  if (MULTIPLAYER_STATE.isReady && MULTIPLAYER_STATE.remoteReady) {
    setTimeout(() => {
      if (!MULTIPLAYER_STATE.pc) {
        multiplayerInitiateConnection();
      }
    }, 1000);
  }
  
  // Перезапускаем timeout
  if (MULTIPLAYER_STATE.connectionTimeout) {
    clearTimeout(MULTIPLAYER_STATE.connectionTimeout);
  }
  
  const timeoutDuration = 35000; // 35 секунд на последующие попытки
  
  MULTIPLAYER_STATE.connectionTimeout = setTimeout(() => {
    if (!MULTIPLAYER_STATE.isConnected) {
      multiplayerRetryConnection();
    }
  }, timeoutDuration);
}

async function multiplayerPollLobby() {
  if (!MULTIPLAYER_STATE.lobbyId || MULTIPLAYER_STATE.pollInFlight) return;
  MULTIPLAYER_STATE.pollInFlight = true;
  
  try {
    const data = await multiplayerRequest('lobby_get', { 
      lobbyId: MULTIPLAYER_STATE.lobbyId, 
      nickname: MULTIPLAYER_STATE.localNick 
    });
    
    if (!data || !data.ok || !data.lobby) return;
    
    const lobby = data.lobby;
    
    // Найти другого игрока
    if (Array.isArray(lobby.players)) {
      const other = lobby.players.find(p => 
        (p.nick || p.nickname) && 
        (String(p.nick || p.nickname).toLowerCase() !== MULTIPLAYER_STATE.localNick.toLowerCase())
      );
      
      if (other && !MULTIPLAYER_STATE.remoteNick) {
        MULTIPLAYER_STATE.remoteNick = other.nick || other.nickname;
        console.log('Remote player found:', MULTIPLAYER_STATE.remoteNick);
      }
    }
    
    // Обработка сигналов с детальным логированием
    if (Array.isArray(lobby.signals) && lobby.signals.length > 0) {
      const signalTypes = lobby.signals.reduce((acc, sig) => {
        acc[sig.type] = (acc[sig.type] || 0) + 1;
        return acc;
      }, {});
      
      console.log('📥 Received', lobby.signals.length, 'signals:', JSON.stringify(signalTypes));
      
      await multiplayerProcessSignals(lobby.signals);
    }
    
  } catch (err) {
    console.warn('Poll error:', err);
  } finally {
    MULTIPLAYER_STATE.pollInFlight = false;
  }
}

async function multiplayerSendSignal(type, payload) {
  if (!MULTIPLAYER_STATE.lobbyId) {
    console.error('Cannot send signal: no lobby ID');
    return false;
  }
  
  try {
    const result = await multiplayerRequest('lobby_signal', {
      lobbyId: MULTIPLAYER_STATE.lobbyId,
      nickname: MULTIPLAYER_STATE.localNick,
      signalType: type,
      payload: payload || ''
    });
    
    console.log('✓ Signal sent to server:', type, 'result:', result ? 'ok' : 'no response');
    return true;
  } catch (err) {
    console.error('✗ Failed to send signal:', type, err);
    return false;
  }
}

function multiplayerCreatePeerConnection() {
  const isPolite = MULTIPLAYER_STATE.role === 'client'; // client is polite, host is impolite
  console.log('Creating peer connection, role:', MULTIPLAYER_STATE.role, 'polite:', isPolite);
  
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  });
  
  // Perfect Negotiation Pattern - automatic renegotiation
  pc.onnegotiationneeded = async () => {
    try {
      console.log('=== Negotiation needed, signaling state:', pc.signalingState);
      MULTIPLAYER_STATE.makingOffer = true;
      await pc.setLocalDescription();
      console.log('=== Sending description:', pc.localDescription.type);
      
      const sent = await multiplayerSendSignal(pc.localDescription.type, JSON.stringify(pc.localDescription));
      if (sent) {
        console.log('=== Description sent successfully');
      } else {
        console.error('=== FAILED to send description, retrying...');
        await new Promise(r => setTimeout(r, 500));
        const retry = await multiplayerSendSignal(pc.localDescription.type, JSON.stringify(pc.localDescription));
        console.log(retry ? '=== Retry successful' : '=== Retry also failed');
      }
    } catch (err) {
      console.error('!!! Failed during negotiation:', err);
    } finally {
      MULTIPLAYER_STATE.makingOffer = false;
    }
  };
  
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      console.log('>>> New ICE candidate:', e.candidate.type, 'protocol:', e.candidate.protocol);
      multiplayerSendSignal('ice', JSON.stringify(e.candidate)).catch(err => {
        console.warn('Failed to send ICE candidate:', err);
      });
    }
  };
  
  pc.onicegatheringstatechange = () => {
    console.log('>>> ICE gathering state:', pc.iceGatheringState);
  };
  
  pc.oniceconnectionstatechange = () => {
    console.log('>>> ICE connection state:', pc.iceConnectionState);
    
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      console.log('✓ ICE connected!');
    } else if (pc.iceConnectionState === 'failed') {
      console.log('✗ ICE failed, restarting...');
      pc.restartIce();
    } else if (pc.iceConnectionState === 'disconnected') {
      console.log('⚠ ICE disconnected');
    }
  };
  
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    console.log('>>> Connection state:', state);
    
    if (state === 'connected') {
      console.log('✓✓✓ WebRTC CONNECTED SUCCESSFULLY! ✓✓✓');
      MULTIPLAYER_STATE.connectionAttempts = 0;
    } else if (state === 'failed') {
      console.error('✗✗✗ Connection FAILED');
      if (MULTIPLAYER_STATE.connectionAttempts < 3) {
        setTimeout(() => multiplayerRetryConnection(), 2000);
      } else {
        multiplayerSetStatus('Connection failed');
      }
    } else if (state === 'disconnected') {
      console.warn('⚠ Connection disconnected');
      multiplayerSetStatus('Connection lost');
    }
  };
  
  pc.onsignalingstatechange = () => {
    console.log('>>> Signaling state:', pc.signalingState);
  };
  
  // Data channel setup
  if (MULTIPLAYER_STATE.role === 'host') {
    const channel = pc.createDataChannel('set-mp', { ordered: true });
    console.log('Host created data channel');
    multiplayerSetupChannel(channel);
  } else {
    pc.ondatachannel = (e) => {
      console.log('Client received data channel');
      multiplayerSetupChannel(e.channel);
    };
  }
  
  return pc;
}

function multiplayerInitiateConnection() {
  if (MULTIPLAYER_STATE.pc) {
    console.log('Connection already exists');
    return;
  }
  
  console.log('Initiating WebRTC connection');
  MULTIPLAYER_STATE.connectionStartTime = Date.now(); // Засекаем время
  multiplayerSetStatus('Connecting…');
  MULTIPLAYER_STATE.pc = multiplayerCreatePeerConnection();
}

async function multiplayerProcessSignals(signals) {
  if (!Array.isArray(signals)) return;
  
  const isPolite = MULTIPLAYER_STATE.role === 'client';
  
  for (const sig of signals) {
    const key = [sig.from, sig.type, sig.at, sig.payload].join('|');
    if (MULTIPLAYER_STATE.processedSignals.has(key)) continue;
    MULTIPLAYER_STATE.processedSignals.add(key);
    
    // Игнорируем собственные сигналы
    if (sig.from && sig.from.toLowerCase() === MULTIPLAYER_STATE.localNick.toLowerCase()) continue;
    
    console.log('<<< Processing signal:', sig.type, 'from:', sig.from);
    
    try {
      // Обработка сигнала готовности
      if (sig.type === 'ready') {
        if (!MULTIPLAYER_STATE.remoteReady) {
          console.log('✓ Remote peer is ready!');
          MULTIPLAYER_STATE.remoteReady = true;
          
          // Обе стороны готовы - создаем соединение
          if (MULTIPLAYER_STATE.isReady && !MULTIPLAYER_STATE.pc) {
            console.log('✓ Both peers ready, creating connection in 100ms');
            setTimeout(() => multiplayerInitiateConnection(), 100);
          }
        }
        continue;
      }
      
      // Если получили offer/answer но у нас нет соединения - создаем
      if (!MULTIPLAYER_STATE.pc && (sig.type === 'offer' || sig.type === 'answer')) {
        console.log('⚠ Received', sig.type, 'but no peer connection exists, creating one NOW');
        multiplayerInitiateConnection();
        // Даем время на создание
        await new Promise(r => setTimeout(r, 200));
      }
      
      // Обработка ICE кандидатов - откладываем если нет remote description
      if (sig.type === 'ice') {
        const candidate = JSON.parse(sig.payload);
        
        if (!MULTIPLAYER_STATE.pc) {
          console.warn('⚠ No peer connection for ICE candidate, will create on next offer/answer');
          continue;
        }
        
        // Если remote description еще не установлен - в очередь
        if (!MULTIPLAYER_STATE.pc.remoteDescription || !MULTIPLAYER_STATE.pc.remoteDescription.type) {
          console.log('⏳ Queueing ICE candidate (no remote description yet)');
          if (!MULTIPLAYER_STATE.pendingIceCandidates) {
            MULTIPLAYER_STATE.pendingIceCandidates = [];
          }
          MULTIPLAYER_STATE.pendingIceCandidates.push(candidate);
          continue;
        }
        
        try {
          await MULTIPLAYER_STATE.pc.addIceCandidate(candidate);
          console.log('✓ ICE candidate added:', candidate.type || 'unknown');
        } catch (err) {
          console.warn('✗ Failed to add ICE candidate:', err.message);
        }
        continue;
      }
      
      // Perfect Negotiation Pattern - offer/answer
      if (sig.type === 'offer' || sig.type === 'answer') {
        const description = JSON.parse(sig.payload);
        
        // Проверка что pc существует
        if (!MULTIPLAYER_STATE.pc) {
          console.error('✗ No peer connection after creation attempt, skipping', sig.type);
          continue;
        }
        
        console.log('<<< Received', description.type, 'signalingState:', MULTIPLAYER_STATE.pc.signalingState);
        
        // Для answer - особенно важно залогировать
        if (description.type === 'answer') {
          console.log('🎉 GOT ANSWER FROM CLIENT! Current signaling state:', MULTIPLAYER_STATE.pc.signalingState);
        }
        
        // Определяем есть ли конфликт (оба делают offer одновременно)
        const offerCollision = description.type === 'offer' && 
                              (MULTIPLAYER_STATE.makingOffer || MULTIPLAYER_STATE.pc.signalingState !== 'stable');
        
        if (offerCollision) {
          console.log('⚠ Offer collision detected! makingOffer:', MULTIPLAYER_STATE.makingOffer, 
                     'signalingState:', MULTIPLAYER_STATE.pc.signalingState);
        }
        
        // Polite peer откатывает при конфликте, impolite игнорирует
        MULTIPLAYER_STATE.ignoreOffer = !isPolite && offerCollision;
        
        if (MULTIPLAYER_STATE.ignoreOffer) {
          console.log('⊘ Ignoring offer (impolite peer, collision)');
          continue;
        }
        
        // Polite peer откатывает свой offer при конфликте
        if (offerCollision && isPolite) {
          console.log('↶ Rolling back (polite peer)');
          await MULTIPLAYER_STATE.pc.setLocalDescription({type: 'rollback'});
          console.log('✓ Rollback complete');
        }
        
        console.log('→ Setting remote description:', description.type);
        await MULTIPLAYER_STATE.pc.setRemoteDescription(description);
        console.log('✓ Remote description set, signalingState now:', MULTIPLAYER_STATE.pc.signalingState);
        
        // Обработка очереди ICE candidates после установки remote description
        if (MULTIPLAYER_STATE.pendingIceCandidates && MULTIPLAYER_STATE.pendingIceCandidates.length > 0) {
          console.log('⏳ Processing', MULTIPLAYER_STATE.pendingIceCandidates.length, 'queued ICE candidates');
          for (const queuedCandidate of MULTIPLAYER_STATE.pendingIceCandidates) {
            try {
              await MULTIPLAYER_STATE.pc.addIceCandidate(queuedCandidate);
              console.log('✓ Queued ICE candidate added');
            } catch (err) {
              console.warn('✗ Failed to add queued ICE candidate:', err.message);
            }
          }
          MULTIPLAYER_STATE.pendingIceCandidates = [];
          console.log('✓ All queued ICE candidates processed');
        }
        
        // Если это offer, отправляем answer
        if (description.type === 'offer') {
          console.log('→ Creating and sending answer');
          await MULTIPLAYER_STATE.pc.setLocalDescription();
          console.log('→ Sending answer, signalingState:', MULTIPLAYER_STATE.pc.signalingState);
          
          const answerPayload = JSON.stringify(MULTIPLAYER_STATE.pc.localDescription);
          console.log('→ Answer payload length:', answerPayload.length);
          
          const sent = await multiplayerSendSignal('answer', answerPayload);
          if (sent) {
            console.log('✓✓✓ Answer sent successfully to server');
          } else {
            console.error('✗✗✗ FAILED to send answer to server, retrying...');
            // Retry once
            await new Promise(r => setTimeout(r, 500));
            const retry = await multiplayerSendSignal('answer', answerPayload);
            console.log(retry ? '✓ Answer retry successful' : '✗ Answer retry also failed');
          }
        }
      }
      
    } catch (err) {
      console.error('✗✗✗ Failed to process signal:', sig.type, err);
    }
  }
}

function multiplayerSetupChannel(channel) {
  console.log('Setting up data channel');
  MULTIPLAYER_STATE.channel = channel;
  
  channel.onopen = () => {
    console.log('Data channel opened!');
    MULTIPLAYER_STATE.isConnected = true;
    MULTIPLAYER_STATE.connectionAttempts = 0;
    multiplayerSetStatus('Connected');
    
    // Замедляем polling после подключения
    multiplayerSlowDownPolling();
    
    multiplayerSend({ type: 'hello', nick: MULTIPLAYER_STATE.localNick });
    multiplayerRenderHud();
    closeMultiplayerModal();
    
    if (MULTIPLAYER_STATE.role === 'host') {
      // Небольшая задержка перед стартом
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
    MULTIPLAYER_STATE.isConnected = false;
    multiplayerSetStatus('Disconnected');
    multiplayerRenderHud();
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

function multiplayerHandleMessage(msg) {
  if (msg.type === 'hello') {
    if (msg.nick) MULTIPLAYER_STATE.remoteNick = String(msg.nick);
    multiplayerRenderHud();
    return;
  }
  if (msg.type === 'state') {
    multiplayerApplyState(msg.state, msg.reason);
    return;
  }
  if (msg.type === 'claim' && multiplayerIsHost()) {
    multiplayerHandleHostClaim(msg);
    return;
  }
  if (msg.type === 'claim_result' && multiplayerIsClient()) {
    multiplayerHandleClaimResult(msg);
    return;
  }
  if (msg.type === 'finish') {
    multiplayerShowResult(msg.summary);
    return;
  }
  if (msg.type === 'rematch' && multiplayerIsHost()) {
    multiplayerStartMatch();
    return;
  }
}

function cardToCode(card) {
  if (!card) return null;
  return ((card.c * 3 + card.s) * 3 + card.f) * 3 + card.n;
}

function codeToCard(code) {
  if (code == null) return null;
  const n = code % 3;
  const f = Math.floor(code / 3) % 3;
  const s = Math.floor(code / 9) % 3;
  const c = Math.floor(code / 27) % 3;
  return { c, s, f, n };
}

function multiplayerBuildState() {
  MULTIPLAYER_STATE.lastStateVersion += 1;
  return {
    version: MULTIPLAYER_STATE.lastStateVersion,
    board: board.map(cardToCode),
    deck: deck.map(cardToCode),
    scores: { ...MULTIPLAYER_STATE.scores },
    timestampsByNick: JSON.parse(JSON.stringify(MULTIPLAYER_STATE.timestampsByNick || {})),
    elapsedMs: Date.now() - startTime,
    isGameOver: !!isGameOver
  };
}

function multiplayerBroadcastState(reason) {
  if (!multiplayerIsHost()) return;
  multiplayerSend({ type: 'state', reason: reason || '', state: multiplayerBuildState() });
}

async function multiplayerApplyState(state, reason) {
  if (!state || MULTIPLAYER_STATE.isApplyingState) return;
  if (state.version && state.version < MULTIPLAYER_STATE.lastStateVersion) return;
  MULTIPLAYER_STATE.lastStateVersion = state.version || MULTIPLAYER_STATE.lastStateVersion;
  MULTIPLAYER_STATE.isApplyingState = true;
  
  // NEW: если это старт новой игры, закрываем модалку результатов
  if (reason === 'start') {
    closeModal('multiplayer-result-modal');
    isGameOver = false;
    MULTIPLAYER_STATE.preferRemote = true; // клиент всегда принимает состояние от хоста
    if (multiplayerIsClient()) {
      multiplayerSetStatus('Match started');
    }
  }
  
  const newDeck = Array.isArray(state.deck) ? state.deck.map(codeToCard) : [];
  const newBoard = Array.isArray(state.board) ? state.board.map(codeToCard) : [];
  
  // NEW: определяем какие слоты изменились
  const changedSlots = [];
  for (let i = 0; i < 12; i++) {
    const oldCard = board[i];
    const newCard = newBoard[i];
    
    // Карта изменилась если:
    // 1. Была карта, стала null (или наоборот)
    // 2. Обе карты, но разные
    const oldCode = oldCard ? cardToCode(oldCard) : null;
    const newCode = newCard ? cardToCode(newCard) : null;
    
    if (oldCode !== newCode) {
      changedSlots.push(i);
    }
  }
  
  const animDuration = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.ANIMATION_DURATION) ? 
                       GAME_CONFIG.ANIMATION_DURATION : 300;
  
  // NEW: обработка разных типов изменений
  const isShuffle = reason === 'shuffle_manual' || reason === 'shuffle_auto';
  const isFullBoardChange = changedSlots.length >= 10; // почти вся доска
  const isSetReplacement = changedSlots.length > 0 && changedSlots.length <= 4; // сет = 3 карты (иногда 4 с подстановкой)
  
  if (isShuffle || isFullBoardChange) {
    // Анимация всей доски при шаффле или массовом изменении
    isAnimating = true;
    
    const boardEl = document.getElementById('board');
    if (boardEl) {
      document.querySelectorAll('.card').forEach(c => c.classList.add('anim-out'));
    }
    
    await new Promise(r => setTimeout(r, animDuration));
    
    deck = newDeck;
    board = newBoard;
    for (let i = 0; i < 12; i++) updateSlot(i, true);
    
  } else if (isSetReplacement) {
    // Анимация только измененных карт (обычно 3 при сете)
    isAnimating = true;
    
    // Фаза 1: fade out измененных карт
    const boardEl = document.getElementById('board');
    if (boardEl) {
      changedSlots.forEach(i => {
        const card = boardEl.children[i]?.querySelector('.card');
        if (card) card.classList.add('anim-out');
      });
    }
    
    await new Promise(r => setTimeout(r, animDuration));
    
    // Фаза 2: обновляем состояние и делаем fade in
    deck = newDeck;
    board = newBoard;
    
    changedSlots.forEach(i => updateSlot(i, true));
    
    // Остальные слоты обновляем без анимации (на всякий случай)
    for (let i = 0; i < 12; i++) {
      if (!changedSlots.includes(i)) {
        updateSlot(i, false);
      }
    }
    
  } else {
    // Без анимации (старт игры, нет изменений или другие случаи)
    deck = newDeck;
    board = newBoard;
    for (let i = 0; i < 12; i++) updateSlot(i, reason === 'start');
  }
  
  MULTIPLAYER_STATE.scores = state.scores || {};
  collectedSets = MULTIPLAYER_STATE.scores[MULTIPLAYER_STATE.localNick] || 0;
  const tsByNick = state.timestampsByNick || {};
  setTimestamps = tsByNick[MULTIPLAYER_STATE.localNick] ? [...tsByNick[MULTIPLAYER_STATE.localNick]] : [];
  isGameOver = !!state.isGameOver;
  if (typeof state.elapsedMs === 'number') {
    startTime = Date.now() - state.elapsedMs;
  }
  selected = [];
  isAnimating = false;
  updateUI();
  multiplayerRenderHud();
  MULTIPLAYER_STATE.pendingClaim = false;
  MULTIPLAYER_STATE.isApplyingState = false;
}

function multiplayerAwardSet(nick, possibleAtStart) {
  const now = Date.now();
  const last = MULTIPLAYER_STATE.lastSetTimeByNick[nick] || startTime;
  const findTime = now - last;
  MULTIPLAYER_STATE.lastSetTimeByNick[nick] = now;
  MULTIPLAYER_STATE.scores[nick] = (MULTIPLAYER_STATE.scores[nick] || 0) + 1;
  if (!Array.isArray(MULTIPLAYER_STATE.timestampsByNick[nick])) MULTIPLAYER_STATE.timestampsByNick[nick] = [];
  MULTIPLAYER_STATE.timestampsByNick[nick].push({ time: now, findTime: findTime, possibleAtStart: possibleAtStart || 0 });
  if (nick === MULTIPLAYER_STATE.localNick) {
    collectedSets = MULTIPLAYER_STATE.scores[nick];
    setTimestamps = [...MULTIPLAYER_STATE.timestampsByNick[nick]];
    lastSetFoundTime = now;
  }
  multiplayerRenderHud();
}

async function multiplayerHandleHostSetFound(sIdx, currentPossible) {
  if (!multiplayerIsHost()) return;
  multiplayerAwardSet(MULTIPLAYER_STATE.localNick, currentPossible);
  await applySetToBoard(sIdx);
  multiplayerBroadcastState('set');
  multiplayerCheckFinish();
}

async function multiplayerHandleHostClaim(msg) {
  if (!msg || !Array.isArray(msg.indices)) return;
  if (isAnimating || isGameOver) {
    multiplayerSend({ type: 'claim_result', ok: false, reason: 'busy' });
    return;
  }
  const sIdx = msg.indices.map(v => Number(v)).filter(v => Number.isFinite(v));
  const unique = new Set(sIdx);
  if (sIdx.length !== 3 || unique.size !== 3) {
    multiplayerSend({ type: 'claim_result', ok: false, reason: 'invalid' });
    return;
  }
  if (sIdx.some(i => i < 0 || i >= board.length || !board[i])) {
    multiplayerSend({ type: 'claim_result', ok: false, reason: 'invalid' });
    return;
  }
  const cards = sIdx.map(i => board[i]);
  const isCorrect = validateSet(cards);
  if (!isCorrect) {
    multiplayerSend({ type: 'claim_result', ok: false, reason: 'wrong' });
    return;
  }
  isAnimating = true;
  selected.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.remove('selected'));
  selected = [];
  const possibleAtStart = analyzePossibleSets().total;
  const nick = msg.nick || MULTIPLAYER_STATE.remoteNick || 'Guest';
  multiplayerAwardSet(nick, possibleAtStart);
  await applySetToBoard(sIdx);
  multiplayerBroadcastState('set');
  multiplayerCheckFinish();
}

function multiplayerHandleClaimResult(msg) {
  MULTIPLAYER_STATE.pendingClaim = false;
  selected.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.remove('selected'));
  selected = [];
  isAnimating = false;
  if (!msg || msg.ok) return;
  if (typeof showToast === 'function') showToast('Not a set');
}

async function multiplayerHandleClientSelection(idx, el) {
  if (!MULTIPLAYER_STATE.isConnected) {
    if (typeof showToast === 'function') showToast('Connect to a lobby first');
    return;
  }
  if (MULTIPLAYER_STATE.pendingClaim || isAnimating || isGameOver) return;
  if (selected.includes(idx)) {
    selected = selected.filter(i => i !== idx);
    el.classList.remove('selected');
    return;
  }
  selected.push(idx);
  el.classList.add('selected');

  const currentPossible = analyzePossibleSets().total;

  if (selected.length === 2 && config.autoSelectThird) {
    const c1 = board[selected[0]];
    const c2 = board[selected[1]];
    const target = {};
    ['c', 's', 'f', 'n'].forEach(p => { target[p] = (3 - (c1[p] + c2[p]) % 3) % 3; });
    let thirdIdx = -1;
    for (let i = 0; i < board.length; i++) {
      if (!board[i] || selected.includes(i)) continue;
      if (['c', 's', 'f', 'n'].every(p => board[i][p] === target[p])) { thirdIdx = i; break; }
    }
    if (thirdIdx !== -1) {
      const thirdEl = document.getElementById('board').children[thirdIdx].querySelector('.card');
      selected.push(thirdIdx);
      thirdEl.classList.add('selected');
    } else {
      mistakes++;
      isAnimating = true;
      await new Promise(r => setTimeout(r, GAME_CONFIG.MISTAKE_DELAY));
      selected.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.remove('selected'));
      selected = [];
      isAnimating = false;
      return;
    }
  }

  if (selected.length === 3) {
    isAnimating = true;
    MULTIPLAYER_STATE.pendingClaim = true;
    multiplayerSend({ type: 'claim', nick: MULTIPLAYER_STATE.localNick, indices: [...selected], possibleAtStart: currentPossible });
  }
}

function multiplayerCheckFinish() {
  if (!multiplayerIsHost() || isGameOver) return;
  const hasSets = analyzePossibleSets().total > 0;
  if (deck.length === 0 && !hasSets) {
    multiplayerFinishMatch();
  }
}

function multiplayerFinishMatch() {
  isGameOver = true;
  multiplayerSetStatus('Match finished');
  const summary = multiplayerBuildSummary();
  multiplayerSend({ type: 'finish', summary: summary });
  multiplayerShowResult(summary);
}

function multiplayerBuildSummary() {
  const scores = MULTIPLAYER_STATE.scores || {};
  const entries = Object.keys(scores);
  let winner = '—';
  let bestScore = -1;
  entries.forEach(nick => {
    const val = Number(scores[nick]) || 0;
    if (val > bestScore) {
      bestScore = val;
      winner = nick;
    } else if (val === bestScore) {
      winner = 'Tie';
    }
  });
  return { winner, scores };
}

function multiplayerShowResult(summary) {
  if (!summary) summary = multiplayerBuildSummary();
  const winnerEl = document.getElementById('multiplayer-result-winner');
  if (winnerEl) {
    const label = summary.winner === 'Tie' ? 'Tie' : (summary.winner || '—');
    winnerEl.textContent = 'Winner: ' + label;
  }
  const list = document.getElementById('multiplayer-result-scores');
  if (list) {
    list.innerHTML = '';
    const scores = summary.scores || {};
    Object.keys(scores).forEach(nick => {
      const row = document.createElement('div');
      row.className = 'mp-result-row';
      const name = document.createElement('div');
      name.className = 'mp-score-name';
      name.textContent = nick === MULTIPLAYER_STATE.localNick ? 'You' : nick;
      const val = document.createElement('div');
      val.className = 'mp-score-val';
      val.textContent = String(scores[nick] ?? 0);
      row.appendChild(name);
      row.appendChild(val);
      list.appendChild(row);
    });
  }
  openModal('multiplayer-result-modal');
}

function multiplayerRequestRematch() {
  if (!MULTIPLAYER_STATE.isConnected) return;
  if (multiplayerIsHost()) {
    // Хост запускает матч и закрывает модалку
    multiplayerStartMatch();
    closeModal('multiplayer-result-modal');
  } else {
    // Клиент только отправляет запрос хосту
    multiplayerSend({ type: 'rematch' });
    if (typeof showToast === 'function') showToast('Rematch request sent to host');
    // НЕ закрываем модалку - она закроется когда придет состояние от хоста
  }
}

function multiplayerStartMatch() {
  if (!multiplayerIsHost()) return;
  MULTIPLAYER_STATE.preferRemote = false;
  MULTIPLAYER_STATE.startEpoch = Date.now();
  const hostNick = MULTIPLAYER_STATE.localNick || multiplayerGetNickname();
  const guestNick = MULTIPLAYER_STATE.remoteNick || 'Guest';
  MULTIPLAYER_STATE.scores = { [hostNick]: 0, [guestNick]: 0 };
  MULTIPLAYER_STATE.timestampsByNick = { [hostNick]: [], [guestNick]: [] };
  MULTIPLAYER_STATE.lastSetTimeByNick = { [hostNick]: MULTIPLAYER_STATE.startEpoch, [guestNick]: MULTIPLAYER_STATE.startEpoch };
  MULTIPLAYER_STATE.pendingClaim = false;
  isGameOver = false;
  multiplayerSetStatus('Match started');
  resetStats();
  initNewDeckAndBoard();
  updateUI();
  closeModal('multiplayer-result-modal');
  multiplayerBroadcastState('start');
}

function multiplayerHandleFinish(isAuto) {
  if (!MULTIPLAYER_STATE.isConnected) return;
  if (!multiplayerIsHost()) {
    if (typeof showToast === 'function') showToast('Only host can finish');
    return;
  }
  multiplayerFinishMatch();
}

function multiplayerHandleReset() {
  if (!MULTIPLAYER_STATE.isConnected) {
    resetStats();
    multiplayerClearBoard();
    return;
  }
  if (multiplayerIsHost()) {
    multiplayerStartMatch();
    return;
  }
  multiplayerRequestRematch();
}

function multiplayerLeave() {
  multiplayerStopPolling();
  multiplayerResetConnectionState();
  MULTIPLAYER_STATE.role = null;
  MULTIPLAYER_STATE.lobbyId = '';
  MULTIPLAYER_STATE.remoteNick = '';
  MULTIPLAYER_STATE.scores = {};
  MULTIPLAYER_STATE.timestampsByNick = {};
  MULTIPLAYER_STATE.lastSetTimeByNick = {};
  MULTIPLAYER_STATE.isConnected = false;
  MULTIPLAYER_STATE.preferRemote = false;
  multiplayerSetStatus('Not connected');
  multiplayerRenderHud();
  closeModal('multiplayer-modal');
  closeModal('multiplayer-result-modal');
  if (MULTIPLAYER_STATE.prevGameMode) {
    setGameMode(MULTIPLAYER_STATE.prevGameMode);
    MULTIPLAYER_STATE.prevGameMode = null;
  }
}
