/**
 * Global state registry.
 *
 * Why this file exists:
 * - Keeps bootstrap-time state initialization in one place.
 * - Documents ownership (who reads/writes each state slice) to reduce accidental coupling.
 *
 * Ownership map (primary writers):
 * - `config`: settings.js (UI controls), storage-module.js (persisted reads/writes), game-logic.js (runtime checks).
 * - `gameModifiers`: game-logic.js (`startGame`, `finishGame`) + results-stats.js rendering.
 * - `binds`: keybinds.js (`saveBinds`, `loadCurrentBinds`) + event-listeners.js keyboard handlers.
 * - Runtime match state (`deck`, `board`, `selected`, etc.): game-logic.js and multiplayer/state-sync.js.
 * - Result/debug state (`currentExtraStats`, `lastFinishResult`, debug fields): game-logic.js, results-stats.js, graphics-rendering.js.
 */

function readBooleanSetting(key, fallback = false) {
  const value = Storage.get(key, fallback);
  return value === true || value === 'true';
}

function readClampedIntSetting(key, fallback, maxValue) {
  const raw = Storage.getInt(key, fallback);
  const clamped = Math.min(raw, maxValue);
  if (raw !== clamped) Storage.set(key, clamped);
  return clamped;
}

function readEnumSetting(key, fallback, allowedValues) {
  const raw = Storage.get(key, fallback);
  if (allowedValues.includes(raw)) return raw;
  Storage.set(key, fallback);
  return fallback;
}

function readBoardOrientationSetting() {
  return readEnumSetting(STORAGE_KEYS.BOARD_ORIENTATION, 'vertical', ['vertical', 'horizontal']);
}

function readShapeSizeRatioSetting() {
  const value = parseFloat(Storage.get(STORAGE_KEYS.SHAPE_SIZE_RATIO, '0.9'));
  return (value >= 0.7 && value <= 1) ? value : 0.9;
}

function readGameColorsSetting() {
  const savedColors = Storage.getJSON(STORAGE_KEYS.GAME_COLORS);
  return Array.isArray(savedColors) && savedColors.length === 3
    ? [...savedColors]
    : [...DEFAULT_GAME_COLORS];
}

let config = {
  // ===== Board appearance (consumed by graphics-rendering.js, settings.js) =====
  preset: Storage.get(STORAGE_KEYS.PRESET, 'standard'),
  boardOrientation: readBoardOrientationSetting(),
  shapeSizeRatio: readShapeSizeRatioSetting(),
  speedMod: Storage.get(STORAGE_KEYS.SPEED_MOD, '1.0'),
  gameColors: readGameColorsSetting(),

  // ===== UI preferences (consumed by timer.js, results-stats.js, game-logic.js) =====
  showPossible: Storage.get(STORAGE_KEYS.SHOW_POSSIBLE, true),
  showSPM: Storage.get(STORAGE_KEYS.SHOW_SPM, false),
  showTimer: Storage.get(STORAGE_KEYS.SHOW_TIMER, true),
  showTimerMs: Storage.get(STORAGE_KEYS.SHOW_TIMER_MS, false),
  showSetsCards: Storage.get(STORAGE_KEYS.SHOW_SETS_CARDS, true),

  // ===== Advanced gameplay settings (consumed by game-logic.js/tps-logic.js) =====
  autoShuffle: Storage.get(STORAGE_KEYS.AUTO_SHUFFLE, true),
  preventBadShuffle: Storage.get(STORAGE_KEYS.PREVENT_BAD_SHUFFLE, false),
  synchronizedSeed: readBooleanSetting(STORAGE_KEYS.SYNCHRONIZED_SEED, false),
  autoSelectThird: Storage.get(STORAGE_KEYS.AUTO_SELECT_THIRD, false),
  minSetsToRecord: readClampedIntSetting(STORAGE_KEYS.MIN_SETS, 23, MIN_SETS_MAX),
  targetPossibleSets: readClampedIntSetting(STORAGE_KEYS.TARGET_POSSIBLE_SETS, 0, TPS_MAX_SETS),
  gameMode: readEnumSetting(STORAGE_KEYS.GAME_MODE, DEFAULT_GAME_MODE, GAME_MODE_IDS),
  debugMode: Storage.get(STORAGE_KEYS.DEBUG_MODE, false),

  // ===== Online settings (consumed by multiplayer/*.js, online-leaderboard.js) =====
  onlineNickname: Storage.get(STORAGE_KEYS.ONLINE_NICKNAME, ''),
  onlineShowOnlyNicks: Storage.get(STORAGE_KEYS.ONLINE_SHOW_ONLY_NICKS, ''),
  onlineBestPerPlayer: readBooleanSetting(STORAGE_KEYS.ONLINE_BEST_PER_PLAYER, true)
};

// Saved together with records and shown in results UI.
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
  const defaults = isHorizontal ? DEFAULT_BINDS_HORIZONTAL : DEFAULT_BINDS;
  return Storage.getJSON(key) || JSON.parse(JSON.stringify(defaults));
}

// Keyboard layout state (owned by keybinds.js and event-listeners.js).
let binds = loadBindsForOrientation(config.boardOrientation);
let isCapturingKey = null;

// ===== Runtime match state (primary writers: game-logic.js, multiplayer/state-sync.js) =====
let deck = [], board = [], selected = [], collectedSets = 0, badShuffles = 0;
let startTime = Date.now(), isAnimating = false, isGameOver = false, isBtnLocked = false;
let shuffleBtnCooldownUntil = 0;
let lastFinishTime = 0;
let isResetting = false;
let restartPending = false;

// ===== Runtime stats for result screen and charts (game-logic.js + timer.js + results-stats.js) =====
let setTimestamps = [], possibleHistory = [], mistakes = 0, shuffleExCount = 0;
let speedChartInstance = null;
let lastSetFoundTime = Date.now();
let currentExtraStats = null;

// ===== Runtime helpers/flags (game-logic.js shuffle and animation flow) =====
let autoShuffleFromSet = false;
let nextAutoShuffleSkipsAnimOut = false;
let startGameModifiers = {};
let usedGameModifiers = {};

// ===== Debug/dev-only state (graphics-rendering.js + game-logic.js) =====
let debugHighlightSet = null;
let lastFinishResult = null;
let resultOpenedFrom = null;
let gameSeededRng = null;
let lastDebugFrameTime = null;
let lastDebugOutputTime = 0;
let currentPeakDelayMs = 0;
let lastDebugTPSIters = null;
let lastDebugTPSLabel = null;
