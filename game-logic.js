/**
 * Game logic: deck creation, UI updates, input handlers, game lifecycle.
 * Depends on: config, board, deck, etc. (state), set-math.js, tps-logic.js,
 * graphics-rendering (updateSlot), utilities (mulberry32), constants (GAME_CONFIG, STORAGE_KEYS).
 */

function getSeedForFixed() {
  const now = new Date();
  const seedStr = `${now.getFullYear()}${now.getMonth()}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
  return parseInt(seedStr, 10);
}

function createDeck(rng) {
  const d = [];
  for (let c = 0; c < 3; c++) for (let s = 0; s < 3; s++) for (let f = 0; f < 3; f++) for (let n = 0; n < 3; n++) d.push({ c, s, f, n });
  const randomFunc = rng != null ? rng : Math.random;
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(randomFunc() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

let lastDebugFrameTime = null;
let lastDebugOutputTime = 0;
let currentPeakDelayMs = 0;

function setDebugTPSIters(iters, label) {
  const el = document.getElementById('debug-tps-iters');
  if (!el) return;
  if (iters == null || iters === undefined) {
    el.textContent = label ? label : 'disabled';
    return;
  }
  el.textContent = label ? iters + ' iter (' + label + ')' : iters + ' iter';
}

function runDebugFPSLoop() {
  const container = document.getElementById('debug-edge-container');
  const el = document.getElementById('debug-delay');
  if (!config.debugMode) {
    if (container) container.style.display = 'none';
    lastDebugFrameTime = null;
    currentPeakDelayMs = 0;
    requestAnimationFrame(runDebugFPSLoop);
    return;
  }
  if (container) container.style.display = 'flex';
  const now = performance.now();
  if (lastDebugFrameTime != null) {
    const delayMs = now - lastDebugFrameTime; // delay (ms) = 1000 / fps
    currentPeakDelayMs = Math.max(currentPeakDelayMs, delayMs);
    if (now - lastDebugOutputTime >= 100) {
      el.textContent = currentPeakDelayMs.toFixed(1);
      lastDebugOutputTime = now;
      currentPeakDelayMs = delayMs;
    }
  }
  lastDebugFrameTime = now;
  requestAnimationFrame(runDebugFPSLoop);
}

function applyDebugHighlight() {
  if (!config.debugMode) return;
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  for (let i = 0; i < 12; i++) {
    const slot = boardEl.children[i];
    const card = slot?.querySelector('.card');
    if (card) {
      const inSet = debugHighlightSet && debugHighlightSet.includes(i);
      card.classList.toggle('debug-set-highlight', !!inSet);
    }
  }
}

function updateLiveSPM() {
  if (isGameOver || !config.showSPM) return;

  const spmElement = document.getElementById('live-spm');
  const totalElapsedMs = Date.now() - startTime;

  if (totalElapsedMs > 500) {
    const spm = (collectedSets / (totalElapsedMs / 60000)).toFixed(1);
    spmElement.innerText = spm;
    spmElement.style.color = getSPMColor(parseFloat(spm));
  } else {
    spmElement.innerText = "0.0";
    spmElement.style.color = getSPMColor(0);
  }
}

function markModUsed(key) {
  if (usedGameModifiers[key] !== undefined) {
    usedGameModifiers[key] = true;
  }
}

function updateUI() {
  const stats = analyzePossibleSets();
  if (!isGameOver && !isAnimating) possibleHistory.push(stats.total);

  gameModifiers.SP = config.showPossible;
  gameModifiers.AS = config.autoShuffle;
  gameModifiers.PBS = config.preventBadShuffle;
  gameModifiers.A3RD = config.autoSelectThird;
  gameModifiers.SS = config.synchronizedSeed;
  gameModifiers.DM = config.debugMode;
  gameModifiers.TPS = !!(config.targetPossibleSets && config.targetPossibleSets > 0);
  gameModifiers.TM = !!config.trainingMode;

  const deckLabel = document.getElementById('deck-label');
  if (isTrainingModeActive()) {
    if (deckLabel) deckLabel.innerText = 'Boards';
    document.getElementById('deck-count').innerText = trainingGetRemainingBoardsCount();
  } else {
    if (deckLabel) deckLabel.innerText = 'Cards';
    document.getElementById('deck-count').innerText = deck.length;
  }
  document.getElementById('current-score').innerText = collectedSets;
  document.getElementById('possible-count').innerText = stats.total;
  document.getElementById('possible-label').style.opacity = config.showPossible ? '1' : '0';
  const detContainer = document.getElementById('detailed-possible');
  detContainer.style.opacity = (config.showPossible && config.debugMode) ? '1' : '0';
  document.getElementById('det-4').innerText = stats[4];
  document.getElementById('det-3').innerText = stats[3];
  document.getElementById('det-2').innerText = stats[2];
  document.getElementById('det-1').innerText = stats[1];

  if (config.debugMode && !isGameOver && !isAnimating) {
    const sets = getPossibleSetsIndices();
    debugHighlightSet = sets.length > 0 ? sets[Math.floor(Math.random() * sets.length)] : null;
  } else {
    debugHighlightSet = null;
  }

  if (
    !isTrainingModeActive() &&
    stats.total === 0 &&
    config.autoShuffle &&
    deck.length > 0 &&
    !isAnimating &&
    !isGameOver
  ) {
    if (config.debugMode) showToast('Auto-shuffle');
    const fromSet = autoShuffleFromSet;
    autoShuffleFromSet = false;
    if (nextAutoShuffleSkipsAnimOut) {
      nextAutoShuffleSkipsAnimOut = false;
      handleShuffleDeck(true, false, true);
    } else {
      handleShuffleDeck(true, fromSet, false);
    }
    return;
  }
  nextAutoShuffleSkipsAnimOut = false;

  updateLiveSPM();
  applyDebugHighlight();
}

function showToast(text) {
  const toast = document.createElement('div');
  toast.className = 'bad-shuffle-toast';
  toast.innerText = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), GAME_CONFIG.TOAST_DURATION);
}

async function handleCardSelect(idx, el) {
  if (isAnimating || isGameOver) return;

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
    const sIdx = [...selected];
    const cards = sIdx.map(i => board[i]);
    const isCorrect = validateSet(cards);
    if (isCorrect) {
      collectedSets++;
      const now = Date.now();
      const findTime = now - lastSetFoundTime;
      setTimestamps.push({ time: now, findTime: findTime, possibleAtStart: currentPossible });
      trainingRecordSetIfNeeded(findTime);
      lastSetFoundTime = now;

      sIdx.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.add('anim-out'));
      await new Promise(r => setTimeout(r, GAME_CONFIG.ANIMATION_DURATION));
      if (isTrainingModeActive()) {
        selected = [];
        isAnimating = false;
        trainingHandleCorrectSet();
        return;
      }
      if (config.targetPossibleSets && deck.length >= 3) {
        const result = pickTargetedReplenishmentThree(sIdx);
        if (result && result.threeCards) {
          removeCardsFromDeck(result.threeCards);
          sIdx.forEach((slot, i) => {
            board[slot] = result.threeCards[i];
            updateSlot(slot, true);
          });
          if (config.debugMode) {
            const label = result.perfect ? 'perfect' : 'closest';
            setDebugTPSIters(result.iterations, 'replenish ' + label);
          }
        } else {
          if (config.debugMode) setDebugTPSIters(null);
          sIdx.forEach(i => {
            board[i] = deck.length > 0 ? deck.pop() : null;
            updateSlot(i, true);
          });
        }
      } else {
        if (config.debugMode) setDebugTPSIters(null);
        sIdx.forEach(i => {
          board[i] = deck.length > 0 ? deck.pop() : null;
          updateSlot(i, true);
        });
      }

      selected = [];
      isAnimating = false;

      autoShuffleFromSet = true;

      updateUI();
      if (collectedSets >= GAME_CONFIG.SETS_TO_WIN && analyzePossibleSets().total === 0 && !isGameOver) {
        setTimeout(() => handleGameFinish(true), 300);
      }
    } else {
      mistakes++;
      await new Promise(r => setTimeout(r, GAME_CONFIG.MISTAKE_DELAY));
      sIdx.forEach(i => document.getElementById('board').children[i].querySelector('.card')?.classList.remove('selected'));
      selected = [];
      isAnimating = false;
    }
  }
}

function getShuffleDurations() {
  const mod = 1 / parseFloat(config.speedMod || '1');
  return {
    fadeOutMs: Math.round(GAME_CONFIG.CARD_FADE_DURATION * mod),
    animInMs: Math.round(GAME_CONFIG.CARD_ANIM_IN_DURATION * mod)
  };
}

function handleShuffleClick() {
  const now = Date.now();
  if (now < shuffleBtnCooldownUntil) return;
  if (isAnimating || isGameOver || isBtnLocked) return;
  if (isTrainingModeActive()) return;
  const possibleCount = analyzePossibleSets().total;
  if (possibleCount > 0) {
    badShuffles++;
    updateUI();
    if (!config.showPossible && !config.autoShuffle) showToast('bad shuffle!');
    if (config.preventBadShuffle) {
      const btn = document.getElementById('shuffle-btn');
      isBtnLocked = true;
      btn.classList.add('locked');
      btn.innerText = 'nuh-uh!';
      setTimeout(() => { btn.classList.remove('locked'); btn.innerText = 'Shuffle'; isBtnLocked = false; }, GAME_CONFIG.LOCK_DURATION);
      return;
    }
  }
  const { fadeOutMs, animInMs } = getShuffleDurations();
  shuffleBtnCooldownUntil = now + fadeOutMs + animInMs;
  handleShuffleDeck(false);
}

function shuffleExistingCards() {
  if (isAnimating || isGameOver) return;
  if (isTrainingModeActive()) return;
  if (config.debugMode) setDebugTPSIters(null);
  isAnimating = true;
  shuffleExCount++;
  const shuffleRng = gameSeededRng || Math.random;
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(shuffleRng() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  selected = [];
  const slots = document.getElementById('board').children;
  for (let i = 0; i < slots.length; i++) {
    updateSlot(i, false);
    const cardEl = slots[i].querySelector('.card');
    if (cardEl) {
      cardEl.classList.add('jumping');
      cardEl.addEventListener('animationend', () => { cardEl.classList.remove('jumping'); }, { once: true });
    }
  }
  setTimeout(() => { isAnimating = false; updateUI(); }, GAME_CONFIG.SHUFFLE_DELAY);
}

function handleShuffleDeck(isAuto = false, fromSet = false, skipAnimOut = false) {
  if (isAnimating) return;
  if (isTrainingModeActive()) return;
  if (config.debugMode) setDebugTPSIters(null);

  if (isAuto && skipAnimOut) {
    isAnimating = true;
    const { animInMs } = getShuffleDurations();
    const currentCards = board.filter(c => c !== null);
    deck.push(...currentCards);
    deck.sort(() => (gameSeededRng || Math.random)() - 0.5);
    board = deck.splice(0, 12);
    if (config.targetPossibleSets) {
      const iters = runPendulumBalancing();
      if (config.debugMode && iters > 0) setDebugTPSIters(iters);
    }
    selected = [];

    for (let i = 0; i < 12; i++) updateSlot(i, true);

    setTimeout(() => {
      isAnimating = false;
      nextAutoShuffleSkipsAnimOut = true;
      updateUI();
    }, animInMs);
    return;
  }

  if (isAuto && !fromSet) {
    const currentCards = board.filter(c => c !== null);
    deck.push(...currentCards);
    deck.sort(() => (gameSeededRng || Math.random)() - 0.5);
    board = deck.splice(0, 12);
    if (config.targetPossibleSets) {
      const iters = runPendulumBalancing();
      if (config.debugMode && iters > 0) setDebugTPSIters(iters);
    }
    selected = [];

    for (let i = 0; i < 12; i++) updateSlot(i, true);

    updateUI();
    return;
  }

  if (isAuto && fromSet) {
    isAnimating = true;
    const { fadeOutMs } = getShuffleDurations();

    document.querySelectorAll('.card')
      .forEach(c => c.classList.add('anim-out'));

    setTimeout(() => {
      const currentCards = board.filter(c => c !== null);
      deck.push(...currentCards);
      deck.sort(() => (gameSeededRng || Math.random)() - 0.5);
      board = deck.splice(0, 12);
      if (config.targetPossibleSets) {
        const iters = runPendulumBalancing();
        if (config.debugMode && iters > 0) setDebugTPSIters(iters);
      }
      selected = [];

      for (let i = 0; i < 12; i++) updateSlot(i, true);

      nextAutoShuffleSkipsAnimOut = true;
      isAnimating = false;
      updateUI();
    }, fadeOutMs);

    return;
  }

  isAnimating = true;

  const { fadeOutMs } = getShuffleDurations();

  document.querySelectorAll('.card')
    .forEach(c => c.classList.add('anim-out'));

  setTimeout(() => {
    const currentCards = board.filter(c => c !== null);
    deck.push(...currentCards);
    deck.sort(() => (gameSeededRng || Math.random)() - 0.5);
    board = deck.splice(0, 12);
    if (config.targetPossibleSets) {
      const iters = runPendulumBalancing();
      if (config.debugMode && iters > 0) setDebugTPSIters(iters);
    }
    selected = [];

    for (let i = 0; i < 12; i++) updateSlot(i, true);

    isAnimating = false;
    updateUI();
  }, fadeOutMs);
}

function saveRecord(extra) {
  if (collectedSets < config.minSetsToRecord) return;
  const records = Storage.getJSON(STORAGE_KEYS.RECORDS, []);
  const rec = {
    id: Date.now(),
    sets: collectedSets,
    time: extra.elapsedMs,
    badShuffles: badShuffles,
    date: extra.dateStr,
    isSeed: config.synchronizedSeed,
    timestamps: setTimestamps,
    modifiers: { ...gameModifiers },
    extra: extra
  };
  records.push(rec);
  Storage.setJSON(STORAGE_KEYS.RECORDS, records);
}

function initNewDeckAndBoard() {
  if (config.debugMode) setDebugTPSIters(null);
  if (isTrainingModeActive()) {
    trainingInitNewBoard();
    return;
  }
  if (config.synchronizedSeed) {
    gameSeededRng = mulberry32(getSeedForFixed());
  } else {
    gameSeededRng = null;
  }
  deck = createDeck(gameSeededRng);
  board = deck.splice(0, 12);
  if (config.targetPossibleSets) {
    const iters = runPendulumBalancing();
    if (config.debugMode && iters > 0) setDebugTPSIters(iters);
  }
  selected = [];
  for (let i = 0; i < 12; i++) updateSlot(i, false);
}

function syncGameModifiers() {
  const currentMods = {
    SP: config.showPossible,
    AS: config.autoShuffle,
    PBS: config.preventBadShuffle,
    A3RD: config.autoSelectThird,
    SS: config.synchronizedSeed,
    DM: config.debugMode,
    TPS: !!(config.targetPossibleSets && config.targetPossibleSets > 0),
    TM: !!config.trainingMode
  };
  startGameModifiers = { ...currentMods };
  usedGameModifiers = { ...currentMods };
}

function resetStats() {
  collectedSets = 0; badShuffles = 0; mistakes = 0; shuffleExCount = 0;
  startTime = Date.now();
  lastSetFoundTime = startTime;
  setTimestamps = [];
  possibleHistory = [];
  trainingResetSessionRecords();

  syncGameModifiers();

  document.getElementById('timer').innerText = "00:00";
  currentExtraStats = null;
}

async function handleGameReset() {
  if (isResetting) return;

  const cooldownMs = GAME_CONFIG.MODAL_TRANSITION + GAME_CONFIG.CARD_FADE_DURATION + 10;
  const elapsed = Date.now() - lastFinishTime;

  if (lastFinishTime > 0 && elapsed < cooldownMs) {
    restartPending = true;
    return;
  }

  isResetting = true;
  restartPending = false;

  const modal = document.getElementById('result-modal');
  if (modal.classList.contains('show')) {
    await closeModal('result-modal');
  }
  if (typeof resultOpenedFrom !== 'undefined') resultOpenedFrom = null;
  isGameOver = false;
  resetStats();
  updateUI();

  isResetting = false;
}

function handleGameFinish(isAuto = false) {
  if (isGameOver) return;
  isGameOver = true;
  lastFinishTime = Date.now();
  const elapsedMs = (Date.now() - startTime);
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const platform = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'Mobile' : 'PC';

  const finalModifiers = {};
  Object.keys(startGameModifiers).forEach(key => {
    finalModifiers[key] = startGameModifiers[key] || usedGameModifiers[key];
  });

  currentExtraStats = {
    elapsedMs, dateStr, platform, isAutoFinish: isAuto,
    mistakes, shuffleExCount,
    possibleHistory: [...possibleHistory],
    timestamps: [...setTimestamps],
    modifiers: finalModifiers
  };

  lastFinishResult = {
    sets: collectedSets,
    time: elapsedMs,
    dateStr,
    isAutoFinish: isAuto,
    badShuffles: badShuffles,
    modifiers: finalModifiers
  };
  trainingFinalizeSessionIfNeeded();
  saveRecord(currentExtraStats);
  displayResults(collectedSets, badShuffles, currentExtraStats);

  if (typeof resetOnlineSubmitForNewFinish === 'function') resetOnlineSubmitForNewFinish();

  openModal('result-modal');
  setTimeout(() => {
    document.querySelectorAll('.card').forEach(c => c.classList.add('anim-out'));
    setTimeout(() => {
      initNewDeckAndBoard();
      setTimeout(() => {
        if (restartPending) handleGameReset();
      }, 50);
    }, GAME_CONFIG.CARD_FADE_DURATION);
  }, GAME_CONFIG.MODAL_TRANSITION);
}

requestAnimationFrame(runDebugFPSLoop);
