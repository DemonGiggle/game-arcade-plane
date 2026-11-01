// Touch controls for the Game scene (GitHub issue #1, P0).
// Encapsulates drag-to-move + auto-fire-while-touching + on-screen
// pause/mute buttons so src/scenes/Game.js only needs a few hook lines.
//
// Usage (kept surgical to ease merges — other agents touch Game.js):
//   import { attachTouchControls } from '../input/touch.js';
//   // init():  this.touch = null;
//   // create(): this.touch = attachTouchControls(this);
//   // update(): if (this.touch) this.touch.applyMovement(this.player, SPEED);
//   //           if (keyboardFire || (this.touch && this.touch.isFiring())) ...

import Phaser from 'phaser';
import { Sfx } from '../sfx.js';

const DRAG_Y_OFFSET = 64; // ship renders above the fingertip so it stays visible
const FOLLOW_GAIN = 14; // velocity proportional gain toward the drag target
const DEAD_ZONE = 4; // px — stop jitter when already on target

export function attachTouchControls(scene) {
  const W = 480;
  const H = 640;

  const state = {
    touching: false,
    pointerId: null,
    targetX: 0,
    targetY: 0
  };

  // Allow drag + button tap simultaneously (drag pointer + button pointer).
  if (scene.input.addPointer) {
    try {
      scene.input.addPointer(1);
    } catch {
      // ignore — extra pointers are best-effort
    }
  }

  const btnStyle = {
    fontFamily: 'Courier New',
    fontSize: '20px',
    color: '#ffffff',
    backgroundColor: '#0b2a55cc',
    padding: { x: 12, y: 8 }
  };

  // Bottom corners, clear of centered HUD text; depth above the pause
  // overlay (depth 60) so pause can be toggled back off by touch.
  const pauseBtn = scene.add
    .text(10, H - 64, 'II', btnStyle)
    .setDepth(70)
    .setScrollFactor(0)
    .setAlpha(0.85)
    .setInteractive({ useHandCursor: true });
  const muteBtn = scene.add
    .text(W - 10, H - 64, '♪', btnStyle)
    .setOrigin(1, 0)
    .setDepth(70)
    .setScrollFactor(0)
    .setAlpha(0.85)
    .setInteractive({ useHandCursor: true });

  const overButton = (x, y) => {
    if (!pauseBtn.active || !muteBtn.active) return false;
    const pb = pauseBtn.getBounds();
    const mb = muteBtn.getBounds();
    return (
      Phaser.Geom.Rectangle.Contains(pb, x, y) ||
      Phaser.Geom.Rectangle.Contains(mb, x, y)
    );
  };

  const syncLabels = () => {
    if (!pauseBtn.active || !muteBtn.active) return;
    const wantPause = scene.isPaused ? '▶' : 'II';
    if (pauseBtn.text !== wantPause) pauseBtn.setText(wantPause);
    // Keep mute glyph in sync when mute changes via keyboard (M) or HUD tap.
    const wantMute = Sfx.isMuted() ? 'X' : '♪';
    if (muteBtn.text !== wantMute) muteBtn.setText(wantMute);
  };

  const onDown = (pointer) => {
    Sfx.unlock();
    // Button taps are handled by the buttons themselves — don't start a drag.
    if (overButton(pointer.x, pointer.y)) return;
    if (state.touching) return; // track first finger only
    state.touching = true;
    state.pointerId = pointer.id;
    state.targetX = pointer.x;
    state.targetY = pointer.y;
  };

  const onMove = (pointer) => {
    if (!state.touching || pointer.id !== state.pointerId) return;
    // Pointer inside a button zone keeps the old target (avoids ship jumps).
    if (overButton(pointer.x, pointer.y)) return;
    if (!pointer.isDown) return;
    state.targetX = pointer.x;
    state.targetY = pointer.y;
  };

  const onUp = (pointer) => {
    if (!state.touching || pointer.id !== state.pointerId) return;
    state.touching = false;
    state.pointerId = null;
  };

  pauseBtn.on('pointerdown', () => {
    Sfx.unlock();
    scene.togglePause();
    syncLabels();
  });
  muteBtn.on('pointerdown', () => {
    Sfx.unlock();
    // Prefer the scene helper (persists mute, refreshes HUD, analytics);
    // fall back to a direct toggle on older revisions.
    if (typeof scene.toggleMuteUi === 'function') {
      scene.toggleMuteUi();
    } else {
      const muted = Sfx.toggleMute();
      if (scene.muteText) scene.muteText.setText(muted ? 'MUTED (M)' : '');
    }
    syncLabels();
  });

  scene.input.on('pointerdown', onDown);
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  // Some browsers/platforms fire pointerupoutside / cancel instead of up.
  if (scene.input.off) {
    scene.input.on('pointerupoutside', onUp);
    scene.input.on('pointercancel', onUp);
    scene.input.on('gameout', onUp);
  }
  scene.events.on('update', syncLabels);

  const api = {
    /** True while a gameplay touch is held (drives auto-fire in Game.update). */
    isFiring() {
      return state.touching && !scene.isPaused && !scene.gameOver;
    },
    /**
     * Drive the player toward the drag target (with fingertip offset).
     * Returns true when a touch drag overrode velocity this frame.
     */
    applyMovement(player, maxSpeed) {
      if (!state.touching || scene.isPaused || scene.gameOver) return false;
      if (!player || !player.active) return false;
      const tx = state.targetX;
      const ty = state.targetY - DRAG_Y_OFFSET;
      const dx = tx - player.x;
      const dy = ty - player.y;
      if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) {
        player.setVelocity(0, 0);
        return true;
      }
      const cap = maxSpeed * 1.5;
      player.setVelocity(
        Phaser.Math.Clamp(dx * FOLLOW_GAIN, -cap, cap),
        Phaser.Math.Clamp(dy * FOLLOW_GAIN, -cap, cap)
      );
      // Tilt with drag direction (mirrors keyboard bank/tilt in Game.update).
      player.setAngle(
        Phaser.Math.Linear(
          player.angle,
          Phaser.Math.Clamp(dx * 0.15, -18, 18),
          0.3
        )
      );
      return true;
    },
    destroy() {
      scene.input.off('pointerdown', onDown);
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      if (scene.input.off) {
        scene.input.off('pointerupoutside', onUp);
        scene.input.off('pointercancel', onUp);
        scene.input.off('gameout', onUp);
      }
      scene.events.off('update', syncLabels);
    }
  };

  scene.events.once('shutdown', () => api.destroy());
  scene.events.once('destroy', () => api.destroy());

  return api;
}
