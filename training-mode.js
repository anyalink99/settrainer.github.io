/**
 * =============================================================================
 * TRAINING MODE (Saved Boards + Replay Loop)
 * =============================================================================
 *
 * Training Mode isolates a curated cycle of boards (24 per session) so players
 * can practice difficult situations. It runs alongside normal gameplay without
 * altering the core deck/set logic when Training Mode is OFF.
 *
 * -----------------------------------------------------------------------------
 * 1. DATA COLLECTION (Normal Mode)
 * -----------------------------------------------------------------------------
 * - Each time a correct set is found, the current 12-card board is snapshotted
 *   along with the find time.
 * - At game finish, if at least 8 sets were collected, the two slowest boards
 *   are saved into local storage. This is async to avoid blocking gameplay.
 *
 * -----------------------------------------------------------------------------
 * 2. TRAINING SESSION GENERATION
 * -----------------------------------------------------------------------------
 * - Each session is exactly 24 boards in random order.
 * - Saved boards are pulled from storage; missing slots are filled with
 *   generated boards using Target Possible Sets = 1.
 *
 * -----------------------------------------------------------------------------
 * 3. SESSION FLOW + SHUFFLE TRANSITIONS
 * -----------------------------------------------------------------------------
 * - After each solved board, the next board is shown using a "shuffle" style
 *   animation (fade out → new board → fade in), since smooth transitions
 *   between fixed layouts aren't possible.
 *
 * -----------------------------------------------------------------------------
 * 4. BOARD LIFECYCLE ("LIVES")
 * -----------------------------------------------------------------------------
 * - Each saved board has 3 lives. Solving it in Training Mode consumes 1 life.
 * - When lives reach 0, the board is removed permanently from storage.
 *
 * -----------------------------------------------------------------------------
 * 5. DEBUG INFO
 * -----------------------------------------------------------------------------
 * - Generated boards display TPS iteration count.
 * - Saved boards display their saved date and remaining lives.
 *
 * Dependencies
 * -----------------------------------------------------------------------------
 * - Globals: config, board, deck, selected, collectedSets, isAnimating
 * - storage-module.js (Storage), constants.js (STORAGE_KEYS)
 * - graphics-rendering.js (updateSlot)
 * - set-math.js (getComplementaryCard, findCardInDeck, getPossibleSetsIndicesForBoard)
 * - game-logic.js (getShuffleDurations, setDebugTPSIters, handleGameFinish)
 */

const TRAINING_SESSION_SIZE = 24;
const TRAINING_TARGET_POSSIBLE_SETS = 1;
const TRAINING_BOARD_LIVES = 3;

let trainingSessionBoards = [];
let trainingSessionIndex = 0;
let trainingCurrentEntry = null;
let trainingLastDebugMeta = null;
let trainingSessionFindRecords = [];

function isTrainingModeActive() {
  return !!(config && config.trainingMode);
}

function cloneBoardSnapshot(boardArr) {
  return boardArr.map(card => card ? ({ c: card.c, s: card.s, f: card.f, n: card.n }) : null);
}

function shuffleArray(input) {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getStoredTrainingBoards() {
  const stored = Storage.getJSON(STORAGE_KEYS.TRAINING_BOARDS, []);
  return Array.isArray(stored) ? stored : [];
}

function saveStoredTrainingBoardsAsync(list) {
  setTimeout(() => Storage.setJSON(STORAGE_KEYS.TRAINING_BOARDS, list), 0);
}

function createTrainingBoardRecord(boardSnapshot) {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000000),
    savedAt: Date.now(),
    lives: TRAINING_BOARD_LIVES,
    board: boardSnapshot
  };
}

function formatTrainingSavedLabel(meta) {
  const savedAt = meta?.savedAt ? new Date(meta.savedAt) : null;
  const dateStr = savedAt
    ? savedAt.toLocaleDateString('ru-RU') + ' ' + savedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : 'unknown date';
  const lives = typeof meta?.lives === 'number' ? meta.lives : '?';
  return `saved ${dateStr} | lives ${lives}`;
}

function generateBoardWithTargetPossibleSets(target) {
  let localDeck = createDeck();
  let localBoard = localDeck.splice(0, 12);
  let iterations = 0;
  if (!target || target <= 0) return { board: localBoard, iterations };

  const MAX_ITER = 50;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const sets = getPossibleSetsIndicesForBoard(localBoard);
    const S = sets.length;
    if (S === target) {
      iterations = iter + 1;
      return { board: localBoard, iterations };
    }
    if (S < target) {
      const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      let i = indices[Math.floor(Math.random() * 12)];
      let j = indices[Math.floor(Math.random() * 12)];
      if (i === j) continue;
      const needed = getComplementaryCard(localBoard[i], localBoard[j]);
      const deckIdx = findCardInDeck(localDeck, needed);
      if (deckIdx === -1) continue;
      const candidates = indices.filter(idx => idx !== i && idx !== j);
      const setCountByPos = {};
      candidates.forEach(idx => { setCountByPos[idx] = 0; });
      sets.forEach(([a, b, c]) => {
        if (setCountByPos[a] !== undefined) setCountByPos[a]++;
        if (setCountByPos[b] !== undefined) setCountByPos[b]++;
        if (setCountByPos[c] !== undefined) setCountByPos[c]++;
      });
      const minCount = Math.min(...candidates.map(idx => setCountByPos[idx]));
      const bestK = candidates.filter(idx => setCountByPos[idx] === minCount);
      const k = bestK[Math.floor(Math.random() * bestK.length)];
      const oldK = localBoard[k];
      localBoard[k] = localDeck.splice(deckIdx, 1)[0];
      localDeck.push(oldK);
    } else {
      if (sets.length === 0) continue;
      const oneSet = sets[Math.floor(Math.random() * sets.length)];
      const k = oneSet[Math.floor(Math.random() * 3)];
      const deckIdx = Math.floor(Math.random() * localDeck.length);
      const oldK = localBoard[k];
      localBoard[k] = localDeck[deckIdx];
      localDeck[deckIdx] = oldK;
    }
  }
  iterations = MAX_ITER;
  return { board: localBoard, iterations };
}

function buildTrainingSessionBoards() {
  const stored = getStoredTrainingBoards();
  const pickedSaved = shuffleArray(stored).slice(0, TRAINING_SESSION_SIZE);
  const sessionBoards = pickedSaved.map(rec => ({ type: 'saved', record: rec }));
  const needed = TRAINING_SESSION_SIZE - sessionBoards.length;
  for (let i = 0; i < needed; i++) {
    const generated = generateBoardWithTargetPossibleSets(TRAINING_TARGET_POSSIBLE_SETS);
    sessionBoards.push({ type: 'generated', board: generated.board, iterations: generated.iterations });
  }
  return shuffleArray(sessionBoards);
}

function getTrainingEntryPayload(entry) {
  if (!entry) return null;
  if (entry.type === 'saved') {
    return {
      board: cloneBoardSnapshot(entry.record.board),
      meta: { type: 'saved', id: entry.record.id, savedAt: entry.record.savedAt, lives: entry.record.lives }
    };
  }
  return {
    board: cloneBoardSnapshot(entry.board),
    meta: { type: 'generated', iterations: entry.iterations }
  };
}

function syncTrainingDebug(meta) {
  trainingLastDebugMeta = meta || null;
  if (!config.debugMode) return;
  if (!meta) {
    setDebugTPSIters(null);
    return;
  }
  if (meta.type === 'generated') {
    setDebugTPSIters(meta.iterations || 0);
  } else {
    setDebugTPSIters(null, formatTrainingSavedLabel(meta));
  }
}

function trainingInitSession() {
  trainingSessionBoards = buildTrainingSessionBoards();
  trainingSessionIndex = 0;
  trainingCurrentEntry = trainingSessionBoards[0] || null;
  trainingLastDebugMeta = null;
}

function trainingGetRemainingBoardsCount() {
  if (!trainingSessionBoards.length || trainingSessionIndex < 0) return 0;
  return Math.max(trainingSessionBoards.length - trainingSessionIndex, 0);
}

function trainingApplyBoard(boardArr, animateIn = false) {
  board = boardArr;
  selected = [];
  for (let i = 0; i < 12; i++) updateSlot(i, animateIn);
}

function trainingLoadCurrentBoard(animateIn = false) {
  if (!trainingCurrentEntry) return;
  const payload = getTrainingEntryPayload(trainingCurrentEntry);
  if (!payload) return;
  trainingApplyBoard(payload.board, animateIn);
  syncTrainingDebug(payload.meta);
}

function trainingInitNewBoard() {
  trainingInitSession();
  deck = [];
  trainingLoadCurrentBoard(false);
}

function trainingAdvanceBoard() {
  trainingSessionIndex++;
  if (trainingSessionIndex >= trainingSessionBoards.length) {
    trainingCurrentEntry = null;
    return null;
  }
  trainingCurrentEntry = trainingSessionBoards[trainingSessionIndex];
  return getTrainingEntryPayload(trainingCurrentEntry);
}

function trainingShuffleToBoard(payload) {
  if (!payload) return;
  if (isAnimating) return;
  if (config.debugMode) setDebugTPSIters(null);
  isAnimating = true;
  const { fadeOutMs, animInMs } = getShuffleDurations();
  document.querySelectorAll('.card').forEach(c => c.classList.add('anim-out'));
  setTimeout(() => {
    trainingApplyBoard(payload.board, true);
    syncTrainingDebug(payload.meta);
    setTimeout(() => {
      isAnimating = false;
      updateUI();
    }, animInMs);
  }, fadeOutMs);
}

function trainingHandleSolvedBoard() {
  if (!trainingCurrentEntry) return;
  if (trainingCurrentEntry.type === 'saved') {
    const records = getStoredTrainingBoards();
    const idx = records.findIndex(r => r.id === trainingCurrentEntry.record.id);
    if (idx !== -1) {
      records[idx].lives = Math.max((records[idx].lives || 0) - 1, 0);
      if (records[idx].lives <= 0) records.splice(idx, 1);
      saveStoredTrainingBoardsAsync(records);
    }
  }
}

function trainingRecordSetIfNeeded(findTimeMs) {
  const snapshot = cloneBoardSnapshot(board);
  const sourceType = isTrainingModeActive()
    ? (trainingCurrentEntry?.type || 'unknown')
    : 'regular';
  trainingSessionFindRecords.push({ findTime: findTimeMs, board: snapshot, sourceType });
}

function trainingFinalizeSessionIfNeeded() {
  const isTraining = isTrainingModeActive();
  if (typeof collectedSets === 'number' && collectedSets < 8) {
    trainingSessionFindRecords = [];
    return;
  }
  if (!trainingSessionFindRecords.length) return;
  const filtered = isTraining
    ? trainingSessionFindRecords.filter(r => r.sourceType === 'generated')
    : trainingSessionFindRecords.filter(r => r.sourceType === 'regular');
  const sorted = filtered.slice().sort((a, b) => b.findTime - a.findTime);
  const picks = sorted.slice(0, 2);
  trainingSessionFindRecords = [];
  if (!picks.length) return;
  const records = getStoredTrainingBoards();
  picks.forEach(pick => records.push(createTrainingBoardRecord(pick.board)));
  saveStoredTrainingBoardsAsync(records);
}

function trainingResetSessionRecords() {
  trainingSessionFindRecords = [];
}

function trainingHandleCorrectSet() {
  trainingHandleSolvedBoard();
  const nextPayload = trainingAdvanceBoard();
  if (!nextPayload) {
    handleGameFinish(true);
    return;
  }
  trainingShuffleToBoard(nextPayload);
}
