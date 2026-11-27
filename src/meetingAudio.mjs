export function meetingSoundEnabled(uid, setting) {
  return localStorage.getItem('monexus.audio.' + uid + '.' + setting) !== 'off';
}

export function setMeetingSound(uid, setting, enabled) {
  localStorage.setItem('monexus.audio.' + uid + '.' + setting, enabled ? 'on' : 'off');
}

// Two short notes repeat until the invitation is answered or the ring expires.
export function ringMeeting(duration) {
  const audio = new AudioContext();
  function ring() {
    if (audio.state !== 'running') return;
    for (const [delay, frequency] of [[0, 440], [0.19, 554.37]]) {
      const start = audio.currentTime + delay;
      const note = audio.createOscillator(), gain = audio.createGain();
      note.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.085, start + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
      note.connect(gain).connect(audio.destination);
      note.start(start); note.stop(start + 0.27);
      note.onended = () => { note.disconnect(); gain.disconnect(); };
    }
  }
  const repeat = setInterval(ring, 2300);
  const timeout = setTimeout(stop, duration);
  function stop() {
    clearInterval(repeat); clearTimeout(timeout);
    if (audio.state !== 'closed') audio.close().catch(() => {});
  }
  audio.resume().then(ring).catch(() => {});
  return stop;
}
