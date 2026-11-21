/**
 * Ziggy, Temporal's tardigrade mascot, in a spacesuit with a glass bubble
 * helmet, two little antennae and a jetpack.
 *
 * This file is the ONLY place Ziggy is drawn. To swap in official mascot art,
 * replace the SVG below but keep:
 *   - the viewBox size (ZIGGY_VIEWBOX) and the hand position (ZIGGY_HAND), which
 *     the flight code uses to land Ziggy's finger exactly on a button;
 *   - the class names on the animatable groups (zg-bob, zg-ant-l/r, zg-eyes,
 *     zg-arm-front, zg-arm-back, zg-flame), which screensaver.css animates.
 * A flat PNG works too: drop the groups, and the pose/tap motion falls back to
 * the whole-body flight and tilt.
 *
 * Ziggy faces right; the flight code mirrors the wrapper to face left.
 */

export type ZiggyPose = 'fly' | 'point' | 'tap' | 'grab' | 'wave' | 'cheer'
export type ZiggyMood = 'happy' | 'calm' | 'wow'

export const ZIGGY_VIEWBOX = { w: 240, h: 280 }
/** Fingertip (point/tap) position in viewBox units, front arm extended. */
export const ZIGGY_HAND = { x: 230, y: 174 }
/** Center of the gloved fist (grab pose), viewBox units. */
export const ZIGGY_FIST = { x: 211, y: 177 }

export function Ziggy({
  pose = 'fly',
  mood = 'happy',
  className = '',
}: {
  pose?: ZiggyPose
  mood?: ZiggyMood
  className?: string
}) {
  return (
    <svg
      viewBox={`0 0 ${ZIGGY_VIEWBOX.w} ${ZIGGY_VIEWBOX.h}`}
      className={`zg ${className}`}
      data-pose={pose}
      data-mood={mood}
      aria-label="Ziggy the tardigrade in a spacesuit"
      role="img"
    >
      <defs>
        <radialGradient id="zg-suit" cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#e9e6f7" />
          <stop offset="1" stopColor="#b9b3d6" />
        </radialGradient>
        <radialGradient id="zg-face" cx="42%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fbe3cc" />
          <stop offset="0.7" stopColor="#f0c4a2" />
          <stop offset="1" stopColor="#dca07e" />
        </radialGradient>
        <radialGradient id="zg-glass" cx="38%" cy="30%" r="72%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="0.7" stopColor="#9cc8ff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#7fb2ff" stopOpacity="0.42" />
        </radialGradient>
        <radialGradient id="zg-inside" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#3b5ea8" stopOpacity="0.55" />
          <stop offset="0.8" stopColor="#5f8ee0" stopOpacity="0.5" />
          <stop offset="1" stopColor="#a9c8ff" stopOpacity="0.65" />
        </radialGradient>
        <linearGradient id="zg-tank" x1="0" x2="1">
          <stop offset="0" stopColor="#6f6a8c" />
          <stop offset="0.45" stopColor="#c9c5df" />
          <stop offset="1" stopColor="#7d7896" />
        </linearGradient>
        <linearGradient id="zg-boot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b98cff" />
          <stop offset="1" stopColor="#7a55d6" />
        </linearGradient>
        <linearGradient id="zg-fire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="0.25" stopColor="#ffcc66" />
          <stop offset="0.65" stopColor="#ff9c38" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ff5555" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="zg-glow-sky">
          <stop offset="0" stopColor="#bfeaff" />
          <stop offset="0.45" stopColor="#66ccff" />
          <stop offset="1" stopColor="#66ccff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="zg-glow-orange">
          <stop offset="0" stopColor="#ffe2b8" />
          <stop offset="0.45" stopColor="#ff9c38" />
          <stop offset="1" stopColor="#ff9c38" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className="zg-bob">
        {/* Thruster flames (behind everything) */}
        <g className="zg-flames">
          {[67, 173].map((x) => (
            <g key={x} transform={`translate(${x} 230)`}>
              <g className="zg-flame">
                <path d="M-9 0 Q-11 22 0 46 Q11 22 9 0 Z" fill="url(#zg-fire)" />
                <path d="M-4 0 Q-5 12 0 24 Q5 12 4 0 Z" fill="#fffbe6" opacity="0.9" />
              </g>
            </g>
          ))}
        </g>

        {/* Jetpack tanks */}
        {[56, 162].map((x) => (
          <g key={x}>
            <rect x={x} y="156" width="22" height="66" rx="10" fill="url(#zg-tank)" stroke="#4a4466" strokeWidth="2" />
            <rect x={x} y="176" width="22" height="7" fill="#ff9c38" />
            <path d={`M${x + 3} 222 h16 l3 9 h-22 z`} fill="#4a4466" />
          </g>
        ))}

        {/* Four stubby tardigrade legs in boots */}
        {[88, 108, 132, 152].map((x, i) => (
          <g key={x}>
            <ellipse cx={x} cy={236 - (i === 1 || i === 2 ? 2 : 0)} rx="12" ry="14" fill="url(#zg-boot)" stroke="#4b2f99" strokeWidth="2" />
            <path d={`M${x - 7} 246 q7 5 14 0`} stroke="#ffcc66" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        ))}

        {/* Back arm (waves) */}
        <g className="zg-arm-back">
          <path d="M76 180 Q60 196 56 214" stroke="#cfcbe6" strokeWidth="21" strokeLinecap="round" fill="none" />
          <path d="M76 180 Q60 196 56 214" stroke="url(#zg-suit)" strokeWidth="17" strokeLinecap="round" fill="none" />
          <rect x="49" y="203" width="16" height="6" rx="3" fill="#ff9c38" transform="rotate(-20 57 206)" />
          <circle cx="54" cy="220" r="11" fill="#9977ff" stroke="#4b2f99" strokeWidth="2" />
        </g>

        {/* Torso: chubby suit */}
        <ellipse cx="120" cy="196" rx="54" ry="46" fill="url(#zg-suit)" stroke="#8f88b3" strokeWidth="2.5" />
        <path d="M70 214 Q120 236 170 214" stroke="#ff9c38" strokeWidth="6" fill="none" strokeLinecap="round" />
        <rect x="113" y="220" width="14" height="10" rx="3" fill="#ffcc66" stroke="#b37a1e" strokeWidth="1.5" />
        {/* Chest control panel */}
        <rect x="98" y="176" width="44" height="28" rx="6" fill="#141024" stroke="#5e5578" strokeWidth="2" />
        <circle className="zg-led zg-led-1" cx="108" cy="185" r="3.4" fill="#66ccff" />
        <circle className="zg-led zg-led-2" cx="120" cy="185" r="3.4" fill="#ffcc66" />
        <circle className="zg-led zg-led-3" cx="132" cy="185" r="3.4" fill="#ff8899" />
        <rect x="104" y="194" width="32" height="4" rx="2" fill="#66dd99" opacity="0.85" />

        {/* Collar ring */}
        <ellipse cx="120" cy="152" rx="47" ry="12" fill="#7d7896" />
        <ellipse cx="120" cy="149" rx="45" ry="10" fill="#d9d5ec" stroke="#8f88b3" strokeWidth="2" />
        <path d="M80 151 Q120 163 160 151" stroke="#ff9c38" strokeWidth="3" fill="none" />

        {/* Helmet interior: tinted glass behind the face so the bubble reads on black space */}
        <circle cx="120" cy="96" r="60" fill="url(#zg-inside)" />

        {/* Face (a tardigrade: round, soft, with a tube-shaped snout) */}
        <ellipse cx="120" cy="104" rx="45" ry="41" fill="url(#zg-face)" />
        <path d="M100 72 Q120 66 140 72" stroke="#c98a68" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.3" />
        <path d="M106 79 Q120 75 134 79" stroke="#c98a68" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.22" />
        <ellipse cx="93" cy="114" rx="8" ry="5" fill="#ff8fa3" opacity="0.5" />
        <ellipse cx="147" cy="114" rx="8" ry="5" fill="#ff8fa3" opacity="0.5" />

        <g className="zg-eyes">
          {/* round eyes (calm / wow) */}
          <g className="zg-eyes-open">
            {[104, 136].map((x) => (
              <g key={x}>
                <ellipse className="zg-eye" cx={x} cy="98" rx="7.5" ry="9.5" fill="#1b1530" />
                <circle cx={x - 2.6} cy="94" r="2.8" fill="#fff" />
                <circle cx={x + 2.4} cy="101" r="1.3" fill="#fff" opacity="0.8" />
              </g>
            ))}
          </g>
          {/* happy crescent eyes */}
          <g className="zg-eyes-happy">
            <path d="M96 100 Q104 89 112 100" stroke="#1b1530" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            <path d="M128 100 Q136 89 144 100" stroke="#1b1530" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          </g>
        </g>
        <g className="zg-brows">
          <path d="M96 82 Q104 77 112 81" stroke="#8a5a44" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M128 81 Q136 77 144 82" stroke="#8a5a44" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </g>
        {/* Snout */}
        <ellipse cx="120" cy="118" rx="10.5" ry="8.5" fill="#f9dcc4" stroke="#cf8d6c" strokeWidth="2" />
        <ellipse className="zg-mouth" cx="120" cy="119" rx="4.6" ry="3.6" fill="#7a3346" />
        <path className="zg-smile" d="M108 129 Q120 136 132 129" stroke="#a65a4a" strokeWidth="2.4" fill="none" strokeLinecap="round" />

        {/* Bubble helmet */}
        <circle cx="120" cy="96" r="60" fill="url(#zg-glass)" />
        <circle cx="120" cy="96" r="60" fill="none" stroke="#d6e6ff" strokeWidth="3.5" opacity="0.9" />
        <circle cx="120" cy="96" r="62.5" fill="none" stroke="#5e6c9a" strokeWidth="1.5" opacity="0.6" />
        <path d="M74 76 Q82 52 106 42" stroke="#ffffff" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.75" />
        <circle cx="70" cy="92" r="3.6" fill="#ffffff" opacity="0.6" />
        <path d="M152 136 Q164 126 170 110" stroke="#ffffff" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.28" />

        {/* Antennae */}
        <g className="zg-ant-l">
          <path d="M100 40 Q92 24 86 12" stroke="#cfcbe6" strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="86" cy="11" r="14" fill="url(#zg-glow-sky)" opacity="0.7" />
          <circle cx="86" cy="11" r="6.5" fill="#66ccff" stroke="#e8f8ff" strokeWidth="1.5" />
        </g>
        <g className="zg-ant-r">
          <path d="M140 40 Q148 24 154 12" stroke="#cfcbe6" strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="154" cy="11" r="14" fill="url(#zg-glow-orange)" opacity="0.7" />
          <circle cx="154" cy="11" r="6.5" fill="#ff9c38" stroke="#fff0dc" strokeWidth="1.5" />
        </g>
        <rect x="94" y="36" width="12" height="7" rx="3" fill="#8f88b3" transform="rotate(-18 100 40)" />
        <rect x="134" y="36" width="12" height="7" rx="3" fill="#8f88b3" transform="rotate(18 140 40)" />

        {/* Front arm (points, taps, grabs) */}
        <g className="zg-arm-front">
          <g className="zg-arm-jab">
            <path d="M162 178 L204 176" stroke="#cfcbe6" strokeWidth="21" strokeLinecap="round" />
            <path d="M162 178 L204 176" stroke="url(#zg-suit)" strokeWidth="17" strokeLinecap="round" />
            <rect x="192" y="168" width="7" height="17" rx="3" fill="#ff9c38" />
            <g className="zg-finger">
              <rect x="212" y="169" width="20" height="9" rx="4.5" fill="#9977ff" stroke="#4b2f99" strokeWidth="2" />
            </g>
            <circle className="zg-glove" cx="211" cy="177" r="11.5" fill="#9977ff" stroke="#4b2f99" strokeWidth="2" />
          </g>
        </g>
      </g>
    </svg>
  )
}
