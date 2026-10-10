import * as THREE from 'three';
import type { Preset } from '../render/post';

export interface Settings {
  quality: Preset;
  shadows: boolean;
  resolution: number;
  edgePan: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voice: boolean;
  showFps: boolean;
  camSpeed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'ultra', shadows: true, resolution: 1, edgePan: true, masterVolume: 0.8, musicVolume: 0.5, sfxVolume: 0.9, voice: true, showFps: true, camSpeed: 1,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('ms.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem('ms.settings', JSON.stringify(s)); } catch { /* ignore */ }
}

/** Owns the WebGL renderer and canvas for the whole app lifetime. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  settings: Settings = loadSettings();
  constructor(readonly parent: HTMLElement, preserve = false) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: preserve });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.id = 'gl';
    parent.appendChild(this.renderer.domElement);
  }
  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }
}
