import { TrackPiece } from '@park/shared';

// Ghost previews are resolved to concrete tiles/pieces before broadcast, so
// other clients can render them without running our tool logic.
export type Ghost =
  | { k: 'tiles'; tiles: [number, number][]; ok: boolean; label?: string }
  | { k: 'track'; pieces: TrackPiece[]; type: string; ok: boolean; label?: string };

export interface Peer {
  id: number;
  name: string;
  isHost: boolean;
  color: string;
  cx: number; // cursor, world tile coords (float)
  cy: number;
  ghost: Ghost | null;
  seen: number; // ms timestamp of last ephemeral
}

export interface LobbyPlayer {
  id: number;
  name: string;
  status: string;
}
