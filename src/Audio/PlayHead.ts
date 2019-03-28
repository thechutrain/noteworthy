import { KEY_SIGNATURE_GUIDELINE_X } from '../constants';
import { ProjectStore } from '../stores/project.store';
import { AccidentalSpec, AccidentalType } from '../types/AccidentalTypes';
import { ChordSpec } from '../types/ChordTypes';
import { NoteSpec, NoteType } from '../types/NoteTypes';
import { MatchType } from '../types/RepeatTypes';
import { ElementId } from '../types/StaffTypes';
import {
  beatsToSeconds,
  noteLengthToBeats,
  staffPositionToMidi
} from './AudioMath';
import SampleLibrary from './SampleLibrary';

export enum EndCondition {
  SAMPLE_ELEMENT,
  END_OF_STAFF,
  END_OF_SHEET
}

const BPM = 100;

export default class PlayHead {
  private context: AudioContext;
  private gain?: GainNode;
  private source?: AudioBufferSourceNode;
  private projectStore: ProjectStore;
  private instrument: SampleLibrary;
  private currentElement: ElementId;
  public currentChord?: ChordSpec;
  public endTime?: number;
  public endCondition: EndCondition;
  private repeatCounters: { [counter: string]: number } = {};
  private workingAccidentals: { [y: number]: AccidentalType } = {};

  constructor(
    context: AudioContext,
    projectStore: ProjectStore,
    instrument: SampleLibrary,
    endCondition: EndCondition,
    currentElement: ElementId
  ) {
    this.context = context;
    this.projectStore = projectStore;
    this.currentElement = currentElement;
    this.instrument = instrument;
    this.endCondition = endCondition;
  }

  playCurrent() {
    const element = this.projectStore.getElementById(this.currentElement);
    if (!element) {
      return;
    }
    switch (element.kind) {
      case 'chord':
        this.currentChord = element;
        this.playChord(element, this.context.currentTime);
        break;
      case 'accidental':
        if (element.x > KEY_SIGNATURE_GUIDELINE_X) {
          this.workingAccidentals[element.y] = element.type;
        }
      case 'note':
        if (this.endCondition === EndCondition.SAMPLE_ELEMENT) {
          let time = 0.5;
          if (element.kind === 'note') {
            time = beatsToSeconds(noteLengthToBeats(element.length), BPM);
          }
          this.playElement(
            element,
            this.context.currentTime,
            this.context.currentTime + time
          );
          this.endTime = this.context.currentTime + time;
        } else {
          this.next();
        }
        break;
      case 'repeat':
        if (element.type === MatchType.START) {
          if (element.nextElement === element.matchElement) {
            // Repeat block is empty.
            return;
          }
          this.next(); // Start repeat -- no-op; go to next note.
        } else {
          // End repeat. Go to start repeat!
          if (this.repeatCounters[element.id] === undefined) {
            this.repeatCounters[element.id] = 1;
          } else {
            this.repeatCounters[element.id]++;
          }
          if (
            element.nRepeats === undefined ||
            this.repeatCounters[element.id] >= element.nRepeats
          ) {
            delete this.repeatCounters[element.id];
            return;
          }
          let startRepeat = element.matchElement;
          if (!startRepeat) {
            startRepeat = this.projectStore.firstElement;
          }
          if (startRepeat) {
            this.currentElement = startRepeat;
            this.playCurrent();
          }
        }
        break;
    }
  }

  next() {
    if (this.endCondition === EndCondition.SAMPLE_ELEMENT) {
      return false;
    }
    const element = this.projectStore.getElementById(this.currentElement);
    if (!element || !element.nextElement) {
      return false;
    }
    const nextElement = this.projectStore.getElementById(element.nextElement);
    if (!nextElement) {
      return false;
    }
    this.currentElement = nextElement.id;
    this.playCurrent();
    return true;
  }

  playChord(chord: ChordSpec, startTime: number) {
    const notes = this.projectStore.getNotesForChord(chord.id);
    const noteTimes = notes.map(note =>
      beatsToSeconds(noteLengthToBeats(note.length), BPM)
    );
    const chordTime = Math.max(...noteTimes);
    this.endTime = startTime + chordTime;
    notes.forEach(note => {
      const noteTime = beatsToSeconds(noteLengthToBeats(note.length), BPM);
      this.playElement(note, startTime, startTime + noteTime);
    });
  }

  playElement(spec: NoteSpec | AccidentalSpec, start: number, stop: number) {
    if (spec.kind === 'note' && spec.type === NoteType.REST) {
      return;
    }
    const source = this.context.createBufferSource();
    const accidental =
      this.workingAccidentals[spec.y] ||
      this.projectStore.getKeySignatureForNote(spec.id);
    if (this.workingAccidentals[spec.y]) {
      delete this.workingAccidentals[spec.y];
    }
    const midiNote = staffPositionToMidi(
      spec.y,
      this.projectStore.getOctaveForElement(spec.id),
      spec.kind === 'note' ? accidental : spec.type
    );
    const { buffer, playbackRate } = this.instrument.getBufferAndRateForMidi(
      midiNote
    );
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.start(start);
    source.stop(stop);
    const gain = this.context.createGain();
    source.connect(gain);
    gain.gain.setValueAtTime(1, start + (stop - start) * 0.7);
    gain.gain.linearRampToValueAtTime(0.000001, stop);
    gain.connect(this.context.destination);
    this.source = source;
    this.gain = gain;
  }

  stop() {
    if (!this.gain || !this.source) {
      return;
    }
    const stopTime = this.context.currentTime + 0.1;
    if (this.endTime && stopTime > this.endTime) {
      return;
    }
    this.gain.gain.cancelScheduledValues(0);
    this.gain.gain.linearRampToValueAtTime(0.000001, stopTime);
    this.source.stop(stopTime);
  }
}
