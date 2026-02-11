import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js'
import { measureLUFS } from './lufs.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

const dropzone = document.getElementById('dropzone')
const fileInput = document.getElementById('fileInput')
const progress = document.getElementById('progress')
const results = document.getElementById('results')

let chart = null
let audioEl = null
let audioUrl = null
let animFrameId = null
let currentData = null

// Drop zone events
dropzone.addEventListener('click', () => fileInput.click())
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropzone.classList.add('dragover')
})
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'))
dropzone.addEventListener('drop', (e) => {
  e.preventDefault()
  dropzone.classList.remove('dragover')
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0])
})
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFile(fileInput.files[0])
})

function showProgress(text) {
  progress.innerHTML = `<div class="spinner"></div><span>${text}</span>`
  progress.classList.add('show')
}

function hideProgress() {
  progress.classList.remove('show')
  progress.innerHTML = ''
}

async function handleFile(file) {
  showProgress('読み込み中...')
  results.classList.remove('show')
  stopAudio()

  try {
    const arrayBuffer = await file.arrayBuffer()

    showProgress('デコード中...')
    const audioCtx = new AudioContext({ sampleRate: 48000 })
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    await audioCtx.close()

    showProgress('測定中...')
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => setTimeout(r, 50))

    const result = measureLUFS(audioBuffer)

    // Set up audio playback
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    audioUrl = URL.createObjectURL(file)
    setupPlayer(audioUrl, result.duration)

    hideProgress()
    currentData = result
    showVerdict(result)
    showResults(file.name, result)
  } catch (err) {
    progress.innerHTML = '<span>エラー: この形式は対応していません</span>'
    progress.classList.add('show')
    console.error(err)
  }
}

function getLufsClass(lufs) {
  if (lufs >= -9 && lufs <= -7) return 'pass'
  if (lufs >= -11 && lufs <= -5) return 'warn'
  return 'fail'
}

function formatTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function showResults(name, data) {
  document.getElementById('filename').textContent = name

  const intEl = document.getElementById('integrated')
  intEl.textContent = data.integrated === -Infinity ? '--' : data.integrated.toFixed(1)
  intEl.className = 'value ' + getLufsClass(data.integrated)

  const tpEl = document.getElementById('truePeak')
  tpEl.textContent = data.truePeak === -Infinity ? '--' : data.truePeak.toFixed(1)
  tpEl.className = 'value ' + (data.truePeak <= -1 ? 'pass' : data.truePeak <= 0 ? 'warn' : 'fail')

  document.getElementById('lra').textContent = data.lra.toFixed(1)

  // Duration
  document.getElementById('duration').textContent = formatTime(data.duration)

  // Zero start / end
  const zeroThreshold = 0.001
  const startEl = document.getElementById('zeroStart')
  const endEl = document.getElementById('zeroEnd')
  startEl.textContent = data.startAmp < zeroThreshold ? 'OK' : data.startAmp.toFixed(4)
  startEl.className = 'value ' + (data.startAmp < zeroThreshold ? 'pass' : 'fail')
  endEl.textContent = data.endAmp < zeroThreshold ? 'OK' : data.endAmp.toFixed(4)
  endEl.className = 'value ' + (data.endAmp < zeroThreshold ? 'pass' : 'fail')

  // Head / Tail silence
  document.getElementById('headSilence').textContent = data.headSilence.toFixed(2)
  document.getElementById('tailSilence').textContent = data.tailSilence.toFixed(2)

  // Clipping
  const clipEl = document.getElementById('clipping')
  clipEl.textContent = data.clippedSamples.toLocaleString()
  clipEl.className = 'value ' + (data.clippedSamples === 0 ? 'pass' : 'fail')

  // Stereo correlation (only show for stereo)
  const stereoMetric = document.getElementById('stereoMetric')
  if (data.stereoCorrelation !== null) {
    stereoMetric.style.display = ''
    const corrEl = document.getElementById('stereoCorr')
    corrEl.textContent = data.stereoCorrelation.toFixed(2)
    corrEl.className = 'value ' + (data.stereoCorrelation < 0 ? 'fail' : data.stereoCorrelation < 0.3 ? 'warn' : 'pass')
  } else {
    stereoMetric.style.display = 'none'
  }

  document.getElementById('info').innerHTML = [
    `再生時間: ${formatTime(data.duration)}`,
    `サンプルレート: ${data.sampleRate} Hz`,
    `チャンネル数: ${data.channels}`,
    `目安: Integrated -7〜-9 LUFS`
  ].map(s => `<span>${s}</span>`).join('')

  renderChart(data)
  results.classList.add('show')
}

// --- Verdict banner ---
function showVerdict(data) {
  const el = document.getElementById('verdict')
  const issues = []

  if (data.integrated !== -Infinity) {
    if (data.integrated > -5) issues.push('Integrated Loudness が高すぎます（配信時に音量が下げられます）')
    else if (data.integrated < -11) issues.push('Integrated Loudness が低めです（音が小さく聞こえる可能性）')
  }

  if (data.truePeak > 0) issues.push('True Peak が 0 dBTP を超えています（音割れの危険）')
  else if (data.truePeak > -1) issues.push('True Peak が -1 dBTP を超えています（余裕が少ない）')

  if (data.clippedSamples > 0) issues.push(`クリッピング検出: ${data.clippedSamples.toLocaleString()} サンプル`)

  if (data.stereoCorrelation !== null && data.stereoCorrelation < 0) {
    issues.push('ステレオ相関が負です（モノラル再生時に音が消える可能性）')
  }

  const zeroThreshold = 0.001
  if (data.startAmp >= zeroThreshold) issues.push(`先頭のサンプルが非ゼロです（${data.startAmp.toFixed(4)}）→ プチッとノイズの原因`)
  if (data.endAmp >= zeroThreshold) issues.push(`末尾のサンプルが非ゼロです（${data.endAmp.toFixed(4)}）→ プチッとノイズの原因`)

  if (data.headSilence > 1) issues.push(`冒頭の無音が ${data.headSilence.toFixed(1)}秒 あります`)
  if (data.tailSilence > 3) issues.push(`末尾の無音が ${data.tailSilence.toFixed(1)}秒 あります`)

  if (issues.length === 0) {
    el.className = 'verdict verdict-pass'
    el.innerHTML = '<div class="verdict-title">問題なし</div><div class="verdict-details">配信の基準を満たしています。</div>'
  } else {
    const hasCritical = data.truePeak > 0 || data.clippedSamples > 0 || (data.stereoCorrelation !== null && data.stereoCorrelation < 0)
    el.className = 'verdict ' + (hasCritical ? 'verdict-fail' : 'verdict-warn')
    el.innerHTML = `<div class="verdict-title">${hasCritical ? '要確認' : '注意'}</div><div class="verdict-details">${issues.join('<br>')}</div>`
  }
}

// --- Audio player ---
function stopAudio() {
  if (audioEl) {
    audioEl.pause()
    audioEl.src = ''
    audioEl = null
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
  document.getElementById('playhead').style.display = 'none'
}

function setupPlayer(url, duration) {
  audioEl = new Audio(url)
  const playBtn = document.getElementById('playBtn')
  const playIcon = document.getElementById('playIcon')
  const pauseIcon = document.getElementById('pauseIcon')
  const playerBar = document.getElementById('playerBar')
  const playerBarFill = document.getElementById('playerBarFill')
  const playerTime = document.getElementById('playerTime')
  const playhead = document.getElementById('playhead')

  playerTime.textContent = `0:00 / ${formatTime(duration)}`
  playerBarFill.style.width = '0%'
  playIcon.style.display = ''
  pauseIcon.style.display = 'none'
  playhead.style.display = 'none'

  playBtn.onclick = () => {
    if (audioEl.paused) {
      audioEl.play()
      playIcon.style.display = 'none'
      pauseIcon.style.display = ''
      startPlayheadSync()
    } else {
      audioEl.pause()
      playIcon.style.display = ''
      pauseIcon.style.display = 'none'
      if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null }
    }
  }

  playerBar.onclick = (e) => {
    const rect = playerBar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audioEl.currentTime = ratio * duration
    updatePlayerUI()
  }

  audioEl.addEventListener('ended', () => {
    playIcon.style.display = ''
    pauseIcon.style.display = 'none'
    playhead.style.display = 'none'
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null }
  })
}

function startPlayheadSync() {
  const playhead = document.getElementById('playhead')
  playhead.style.display = ''

  function tick() {
    updatePlayerUI()
    animFrameId = requestAnimationFrame(tick)
  }
  tick()
}

function updatePlayerUI() {
  if (!audioEl || !currentData) return
  const duration = currentData.duration
  const current = audioEl.currentTime
  const ratio = duration > 0 ? current / duration : 0

  document.getElementById('playerBarFill').style.width = (ratio * 100) + '%'
  document.getElementById('playerTime').textContent = `${formatTime(current)} / ${formatTime(duration)}`

  // Sync playhead with chart
  if (chart) {
    const chartArea = chart.chartArea
    if (chartArea) {
      const x = chartArea.left + ratio * (chartArea.right - chartArea.left)
      const playhead = document.getElementById('playhead')
      playhead.style.left = x + 'px'
      playhead.style.top = chartArea.top + 'px'
      playhead.style.height = (chartArea.bottom - chartArea.top) + 'px'
    }
  }
}

// --- Batch measurement ---
const batchDropzone = document.getElementById('batchDropzone')
const batchFileInput = document.getElementById('batchFileInput')
const batchProgress = document.getElementById('batchProgress')
const batchResults = document.getElementById('batchResults')
const batchBody = document.getElementById('batchBody')

batchDropzone.addEventListener('click', () => batchFileInput.click())
batchDropzone.addEventListener('dragover', (e) => {
  e.preventDefault()
  batchDropzone.classList.add('dragover')
})
batchDropzone.addEventListener('dragleave', () => batchDropzone.classList.remove('dragover'))
batchDropzone.addEventListener('drop', (e) => {
  e.preventDefault()
  batchDropzone.classList.remove('dragover')
  if (e.dataTransfer.files.length) handleBatch(e.dataTransfer.files)
})
batchFileInput.addEventListener('change', () => {
  if (batchFileInput.files.length) handleBatch(batchFileInput.files)
})

function getTpClass(tp) {
  if (tp <= -1) return 'pass'
  if (tp <= 0) return 'warn'
  return 'fail'
}

async function handleBatch(fileList) {
  const files = Array.from(fileList).slice(0, 10)
  batchBody.innerHTML = ''
  batchResults.classList.add('show')

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    batchProgress.innerHTML = `<div class="spinner"></div><span>${i + 1} / ${files.length} 測定中: ${file.name}</span>`
    batchProgress.classList.add('show')

    // Let UI update
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => setTimeout(r, 50))

    try {
      const arrayBuffer = await file.arrayBuffer()
      const audioCtx = new AudioContext({ sampleRate: 48000 })
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      await audioCtx.close()

      const data = measureLUFS(audioBuffer)
      const intVal = data.integrated === -Infinity ? '--' : data.integrated.toFixed(1)
      const tpVal = data.truePeak === -Infinity ? '--' : data.truePeak.toFixed(1)

      const clipClass = data.clippedSamples === 0 ? 'pass' : 'fail'
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td class="fname" title="${file.name}">${file.name}</td>
        <td class="num"><span class="${getLufsClass(data.integrated)}">${intVal}</span><span class="unit-cell"> LUFS</span></td>
        <td class="num"><span class="${getTpClass(data.truePeak)}">${tpVal}</span><span class="unit-cell"> dBTP</span></td>
        <td class="num">${data.lra.toFixed(1)}<span class="unit-cell"> LU</span></td>
        <td class="num">${data.headSilence.toFixed(1)}<span class="unit-cell">s</span> / ${data.tailSilence.toFixed(1)}<span class="unit-cell">s</span></td>
        <td class="num"><span class="${clipClass}">${data.clippedSamples.toLocaleString()}</span></td>
      `
      batchBody.appendChild(tr)
    } catch (err) {
      console.error(err)
      const tr = document.createElement('tr')
      tr.className = 'error-row'
      tr.innerHTML = `
        <td class="fname" title="${file.name}">${file.name}</td>
        <td colspan="5" style="color:#f87171">エラー: 対応していない形式</td>
      `
      batchBody.appendChild(tr)
    }
  }

  batchProgress.classList.remove('show')
  batchProgress.innerHTML = ''
}

function renderChart(data) {
  const ctx = document.getElementById('chart').getContext('2d')

  if (chart) chart.destroy()

  // Clamp values for display
  const clamp = (v) => Math.max(-20, Math.min(0, v))
  const momentaryData = data.momentary.map(clamp)
  const shortTermData = data.shortTermTimes.map((t, i) => ({
    x: t,
    y: clamp(data.shortTerm[i])
  }))

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.momentaryTimes.map(t => formatTime(t)),
      datasets: [
        {
          label: 'Momentary (400ms)',
          data: momentaryData,
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167, 139, 250, 0.1)',
          borderWidth: 1,
          pointRadius: 0,
          fill: true,
          tension: 0.3
        },
        {
          label: 'Short-term (3s)',
          data: data.shortTermTimes.map((t, i) => {
            // Map short-term to nearest momentary index
            const idx = Math.round(t / (data.momentaryTimes[1] - data.momentaryTimes[0]))
            return { x: idx, y: clamp(data.shortTerm[i]) }
          }).reduce((acc, { x, y }) => { acc[x] = y; return acc }, []),
          borderColor: '#f472b6',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.3,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.5,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (item) => {
              const v = item.raw
              if (v == null) return null
              return `${item.dataset.label}: ${typeof v === 'number' ? v.toFixed(1) : v} LUFS`
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          ticks: {
            color: '#52525b',
            maxTicksLimit: 10,
            font: { size: 10 }
          },
          grid: { color: '#1e1e22' }
        },
        y: {
          display: true,
          min: -20,
          max: 0,
          ticks: {
            color: '#52525b',
            callback: (v) => v + ' LUFS',
            font: { size: 10 }
          },
          grid: { color: '#1e1e22' }
        }
      }
    }
  })
}
