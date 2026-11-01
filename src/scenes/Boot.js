import Phaser from 'phaser';
import { createAllTextures } from '../textures.js';

export default class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    createAllTextures(this);
    this.scene.start('Menu');
  }
}
