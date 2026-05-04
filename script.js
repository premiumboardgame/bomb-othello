'use strict';

const EMPTY = 0, BLACK = 1, WHITE = 2;
const SIZE = 6;
const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const AI_BOMB_TURN = 10;
const AI_BOMB_FLIP_THRESHOLD = 2;

const state = {
  board: [],
  bombCells: {},   // key: "r,c", value: BLACK or WHITE
  currentTurn: BLACK,
  playerHasBomb: true,
  aiHasBomb: true,
  moveCount: 0,
  useBombMode: false,
  gameOver: false,
};

// ── Board logic ──────────────────────────────────────────────

function initBoard() {
  const b = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  const m = SIZE / 2;
  b[m-1][m-1] = WHITE; b[m-1][m] = BLACK;
  b[m][m-1]   = BLACK; b[m][m]   = WHITE;
  return b;
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function calculateFlips(board, r, c, color) {
  const opponent = color === BLACK ? WHITE : BLACK;
  const flips = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc) && board[nr][nc] === opponent) {
      line.push([nr, nc]);
      nr += dr; nc += dc;
    }
    if (line.length && inBounds(nr, nc) && board[nr][nc] === color) {
      flips.push(...line);
    }
  }
  return flips;
}

function getValidMoves(board, color) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== EMPTY) continue;
      const flips = calculateFlips(board, r, c, color);
      if (flips.length) moves.push({ r, c, flips });
    }
  }
  return moves;
}

function countScore(board) {
  let black = 0, white = 0;
  for (const row of board) for (const v of row) {
    if (v === BLACK) black++;
    else if (v === WHITE) white++;
  }
  return { black, white };
}

// ── Move application ─────────────────────────────────────────

// Returns: null (continue), or { winner, reason }
function applyMove(r, c, isBomb) {
  const color = state.currentTurn;
  const flips = calculateFlips(state.board, r, c, color);

  // Place piece
  state.board[r][c] = color;
  if (isBomb) {
    state.bombCells[`${r},${c}`] = color;
    if (color === BLACK) state.playerHasBomb = false;
    else state.aiHasBomb = false;
  }

  // Process flips — check for bomb detonation
  const opponent = color === BLACK ? WHITE : BLACK;
  for (const [fr, fc] of flips) {
    const key = `${fr},${fc}`;
    if (key in state.bombCells) {
      if (state.bombCells[key] === opponent) {
        // Hit opponent's bomb — current player loses
        state.board[fr][fc] = color; // flip it visually first
        delete state.bombCells[key];
        applyRemainingFlips(flips, [fr, fc]);
        state.gameOver = true;
        return { winner: opponent, reason: 'bomb' };
      } else {
        // Own bomb flipped back — safe, just remove marker
        delete state.bombCells[key];
      }
    }
    state.board[fr][fc] = color;
  }

  state.moveCount++;
  return null;
}

function applyRemainingFlips(flips, exclude) {
  for (const [fr, fc] of flips) {
    if (fr === exclude[0] && fc === exclude[1]) continue;
    state.board[fr][fc] = state.currentTurn;
    const key = `${fr},${fc}`;
    if (key in state.bombCells && state.bombCells[key] !== state.currentTurn) {
      delete state.bombCells[key];
    }
  }
}

// ── Game flow ────────────────────────────────────────────────

function nextTurn() {
  state.currentTurn = state.currentTurn === BLACK ? WHITE : BLACK;
  const moves = getValidMoves(state.board, state.currentTurn);
  if (moves.length === 0) {
    // Try passing
    const other = state.currentTurn === BLACK ? WHITE : BLACK;
    const otherMoves = getValidMoves(state.board, other);
    if (otherMoves.length === 0) {
      return endByCount();
    }
    // Pass — switch back
    state.currentTurn = other;
  }
  return null;
}

function endByCount() {
  state.gameOver = true;
  const { black, white } = countScore(state.board);
  const winner = black > white ? BLACK : white > black ? WHITE : null;
  return { winner, reason: 'count' };
}

// ── AI logic ─────────────────────────────────────────────────

function aiThink() {
  const moves = getValidMoves(state.board, WHITE);
  if (moves.length === 0) return null;

  const playerBombKey = Object.entries(state.bombCells).find(([, v]) => v === BLACK)?.[0];
  const playerBombPos = playerBombKey ? playerBombKey.split(',').map(Number) : null;

  // Separate moves that step on player's bomb
  const safeMoves = playerBombPos
    ? moves.filter(m => !m.flips.some(([fr, fc]) => fr === playerBombPos[0] && fc === playerBombPos[1]))
    : moves;
  const dangerMoves = playerBombPos ? moves.filter(m => !safeMoves.includes(m)) : [];

  const pool = safeMoves.length > 0 ? safeMoves : dangerMoves;
  const maxSafeFlips = safeMoves.length > 0 ? Math.max(...safeMoves.map(m => m.flips.length)) : 0;

  // Decide whether AI should use its bomb
  const useBomb = state.aiHasBomb
    && state.moveCount >= AI_BOMB_TURN
    && maxSafeFlips <= AI_BOMB_FLIP_THRESHOLD
    && safeMoves.length > 0;

  if (useBomb) {
    const best = safeMoves.reduce((a, b) => b.flips.length > a.flips.length ? b : a);
    return { r: best.r, c: best.c, isBomb: true };
  }

  const best = pool.reduce((a, b) => b.flips.length > a.flips.length ? b : a);
  return { r: best.r, c: best.c, isBomb: false };
}

// ── UI rendering ─────────────────────────────────────────────

const boardEl   = document.getElementById('board');
const bombBtn   = document.getElementById('bomb-toggle');
const modal     = document.getElementById('modal');
const countBlackEl = document.getElementById('count-black');
const countWhiteEl = document.getElementById('count-white');
const turnEl    = document.getElementById('turn-indicator');
const scoreBlackEl = document.getElementById('score-black');
const scoreWhiteEl = document.getElementById('score-white');

function renderBoard(hintMoves) {
  const hintSet = new Set((hintMoves || []).map(m => `${m.r},${m.c}`));

  boardEl.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const key = `${r},${c}`;
      const val = state.board[r][c];

      if (val !== EMPTY) {
        const piece = document.createElement('div');
        piece.className = `piece ${val === BLACK ? 'black' : 'white'}`;
        cell.appendChild(piece);

        if (key in state.bombCells) {
          const bomb = document.createElement('span');
          bomb.className = 'bomb-marker';
          bomb.textContent = '💣';
          cell.appendChild(bomb);
        }
      } else if (hintSet.has(key) && !state.gameOver) {
        cell.classList.add('hint');
        cell.addEventListener('click', () => onCellClick(r, c));
      } else {
        cell.classList.add('no-action');
      }

      boardEl.appendChild(cell);
    }
  }
}

function updateStatus() {
  const { black, white } = countScore(state.board);
  countBlackEl.textContent = black;
  countWhiteEl.textContent = white;

  const isPlayerTurn = state.currentTurn === BLACK && !state.gameOver;
  scoreBlackEl.classList.toggle('active', isPlayerTurn);
  scoreWhiteEl.classList.toggle('active', !isPlayerTurn && !state.gameOver);
  turnEl.textContent = state.gameOver ? '終了' : (state.currentTurn === BLACK ? '黒の番' : '白の番');

  // Bomb button
  if (!state.playerHasBomb || state.gameOver || state.currentTurn !== BLACK) {
    bombBtn.classList.add('hidden');
  } else {
    bombBtn.classList.remove('hidden');
    bombBtn.classList.toggle('active', state.useBombMode);
    bombBtn.textContent = state.useBombMode ? '💣 ボムモード ON' : '💣 ボムを置く';
  }
}

function showModal(result) {
  const isPlayerWin = result.winner === BLACK;
  const isDraw = result.winner === null;

  document.getElementById('modal-icon').textContent =
    isDraw ? '🤝' : (result.reason === 'bomb' ? '💥' : (isPlayerWin ? '🏆' : '💀'));

  document.getElementById('modal-title').textContent =
    isDraw ? '引き分け' : (isPlayerWin ? 'あなたの勝ち！' : 'AIの勝ち');

  const reasons = {
    bomb: isPlayerWin ? 'AIがあなたのボムを踏みました' : 'あなたがAIのボムを踏みました',
    count: '石の枚数で決着',
  };
  document.getElementById('modal-reason').textContent = reasons[result.reason] || '';

  const { black, white } = countScore(state.board);
  document.getElementById('modal-scores').innerHTML = `
    <div class="modal-score-item">
      <span class="stone black"></span>
      <span class="count">${black}</span>
    </div>
    <div class="modal-score-item">
      <span class="stone white"></span>
      <span class="count">${white}</span>
    </div>
  `;

  modal.classList.remove('hidden');
}

// ── Game init & main loop ─────────────────────────────────────

function initGame() {
  state.board = initBoard();
  state.bombCells = {};
  state.currentTurn = BLACK;
  state.playerHasBomb = true;
  state.aiHasBomb = true;
  state.moveCount = 0;
  state.useBombMode = false;
  state.gameOver = false;
  modal.classList.add('hidden');

  const moves = getValidMoves(state.board, BLACK);
  renderBoard(moves);
  updateStatus();
}

function onCellClick(r, c) {
  if (state.gameOver || state.currentTurn !== BLACK) return;

  const isBomb = state.useBombMode && state.playerHasBomb;
  if (isBomb) state.useBombMode = false;

  const result = applyMove(r, c, isBomb);

  if (result) {
    renderBoard([]);
    updateStatus();
    setTimeout(() => showModal(result), 300);
    return;
  }

  const endResult = nextTurn();
  if (endResult) {
    renderBoard([]);
    updateStatus();
    setTimeout(() => showModal(endResult), 300);
    return;
  }

  if (state.currentTurn === WHITE) {
    renderBoard([]);
    updateStatus();
    setTimeout(runAI, 500);
  } else {
    const moves = getValidMoves(state.board, BLACK);
    renderBoard(moves);
    updateStatus();
  }
}

function runAI() {
  if (state.gameOver || state.currentTurn !== WHITE) return;

  const action = aiThink();
  if (!action) {
    const endResult = nextTurn();
    if (endResult) {
      renderBoard([]);
      updateStatus();
      setTimeout(() => showModal(endResult), 300);
    } else {
      const moves = getValidMoves(state.board, BLACK);
      renderBoard(moves);
      updateStatus();
    }
    return;
  }

  const result = applyMove(action.r, action.c, action.isBomb);

  if (result) {
    renderBoard([]);
    updateStatus();
    setTimeout(() => showModal(result), 300);
    return;
  }

  const endResult = nextTurn();
  if (endResult) {
    renderBoard([]);
    updateStatus();
    setTimeout(() => showModal(endResult), 300);
    return;
  }

  if (state.currentTurn === WHITE) {
    renderBoard([]);
    updateStatus();
    setTimeout(runAI, 500);
  } else {
    const moves = getValidMoves(state.board, BLACK);
    renderBoard(moves);
    updateStatus();
  }
}

// ── Event listeners ───────────────────────────────────────────

bombBtn.addEventListener('click', () => {
  if (!state.playerHasBomb || state.gameOver || state.currentTurn !== BLACK) return;
  state.useBombMode = !state.useBombMode;
  updateStatus();
});

document.getElementById('restart-btn').addEventListener('click', initGame);

// Start
initGame();
