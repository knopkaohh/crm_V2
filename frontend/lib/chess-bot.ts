import { Chess, type Move } from 'chess.js'

const MATE = 100000
const INF = MATE * 2

const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
}

const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [80, 80, 80, 80, 80, 80, 80, 80],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
]

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
]

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
]

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
]

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
]

const KING_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -20, -20, -20, -20, -20, -20, -20],
  [-10, -10, -10, -10, -10, -10, -10, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
]

function pstFor(type: string, color: 'w' | 'b', rank: number, file: number): number {
  const r = color === 'w' ? 7 - rank : rank
  const tables: Record<string, number[][]> = {
    p: PAWN_PST,
    n: KNIGHT_PST,
    b: BISHOP_PST,
    r: ROOK_PST,
    q: QUEEN_PST,
    k: KING_PST,
  }
  const val = tables[type]?.[r]?.[file] ?? 0
  return color === 'w' ? val : -val
}

/** Оценка с точки зрения белых (без случайного шума) */
function evaluate(game: Chess): number {
  if (game.isCheckmate()) {
    return game.turn() === 'w' ? -MATE : MATE
  }
  if (game.isDraw() || game.isStalemate()) return 0

  let score = 0
  const board = game.board()
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file]
      if (!piece) continue
      const sign = piece.color === 'w' ? 1 : -1
      score += sign * (PIECE_VALUE[piece.type] + pstFor(piece.type, piece.color, rank, file))
    }
  }

  const mobility = game.moves().length
  score += (game.turn() === 'w' ? 1 : -1) * mobility * 3

  if (game.isCheck()) {
    score += game.turn() === 'w' ? -25 : 25
  }

  return score
}

function moveScore(move: Move): number {
  let s = 0
  if (move.captured) {
    s += PIECE_VALUE[move.captured] * 10 - PIECE_VALUE[move.piece]
  }
  if (move.san.includes('+')) s += 50
  if (move.san.includes('#')) s += 10000
  return s
}

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => moveScore(b) - moveScore(a))
}

function isNoisy(move: Move): boolean {
  return Boolean(move.captured) || move.san.includes('+')
}

function quiescence(game: Chess, alpha: number, beta: number, depth: number): number {
  const standPat = evaluate(game)
  if (depth <= 0) return standPat
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat

  const moves = orderMoves(game.moves({ verbose: true })).filter(isNoisy)
  for (const move of moves) {
    game.move(move)
    const score = -quiescence(game, -beta, -alpha, depth - 1)
    game.undo()
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

function negamax(game: Chess, depth: number, alpha: number, beta: number): number {
  if (game.isGameOver()) return evaluate(game)
  if (depth === 0) return quiescence(game, alpha, beta, 5)

  let best = -INF
  const moves = orderMoves(game.moves({ verbose: true }))

  for (const move of moves) {
    game.move(move)
    const score = -negamax(game, depth - 1, -beta, -alpha)
    game.undo()
    best = Math.max(best, score)
    alpha = Math.max(alpha, score)
    if (alpha >= beta) break
  }

  return best === -INF ? evaluate(game) : best
}

interface ScoredMove {
  move: Move
  score: number
}

function scoreRootMoves(game: Chess, depth: number): ScoredMove[] {
  const moves = orderMoves(game.moves({ verbose: true }))
  const scored: ScoredMove[] = []

  for (const move of moves) {
    game.move(move)
    const score = -negamax(game, depth - 1, -INF, INF)
    game.undo()
    scored.push({ move, score })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored
}

/**
 * Бот ~1200–1250 ELO: поиск глубина 3 + quiescence,
 * редкие неточности на корне (не случайные ходы).
 */
export function pickBotMove(game: Chess): Move | null {
  const moves = game.moves({ verbose: true })
  if (moves.length === 0) return null

  const depth = game.moveNumber() <= 8 ? 3 : 4
  const scored = scoreRootMoves(game, depth)
  if (scored.length === 0) return null

  const best = scored[0].score
  const top = scored.filter((s) => s.score >= best - 35)
  const decent = scored.filter((s) => s.score >= best - 90)

  const roll = Math.random()

  // ~3% — заметная ошибка (не лучший ход, но не заведомо проигрышный)
  if (roll < 0.03 && decent.length > 2) {
    const pool = decent.slice(Math.min(2, decent.length - 1))
    return pool[Math.floor(Math.random() * pool.length)].move
  }

  // ~12% — второй/третий по силе ход в пределах окна
  if (roll < 0.15 && top.length > 1) {
    return top[1 + Math.floor(Math.random() * Math.min(2, top.length - 1))].move
  }

  // Обычно лучший или один из топ-2 близких
  return top[Math.floor(Math.random() * Math.min(2, top.length))].move
}
