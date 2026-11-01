import Phaser from 'phaser';
import Boot from './scenes/Boot.js';
import Menu from './scenes/Menu.js';
import Game from './scenes/Game.js';
import GameOver from './scenes/GameOver.js';
import Win from './scenes/Win.js';
import './style.css';

function hideLoading() {
  var el = document.getElementById('loading');
  if (el && el.remove) el.remove();
}

function showFallback(message) {
  hideLoading();
  var fallback = document.getElementById('fallback');
  if (!fallback) return;
  fallback.hidden = false;
  if (message) {
    var detail = document.getElementById('fallback-detail');
    if (detail) detail.textContent = String(message);
  }
}

// Surface boot/runtime failures in the DOM instead of a blank page.
window.addEventListener('error', function (event) {
  var message = event && event.message ? event.message : 'An unexpected error occurred.';
  showFallback(message);
});

window.addEventListener('unhandledrejection', function (event) {
  var reason = event ? event.reason : null;
  var message =
    reason instanceof Error ? reason.message : String(reason != null ? reason : 'An unexpected error occurred.');
  showFallback(message);
});

// Remove the loading indicator once the first scene boots successfully.
// Patched here so Boot.js stays focused on texture/scene setup.
var bootCreate = Boot.prototype.create;
Boot.prototype.create = function () {
  try {
    hideLoading();
  } catch (e) {
    // Ignore DOM cleanup errors; boot should continue.
  }
  return bootCreate.apply(this, arguments);
};

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
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
    fullscreenTarget: 'game',
    disableContextMenu: true
  },
  scene: [Boot, Menu, Game, GameOver, Win]
};

try {
  // eslint-disable-next-line no-new
  new Phaser.Game(config);
} catch (err) {
  console.error(err);
  var message = err instanceof Error ? err.message : String(err);
  showFallback('Boot failed: ' + message);
}
