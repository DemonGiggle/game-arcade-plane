import Phaser from 'phaser';
import Boot from './scenes/Boot.js';
import Menu from './scenes/Menu.js';
import Game from './scenes/Game.js';
import GameOver from './scenes/GameOver.js';
import Win from './scenes/Win.js';
import './style.css';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 480,
  height: 640,
  backgroundColor: '#071a3a',
  pixelArt: true,
  // Keep Phaser's VisibilityHandler enabled so game.events emits
  // 'hidden'/'blur' — Game scene uses them for auto-pause (issue #2).
  disableVisibilityChange: false,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [Boot, Menu, Game, GameOver, Win]
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
