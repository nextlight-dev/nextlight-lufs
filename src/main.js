import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js'
import { measureLUFS } from './lufs.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

const dropzone = document.getElementById('dropzone')
const fileInput = document.getElementById('fileInput')
const progress = document.getElementById('progress')
const results = document.getElementById('results')

let chart = null

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

  try {
    const arrayBuffer = await file.arrayBuffer()

    showProgress('デコード中...')
    const audioCtx = new AudioContext()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    await audioCtx.close()

    showProgress('測定中...')
    // Defer to next frame so the UI updates
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => setTimeout(r, 50))

    const result = measureLUFS(audioBuffer)

    hideProgress()
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
      const audioCtx = new AudioContext()
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
