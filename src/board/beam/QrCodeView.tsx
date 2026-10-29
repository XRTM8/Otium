import React, { useMemo } from 'react';

interface QrCodeViewProps {
  value: string;
  size?: number;
}

/**
 * Generates an SVG QR-like visual matrix deterministically from string value.
 * Standard 21x21 matrix layout with standard corner finder patterns.
 */
export const QrCodeView: React.FC<QrCodeViewProps> = ({ value, size = 160 }) => {
  const matrix = useMemo(() => {
    const N = 21;
    const grid: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));

    // Helper to draw finder pattern (7x7)
    const drawFinder = (startX: number, startY: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (
            r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            grid[startY + r][startX + c] = true;
          }
        }
      }
    };

    // Draw 3 corner finder patterns
    drawFinder(0, 0);
    drawFinder(N - 7, 0);
    drawFinder(0, N - 7);

    // Timing lines
    for (let i = 8; i < N - 8; i++) {
      grid[6][i] = i % 2 === 0;
      grid[i][6] = i % 2 === 0;
    }

    // Deterministic payload fill based on string hash
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    let seed = Math.abs(hash);
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        // Skip finder patterns
        const inFinderTopLeft = r < 8 && c < 8;
        const inFinderTopRight = r < 8 && c >= N - 8;
        const inFinderBottomLeft = r >= N - 8 && c < 8;
        const inTiming = r === 6 || c === 6;

        if (!inFinderTopLeft && !inFinderTopRight && !inFinderBottomLeft && !inTiming) {
          grid[r][c] = pseudoRandom() > 0.48;
        }
      }
    }

    return grid;
  }, [value]);

  const N = matrix.length;
  const cellSize = size / N;

  return (
    <div
      style={{ width: `${size}px`, height: `${size}px` }}
      className="p-2.5 bg-white rounded-2xl shadow-md border border-slate-200 flex items-center justify-center select-none"
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="shape-rendering-crispEdges"
      >
        <rect width={size} height={size} fill="#ffffff" />
        {matrix.map((row, r) =>
          row.map((cell, c) => {
            if (!cell) return null;
            return (
              <rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize}
                height={cellSize}
                fill="#0f172a"
              />
            );
          })
        )}
      </svg>
    </div>
  );
};
