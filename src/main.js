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

async function handleFile(file) {
  progress.textContent = '読み込み中...'
  results.classList.remove('show')

  try {
    const arrayBuffer = await file.arrayBuffer()

    progress.textContent = 'デコード中...'
    const audioCtx = new AudioContext()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    await audioCtx.close()

    progress.textContent = '測定中...'
    // Defer to next frame so the UI updates
    await new Promise(r => requestAnimationFrame(r))

    const result = measureLUFS(audioBuffer)

    progress.textContent = ''
    showResults(file.name, result)
  } catch (err) {
    progress.textContent = 'エラー: この形式は対応していません'
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

  document.getElementById('info').innerHTML = [
    `再生時間: ${formatTime(data.duration)}`,
    `サンプルレート: ${data.sampleRate} Hz`,
    `チャンネル数: ${data.channels}`,
    `目安: Integrated -7〜-9 LUFS`
  ].map(s => `<span>${s}</span>`).join('')

  renderChart(data)
  results.classList.add('show')
}

function renderChart(data) {
  const ctx = document.getElementById('chart').getContext('2d')

  if (chart) chart.destroy()

  // Clamp values for display
  const clamp = (v) => Math.max(-40, Math.min(0, v))
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
          min: -40,
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
