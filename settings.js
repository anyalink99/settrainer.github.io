function syncSettingsUI() {
  document.getElementById('btn-std').className = `preset-chip ${config.preset === 'standard' ? 'active' : ''}`;
  document.getElementById('btn-cls').className = `preset-chip ${config.preset === 'classic' ? 'active' : ''}`;
  document.getElementById('btn-vertical').className = `preset-chip ${config.boardOrientation === 'vertical' ? 'active' : ''}`;
  document.getElementById('btn-horizontal').className = `preset-chip ${config.boardOrientation === 'horizontal' ? 'active' : ''}`;
  document.getElementById('toggle-possible').classList.toggle('active', config.showPossible);
  const forceMultiplayerMetrics = isMultiplayerModeActive();
  document.getElementById('toggle-spm').classList.toggle('active', isSPMEnabled());
  const toggleDebug = document.getElementById('toggle-debug');
  if (toggleDebug) toggleDebug.classList.toggle('active', config.debugMode);
  document.getElementById('live-spm').style.display = isSPMEnabled() ? 'block' : 'none';
  if (isSPMEnabled()) updateLiveSPM();
  document.getElementById('toggle-timer').classList.toggle('active', isTimerEnabled());
  const toggleTimerMs = document.getElementById('toggle-timer-ms');
  if (toggleTimerMs) {
    toggleTimerMs.classList.toggle('active', config.showTimerMs);
    toggleTimerMs.classList.toggle('disabled', !isTimerEnabled());
  }
  const toggleSpm = document.getElementById('toggle-spm');
  if (toggleSpm) toggleSpm.classList.toggle('disabled', forceMultiplayerMetrics);
  const toggleTimer = document.getElementById('toggle-timer');
  if (toggleTimer) toggleTimer.classList.toggle('disabled', forceMultiplayerMetrics);

  const toggleSetsCards = document.getElementById('toggle-sets-cards');
  if (toggleSetsCards) toggleSetsCards.classList.toggle('active', config.showSetsCards);
  const setsCardsDisplay = document.getElementById('sets-cards-display');
  if (setsCardsDisplay) setsCardsDisplay.style.display = config.showSetsCards ? '' : 'none';
  document.getElementById('timer').style.display = isTimerEnabled() ? '' : 'none';

  document.getElementById('toggle-auto').classList.toggle('active', config.autoShuffle);
  document.getElementById('toggle-auto-select').classList.toggle('active', config.autoSelectThird);
  const togglePrevent = document.getElementById('toggle-prevent');
  if (togglePrevent) {
    togglePrevent.classList.toggle('active', isPreventBadShuffleEnabled());
    togglePrevent.classList.toggle('disabled', forceMultiplayerMetrics);
  }
  document.getElementById('toggle-seed').classList.toggle('active', config.synchronizedSeed);
  document.getElementById('min-sets-input').value = config.minSetsToRecord;
  const tpsInput = document.getElementById('target-set-x-input');
  if (tpsInput) tpsInput.value = config.targetPossibleSets ? config.targetPossibleSets : '';
  document.getElementById('seed-label').style.display = config.synchronizedSeed ? 'block' : 'none';

  const speedRange = document.getElementById('speed-range');
  if (speedRange) speedRange.value = config.speedMod;

  const speedVal = document.getElementById('speed-val');
  if (speedVal) speedVal.innerText = config.speedMod + 'x';

  const mod = 1 / parseFloat(config.speedMod || '1');
  document.documentElement.style.setProperty('--speed-mod', String(mod));
  
  const boardEl = document.getElementById('board');
  if (boardEl) {
    if (config.boardOrientation === 'horizontal') {
      boardEl.classList.add('rotated');
    } else {
      boardEl.classList.remove('rotated');
    }
    boardEl.classList.toggle('preset-standard', config.preset === 'standard');
    boardEl.classList.toggle('preset-classic', config.preset === 'classic');
    boardEl.style.setProperty('--shape-size-ratio', String(config.shapeSizeRatio));
  }

  const shapeSizeRange = document.getElementById('shape-size-range');
  const shapeSizeVal = document.getElementById('shape-size-val');
  if (shapeSizeRange) shapeSizeRange.value = config.shapeSizeRatio;
  if (shapeSizeVal) shapeSizeVal.textContent = Math.round(config.shapeSizeRatio * 100) + '%';

  const modeNormal = document.getElementById('gamemode-normal');
  const modeTraining = document.getElementById('gamemode-training');
  const modeJunior = document.getElementById('gamemode-junior');
  const modeMultiplayer = document.getElementById('gamemode-multiplayer');
  if (modeNormal) modeNormal.classList.toggle('active', config.gameMode === GAME_MODES.NORMAL);
  if (modeTraining) modeTraining.classList.toggle('active', config.gameMode === GAME_MODES.TRAINING);
  if (modeJunior) modeJunior.classList.toggle('active', config.gameMode === GAME_MODES.JUNIOR);
  if (modeMultiplayer) modeMultiplayer.classList.toggle('active', config.gameMode === GAME_MODES.MULTIPLAYER);
}

function updatePreset(p) {
  if (config.preset === p) return;
  config.preset = p;
  Storage.set(STORAGE_KEYS.PRESET, p);
  const activeBtn = p === 'standard' ? document.getElementById('btn-std') : document.getElementById('btn-cls');
  activeBtn.classList.add('chip-animate');
  activeBtn.addEventListener('animationend', () => { activeBtn.classList.remove('chip-animate'); }, { once: true });
  updateColors();
  syncSettingsUI();
  refreshBoardAppearancePreviews();
}

function updateSpeedModifier(val) {
  config.speedMod = val;
  Storage.set(STORAGE_KEYS.SPEED_MOD, val);
  const mod = 1 / parseFloat(val || '1');
  document.documentElement.style.setProperty('--speed-mod', String(mod));
  const speedVal = document.getElementById('speed-val');
  if (speedVal) speedVal.innerText = val + 'x';
}

function toggleOption(key) {
  if (isMultiplayerModeActive() && (key === 'showTimer' || key === 'showSPM' || key === 'preventBadShuffle')) return;
  config[key] = !config[key];
  const storageKey = 'set_' + key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  Storage.set(storageKey, String(config[key]));

  const keyMap = {
    'showPossible': 'SP',
    'autoShuffle': 'AS',
    'preventBadShuffle': 'PBS',
    'autoSelectThird': 'A3RD',
    'synchronizedSeed': 'SS',
    'debugMode': 'DM'
  };

  const modShortName = keyMap[key];
  if (modShortName && !isGameOver) {
      if (config[key]) {
          usedGameModifiers[modShortName] = true;
      }
  }

  syncSettingsUI();

  if (key === 'synchronizedSeed') {
    initNewDeckAndBoard();
    resetStats();
    updateUI();
  } else if (key === 'debugMode') {
    if (!config.debugMode) {
      clearDebugTPSUI();
    } else if (isTrainingModeActive()) {
      trainingRefreshDebugInfo();
    } else {
      restoreDebugTPSInfo();
    }
    updateUI();
  } else {
    updateUI();
  }
}

function setGameMode(mode) {
  if (!GAME_MODE_IDS.includes(mode)) return;
  if (config.gameMode === mode) return;
  config.gameMode = mode;
  Storage.set(STORAGE_KEYS.GAME_MODE, mode);
  if (!isGameOver && typeof usedGameModifiers !== 'undefined') {
    if (mode === GAME_MODES.TRAINING) usedGameModifiers.TM = true;
    if (mode === GAME_MODES.JUNIOR) usedGameModifiers.JN = true;
    if (mode === GAME_MODES.MULTIPLAYER) usedGameModifiers.MP = true;
  }
  initNewDeckAndBoard();
  resetStats();
  updateUI();
  syncSettingsUI();
}

function toggleTimerMs() {
  if (!isTimerEnabled()) return;
  config.showTimerMs = !config.showTimerMs;
  Storage.set(STORAGE_KEYS.SHOW_TIMER_MS, String(config.showTimerMs));
  const timerEl = document.getElementById('timer');
  if (timerEl && typeof formatTime === 'function') {
    const elapsedMs = Date.now() - startTime;
    timerEl.innerText = config.showTimerMs ? formatTimeTenths(elapsedMs) : formatTime(elapsedMs);
  }
  syncSettingsUI();
}

function updateMinSets(val) {
  let num = parseInt(val) || 0;
  if (num > MIN_SETS_MAX) num = MIN_SETS_MAX;
  config.minSetsToRecord = num;
  Storage.set(STORAGE_KEYS.MIN_SETS, num);
  syncSettingsUI();
}

function updateTargetPossibleSets(val) {
  const num = parseInt(val, 10);
  let x = (num === undefined || isNaN(num) || num < 0) ? 0 : num;
  if (x > TPS_MAX_SETS) x = TPS_MAX_SETS;
  config.targetPossibleSets = x;
  Storage.set(STORAGE_KEYS.TARGET_POSSIBLE_SETS, x);
  if (!isGameOver && x > 0 && typeof usedGameModifiers !== 'undefined') {
    usedGameModifiers.TPS = true;
  }
  syncSettingsUI();
}

function updateShapeSizeRatio(val) {
  const num = parseFloat(val);
  if (isNaN(num) || num < 0.7 || num > 1) return;
  config.shapeSizeRatio = num;
  Storage.set(STORAGE_KEYS.SHAPE_SIZE_RATIO, String(num));
  const boardEl = document.getElementById('board');
  if (boardEl) boardEl.style.setProperty('--shape-size-ratio', String(num));
  const shapeSizeVal = document.getElementById('shape-size-val');
  if (shapeSizeVal) shapeSizeVal.textContent = Math.round(num * 100) + '%';
  refreshBoardAppearancePreviews();
  for (let i = 0; i < 12; i++) updateSlot(i, false);
}

function updateBoardOrientation(orientation) {
  if (orientation !== 'vertical' && orientation !== 'horizontal') return;
  const wasHorizontal = config.boardOrientation === 'horizontal';
  config.boardOrientation = orientation;
  if (wasHorizontal === (orientation === 'horizontal')) return;

  Storage.set(STORAGE_KEYS.BOARD_ORIENTATION, config.boardOrientation);

  const prevKey = wasHorizontal ? STORAGE_KEYS.KEYBINDS_HORIZONTAL : STORAGE_KEYS.KEYBINDS;
  Storage.setJSON(prevKey, binds);
  binds = loadBindsForOrientation(config.boardOrientation);

  document.getElementById('btn-vertical').className = `preset-chip ${config.boardOrientation === 'vertical' ? 'active' : ''}`;
  document.getElementById('btn-horizontal').className = `preset-chip ${config.boardOrientation === 'horizontal' ? 'active' : ''}`;
  
  const activeBtn = config.boardOrientation === 'horizontal' ? document.getElementById('btn-horizontal') : document.getElementById('btn-vertical');
  if (activeBtn) {
    activeBtn.classList.add('chip-animate');
    activeBtn.addEventListener('animationend', () => { activeBtn.classList.remove('chip-animate'); }, { once: true });
  }
  
  const boardEl = document.getElementById('board');
  if (boardEl) {
    if (config.boardOrientation === 'horizontal') {
      boardEl.classList.add('rotated');
    } else {
      boardEl.classList.remove('rotated');
    }
  }
  
  transposeBoardLayout();
  for (let i = 0; i < 12; i++) updateSlot(i, false);
  updateUI();
  refreshBoardAppearancePreviews();
}

function transposeBoardLayout() {
  
  const newBoard = [];
  if (config.boardOrientation === 'horizontal') {
    const mapping = [0, 4, 8, 1, 5, 9, 2, 6, 10, 3, 7, 11];
    for (let i = 0; i < 12; i++) {
      newBoard[i] = board[mapping[i]];
    }
  } else {
    const mapping = [0, 3, 6, 9, 1, 4, 7, 10, 2, 5, 8, 11];
    for (let i = 0; i < 12; i++) {
      newBoard[i] = board[mapping[i]];
    }
  }
  board = newBoard;
  selected = [];
}
