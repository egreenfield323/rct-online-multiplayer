// Lightweight WebAudio music + SFX. Everything is synthesized (oscillators) —
// no audio files to ship, and it works the same in the browser and the Electron
// build. A jaunty looping theme in the spirit of the old tycoon games, plus
// short blips for clicks and yes/no feedback when you place things.
//
// Browsers block audio until a user gesture, so the context is created lazily on
// the first interaction (see `unlock`).

type Sfx = 'click' | 'ok' | 'fail' | 'place' | 'cash' | 'hire';

const SEMI = (n: number) => 523.25 * Math.pow(2, n / 12); // n = semitones from C5

// A cheerful two-bar melody (semitones from C5; null = rest) at ~132 BPM.
// Major key, simple skips — reads as "theme-park" without being grating.
const MELODY: ([number | null, number])[] = [
  [0, 1], [4, 1], [7, 1], [12, 1], [11, 1], [7, 1], [9, 2],
  [5, 1], [9, 1], [12, 1], [9, 1], [7, 1], [4, 1], [0, 2],
];
const BASS: ([number, number])[] = [
  [-12, 2], [-5, 2], [-7, 2], [-12, 2], [-10, 2], [-5, 2], [-12, 2],
];

class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  muted = localStorage.getItem('openpark-muted') === '1';
  private musicOn = false;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bassStep = 0;
  private readonly beat = 60 / 132;

  // call from any user gesture before sound is needed
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem('openpark-muted', m ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, peak: number, dest: AudioNode): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------ music loop

  startMusic(): void {
    this.unlock();
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.bassStep = 0;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
  }

  private schedule(): void {
    if (!this.ctx || !this.musicGain) return;
    // schedule ~0.4s ahead
    while (this.nextTime < this.ctx.currentTime + 0.4) {
      const [n, d] = MELODY[this.step % MELODY.length];
      const dur = d * this.beat;
      if (n !== null) {
        this.tone(SEMI(n), this.nextTime, Math.min(dur, this.beat * 0.95), 'triangle', 0.9, this.musicGain);
        this.tone(SEMI(n) * 2.0, this.nextTime, this.beat * 0.4, 'sine', 0.18, this.musicGain); // shimmer
      }
      // bass plods along underneath, one note per two beats
      const [bn, bd] = BASS[this.bassStep % BASS.length];
      this.tone(SEMI(bn), this.nextTime, this.beat * 0.9, 'square', 0.28, this.musicGain);
      this.bassStep++;
      this.nextTime += dur;
      this.step++;
    }
  }

  // ------------------------------------------------------------ one-shot SFX

  sfx(kind: Sfx): void {
    this.unlock();
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case 'click':
        this.tone(660, t, 0.06, 'square', 0.25, this.master);
        break;
      case 'ok': // rising two-note "yes"
        this.tone(660, t, 0.09, 'triangle', 0.4, this.master);
        this.tone(990, t + 0.08, 0.12, 'triangle', 0.4, this.master);
        break;
      case 'place': // soft confirming thunk
        this.tone(440, t, 0.08, 'triangle', 0.35, this.master);
        break;
      case 'fail': // descending "no" buzz
        this.tone(220, t, 0.13, 'sawtooth', 0.3, this.master);
        this.tone(165, t + 0.1, 0.16, 'sawtooth', 0.3, this.master);
        break;
      case 'cash':
        this.tone(880, t, 0.07, 'square', 0.3, this.master);
        this.tone(1320, t + 0.06, 0.1, 'square', 0.3, this.master);
        break;
      case 'hire':
        this.tone(523, t, 0.09, 'triangle', 0.35, this.master);
        this.tone(784, t + 0.08, 0.09, 'triangle', 0.35, this.master);
        this.tone(1047, t + 0.16, 0.12, 'triangle', 0.35, this.master);
        break;
    }
  }
}

export const audio = new GameAudio();
