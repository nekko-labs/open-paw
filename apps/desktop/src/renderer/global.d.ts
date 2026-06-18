import type { NekkoApi } from '@nekko/shared';

declare global {
  interface Window {
    nekko: NekkoApi;
  }
}

export {};
