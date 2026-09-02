'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Chess, type Square } from 'chess.js'
import Layout from '@/components/Layout'
import { auth } from '@/lib/auth'
import { pickBotMove } from '@/lib/chess-bot'
import { Crown, RotateCcw, Loader2 } from 'lucide-react'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const PIECE_CHARS: Record<string, string> = {
  wk: '♔',
  wq: '♕',
  wr: '♖',
  wb: '♗',
  wn: '♘',
  wp: '♙',
  bk: '♚',
  bq: '♛',
  br: '♜',
  bb: '♝',
  bn: '♞',
  bp: '♟',
}

type PromotionPiece = 'q' | 'r' | 'b' | 'n'

function squareLabel(file: number, rank: number): Square {
  return `${String.fromCharCode(97 + file)}${8 - rank}` as Square
}

function statusMessage(game: Chess, thinking: boolean): string {
  if (thinking) return 'Компьютер думает…'
  if (game.isCheckmate()) return game.turn() === 'w' ? 'Мат. Компьютер победил.' : 'Мат. Вы победили!'
  if (game.isStalemate()) return 'Пат — ничья.'
  if (game.isDraw()) return 'Ничья.'
  if (game.isCheck()) return game.turn() === 'w' ? 'Шах! Ваш ход.' : 'Шах компьютеру.'
  return game.turn() === 'w' ? 'Ваш ход (белые)' : 'Ход компьютера…'
}

export default function ChessPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fen, setFen] = useState(START_FEN)
  const [selected, setSelected] = useState<Square | null>(null)
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [thinking, setThinking] = useState(false)
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null)
  const botScheduled = useRef(false)

  const game = useMemo(() => new Chess(fen), [fen])

  useEffect(() => {
    void auth
      .getCurrentUser()
      .then((user) => {
        if (user?.role !== 'ADMIN') {
          router.replace('/dashboard')
          return
        }
        setAuthorized(true)
      })
      .catch(() => router.replace('/dashboard'))
      .finally(() => setLoading(false))
  }, [router])

  const legalTargets = useMemo(() => {
    if (!selected || game.turn() !== 'w' || game.isGameOver()) return new Set<string>()
    const moves = game.moves({ square: selected, verbose: true })
    return new Set(moves.map((m) => m.to))
  }, [game, selected])

  const resetGame = useCallback(() => {
    setFen(START_FEN)
    setSelected(null)
    setLastMove(null)
    setThinking(false)
    setPromotionPending(null)
    botScheduled.current = false
  }, [])

  const applyPlayerMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      const next = new Chess(fen)
      try {
        const move = next.move({ from, to, promotion: promotion ?? 'q' })
        if (!move) return false
        setFen(next.fen())
        setLastMove({ from, to })
        setSelected(null)
        setPromotionPending(null)
        return true
      } catch {
        return false
      }
    },
    [fen],
  )

  const onSquareClick = (file: number, rank: number) => {
    if (thinking || game.isGameOver() || game.turn() !== 'w') return

    const sq = squareLabel(file, rank)
    const piece = game.get(sq)

    if (selected) {
      if (sq === selected) {
        setSelected(null)
        return
      }

      const move = game.moves({ square: selected, verbose: true }).find((m) => m.to === sq)
      if (move) {
        const isPromotion =
          move.flags.includes('p') ||
          (game.get(selected)?.type === 'p' && (sq[1] === '8' || sq[1] === '1'))
        if (isPromotion) {
          setPromotionPending({ from: selected, to: sq })
          return
        }
        applyPlayerMove(selected, sq)
        return
      }

      if (piece && piece.color === 'w') {
        setSelected(sq)
        return
      }

      setSelected(null)
      return
    }

    if (piece && piece.color === 'w') {
      setSelected(sq)
    }
  }

  const confirmPromotion = (piece: PromotionPiece) => {
    if (!promotionPending) return
    applyPlayerMove(promotionPending.from, promotionPending.to, piece)
  }

  useEffect(() => {
    if (!authorized) return
    const g = new Chess(fen)
    if (g.isGameOver() || g.turn() !== 'b') {
      botScheduled.current = false
      setThinking(false)
      return
    }
    if (botScheduled.current) return

    botScheduled.current = true
    setThinking(true)

    const delay = 350 + Math.random() * 500
    const timer = window.setTimeout(() => {
      const botGame = new Chess(fen)
      const botMove = pickBotMove(botGame)
      if (botMove) {
        botGame.move(botMove)
        setFen(botGame.fen())
        setLastMove({ from: botMove.from, to: botMove.to })
      }
      setThinking(false)
      botScheduled.current = false
    }, delay)

    return () => {
      window.clearTimeout(timer)
      botScheduled.current = false
    }
  }, [fen, authorized])

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      </Layout>
    )
  }

  if (!authorized) return null

  const board = game.board()

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Crown className="h-8 w-8 text-amber-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Шахматы</h1>
              <p className="text-sm text-gray-600 mt-0.5">Вы играете белыми · сила компьютера ~1250 ELO</p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetGame}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" />
            Новая партия
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-lg p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 min-h-[28px]">
            <p className="text-sm font-medium text-gray-800">{statusMessage(game, thinking)}</p>
            {thinking && <Loader2 className="h-5 w-5 animate-spin text-primary-600" />}
          </div>

          <div className="flex justify-center">
            <div className="inline-block rounded-lg overflow-hidden border-2 border-gray-800 shadow-xl">
              {board.map((row, rank) => (
                <div key={rank} className="flex">
                  {row.map((cell, file) => {
                    const sq = squareLabel(file, rank)
                    const isLight = (rank + file) % 2 === 0
                    const isSelected = selected === sq
                    const isTarget = legalTargets.has(sq)
                    const isLast =
                      lastMove && (lastMove.from === sq || lastMove.to === sq)
                    const pieceKey = cell ? `${cell.color}${cell.type}` : null

                    return (
                      <button
                        key={sq}
                        type="button"
                        onClick={() => onSquareClick(file, rank)}
                        className={`relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 flex items-center justify-center text-2xl sm:text-3xl md:text-4xl select-none transition-colors ${
                          isLight ? 'bg-amber-100' : 'bg-amber-700'
                        } ${isSelected ? 'ring-4 ring-inset ring-primary-500' : ''} ${
                          isLast ? 'bg-primary-200/60' : ''
                        } hover:brightness-95`}
                        disabled={thinking}
                      >
                        {pieceKey ? (
                          <span
                            className={`leading-none ${
                              cell?.color === 'w' ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-gray-900'
                            }`}
                          >
                            {PIECE_CHARS[pieceKey]}
                          </span>
                        ) : null}
                        {isTarget && (
                          <span
                            className={`absolute rounded-full ${
                              cell ? 'inset-1 border-2 border-primary-500/70' : 'w-3 h-3 bg-primary-600/50'
                            }`}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 justify-center text-xs text-gray-500">
            <span>a–h</span>
            <span>·</span>
            <span>Клик: выбрать фигуру → клик по клетке для хода</span>
          </div>
        </div>
      </div>

      {promotionPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="rounded-2xl bg-white border border-gray-200 shadow-2xl p-5 w-full max-w-xs">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Превращение пешки</h2>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { piece: 'q' as const, label: '♕', name: 'Ферзь' },
                  { piece: 'r' as const, label: '♖', name: 'Ладья' },
                  { piece: 'b' as const, label: '♗', name: 'Слон' },
                  { piece: 'n' as const, label: '♘', name: 'Конь' },
                ] as const
              ).map(({ piece, label, name }) => (
                <button
                  key={piece}
                  type="button"
                  onClick={() => confirmPromotion(piece)}
                  className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 py-3 hover:bg-primary-50 hover:border-primary-300"
                >
                  <span className="text-3xl">{label}</span>
                  <span className="text-[10px] text-gray-600">{name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
