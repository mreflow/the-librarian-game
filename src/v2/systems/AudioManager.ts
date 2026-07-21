import type { SettingsData } from '../types';

type SfxId = 'pickup' | 'shelve' | 'laugh' | 'warning' | 'success' | 'select' | 'breath';

const SFX: Record<SfxId, string[]> = {
  pickup: ['/pickup_book.mp3'],
  shelve: ['/book_on_shelf.mp3'],
  laugh: ['/kid_laughing_1.mp3', '/kid_laughing_2.mp3', '/kid_laughing_3.mp3'],
  warning: ['/uh_oh.mp3'],
  success: ['/yay.mp3'],
  select: ['/menu_select.mp3'],
  breath: ['/out_of_breath.mp3'],
};

const SFX_CUES: Record<SfxId, string> = {
  pickup: 'Book collected',
  shelve: 'Book returned to a shelf',
  laugh: 'Children laughing nearby',
  warning: 'Warning bell',
  success: 'Task complete chime',
  select: 'Menu selection',
  breath: 'Librarian breathing heavily',
};

export class AudioManager {
  private music: HTMLAudioElement | null = null;
  private ambience: HTMLAudioElement | null = null;
  private settings: SettingsData;
  private context: AudioContext | null = null;
  private nextPulseAt = 0;
  private chaos = 0;
  private paused = false;

  constructor(settings: SettingsData, private readonly onSoundCue?: (cue: string) => void) {
    this.settings = settings;
  }

  async unlock(): Promise<void> {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  updateSettings(settings: SettingsData): void {
    this.settings = settings;
    if (this.music) this.music.volume = this.channelVolume(settings.musicVolume, 0.62);
    if (this.ambience) this.ambience.volume = this.channelVolume(settings.ambienceVolume, 0.45);
  }

  playMenuMusic(): void {
    this.setTracks('/intro_music.mp3', null);
  }

  playRunMusic(): void {
    this.setTracks('/game_music.mp3', '/intro_music.mp3');
  }

  setChaos(value: number): void {
    this.chaos = value;
    if (this.music) this.music.playbackRate = 1 + Math.max(0, value - 50) / 500;
    this.tickDynamicStem();
  }

  playSfx(id: SfxId, detune = 0): void {
    if (this.settings.soundCues) this.onSoundCue?.(SFX_CUES[id]);
    const volume = this.channelVolume(this.settings.sfxVolume, id === 'laugh' ? 0.35 : 0.7);
    if (volume <= 0) return;
    const choices = SFX[id];
    const source = choices[Math.floor(Math.random() * choices.length)];
    if (!source) return;
    const audio = new Audio(source);
    audio.volume = volume;
    audio.playbackRate = Math.max(0.8, Math.min(1.25, 1 + detune));
    void audio.play().catch(() => undefined);
  }

  uiTick(frequency = 520): void {
    if (!this.context || this.context.state !== 'running') return;
    const volume = this.channelVolume(this.settings.uiVolume, 0.035);
    if (volume <= 0) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.08);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.09);
  }

  pause(): void {
    this.paused = true;
    this.music?.pause();
    this.ambience?.pause();
    void this.context?.suspend();
  }

  resume(): void {
    this.paused = false;
    void this.music?.play().catch(() => undefined);
    void this.ambience?.play().catch(() => undefined);
    void this.context?.resume();
  }

  destroy(): void {
    this.music?.pause();
    this.ambience?.pause();
    void this.context?.close();
  }

  private setTracks(musicSource: string, ambienceSource: string | null): void {
    if (this.music?.src.endsWith(musicSource)) {
      this.paused = false;
      void this.music.play().catch(() => undefined);
      void this.ambience?.play().catch(() => undefined);
      void this.context?.resume();
      return;
    }
    this.paused = false;
    this.music?.pause();
    this.ambience?.pause();
    this.music = new Audio(musicSource);
    this.music.loop = true;
    this.music.volume = this.channelVolume(this.settings.musicVolume, 0.62);
    void this.music.play().catch(() => undefined);
    this.ambience = ambienceSource ? new Audio(ambienceSource) : null;
    if (this.ambience) {
      this.ambience.loop = true;
      this.ambience.volume = this.channelVolume(this.settings.ambienceVolume, 0.45);
      void this.ambience.play().catch(() => undefined);
    }
  }

  private tickDynamicStem(): void {
    if (this.paused || !this.context || this.context.state !== 'running' || this.chaos < 45) return;
    if (this.context.currentTime < this.nextPulseAt) return;
    const interval = this.chaos >= 75 ? 0.42 : 0.7;
    this.nextPulseAt = this.context.currentTime + interval;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = this.chaos >= 75 ? 'triangle' : 'sine';
    oscillator.frequency.value = this.chaos >= 75 ? 92 : 130;
    const volume = this.channelVolume(this.settings.musicVolume, 0.018);
    if (volume <= 0) return;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.16);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.17);
  }

  private channelVolume(level: number, multiplier: number): number {
    return this.settings.muted ? 0 : Math.max(0, Math.min(1, level * multiplier));
  }
}
