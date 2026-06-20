/** Remote-access (relay) status for the in-app pairing UI. */
export interface RemoteStatus {
  enabled: boolean;
  relayUrl?: string;
  room?: string;
  key?: string;
}
