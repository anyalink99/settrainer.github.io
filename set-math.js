function analyzePossibleSets() {
  let stats = { total: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < board.length; i++) {
    for (let j = i + 1; j < board.length; j++) {
      for (let k = j + 1; k < board.length; k++) {
        if (board[i] && board[j] && board[k]) {
          let diffCount = 0;
          let isSet = true;
          ['c', 's', 'f', 'n'].forEach(p => {
            if ((board[i][p] + board[j][p] + board[k][p]) % 3 !== 0) isSet = false;
            if (board[i][p] !== board[j][p]) diffCount++;
          });
          if (isSet) { stats.total++; stats[diffCount]++; }
        }
      }
    }
  }
  return stats;
}

function getPossibleSetsIndices() {
  const out = [];
  for (let i = 0; i < board.length; i++) {
    for (let j = i + 1; j < board.length; j++) {
      for (let k = j + 1; k < board.length; k++) {
        if (board[i] && board[j] && board[k] && validateSet([board[i], board[j], board[k]])) {
          out.push([i, j, k]);
        }
      }
    }
  }
  return out;
}

function getComplementaryCard(cardA, cardB) {
  const result = {};
  ['c', 's', 'f', 'n'].forEach(p => {
    result[p] = (3 - ((cardA[p] + cardB[p]) % 3)) % 3;
  });
  return result;
}

function getPossibleSetsIndicesForBoard(boardArr) {
  const out = [];
  for (let i = 0; i < boardArr.length; i++) {
    for (let j = i + 1; j < boardArr.length; j++) {
      for (let k = j + 1; k < boardArr.length; k++) {
        if (boardArr[i] && boardArr[j] && boardArr[k] && validateSet([boardArr[i], boardArr[j], boardArr[k]])) {
          out.push([i, j, k]);
        }
      }
    }
  }
  return out;
}

function findCardInDeck(deckArr, card) {
  for (let idx = 0; idx < deckArr.length; idx++) {
    if (deckArr[idx].c === card.c && deckArr[idx].s === card.s && deckArr[idx].f === card.f && deckArr[idx].n === card.n) {
      return idx;
    }
  }
  return -1;
}

function getSetCountForCardArray(cardArray) {
  let count = 0;
  for (let i = 0; i < cardArray.length; i++) {
    for (let j = i + 1; j < cardArray.length; j++) {
      for (let k = j + 1; k < cardArray.length; k++) {
        if (cardArray[i] && cardArray[j] && cardArray[k] && validateSet([cardArray[i], cardArray[j], cardArray[k]])) {
          count++;
        }
      }
    }
  }
  return count;
}
