export function meetingSoundEnabled(uid, setting) {
  return localStorage.getItem('monexus.audio.' + uid + '.' + setting) !== 'off';
}

export function setMeetingSound(uid, setting, enabled) {
  localStorage.setItem('monexus.audio.' + uid + '.' + setting, enabled ? 'on' : 'off');
}

export const meetingRingtones = [
  { id: 'classic', name: 'Classic', notes: [[0, 440], [0.19, 554.37]] },
  { id: 'chime', name: 'Chime', notes: [[0, 659.25], [0.18, 783.99], [0.36, 987.77]] },
  { id: 'soft', name: 'Soft bell', notes: [[0, 523.25], [0.32, 392]] },
  { id: 'pulse', name: 'Pulse', notes: [[0, 493.88], [0.16, 493.88], [0.40, 659.25]] },
];

function ringtoneFor(id) {
  return meetingRingtones.find(tone => tone.id === id) || meetingRingtones[0];
}

export function getMeetingRingtone(uid) {
  return ringtoneFor(localStorage.getItem('monexus.audio.' + uid + '.ringtoneChoice')).id;
}

export function setMeetingRingtone(uid, id) {
  localStorage.setItem('monexus.audio.' + uid + '.ringtoneChoice', ringtoneFor(id).id);
}

// A short duration plays one phrase for a preview or a scheduled meeting start.
export function ringMeeting(duration, id) {
  const audio = new AudioContext();
  const { notes } = ringtoneFor(id);
  let stopped = false;
  function ring() {
    if (stopped || audio.state !== 'running') return;
    for (const [delay, frequency] of notes) {
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
    if (stopped) return;
    stopped = true;
    clearInterval(repeat); clearTimeout(timeout);
    if (audio.state !== 'closed') audio.close().catch(() => {});
  }
  audio.resume().then(ring).catch(() => {});
  return stop;
}
