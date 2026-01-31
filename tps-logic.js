/**
 * =============================================================================
 * TPS (Target Possible Sets) Modifier Logic
 * =============================================================================
 *
 * When the user sets "Target Possible Sets: X" in Advanced settings (X > 0),
 * board generation and card replenishment are steered so that the number of
 * possible sets on the 12-card board stays close to X. All of this runs in
 * game state only; the UI just displays the final board.
 *
 * -----------------------------------------------------------------------------
 * 1. PENDULUM BALANCING (runPendulumBalancing)
 * -----------------------------------------------------------------------------
 * Used when a full 12-card board is created: game start or any Shuffle.
 *
 * - Start with 12 random cards from the deck.
 * - Loop up to 50 times. Each iteration:
 *   - Count current sets on the board (S).
 *   - If S === X, done; return iteration count.
 *   - If S < X (Build): pick two random board positions (i, j), compute the
 *     complementary card that would form a set with board[i] and board[j].
 *     If that card is in the deck, pick a third position k (k ≠ i, j) that
 *     participates in the fewest current sets (to avoid breaking sets when
 *     we swap). Swap board[k] with that card (old board[k] goes back to deck).
 *   - If S > X (Destroy): pick a random set on the board, pick a random card
 *     k in that set, swap board[k] with a random card from the deck.
 * - If 50 iterations pass without S === X, return 50 (caller keeps current
 *   board as best approximation).
 *
 * -----------------------------------------------------------------------------
 * 2. TARGETED REPLENISHMENT (pickTargetedReplenishmentThree)
 * -----------------------------------------------------------------------------
 * Used after the player collects a set: 3 cards are removed and 3 new ones
 * must be drawn. Instead of blindly popping from the deck, we search for a
 * triple that yields exactly X sets on the resulting 12-card board.
 *
 * - Input: emptySlots = [i, j, k], the three indices that will receive new cards.
 * - Loop up to 100 times. Each iteration:
 *   - With 50% probability use a "guided" draw: pick a random pair from the
 *     9 remaining board positions, compute the complementary card (so it forms
 *     a set with that pair). If that card is in the deck, use it as the first
 *     of the 3 new cards; the other two are random from the deck. Otherwise
 *     fall back to three random cards.
 *   - With 50% probability pick three fully random cards from the deck.
 *   - Build a candidate 12-card board: the 9 unchanged cards plus the 3 new
 *     ones in emptySlots. Count sets (S_total).
 *   - If S_total === X, return { threeCards, iterations, perfect: true }.
 *   - Else track the triple that minimizes |S_total - X|.
 * - After 100 iterations, return the best triple found with perfect: false.
 *
 * The caller (game-logic.js) then removes those 3 cards from the deck and
 * assigns them to the empty slots. If deck has fewer than 3 cards, TPS is
 * skipped and normal pop logic is used.
 *
 * -----------------------------------------------------------------------------
 * 3. HELPERS
 * -----------------------------------------------------------------------------
 * - removeCardsFromDeck(threeCards): removes the given card objects from the
 *   global deck (by value match), so the deck stays consistent.
 *
 * -----------------------------------------------------------------------------
 * Dependencies
 * -----------------------------------------------------------------------------
 * - Globals: config (config.targetSetX), board, deck (state.js).
 * - set-math.js: getComplementaryCard, findCardInDeck, getPossibleSetsIndices,
 *   getPossibleSetsIndicesForBoard.
 */

function pickTargetedReplenishmentThree(emptySlots) {
  const X = config.targetSetX;
  if (!X || deck.length < 3) return null;
  const MAX_ITER = 100;
  const boardIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(i => !emptySlots.includes(i));
  let best = { diff: Infinity, threeCards: null };
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let c0, c1, c2;
    if (Math.random() < 0.5 && boardIndices.length >= 2) {
      const i = boardIndices[Math.floor(Math.random() * boardIndices.length)];
      let j = boardIndices[Math.floor(Math.random() * boardIndices.length)];
      while (j === i) j = boardIndices[Math.floor(Math.random() * boardIndices.length)];
      const needed = getComplementaryCard(board[i], board[j]);
      const needIdx = findCardInDeck(deck, needed);
      if (needIdx !== -1) {
        c0 = deck[needIdx];
        const others = deck.filter((_, idx) => idx !== needIdx);
        const r1 = Math.floor(Math.random() * others.length);
        c1 = others[r1];
        const r2 = Math.floor(Math.random() * (others.length - 1));
        c2 = others[r2 >= r1 ? r2 + 1 : r2];
      } else {
        c0 = deck[Math.floor(Math.random() * deck.length)];
        let idx1 = Math.floor(Math.random() * deck.length);
        let idx2 = Math.floor(Math.random() * deck.length);
        while (idx1 === deck.indexOf(c0)) idx1 = Math.floor(Math.random() * deck.length);
        while (idx2 === deck.indexOf(c0) || idx2 === idx1) idx2 = Math.floor(Math.random() * deck.length);
        c1 = deck[idx1];
        c2 = deck[idx2];
      }
    } else {
      const idx0 = Math.floor(Math.random() * deck.length);
      let idx1 = Math.floor(Math.random() * deck.length);
      let idx2 = Math.floor(Math.random() * deck.length);
      while (idx1 === idx0) idx1 = Math.floor(Math.random() * deck.length);
      while (idx2 === idx0 || idx2 === idx1) idx2 = Math.floor(Math.random() * deck.length);
      c0 = deck[idx0];
      c1 = deck[idx1];
      c2 = deck[idx2];
    }
    const candidateBoard = [];
    let newIdx = 0;
    for (let pos = 0; pos < 12; pos++) {
      if (emptySlots.includes(pos)) {
        candidateBoard[pos] = [c0, c1, c2][newIdx++];
      } else {
        candidateBoard[pos] = board[pos];
      }
    }
    const S_total = getPossibleSetsIndicesForBoard(candidateBoard).length;
    const diff = Math.abs(S_total - X);
    if (diff === 0) {
      return { threeCards: [c0, c1, c2], iterations: iter + 1, perfect: true };
    }
    if (diff < best.diff) {
      best = { diff, threeCards: [c0, c1, c2] };
    }
  }
  return { threeCards: best.threeCards, iterations: MAX_ITER, perfect: false };
}

function removeCardsFromDeck(threeCards) {
  for (const card of threeCards) {
    const idx = findCardInDeck(deck, card);
    if (idx !== -1) deck.splice(idx, 1);
  }
}

function runPendulumBalancing() {
  const X = config.targetSetX;
  if (!X || X <= 0) return 0;
  const MAX_ITER = 50;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const sets = getPossibleSetsIndices();
    const S = sets.length;
    if (S === X) return iter + 1;
    if (S < X) {
      const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      let i = indices[Math.floor(Math.random() * 12)];
      let j = indices[Math.floor(Math.random() * 12)];
      if (i === j) continue;
      const needed = getComplementaryCard(board[i], board[j]);
      const deckIdx = findCardInDeck(deck, needed);
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
      const oldK = board[k];
      board[k] = deck.splice(deckIdx, 1)[0];
      deck.push(oldK);
    } else {
      const setList = getPossibleSetsIndices();
      const oneSet = setList[Math.floor(Math.random() * setList.length)];
      const k = oneSet[Math.floor(Math.random() * 3)];
      const deckIdx = Math.floor(Math.random() * deck.length);
      const oldK = board[k];
      board[k] = deck[deckIdx];
      deck[deckIdx] = oldK;
    }
  }
  return MAX_ITER;
}
