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
  isReady: false,
  remoteReady: false,
  offerSent: false,
  answerSent: false,
  connectionAttempts: 0
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
    if (!data || !data.ok || !data.lobbyId) throw new Error((data && data.error) || 'Failed to create lobby');
    multiplayerResetConnectionState();
    MULTIPLAYER_STATE.role = 'host';
    MULTIPLAYER_STATE.lobbyId = data.lobbyId;
    MULTIPLAYER_STATE.isReady = true;
    multiplayerSetStatus('Lobby created. Waiting for player…');
    multiplayerSyncModal();
    multiplayerStartPolling();
  } catch (err) {
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
    if (!data || !data.ok) throw new Error((data && data.error) || 'Failed to join lobby');
    multiplayerResetConnectionState();
    MULTIPLAYER_STATE.role = 'client';
    MULTIPLAYER_STATE.lobbyId = lobbyId;
    multiplayerSetStatus('Joined. Preparing connection…');
    multiplayerSyncModal();
    multiplayerStartPolling();
    setTimeout(() => {
      MULTIPLAYER_STATE.isReady = true;
      multiplayerSendSignal('ready', 'true').catch(() => {});
      multiplayerSetStatus('Ready. Waiting for host…');
    }, 300);
  } catch (err) {
    multiplayerSetStatus('Failed to join lobby');
    if (typeof showToast === 'function') showToast(err.message || 'Failed to join lobby');
  }
}

function multiplayerResetConnectionState() {
  MULTIPLAYER_STATE.isConnected = false;
  MULTIPLAYER_STATE.channel = null;
  if (MULTIPLAYER_STATE.pc) {
    try { MULTIPLAYER_STATE.pc.close(); } catch (_) {}
  }
  MULTIPLAYER_STATE.pc = null;
  MULTIPLAYER_STATE.processedSignals = new Set();
  MULTIPLAYER_STATE.pendingClaim = false;
  MULTIPLAYER_STATE.lastStateVersion = 0;
  MULTIPLAYER_STATE.isReady = false;
  MULTIPLAYER_STATE.remoteReady = false;
  MULTIPLAYER_STATE.offerSent = false;
  MULTIPLAYER_STATE.answerSent = false;
  MULTIPLAYER_STATE.connectionAttempts = 0;
}

function multiplayerStopPolling() {
  if (MULTIPLAYER_STATE.pollTimer) clearInterval(MULTIPLAYER_STATE.pollTimer);
  MULTIPLAYER_STATE.pollTimer = null;
}

function multiplayerStartPolling() {
  multiplayerStopPolling();
  MULTIPLAYER_STATE.pollTimer = setInterval(multiplayerPollLobby, 350);
  multiplayerPollLobby();
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
      MULTIPLAYER_STATE.remoteNick = other ? (other.nick || other.nickname) : MULTIPLAYER_STATE.remoteNick;
    }
    
    if (Array.isArray(lobby.signals)) {
      multiplayerProcessSignals(lobby.signals);
    }
    
    if (MULTIPLAYER_STATE.role === 'host' && 
        !MULTIPLAYER_STATE.pc && 
        MULTIPLAYER_STATE.isReady && 
        MULTIPLAYER_STATE.remoteReady && 
        MULTIPLAYER_STATE.remoteNick &&
        !MULTIPLAYER_STATE.offerSent) {
      setTimeout(() => multiplayerStartOffer(), 200);
    }
    
  } catch (_) {
    // ignore transient errors
  } finally {
    MULTIPLAYER_STATE.pollInFlight = false;
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

function multiplayerCreatePeerConnection(isHost) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });
  
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      multiplayerSendSignal('ice', JSON.stringify(e.candidate)).catch(() => {});
    }
  };
  
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    console.log('Connection state:', state);
    
    if (state === 'connected') {
      MULTIPLAYER_STATE.connectionAttempts = 0;
    } else if (state === 'disconnected' || state === 'failed') {
      multiplayerSetStatus('Connection lost');
      if (MULTIPLAYER_STATE.connectionAttempts < 3) {
        MULTIPLAYER_STATE.connectionAttempts++;
        setTimeout(() => {
          if (!MULTIPLAYER_STATE.isConnected) {
            multiplayerResetConnectionState();
            MULTIPLAYER_STATE.isReady = true;
            if (MULTIPLAYER_STATE.role === 'client') {
              multiplayerSendSignal('ready', 'true').catch(() => {});
            }
          }
        }, 1000);
      }
    }
  };
  
  if (isHost) {
    const channel = pc.createDataChannel('set-mp');
    multiplayerSetupChannel(channel);
  } else {
    pc.ondatachannel = (e) => multiplayerSetupChannel(e.channel);
  }
  
  return pc;
}

async function multiplayerStartOffer() {
  if (MULTIPLAYER_STATE.pc || MULTIPLAYER_STATE.offerSent) return;
  
  MULTIPLAYER_STATE.offerSent = true;
  MULTIPLAYER_STATE.pc = multiplayerCreatePeerConnection(true);
  
  try {
    const offer = await MULTIPLAYER_STATE.pc.createOffer();
    await MULTIPLAYER_STATE.pc.setLocalDescription(offer);
    await multiplayerSendSignal('offer', JSON.stringify(offer));
    multiplayerSetStatus('Connecting…');
  } catch (err) {
    console.error('Failed to create offer:', err);
    MULTIPLAYER_STATE.offerSent = false;
    multiplayerSetStatus('Connection failed');
  }
}

async function multiplayerHandleOffer(offer) {
  if (!offer) return;
  
  if (MULTIPLAYER_STATE.pc && MULTIPLAYER_STATE.answerSent) {
    console.log('Already processed offer, ignoring');
    return;
  }
  
  if (!MULTIPLAYER_STATE.pc) {
    MULTIPLAYER_STATE.pc = multiplayerCreatePeerConnection(false);
  }
  
  try {
    await MULTIPLAYER_STATE.pc.setRemoteDescription(offer);
    const answer = await MULTIPLAYER_STATE.pc.createAnswer();
    await MULTIPLAYER_STATE.pc.setLocalDescription(answer);
    await multiplayerSendSignal('answer', JSON.stringify(answer));
    MULTIPLAYER_STATE.answerSent = true;
    multiplayerSetStatus('Connecting…');
  } catch (err) {
    console.error('Failed to handle offer:', err);
    multiplayerSetStatus('Connection failed');
  }
}

async function multiplayerHandleAnswer(answer) {
  if (!MULTIPLAYER_STATE.pc || !answer) return;
  
  try {
    if (MULTIPLAYER_STATE.pc.signalingState === 'stable') {
      console.log('Already stable, ignoring answer');
      return;
    }
    
    await MULTIPLAYER_STATE.pc.setRemoteDescription(answer);
    multiplayerSetStatus('Finalizing connection…');
  } catch (err) {
    console.error('Failed to handle answer:', err);
  }
}

async function multiplayerHandleIceCandidate(candidate) {
  if (!MULTIPLAYER_STATE.pc || !candidate) return;
  
  try {
    if (!MULTIPLAYER_STATE.pc.remoteDescription) {
      console.log('Remote description not set, queueing ICE candidate');
      setTimeout(() => multiplayerHandleIceCandidate(candidate), 100);
      return;
    }
    
    await MULTIPLAYER_STATE.pc.addIceCandidate(candidate);
  } catch (err) {
    console.warn('Failed to add ICE candidate:', err);
  }
}

function multiplayerProcessSignals(signals) {
  if (!Array.isArray(signals)) return;
  
  signals.forEach(sig => {
    const key = [sig.from, sig.type, sig.at, sig.payload].join('|');
    if (MULTIPLAYER_STATE.processedSignals.has(key)) return;
    MULTIPLAYER_STATE.processedSignals.add(key);
    
    if (sig.from && sig.from.toLowerCase() === MULTIPLAYER_STATE.localNick.toLowerCase()) return;
    
    try {
      if (sig.type === 'ready') {
        MULTIPLAYER_STATE.remoteReady = true;
        console.log('Remote peer is ready');
        return;
      }
      
      if (sig.type === 'offer') {
        multiplayerHandleOffer(JSON.parse(sig.payload));
      } else if (sig.type === 'answer') {
        multiplayerHandleAnswer(JSON.parse(sig.payload));
      } else if (sig.type === 'ice') {
        multiplayerHandleIceCandidate(JSON.parse(sig.payload));
      }
    } catch (err) {
      console.error('Failed to process signal:', sig.type, err);
    }
  });
}

function multiplayerSetupChannel(channel) {
  MULTIPLAYER_STATE.channel = channel;
  
  channel.onopen = () => {
    MULTIPLAYER_STATE.isConnected = true;
    MULTIPLAYER_STATE.connectionAttempts = 0;
    multiplayerSetStatus('Connected');
    multiplayerStopPolling();
    multiplayerSend({ type: 'hello', nick: MULTIPLAYER_STATE.localNick });
    multiplayerRenderHud();
    closeMultiplayerModal();
    
    if (MULTIPLAYER_STATE.role === 'host') {
      setTimeout(() => multiplayerStartMatch(), 300);
    }
  };
  
  channel.onmessage = (e) => {
    let msg = null;
    try { 
      msg = JSON.parse(e.data); 
    } catch (_) { 
      return; 
    }
    if (!msg || !msg.type) return;
    multiplayerHandleMessage(msg);
  };
  
  channel.onclose = () => {
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
  
  const changedSlots = [];
  for (let i = 0; i < 12; i++) {
    const oldCard = board[i];
    const newCard = newBoard[i];
    
    const oldCode = oldCard ? cardToCode(oldCard) : null;
    const newCode = newCard ? cardToCode(newCard) : null;
    
    if (oldCode !== newCode) {
      changedSlots.push(i);
    }
  }
  
  const animDuration = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.ANIMATION_DURATION) ? 
                       GAME_CONFIG.ANIMATION_DURATION : 300;
  
  const isShuffle = reason === 'shuffle_manual' || reason === 'shuffle_auto';
  const isFullBoardChange = changedSlots.length >= 10; // почти вся доска
  const isSetReplacement = changedSlots.length > 0 && changedSlots.length <= 4; // сет = 3 карты (иногда 4 с подстановкой)
  
  if (isShuffle || isFullBoardChange) {
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
    isAnimating = true;
    
    const boardEl = document.getElementById('board');
    if (boardEl) {
      changedSlots.forEach(i => {
        const card = boardEl.children[i]?.querySelector('.card');
        if (card) card.classList.add('anim-out');
      });
    }
    
    await new Promise(r => setTimeout(r, animDuration));
    
    deck = newDeck;
    board = newBoard;
    
    changedSlots.forEach(i => updateSlot(i, true));
    
    for (let i = 0; i < 12; i++) {
      if (!changedSlots.includes(i)) {
        updateSlot(i, false);
      }
    }
    
  } else {
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
    multiplayerStartMatch();
    closeModal('multiplayer-result-modal');
  } else {
    multiplayerSend({ type: 'rematch' });
    if (typeof showToast === 'function') showToast('Rematch request sent to host');
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
