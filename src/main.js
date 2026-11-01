import Phaser from 'phaser';
import Boot from './scenes/Boot.js';
import Menu from './scenes/Menu.js';
import Game from './scenes/Game.js';
import GameOver from './scenes/GameOver.js';
import Win from './scenes/Win.js';
import { createPhaserConfig } from './config.js';
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

// Phaser boot config lives in src/config.js (issue #11 extraction); the
// values below preserve main's perf/scale/visibility tuning (issues #1/#2/#8).
const config = createPhaserConfig([Boot, Menu, Game, GameOver, Win]);

let game = null;
try {
  game = new Phaser.Game(config);
} catch (err) {
  console.error(err);
  var message = err instanceof Error ? err.message : String(err);
  showFallback('Boot failed: ' + message);
}

export default game;
