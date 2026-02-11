/**
 * 判定基準プリセット定義
 */
export const presets = [
  {
    id: 'nextlight',
    name: 'NEXTLIGHT リリース基準',
    integrated: {
      pass: [-9, -7],
      warn: [-11, -5],
    },
    truePeak: {
      pass: -1,
      warn: 0,
    },
    clipping: 0,
    stereo: {
      pass: 0.3,
      warn: 0,
      check: true,
    },
    zeroCheck: true,
    silence: {
      head: 1,
      tail: 3,
    },
    verdict: {
      integratedHigh: -5,
      integratedLow: -11,
      truePeakCritical: 0,
      truePeakWarn: -1,
    },
  },
  {
    id: 'picco',
    name: 'picco 楽曲基準',
    integrated: {
      pass: [-14, -7],
      warn: [-16, -5],
    },
    truePeak: {
      pass: 0,
      warn: 1,
    },
    clipping: 0,
    stereo: {
      pass: 0,
      warn: -1,
      check: false,
    },
    zeroCheck: true,
    silence: {
      head: 2,
      tail: 5,
    },
    verdict: {
      integratedHigh: -5,
      integratedLow: -16,
      truePeakCritical: 1,
      truePeakWarn: 0,
    },
  },
]
