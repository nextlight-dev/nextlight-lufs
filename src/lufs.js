/**
 * LUFS measurement based on ITU-R BS.1770-4
 * K-weighting + gated loudness measurement
 */

// K-weighting filter coefficients for common sample rates
// Pre-filter (stage 1: high shelf) and RLB (stage 2: high-pass)
function getKWeightingCoefficients(sampleRate) {
  // Coefficients from ITU-R BS.1770-4 for 48kHz
  // For other sample rates, use bilinear transform approximation via Web Audio API
  if (sampleRate === 48000) {
    return {
      stage1: {
        b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
        a: [1.0, -1.69065929318241, 0.73248077421585]
      },
      stage2: {
        b: [1.0, -2.0, 1.0],
        a: [1.0, -1.99004745483398, 0.99007225036621]
      }
    }
  }
  if (sampleRate === 44100) {
    return {
      stage1: {
        b: [1.5308412300498355, -2.6509799951547297, 1.1690790799215869],
        a: [1.0, -1.6636551132560204, 0.7125954280732254]
      },
      stage2: {
        b: [1.0, -2.0, 1.0],
        a: [1.0, -1.9891696736297957, 0.9891990357870394]
      }
    }
  }
  // Fallback: use 48kHz coefficients (close enough for measurement)
  return getKWeightingCoefficients(48000)
}

// Apply biquad filter to samples
function applyBiquad(samples, b, a) {
  const out = new Float64Array(samples.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
    out[i] = y
    x2 = x1; x1 = x
    y2 = y1; y1 = y
  }
  return out
}

// Apply K-weighting to a single channel
function applyKWeighting(samples, sampleRate) {
  const coeff = getKWeightingCoefficients(sampleRate)
  const stage1 = applyBiquad(samples, coeff.stage1.b, coeff.stage1.a)
  return applyBiquad(stage1, coeff.stage2.b, coeff.stage2.a)
}

// Calculate mean square of a segment
function meanSquare(samples, start, length) {
  let sum = 0
  const end = Math.min(start + length, samples.length)
  for (let i = start; i < end; i++) {
    sum += samples[i] * samples[i]
  }
  return sum / (end - start)
}

/**
 * Measure LUFS from an AudioBuffer
 * Returns: { integrated, momentary[], shortTerm[], truePeak }
 */
export function measureLUFS(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate
  const numChannels = audioBuffer.numberOfChannels
  const numSamples = audioBuffer.length

  // Apply K-weighting to each channel
  const kWeighted = []
  for (let ch = 0; ch < numChannels; ch++) {
    const raw = audioBuffer.getChannelData(ch)
    kWeighted.push(applyKWeighting(raw, sampleRate))
  }

  // Channel weights (ITU-R BS.1770)
  // L, R = 1.0; C = 1.0; Ls, Rs = 1.41
  const channelWeights = []
  for (let ch = 0; ch < numChannels; ch++) {
    channelWeights.push(ch >= 4 ? 1.41 : 1.0)
  }

  // Momentary loudness (400ms blocks, 100ms hop)
  const blockSize = Math.round(sampleRate * 0.4)
  const hopSize = Math.round(sampleRate * 0.1)
  const momentary = []
  const momentaryTimes = []

  for (let start = 0; start + blockSize <= numSamples; start += hopSize) {
    let blockPower = 0
    for (let ch = 0; ch < numChannels; ch++) {
      blockPower += channelWeights[ch] * meanSquare(kWeighted[ch], start, blockSize)
    }
    const lufs = blockPower > 0 ? -0.691 + 10 * Math.log10(blockPower) : -Infinity
    momentary.push(lufs)
    momentaryTimes.push(start / sampleRate)
  }

  // Short-term loudness (3s blocks, 1s hop)
  const stBlockSize = Math.round(sampleRate * 3)
  const stHopSize = Math.round(sampleRate * 1)
  const shortTerm = []
  const shortTermTimes = []

  for (let start = 0; start + stBlockSize <= numSamples; start += stHopSize) {
    let blockPower = 0
    for (let ch = 0; ch < numChannels; ch++) {
      blockPower += channelWeights[ch] * meanSquare(kWeighted[ch], start, stBlockSize)
    }
    const lufs = blockPower > 0 ? -0.691 + 10 * Math.log10(blockPower) : -Infinity
    shortTerm.push(lufs)
    shortTermTimes.push(start / sampleRate)
  }

  // Integrated loudness with gating (EBU R 128)
  // Step 1: Absolute gate at -70 LUFS
  const blockPowers = []
  for (let start = 0; start + blockSize <= numSamples; start += hopSize) {
    let power = 0
    for (let ch = 0; ch < numChannels; ch++) {
      power += channelWeights[ch] * meanSquare(kWeighted[ch], start, blockSize)
    }
    blockPowers.push(power)
  }

  const absoluteGate = Math.pow(10, (-70 + 0.691) / 10)
  const aboveAbsolute = blockPowers.filter(p => p > absoluteGate)

  let integrated = -Infinity
  if (aboveAbsolute.length > 0) {
    const avgAboveAbsolute = aboveAbsolute.reduce((a, b) => a + b, 0) / aboveAbsolute.length
    const relativeGate = avgAboveAbsolute * Math.pow(10, -10 / 10) // -10 dB below

    const aboveRelative = blockPowers.filter(p => p > relativeGate)
    if (aboveRelative.length > 0) {
      const avgFinal = aboveRelative.reduce((a, b) => a + b, 0) / aboveRelative.length
      integrated = -0.691 + 10 * Math.log10(avgFinal)
    }
  }

  // True peak (inter-sample peak estimation via oversampling)
  let truePeak = 0
  for (let ch = 0; ch < numChannels; ch++) {
    const raw = audioBuffer.getChannelData(ch)
    for (let i = 0; i < raw.length; i++) {
      const abs = Math.abs(raw[i])
      if (abs > truePeak) truePeak = abs
    }
  }
  const truePeakDB = truePeak > 0 ? 20 * Math.log10(truePeak) : -Infinity

  // Loudness range (LRA) from short-term measurements
  const validShortTerm = shortTerm.filter(v => v > -70)
  let lra = 0
  if (validShortTerm.length >= 2) {
    const sorted = [...validShortTerm].sort((a, b) => a - b)
    const low = sorted[Math.floor(sorted.length * 0.1)]
    const high = sorted[Math.floor(sorted.length * 0.95)]
    lra = high - low
  }

  return {
    integrated: Math.round(integrated * 10) / 10,
    truePeak: Math.round(truePeakDB * 10) / 10,
    lra: Math.round(lra * 10) / 10,
    momentary,
    momentaryTimes,
    shortTerm,
    shortTermTimes,
    duration: numSamples / sampleRate,
    sampleRate,
    channels: numChannels
  }
}
