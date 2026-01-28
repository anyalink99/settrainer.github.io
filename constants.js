const STORAGE_KEYS = {
  PRESET: 'set_shape_preset',
  SPEED_MOD: 'set_speed_mod',
  SHOW_POSSIBLE: 'set_show_possible',
  SHOW_SPM: 'set_show_s_p_m',
  DEBUG_MODE: 'set_debug_mode',
  SHOW_TIMER: 'set_show_timer',
  AUTO_SHUFFLE: 'set_auto_shuffle',
  AUTO_SELECT_THIRD: 'set_auto_select_third',
  PREVENT_BAD_SHUFFLE: 'set_prevent_bad_shuffle',
  USE_FIXED_SEED: 'set_use_fixed_seed',
  MIN_SETS: 'set_min_sets',
  KEYBINDS: 'set_keybinds',
  RECORDS: 'set_pro_records',
  ONLINE_NICKNAME: 'set_online_nickname',
  ONLINE_SHOW_ONLY_NICKS: 'set_online_show_only_nicks',
  APP_WIDTH: 'set_app_width',
  BOARD_ROTATED: 'set_board_rotated',
  GAME_COLORS: 'set_game_colors'
};

const GAME_CONFIG = {
  SETS_TO_WIN: 23,
  ANIMATION_DURATION: 70,
  CARD_FADE_DURATION: 100,
  CARD_ANIM_IN_DURATION: 180,
  SHUFFLE_DELAY: 280,
  MISTAKE_DELAY: 150,
  TOAST_DURATION: 800,
  LOCK_DURATION: 1000,
  MODAL_TRANSITION: 200,
  EXPORT_DELAY: 30
};

const DEFAULT_GAME_COLORS = ['#fd0000', '#01a43b', '#0000fe'];

const UI_COLORS = {
  BACKGROUND: '#2d2631',
  SPM_MIN_HUE: 0,
  SPM_MAX_HUE: 330
};

const KEY_MAP = {
  'й':'q','ц':'w','у':'e','к':'r','е':'t','н':'y','г':'u','ш':'i','щ':'o','з':'p','х':'[','ъ':']',
  'ф':'a','ы':'s','в':'d','а':'f','п':'g','р':'h','о':'j','л':'k','д':'l','ж':';','э':'\'',
  'я':'z','ч':'x','с':'c','м':'v','и':'b','т':'n','ь':'m','б':',','ю':'.'
};

const DEFAULT_BINDS = {
  board: ['e', 'r', 'i', 'o', 'd', 'f', 'k', 'l', 'x', 'c', 'm', ','],
  shuffle: 'backspace',
  shuffleEx: ' ',
  finish: 'enter'
};

// Leave empty to disable. 
const ONLINE_LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfycbzs-XcC56kdbxwz8cNTeGUbJxdDmzw0W8U1WNm7bY896r2iFok2cX0bpDiYCBIdc6eKIA/exec';
