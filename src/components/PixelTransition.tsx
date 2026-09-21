import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COVER_MS,
  REVEAL_MS,
  currentState,
  subscribe,
  type Direction,
  type Phase,
} from '../lib/pixelate';

/* ---------- the overlay ---------- */

/**
 * Roughly how wide each square is on a desktop. Smaller reads as finer grain and costs
 * more nodes.
 *
 * It is a ceiling rather than a constant because a fixed 46px is nine columns on a phone,
 * and nine columns is a chunky checkerboard wipe, not a dissolve. Targeting a column count
 * instead keeps the grain looking the same on every screen.
 */
const CELL = 46;
const MIN_CELL = 24;
const TARGET_COLS = 26;

/**
 * How long one square takes to arrive and to leave. These mirror animation-duration in
 * index.css, and the stagger below is sized from them so the last square finishes exactly
 * as the phase ends. Without that the overlay unmounts on top of squares that are still
 * mid-flight, which shows up as a scatter of dots popping out at the end of the reveal.
 */
const CELL_IN_MS = 240;
const CELL_OUT_MS = 200;
const COVER_STAGGER = COVER_MS - CELL_IN_MS;
const REVEAL_STAGGER = REVEAL_MS - CELL_OUT_MS;

/**
 * This portal's palette at one end, the Tech League's at the other.
 *
 * Each cell samples near its own place in the sweep, so the field is a colour ramp rather
 * than a wipe. The list is read forwards when crossing into the Tech League and backwards
 * when coming back, which is what keeps the cells clearing last against the destination
 * the ones that already match it. Read one way only, the return trip ended with a block of
 * black and neon green sitting on the cream portal.
 *
 * Note this is a ramp across space, not across time: the covered screen is the whole
 * spectrum at once, not the destination palette. What the direction buys is which end of
 * that spectrum is left on the page you are arriving at.
 */
const RAMP = [
  '#FBF4E4', // canvas
  '#FFDD33', // yellow
  '#8CC9FF', // sky
  '#0039A6', // gsu blue
  '#002a7a', // gsu blue dim
  '#14110D', // ink
  '#080b12', // tech league pitch
  '#111726', // tech league surface
  '#4d7cfe', // tech league blue
  '#3df07f', // tech league green
] as const;

/** `at` is the cell's place in the sweep, 0 to 1, scaled to milliseconds per phase. */
type Cell = { key: string; at: number; color: string };

export default function PixelTransition() {
  const [phase, setPhase] = useState<Phase>(currentState().phase);
  const [label, setLabel] = useState<string | null>(currentState().label);
  const [direction, setDirection] = useState<Direction>(currentState().direction);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    return subscribe((s) => {
      setDirection(s.direction);
      setPhase(s.phase);
      setLabel(s.label);
    });
  }, []);

  // Measured rather than read from CSS so the grid matches the actual viewport, including
  // after a resize mid-transition (a phone rotating, a window snapping).
  useEffect(() => {
    const measure = () => {
      window.cancelAnimationFrame(frame.current ?? 0);
      frame.current = window.requestAnimationFrame(() =>
        setSize({ w: window.innerWidth, h: window.innerHeight }),
      );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.cancelAnimationFrame(frame.current ?? 0);
    };
  }, []);

  const { cols, rows, cells } = useMemo(() => {
    if (!size.w || !size.h) return { cols: 0, rows: 0, cells: [] as Cell[] };

    const cell = Math.max(MIN_CELL, Math.min(CELL, Math.round(size.w / TARGET_COLS)));
    const c = Math.ceil(size.w / cell);
    const r = Math.ceil(size.h / cell);
    const out: Cell[] = [];

    for (let y = 0; y < r; y += 1) {
      for (let x = 0; x < c; x += 1) {
        // Progress across the sweep. The row term tilts the leading edge slightly so it
        // arrives as a diagonal, which reads as motion; a straight vertical line reads as
        // a loading bar.
        const p = (x / Math.max(1, c - 1)) * 0.85 + (y / Math.max(1, r - 1)) * 0.15;

        // Jitter breaks the edge into something pixellated instead of a clean front. It is
        // deterministic per cell, so a re-render during the transition does not reshuffle
        // every square mid-flight.
        const jitter = (((x * 73 + y * 151) % 17) / 17 - 0.5) * 0.09;
        const at = Math.max(0, Math.min(1, p + jitter));

        // Each cell samples the ramp near its own progress, with the same deterministic
        // wobble, so neighbouring squares differ a little and the field has texture.
        const spread = (((x * 31 + y * 17) % 5) - 2) * 0.06;
        const sample = Math.max(0, Math.min(1, p + spread));
        const i = Math.round(sample * (RAMP.length - 1));
        const color = RAMP[direction === 'to-portal' ? RAMP.length - 1 - i : i];

        out.push({ key: `${x}-${y}`, at, color });
      }
    }
    return { cols: c, rows: r, cells: out };
  }, [size.w, size.h, direction]);

  if (phase === 'idle' || cells.length === 0) return null;

  return (
    <div
      className={`pixelfx pixelfx-${phase}`}
      aria-hidden="true"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {cells.map((cell) => (
        <span
          key={cell.key}
          className="pixelfx-cell"
          style={{
            background: cell.color,
            // Both phases run the stagger in the same direction, so the squares leave in
            // the order they arrived and the whole thing reads as one gesture travelling
            // across the screen. Running the reveal backwards instead made the overlay
            // retreat the way it came, which reads as an undo, and it left the bright
            // cream end of the ramp sitting on the new screen the longest.
            animationDelay: `${cell.at * (phase === 'covering' ? COVER_STAGGER : REVEAL_STAGGER)}ms`,
          }}
        />
      ))}
      {/* The caption rides on its own plate. Centred bare text lands on whatever square
          happens to be under it, and on a narrow screen that includes the neon green and
          the cream ones, where green-on-green is unreadable. */}
      {label && phase === 'covering' && (
        <p className="pixelfx-label">
          <span>{label}</span>
        </p>
      )}
    </div>
  );
}
