import Phaser from 'phaser';
import { createAllTextures } from '../textures.js';
import { installAudioUnlock } from '../sfx.js';

export default class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    createAllTextures(this);
    installAudioUnlock();
    this.scene.start('Menu');
  }
}
