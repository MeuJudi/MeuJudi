/**
 * Type definitions globais pro window.meujudi
 * Expõe o ElectronAPI injetado pelo preload.
 */

import type { ElectronAPI } from './types';

declare global {
  interface Window {
    meujudi: ElectronAPI;
  }
}

export {};
