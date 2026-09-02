'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { Chess, type Square } from 'chess.js'
import Layout from '@/components/Layout'
import { auth } from '@/lib/auth'
import { pickBotMove } from '@/lib/chess-bot'
import { ChessPiece } from '@/components/chess/ChessPiece'
import { Crown, RotateCcw, Loader2 } from 'lucide-react'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const LIGHT = '#f0d9b5'
const DARK = '#b58863'
const LAST_MOVE = 'rgba(155, 199, 0, 0.43)'
const SELECTED = 'rgba(20, 85, 30, 0.55)'
const CHECK = 'rgba(255, 0, 0, 0.55)'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

type PromotionPiece = 'q' | 'r' | 'b' | 'n'

function squareLabel(file: number, rank: number): Square {
  return `${String.fromCharCode(97 + file)}${8 - rank}` as Square
}

function findKingSquare(game: Chess, color: 'w' | 'b'): Square | null {
  const board = game.board()
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const p = board[rank][file]
      if (p?.type === 'k' && p.color === color) {
        return squareLabel(file, rank)
      }
    }
  }
  return null
}

function statusMessage(game: Chess, thinking: boolean): string {
  if (thinking) return 'Компьютер думает…'
  if (game.isCheckmate()) return game.turn() === 'w' ? 'Мат. Компьютер победил.' : 'Мат. Вы победили!'
  if (game.isStalemate()) return 'Пат — ничья.'
  if (game.isDraw()) return 'Ничья.'
  if (game.isCheck()) return game.turn() === 'w' ? 'Шах! Ваш ход.' : 'Шах компьютеру.'
  return game.turn() === 'w' ? 'Ваш ход' : 'Ход компьютера'
}

function squareStyle(
  isLight: boolean,
  opts: { selected: boolean; last: boolean; check: boolean },
): CSSProperties {
  let bg = isLight ? LIGHT : DARK
  if (opts.last) bg = LAST_MOVE
  if (opts.selected) bg = SELECTED
  if (opts.check) bg = CHECK
  return { backgroundColor: bg }
}

function PlayerBar({
  name,
  subtitle,
  active,
  isWhite,
}: {
  name: string
  subtitle?: string
  active: boolean
  isWhite: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
        active ? 'bg-white/10' : 'bg-transparent'
      }`}
    >
      <div
        className={`h-4 w-4 rounded-sm border border-white/30 shrink-0 ${
          isWhite ? 'bg-[#f0f0f0]' : 'bg-[#1a1a1a]'
        }`}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#e8e4e0] truncate">{name}</p>
        {subtitle ? <p className="text-xs text-[#a8a4a0]">{subtitle}</p> : null}
      </div>
      {active && <span className="ml-auto h-2 w-2 rounded-full bg-[#7fa650] animate-pulse" />}
    </div>
  )
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
  const moveHistory = useMemo(() => game.history(), [game])
  const checkSquare =
    game.isCheck() ? findKingSquare(game, game.turn()) : null

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
        if (move.flags.includes('p') || (game.get(selected)?.type === 'p' && sq[1] === '8')) {
          setPromotionPending({ from: selected, to: sq })
          return
        }
        applyPlayerMove(selected, sq)
        return
      }

      if (piece?.color === 'w') {
        setSelected(sq)
        return
      }

      setSelected(null)
      return
    }

    if (piece?.color === 'w') {
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

    const delay = 500 + Math.random() * 700
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
  const cellSize = 'min(11vw, 52px)'

  const formattedMoves: string[] = []
  for (let i = 0; i < moveHistory.length; i += 2) {
    const num = Math.floor(i / 2) + 1
    const white = moveHistory[i]
    const black = moveHistory[i + 1]
    formattedMoves.push(black ? `${num}. ${white} ${black}` : `${num}. ${white}`)
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Crown className="h-7 w-7 text-amber-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Шахматы</h1>
              <p className="text-sm text-gray-500">Белые · против компьютера (~1250)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetGame}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#312e2b] text-sm font-medium text-[#e8e4e0] hover:bg-[#3d3a37]"
          >
            <RotateCcw className="h-4 w-4" />
            Новая партия
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 items-start justify-center">
          <div className="w-full lg:flex-1 max-w-[min(100%,480px)] mx-auto lg:mx-0">
            <div className="rounded-lg overflow-hidden shadow-2xl bg-[#262421] p-2 sm:p-3">
              <PlayerBar
                name="Компьютер"
                subtitle="~1250 ELO"
                active={game.turn() === 'b' && !game.isGameOver()}
                isWhite={false}
              />

              <div className="flex justify-center my-1">
                <div className="inline-flex flex-col">
                  <div className="flex">
                    <div style={{ width: 18 }} />
                    <div className="flex">
                      {FILES.map((f) => (
                        <div
                          key={f}
                          style={{ width: cellSize, height: 16 }}
                          className="flex items-end justify-center text-[10px] text-[#a8a4a0] font-medium"
                        >
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex">
                    <div className="flex flex-col">
                      {RANKS.map((r) => (
                        <div
                          key={r}
                          style={{ width: 18, height: cellSize }}
                          className="flex items-center justify-end pr-1 text-[10px] text-[#a8a4a0] font-medium"
                        >
                          {r}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-sm overflow-hidden border border-[#1a1816]">
                      {board.map((row, rank) => (
                        <div key={rank} className="flex">
                          {row.map((cell, file) => {
                            const sq = squareLabel(file, rank)
                            const isLight = (rank + file) % 2 === 0
                            const isSelected = selected === sq
                            const isLast =
                              Boolean(lastMove) &&
                              (lastMove!.from === sq || lastMove!.to === sq)
                            const isCheck = checkSquare === sq
                            const isTarget = legalTargets.has(sq)

                            return (
                              <button
                                key={sq}
                                type="button"
                                onClick={() => onSquareClick(file, rank)}
                                disabled={thinking}
                                style={{
                                  width: cellSize,
                                  height: cellSize,
                                  ...squareStyle(isLight, {
                                    selected: isSelected,
                                    last: isLast && !isSelected,
                                    check: isCheck,
                                  }),
                                }}
                                className="relative flex items-center justify-center select-none touch-manipulation"
                              >
                                {cell ? (
                                  <ChessPiece color={cell.color} type={cell.type} />
                                ) : null}
                                {isTarget && (
                                  <span
                                    className={`absolute rounded-full pointer-events-none ${
                                      cell
                                        ? 'inset-[12%] border-[3px] border-black/25'
                                        : 'w-[28%] h-[28%] bg-black/20'
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

                  <div className="flex">
                    <div style={{ width: 18 }} />
                    <div className="flex">
                      {FILES.map((f) => (
                        <div
                          key={`b-${f}`}
                          style={{ width: cellSize, height: 16 }}
                          className="flex items-start justify-center text-[10px] text-[#a8a4a0] font-medium"
                        >
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <PlayerBar
                name="Вы"
                subtitle="Белые"
                active={game.turn() === 'w' && !game.isGameOver()}
                isWhite
              />
            </div>

            <div className="mt-3 flex items-center gap-2 min-h-[24px] px-1">
              <p className="text-sm text-gray-700">{statusMessage(game, thinking)}</p>
              {thinking && <Loader2 className="h-4 w-4 animate-spin text-[#7fa650]" />}
            </div>
          </div>

          <div className="w-full lg:w-56 shrink-0 rounded-lg bg-[#262421] text-[#e8e4e0] shadow-lg overflow-hidden mx-auto lg:mx-0">
            <div className="px-3 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wide text-[#a8a4a0]">
              Ходы
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2 font-mono text-sm leading-relaxed">
              {formattedMoves.length === 0 ? (
                <p className="text-[#6d6a67] text-xs px-1">Партия не начата</p>
              ) : (
                formattedMoves.map((line, i) => (
                  <div key={i} className="px-1 py-0.5 hover:bg-white/5 rounded">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {promotionPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="rounded-lg bg-[#262421] border border-white/10 shadow-2xl p-5 w-full max-w-sm">
            <h2 className="text-base font-semibold text-[#e8e4e0] mb-4">Превращение пешки</h2>
            <div className="grid grid-cols-4 gap-2">
              {(['q', 'r', 'b', 'n'] as const).map((piece) => (
                <button
                  key={piece}
                  type="button"
                  onClick={() => confirmPromotion(piece)}
                  className="flex items-center justify-center aspect-square rounded-md bg-[#312e2b] hover:bg-[#3d3a37] border border-white/10"
                >
                  <div className="w-10 h-10">
                    <ChessPiece color="w" type={piece} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
