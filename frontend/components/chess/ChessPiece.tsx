/** SVG-фигуры в духе Lichess / Cburnett */
export function ChessPiece({ color, type }: { color: 'w' | 'b'; type: string }) {
  const fill = color === 'w' ? '#fff' : '#212121'
  const stroke = color === 'w' ? '#212121' : '#f0f0f0'

  const paths: Record<string, string> = {
    p: 'M19 36c-8 0-12-4-12-8 0-4 3-7 8-8l3-9h6l3 9c5 1 8 4 8 8 0 4-4 8-12 8zm-2-17c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5z',
    r: 'M9 36h22v-3H9v3zm2-4h18v-4H11v4zm-1-5V19h3v-2h12v2h3v8H10zm2-9h14v-3H12v3z',
    n: 'M22 36c-1 0-2-1-2-2v-2h-4v2c0 1-1 2-2 2H8c-1 0-2-1-2-2v-2l3-9c1-3 4-5 7-5h4c3 0 6 2 7 5l3 9v2c0 1-1 2-2 2h-6zm-6-14c-2 0-3 1-4 3l-2 6h12l-2-6c-1-2-2-3-4-3z',
    b: 'M20 36c-1 0-2-1-2-2v-2h-4v2c0 1-1 2-2 2h-8c-1 0-2-1-2-2v-2l2-8c0-4 4-7 8-7s8 3 8 7l2 8v2c0 1-1 2-2 2h-8zm-4-14c-2 0-4 2-4 4s2 4 4 4 4-2 4-4-2-4-4-4zm0-6c-1 0-2-1-2-2s1-2 2-2 2 1 2 2-1 2-2 2z',
    q: 'M12 36h16v-3H12v3zm1-4h14l-1-4h-2l-1 3h-2l-1-3h-2l-1 4zm-1-6l2-9c1-3 4-5 7-5s6 2 7 5l2 9H12zm3-9c0-1 1-2 2-2s2 1 2 2-1 2-2 2-2-1-2-2zm8 0c0-1 1-2 2-2s2 1 2 2-1 2-2 2-2-1-2-2z',
    k: 'M20 36c-1 0-2-1-2-2v-2h-2v2c0 1-1 2-2 2h-4c-1 0-2-1-2-2v-2h-2v2c0 1-1 2-2 2h-4c-1 0-2-1-2-2v-2l2-10h4v-4h-2v-2h4V8h-2V6h4V4h-4v2h-2v2h4v4h-4v2h4l2 10v2c0 1-1 2-2 2h-4z',
  }

  const d = paths[type]
  if (!d) return null

  return (
    <svg viewBox="0 0 40 40" className="w-[85%] h-[85%] drop-shadow-sm" aria-hidden>
      <path d={d} fill={fill} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}
