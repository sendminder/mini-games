import Phaser from 'phaser';
import { DodgeScene } from './scenes/DodgeScene';
import { MenuScene } from './scenes/MenuScene';
import { SnakeScene } from './scenes/SnakeScene';
import { WhackScene } from './scenes/WhackScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: '#111827',
  scene: [MenuScene, SnakeScene, DodgeScene, WhackScene],
};
