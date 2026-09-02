import { Chess, type Move } from 'chess.js'

const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
}

/** Упрощённые таблицы позиций (центр и развитие) */
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
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

const KING_PST_MID = [
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
  const c = file
  let table: number[][]
  switch (type) {
    case 'p':
      table = PAWN_PST
      break
    case 'n':
      table = KNIGHT_PST
      break
    case 'b':
      table = BISHOP_PST
      break
    case 'r':
      table = ROOK_PST
      break
    case 'q':
      table = QUEEN_PST
      break
    case 'k':
      table = KING_PST_MID
      break
    default:
      return 0
  }
  const val = table[r]?.[c] ?? 0
  return color === 'w' ? val : -val
}

function evaluate(game: Chess): number {
  if (game.isCheckmate()) {
    return game.turn() === 'w' ? -99999 : 99999
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
  score += (game.turn() === 'w' ? 1 : -1) * mobility * 2

  if (game.isCheck()) {
    score += game.turn() === 'w' ? -15 : 15
  }

  score += (Math.random() - 0.5) * 40
  return score
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function negamax(game: Chess, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || game.isGameOver()) {
    return evaluate(game)
  }

  let best = -Infinity
  const moves = shuffle(game.moves({ verbose: true }))

  for (const move of moves) {
    game.move(move)
    const score = -negamax(game, depth - 1, -beta, -alpha)
    game.undo()
    best = Math.max(best, score)
    alpha = Math.max(alpha, score)
    if (alpha >= beta) break
  }

  return best
}

function searchBestMoves(game: Chess, depth: number): Move[] {
  const moves = shuffle(game.moves({ verbose: true }))
  if (moves.length === 0) return []

  let bestScore = -Infinity
  let best: Move[] = []

  for (const move of moves) {
    game.move(move)
    const score = -negamax(game, depth - 1, -Infinity, Infinity)
    game.undo()

    if (score > bestScore + 25) {
      bestScore = score
      best = [move]
    } else if (Math.abs(score - bestScore) <= 25) {
      best.push(move)
    }
  }

  return best.length > 0 ? best : moves
}

/** Бот ~1200–1300 ELO: глубина 2, иногда ошибки и случайный выбор среди равных ходов */
export function pickBotMove(game: Chess): Move | null {
  const moves = game.moves({ verbose: true })
  if (moves.length === 0) return null

  if (Math.random() < 0.1) {
    return moves[Math.floor(Math.random() * moves.length)]
  }

  const depth = Math.random() < 0.2 ? 1 : 2
  const candidates = searchBestMoves(game, depth)
  return candidates[Math.floor(Math.random() * candidates.length)]
}
