import Phaser from 'phaser';
import { DodgeScene } from './scenes/DodgeScene';
import { MenuScene } from './scenes/MenuScene';
import { RankScene } from './scenes/RankScene';
import { BrickBreakerScene } from './scenes/BrickBreakerScene';
import { SnakeScene } from './scenes/SnakeScene';
import { TetrisScene } from './scenes/TetrisScene';
import { WhackScene } from './scenes/WhackScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: {
    zoom: 1,
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  roundPixels: true,
  backgroundColor: '#111827',
  scene: [MenuScene, RankScene, SnakeScene, DodgeScene, WhackScene, TetrisScene, BrickBreakerScene],
};
