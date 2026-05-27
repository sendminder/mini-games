import Phaser from 'phaser';
import { RENDER_HEIGHT, RENDER_WIDTH } from './render';
import { DodgeScene } from './scenes/DodgeScene';
import { MenuScene } from './scenes/MenuScene';
import { SnakeScene } from './scenes/SnakeScene';
import { WhackScene } from './scenes/WhackScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: RENDER_WIDTH,
  height: RENDER_HEIGHT,
  backgroundColor: '#111827',
  scene: [MenuScene, SnakeScene, DodgeScene, WhackScene],
};
