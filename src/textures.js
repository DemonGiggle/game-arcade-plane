// In-code pixel-art texture generation. No external image assets.
// All sprites are drawn from small string pixel-maps so they stay crisp
// with pixelArt: true.

function drawPixelMap(scene, key, map, palette, pixel = 4) {
  // ISSUE-8: per-key guard so partial regens never duplicate an existing key.
  if (scene.textures.exists(key)) return;
  const rows = map.length;
  const cols = map[0].length;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = map[y][x];
      if (ch === '.' || ch === ' ') continue;
      const color = palette[ch];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(x * pixel, y * pixel, pixel, pixel);
    }
  }
  g.generateTexture(key, cols * pixel, rows * pixel);
  g.destroy();
}

export function createAllTextures(scene) {
  // ISSUE-8 (P1 perf): guard on ALL keys, not just 'player', so re-entering
  // Boot/Menu never regenerates the 256px ocean/clouds fill-rate-heavy layers.
  const ALL_KEYS = [
    'player',
    'enemy1',
    'enemy2',
    'enemy3',
    'boss',
    'bullet',
    'bullet2',
    'enemyBullet',
    'powerDouble',
    'powerShield',
    'spark',
    'ocean',
    'clouds'
  ];
  if (ALL_KEYS.every((k) => scene.textures.exists(k))) return;

  // --- Player plane (top-down jet, blue/white) ---
  drawPixelMap(
    scene,
    'player',
    [
      '....X....',
      '....X....',
      '....X....',
      '...XXX...',
      '...XWX...',
      '...XXX...',
      '..XXXXX..',
      '.XXXXXXX.',
      'XXXXXXXXX',
      'XX.X.X.XX',
      '.X.....X.'
    ],
    { X: 0x3aa0ff, W: 0xeaf6ff },
    4
  );

  // --- Enemy type 1: scout (fast, red dart) ---
  drawPixelMap(
    scene,
    'enemy1',
    [
      '.R.....R.',
      '.R.....R.',
      '.RRRRRRR.',
      '..RRRRR..',
      '..RWRRR..',
      '...RRR...',
      '...R.R...',
      '....R....'
    ],
    { R: 0xff4d4d, W: 0xffffff },
    4
  );

  // --- Enemy type 2: weaver (orange, wide wings) ---
  drawPixelMap(
    scene,
    'enemy2',
    [
      'O.......O',
      'OO.....OO',
      '.OOOOOOO.',
      '..OOOOO..',
      '..OWOOO..',
      '...OOO...',
      '....O....',
      '...O.O...'
    ],
    { O: 0xffa126, W: 0xfff2cc },
    4
  );

  // --- Enemy type 3: tank (purple, bulky, 3 HP) ---
  drawPixelMap(
    scene,
    'enemy3',
    [
      '.PP...PP.',
      '.PPP.PPP.',
      '.PPPPPPP.',
      '..PPPPP..',
      '..PWWWP..',
      '..PPPPP..',
      '.PPPPPPP.',
      '.P.P.P.P.'
    ],
    { P: 0xb366ff, W: 0xffe9ff },
    4
  );

  // --- Boss (large gunship, 64px wide) ---
  drawPixelMap(
    scene,
    'boss',
    [
      '.....BBBBBB.....',
      '....BBBBBBBB....',
      '....BWWBBWWB....',
      '...BBBBBBBBBB...',
      '..BBBBBBBBBBBB..',
      '.BBBRBBBBBBRBBB.',
      '.BBRRBBBBBBRRBB.',
      'BBBBBBBBBBBBBBBB',
      'B.BB.BBBBBB.BB.B',
      '....BB.BB.BB....'
    ],
    { B: 0xff3355, W: 0xffe1e8, R: 0x7a0e22 },
    6
  );

  // --- Bullets ---
  drawPixelMap(scene, 'bullet', ['Y', 'Y', 'Y'], { Y: 0xffe14d }, 4);
  drawPixelMap(
    scene,
    'bullet2',
    ['..Y..', '..Y..', 'YYYYY', '..Y..', '..Y..'],
    { Y: 0xfff58a },
    3
  );
  drawPixelMap(scene, 'enemyBullet', ['.R.', 'RRR', '.R.'], { R: 0xff2222 }, 4);

  // --- Power-ups ---
  drawPixelMap(
    scene,
    'powerDouble',
    [
      '..........',
      '.GGGGGGGG.',
      '.GY....YG.',
      '.GY.YY.YG.',
      '.GY.YY.YG.',
      '.GY....YG.',
      '.GGGGGGGG.',
      '..........'
    ],
    { G: 0x2eff7a, Y: 0xfff200 },
    3
  );
  drawPixelMap(
    scene,
    'powerShield',
    [
      '..........',
      '.CCCCCCCC.',
      '.CCWWWWCC.',
      '.CWCCCCWC.',
      '.CWCCCCWC.',
      '.CCWWWWCC.',
      '.CCCCCCCC.',
      '..........'
    ],
    { C: 0x35e0ff, W: 0xffffff },
    3
  );

  // --- Particle spark ---
  // ISSUE-8: per-key guards so heavy layers are never needlessly redrawn.
  if (!scene.textures.exists('spark')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture('spark', 8, 8);
    g.destroy();
  }

  // --- Tileable ocean background (256x256) ---
  if (!scene.textures.exists('ocean')) {
    const S = 256;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x0b3d91, 1);
    g.fillRect(0, 0, S, S);
    // Wrapping wave dots: use modulo pattern so edges tile seamlessly.
    for (let y = 0; y < S; y += 16) {
      for (let x = 0; x < S; x += 16) {
        const wobble = ((x * 7 + y * 13) % 29) / 29;
        if (wobble > 0.55) {
          g.fillStyle(0x1550b5, 1);
          g.fillRect(x + 3, y + 6, 10, 3);
          g.fillStyle(0x0a2f6e, 1);
          g.fillRect(x + 3, y + 11, 10, 2);
        } else if (wobble < 0.12) {
          g.fillStyle(0x1e6ae0, 1);
          g.fillRect(x + 5, y + 4, 3, 3);
        }
      }
    }
    g.generateTexture('ocean', S, S);
    g.destroy();
  }

  // --- Transparent clouds layer (256x256, tileable-ish blobs) ---
  if (!scene.textures.exists('clouds')) {
    const S = 256;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const blobs = [
      [30, 40, 46, 18], [90, 70, 60, 22], [170, 36, 52, 20],
      [210, 110, 58, 22], [120, 140, 66, 24], [40, 170, 54, 20],
      [180, 200, 62, 22], [80, 220, 48, 18], [230, 230, 40, 16]
    ];
    for (const [x, y, w, h] of blobs) {
      g.fillStyle(0xffffff, 0.28);
      g.fillEllipse(x, y + 3, w, h);
      g.fillStyle(0xffffff, 0.85);
      g.fillEllipse(x, y, w * 0.8, h * 0.7);
    }
    g.generateTexture('clouds', S, S);
    g.destroy();
  }
}
