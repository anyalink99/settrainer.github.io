let config = {
  // Board (Board Appearance)
  preset: Storage.get(STORAGE_KEYS.PRESET, 'standard'),
  boardOrientation: (() => {
    const v = Storage.get(STORAGE_KEYS.BOARD_ORIENTATION, 'vertical');
    return (v === 'vertical' || v === 'horizontal') ? v : 'vertical';
  })(),
  shapeSizeRatio: (() => {
    const v = parseFloat(Storage.get(STORAGE_KEYS.SHAPE_SIZE_RATIO, '0.9'));
    return (v >= 0.7 && v <= 1) ? v : 0.9;
  })(),
  speedMod: Storage.get(STORAGE_KEYS.SPEED_MOD, '1.0'),
  gameColors: (() => {
    const saved = Storage.getJSON(STORAGE_KEYS.GAME_COLORS);
    return Array.isArray(saved) && saved.length === 3 ? [...saved] : [...DEFAULT_GAME_COLORS];
  })(),
  // Settings
  showPossible: Storage.get(STORAGE_KEYS.SHOW_POSSIBLE, true),
  showSPM: Storage.get(STORAGE_KEYS.SHOW_SPM, false),
  showTimer: Storage.get(STORAGE_KEYS.SHOW_TIMER, true),
  showTimerMs: Storage.get(STORAGE_KEYS.SHOW_TIMER_MS, false),
  showSetsCards: Storage.get(STORAGE_KEYS.SHOW_SETS_CARDS, true),
  // Advanced
  autoShuffle: Storage.get(STORAGE_KEYS.AUTO_SHUFFLE, true),
  preventBadShuffle: Storage.get(STORAGE_KEYS.PREVENT_BAD_SHUFFLE, false),
  synchronizedSeed: (() => {
    const v = Storage.get(STORAGE_KEYS.SYNCHRONIZED_SEED, false);
    return v === true || v === 'true';
  })(),
  autoSelectThird: Storage.get(STORAGE_KEYS.AUTO_SELECT_THIRD, false),
  minSetsToRecord: (() => {
    const raw = Storage.getInt(STORAGE_KEYS.MIN_SETS, 23);
    const capped = Math.min(raw, MIN_SETS_MAX);
    if (raw !== capped) Storage.set(STORAGE_KEYS.MIN_SETS, capped);
    return capped;
  })(),
  targetPossibleSets: (() => {
    const raw = Storage.getInt(STORAGE_KEYS.TARGET_POSSIBLE_SETS, 0);
    const capped = Math.min(raw, TPS_MAX_SETS);
    if (raw !== capped) Storage.set(STORAGE_KEYS.TARGET_POSSIBLE_SETS, capped);
    return capped;
  })(),
  gameMode: (() => {
    const raw = Storage.get(STORAGE_KEYS.GAME_MODE, '');
    if (GAME_MODE_IDS.includes(raw)) return raw;
    Storage.set(STORAGE_KEYS.GAME_MODE, DEFAULT_GAME_MODE);
    return DEFAULT_GAME_MODE;
  })(),
  debugMode: Storage.get(STORAGE_KEYS.DEBUG_MODE, false),
  // Online
  onlineNickname: Storage.get(STORAGE_KEYS.ONLINE_NICKNAME, ''),
  onlineShowOnlyNicks: Storage.get(STORAGE_KEYS.ONLINE_SHOW_ONLY_NICKS, ''),
  onlineBestPerPlayer: (() => {
    const v = Storage.get(STORAGE_KEYS.ONLINE_BEST_PER_PLAYER, true);
    return v === true || v === 'true';
  })()
};

let gameModifiers = {
  SP: false, AS: false, PBS: false, A3RD: false, SS: false, DM: false, TPS: false, TM: false, JN: false, MP: false
};

function isTrainingModeActive() {
  return !!(config && config.gameMode === GAME_MODES.TRAINING);
}

function isJuniorModeActive() {
  return !!(config && config.gameMode === GAME_MODES.JUNIOR);
}

function isMultiplayerModeActive() {
  return !!(config && config.gameMode === GAME_MODES.MULTIPLAYER);
}


function isTimerEnabled() {
  return !!(config && config.showTimer && !isMultiplayerModeActive());
}

function isSPMEnabled() {
  return !!(config && config.showSPM && !isMultiplayerModeActive());
}

function isPreventBadShuffleEnabled() {
  return !!(config && (config.preventBadShuffle || isMultiplayerModeActive()));
}

function loadBindsForOrientation(orientation) {
  const isHorizontal = orientation === 'horizontal';
  const key = isHorizontal ? STORAGE_KEYS.KEYBINDS_HORIZONTAL : STORAGE_KEYS.KEYBINDS;
  const def = isHorizontal ? DEFAULT_BINDS_HORIZONTAL : DEFAULT_BINDS;
  return Storage.getJSON(key) || JSON.parse(JSON.stringify(def));
}
let binds = loadBindsForOrientation(config.boardOrientation);
let isCapturingKey = null;

let deck = [], board = [], selected = [], collectedSets = 0, badShuffles = 0;
let startTime = Date.now(), isAnimating = false, isGameOver = false, isBtnLocked = false;
let shuffleBtnCooldownUntil = 0;
let lastFinishTime = 0;
let isResetting = false;
let restartPending = false;
let setTimestamps = [], possibleHistory = [], mistakes = 0, shuffleExCount = 0;
let speedChartInstance = null;
let lastSetFoundTime = Date.now();
let currentExtraStats = null;
let autoShuffleFromSet = false;
let nextAutoShuffleSkipsAnimOut = false;
let startGameModifiers = {};
let usedGameModifiers = {};
let debugHighlightSet = null;
let lastFinishResult = null;
let resultOpenedFrom = null;
let gameSeededRng = null;
let lastDebugFrameTime = null;
let lastDebugOutputTime = 0;
let currentPeakDelayMs = 0;
let lastDebugTPSIters = null;
let lastDebugTPSLabel = null;
