// Application state management
import { DEFAULT_CONF_THRESHOLD, DEFAULT_IOU_THRESHOLD } from './constants.js';

export function createAppState() {
  return {
    // Model state
    session: null,
    modelInfo: null,
    modelBuffer: null,  // Store buffer to recreate session with different backend

    // Image state
    imageData: null,

    // Results state
    results: [],

    // Stats state
    runStats: { count: 0, times: [] },

    // Server models
    serverModels: [],

    // Image display info for coordinate mapping
    displayScale: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, displayed: false },

    // Configuration
    config: {
      confThreshold: DEFAULT_CONF_THRESHOLD,
      iouThreshold: DEFAULT_IOU_THRESHOLD
    }
  };
}

// Simple reactive state wrapper
export class StateManager {
  constructor(initialState) {
    this._state = initialState;
    this._listeners = [];
  }

  get state() {
    return this._state;
  }

  setState(updates) {
    this._state = { ...this._state, ...updates };
    this._notify();
  }

  subscribe(listener) {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  _notify() {
    this._listeners.forEach(listener => listener(this._state));
  }
}