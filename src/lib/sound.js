// Generates short beep tones with the Web Audio API so we don't need to
// ship/host any audio files. Safe to call repeatedly.
function beep({ frequency, duration, type = 'sine', volume = 0.3 }) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = type
    oscillator.frequency.value = frequency
    gain.gain.value = volume
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + duration)
    oscillator.onended = () => ctx.close()
  } catch {
    // Audio isn't available (e.g. no user interaction yet) — fail silently
  }
}

export function playScanSuccess() {
  beep({ frequency: 1200, duration: 0.12, type: 'sine' })
}

export function playScanError() {
  beep({ frequency: 220, duration: 0.35, type: 'square', volume: 0.25 })
}
