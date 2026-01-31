let config = {
  // Board (Board Appearance)
  preset: Storage.get(STORAGE_KEYS.PRESET, 'standard'),
  boardRotated: Storage.get(STORAGE_KEYS.BOARD_ROTATED, false),
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
  // Advanced
  autoShuffle: Storage.get(STORAGE_KEYS.AUTO_SHUFFLE, true),
  preventBadShuffle: Storage.get(STORAGE_KEYS.PREVENT_BAD_SHUFFLE, false),
  useFixedSeed: Storage.get(STORAGE_KEYS.USE_FIXED_SEED, false),
  autoSelectThird: Storage.get(STORAGE_KEYS.AUTO_SELECT_THIRD, false),
  minSetsToRecord: Storage.getInt(STORAGE_KEYS.MIN_SETS, 23),
  targetSetX: Storage.getInt(STORAGE_KEYS.TARGET_SET_X, 0),
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
  SP: false, AS: false, PBS: false, A3RD: false, SS: false, DM: false, TPS: false
};

let binds = Storage.getJSON(STORAGE_KEYS.KEYBINDS) || JSON.parse(JSON.stringify(DEFAULT_BINDS));
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
