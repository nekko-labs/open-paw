import type { NekkoApi } from '@open-paw/shared';

declare global {
  interface Window {
    nekko: NekkoApi;
  }
}

export {};
