import { inject, observer } from 'mobx-react';
import React, { Component } from 'react';
import uuid from 'uuid/v4';
import Accidental from '../Accidental/Accidental';
import Audio from '../Audio/Audio';
import {
  CURSOR_COLOR,
  LINE_DY,
  MOUSE_OFFSET_X,
  MOUSE_OFFSET_Y,
  SHEET_MARGIN_TOP,
  STAFF_HEIGHT,
  STAFF_MARGIN
} from '../constants';
import RenderNote from '../RenderNote/RenderNote';
import RepeatStartRender from '../Repeat/RepeatStartRender';
import { ProjectStore } from '../stores/project.store';
import { MouseMode, UiStore } from '../stores/ui.store';
import { ChordSpec } from '../types/ChordTypes';
import { NoteOrientation, NoteType } from '../types/NoteTypes';
import { ElementId, StaffIndex } from '../types/StaffTypes';

interface CursorElementProps {
  snapToStaff: boolean;
  currentSheetScroll: number;
  getSheetBoundingX: () => number | undefined;
}

interface InjectedProps extends CursorElementProps {
  projectStore: ProjectStore;
  uiStore: UiStore;
}

@inject('projectStore', 'uiStore')
@observer
export default class CursorElement extends Component<CursorElementProps> {
  state = {
    justMounted: true
  };
  get injected() {
    return this.props as InjectedProps;
  }
  componentDidMount() {
    document.addEventListener('mousemove', this.onMouseMove);
  }
  componentWillUnmount() {
    document.removeEventListener('mousemove', this.onMouseMove);
  }
  onMouseMove = (e: MouseEvent) => {
    const { uiStore, projectStore } = this.injected;
    uiStore.insertX = e.clientX;
    uiStore.insertY = e.clientY;
    const { x, yOnStaff, staffIndex } = this.clientPositionToSvgPosition()!;
    uiStore.activeChord = projectStore.findAdjacentChord(x, staffIndex);
    uiStore.insertStaffId = staffIndex;
    uiStore.insertStaffX = x;
    uiStore.insertStaffY = yOnStaff;
    this.setState({ justMounted: false });
  };
  onMouseDown = (e: React.MouseEvent) => {
    const { uiStore } = this.injected;
    const { cursorSpec } = uiStore;

    if (!cursorSpec) {
      throw new Error(
        'Attempted to create cursor element with no spec available.'
      );
    }
    const newElementId = uuid() as ElementId;

    const { projectStore } = this.injected;
    const { x, y, staffIndex } = this.clientPositionToSvgPosition()!;
    const adjacentChord = projectStore.findAdjacentChord(x, staffIndex);
    const staffY = this.svgYToStaffY(y, staffIndex);

    if (cursorSpec.kind === 'note') {
      let newChord: ChordSpec | undefined;
      if (!adjacentChord) {
        newChord = {
          id: uuid(),
          staffIndex,
          x
        };
      }

      const chordId = adjacentChord ? adjacentChord.id : newChord!.id;

      projectStore.addElement(
        {
          ...cursorSpec,
          id: newElementId,
          y: staffY,
          chordId: chordId
        },
        newChord
      );

      Audio.playChord(chordId);
    } else if (cursorSpec.kind === 'accidental') {
      projectStore.addElement({
        ...cursorSpec,
        id: newElementId,
        y: staffY
      });
    } else if (cursorSpec.kind === 'repeat') {
      projectStore.addElement({
        ...cursorSpec,
        id: newElementId
      });
    }

    uiStore.mouseMode = MouseMode.DRAG;
    uiStore.dragElementId = newElementId;
    uiStore.dragStartClientX = e.clientX;
    uiStore.dragStartClientY = e.clientY;
    uiStore.dragStartStaffIndex = staffIndex;
    uiStore.dragStartX = x;
    uiStore.dragStartY = staffY;
  };

  svgYToStaffY(svgY: number, staffIndex: StaffIndex) {
    return svgY - staffIndex * (STAFF_HEIGHT + STAFF_MARGIN);
  }

  clientPositionToSvgPosition() {
    const { uiStore } = this.injected;
    const { cursorSpec, insertX, insertY } = uiStore;
    const { snapToStaff, currentSheetScroll, getSheetBoundingX } = this.props;

    if (!cursorSpec) {
      return;
    }

    let x = insertX;
    let y = insertY + currentSheetScroll;

    if (snapToStaff) {
      y = Math.round(y / (LINE_DY / 2)) * (LINE_DY / 2);
    }

    const bucketSize = STAFF_HEIGHT + STAFF_MARGIN;
    const staffIndex = Math.round(
      (y - SHEET_MARGIN_TOP - STAFF_MARGIN / 2) / bucketSize
    );

    if (cursorSpec.kind === 'note' && cursorSpec.type === NoteType.REST) {
      // Rests are fixed to the top of the staff.
      y = staffIndex * (STAFF_HEIGHT + STAFF_MARGIN) + SHEET_MARGIN_TOP;
    }

    const sheetBoundingX = getSheetBoundingX();
    if (sheetBoundingX) {
      x -= sheetBoundingX;
    }

    y += MOUSE_OFFSET_Y;
    x += MOUSE_OFFSET_X;

    const yOnStaff = this.svgYToStaffY(y, staffIndex);

    const orientation =
      yOnStaff >= STAFF_HEIGHT / 2 ? NoteOrientation.UP : NoteOrientation.DOWN;

    return { x, y, orientation, staffIndex, yOnStaff };
  }

  render() {
    const { uiStore } = this.injected;
    const { cursorSpec } = uiStore;

    if (!cursorSpec || this.state.justMounted) {
      return <g />;
    }
    let { x, y, orientation } = this.clientPositionToSvgPosition()!;
    if (x < 0) {
      return <g />;
    }
    switch (cursorSpec.kind) {
      case 'note':
        return (
          <RenderNote
            length={cursorSpec.length}
            type={cursorSpec.type}
            x={x}
            y={y}
            color={CURSOR_COLOR}
            cssClass="CursorNote"
            orientation={orientation}
            onMainMouseDown={this.onMouseDown}
          />
        );
      case 'accidental':
        return <Accidental x={x} y={y} type={cursorSpec.type} color="#ddd" />;
      case 'repeat':
        return <RepeatStartRender x={x} />;
    }
  }
}