// Text-to-speech helper for English learning
export function speakWord(text, rate = 0.9) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('Speech synthesis is not supported on this browser.');
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = rate; // 0.9 is natural for learners, 0.7 for slow phonics
  utterance.pitch = 1.0;

  // Try to find a high quality English voice (Google US English, Samantha, Daniel, etc.)
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find(v => 
    (v.lang.startsWith('en-US') || v.lang.startsWith('en-GB') || v.lang.startsWith('en')) &&
    (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Samantha') || v.name.includes('Daniel'))
  ) || voices.find(v => v.lang.startsWith('en'));

  if (englishVoice) {
    utterance.voice = englishVoice;
  }

  window.speechSynthesis.speak(utterance);
}

export function playAudioFeedback(type) {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'correct') {
      // Pleasant high double beep
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.1); // A5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'wrong') {
      // Low buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(160, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'flip') {
      // Gentle click/pop
      osc.frequency.setValueAtTime(400, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'win') {
      // Celebration fanfare
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const noteOsc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        noteOsc.connect(noteGain);
        noteGain.connect(ctx.destination);
        noteOsc.frequency.value = freq;
        noteGain.gain.setValueAtTime(0.12, now + idx * 0.1);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.3);
        noteOsc.start(now + idx * 0.1);
        noteOsc.stop(now + idx * 0.1 + 0.3);
      });
    }
  } catch {
    // Audio context might be restricted before user gesture
  }
}
