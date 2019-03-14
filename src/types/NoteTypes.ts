import { CellId } from './CellTypes';

export type NoteId = string;

export enum NoteLength {
  SIXTEENTH,
  EIGHTH,
  QUARTER,
  HALF,
  WHOLE,
  DOUBLEWHOLE
}

export enum NoteType {
  TONE,
  REST
}

export enum NoteOrientation {
  UP,
  DOWN
}

export interface NoteSpec {
  id: NoteId;
  type: NoteType;
  length: NoteLength;
  cellId?: CellId;
  y: number;
  isPlaying: boolean;
}
