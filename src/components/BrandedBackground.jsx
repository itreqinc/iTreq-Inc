import { useId } from 'react'

/**
 * Fixed iTreq Inc wash: azure → lime waves and a quiet wordmark.
 * Does not scroll with page content. Inputs stay on ink surfaces.
 */
export function BrandedBackground() {
  const rawId = useId().replace(/:/g, '')
  const gFill = `bg-fill-${rawId}`
  const gWave = `bg-wave-${rawId}`
  const gStroke = `bg-stroke-${rawId}`
  const gPin = `bg-pin-${rawId}`

  return (
    <div className="branded-bg" aria-hidden="true">
      <div className="branded-bg__wash" />
      <div className="branded-bg__orb branded-bg__orb--azure" />
      <div className="branded-bg__orb branded-bg__orb--lime" />
      <div className="branded-bg__orb branded-bg__orb--cyan" />

      <svg
        className="branded-bg__svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gFill} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2080d0" stopOpacity="0.22" />
            <stop offset="55%" stopColor="#1766b0" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#6dc03f" stopOpacity="0.16" />
          </linearGradient>
          <linearGradient id={gWave} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2080d0" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#6dc03f" stopOpacity="0.14" />
          </linearGradient>
          <linearGradient id={gStroke} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3d9ad4" />
            <stop offset="50%" stopColor="#7abde6" />
            <stop offset="100%" stopColor="#7bc940" />
          </linearGradient>
          <linearGradient id={gPin} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#2080d0" />
            <stop offset="100%" stopColor="#6dc03f" />
          </linearGradient>
        </defs>

        <path
          fill={`url(#${gFill})`}
          d="M0 620 C180 560 320 700 520 640 C760 560 900 720 1120 650 C1280 600 1380 640 1440 610 L1440 900 L0 900 Z"
        />
        <path
          fill={`url(#${gWave})`}
          d="M0 700 C220 640 380 780 620 710 C860 640 1040 790 1260 720 C1360 690 1410 710 1440 700 L1440 900 L0 900 Z"
        />

        <path
          fill="none"
          stroke={`url(#${gStroke})`}
          strokeWidth="1.35"
          opacity="0.42"
          d="M-40 210 C180 130 360 290 560 200 C780 100 980 280 1220 170 C1340 120 1420 160 1480 140"
        />
        <path
          fill="none"
          stroke={`url(#${gStroke})`}
          strokeWidth="1.1"
          opacity="0.28"
          d="M-20 320 C200 250 420 400 640 310 C880 210 1080 390 1320 300 C1400 270 1460 290 1500 280"
        />
        <path
          fill="none"
          stroke="#6dc03f"
          strokeWidth="1.05"
          opacity="0.18"
          d="M-30 430 C160 370 340 510 560 430 C800 340 1020 520 1260 430 C1380 390 1460 430 1520 410"
        />
        <path
          fill="none"
          stroke="#3d9ad4"
          strokeWidth="0.9"
          opacity="0.22"
          d="M-40 540 C200 470 400 620 660 530 C900 450 1100 630 1340 540 C1420 510 1480 540 1520 530"
        />

        <g transform="translate(1188 36) scale(1.35)" opacity="0.11">
          <path
            fill={`url(#${gPin})`}
            d="M50 6 C76 6 96 28 96 54 C96 82 62 118 50 132 C38 118 4 82 4 54 C4 28 24 6 50 6 Z"
          />
          <path
            fill="#08141f"
            d="M18 58 C32 46 44 62 58 50 C72 38 82 54 94 46 L94 68 C80 76 70 60 56 72 C42 84 30 68 18 76 Z"
          />
        </g>
      </svg>

      <div className="branded-bg__mark">
        <img src="/logo.png" alt="" />
      </div>
    </div>
  )
}
