// src/components/ui/CILogo.tsx
// 6-petal pinwheel — petals bloom out from a center dot on mount
// Usage: <CILogo size={40} animate />
// animate=true plays the bloom once on mount; false = static

'use client'

import { useEffect, useState } from 'react'

interface CILogoProps {
  size?: number
  animate?: boolean
}

export default function CILogo({ size = 40, animate = false }: CILogoProps) {
  const [bloomed, setBloomed] = useState(!animate)

  useEffect(() => {
    if (!animate) return
    // Short delay so the animation feels intentional, not instant
    const t = setTimeout(() => setBloomed(true), 120)
    return () => clearTimeout(t)
  }, [animate])

  const cx = 50
  const cy = 50
  const lightBlue = '#4AAFF7'
  const darkBlue  = '#1A6FBF'

  // Each petal: teardrop pointing "up" from center, then rotated into position
  // The shape: starts at center point, curves out into a round tip, comes back
  const petalPath = `M${cx},${cy} C${cx - 7},${cy - 8} ${cx - 6},${cy - 22} ${cx},${cy - 26} C${cx + 6},${cy - 22} ${cx + 7},${cy - 8} ${cx},${cy}Z`

  const angles = [0, 60, 120, 180, 240, 300]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <style>{`
        @keyframes petalBloom {
          0%   { transform-origin: 50px 50px; transform: rotate(var(--r)) scale(0); opacity: 0; }
          60%  { transform-origin: 50px 50px; transform: rotate(var(--r)) scale(1.15); opacity: 1; }
          100% { transform-origin: 50px 50px; transform: rotate(var(--r)) scale(1); opacity: 1; }
        }
        @keyframes petalStatic {
          0%   { transform-origin: 50px 50px; transform: rotate(var(--r)) scale(1); }
          100% { transform-origin: 50px 50px; transform: rotate(var(--r)) scale(1); }
        }
        .ci-petal {
          transform-origin: 50px 50px;
        }
      `}</style>

      {angles.map((angle, i) => (
        <path
          key={angle}
          className="ci-petal"
          d={petalPath}
          fill={i % 2 === 0 ? lightBlue : darkBlue}
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${angle}deg)`,
            ...(bloomed ? {} : { transform: `rotate(${angle}deg) scale(0)`, opacity: 0 }),
            transition: bloomed
              ? `transform 0.45s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.06}s,
                 opacity 0.25s ease ${i * 0.06}s`
              : 'none',
          }}
        />
      ))}

      {/* Center dot — always visible, gives the "origin" feel */}
      <circle cx={cx} cy={cy} r="3.5" fill={lightBlue} opacity="0.9" />
    </svg>
  )
}