import Phaser from 'phaser';
import { RENDER_SCALE } from './render';
import { DodgeScene } from './scenes/DodgeScene';
import { MenuScene } from './scenes/MenuScene';
import { RankScene } from './scenes/RankScene';
import { SnakeScene } from './scenes/SnakeScene';
import { WhackScene } from './scenes/WhackScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  scale: {
    zoom: RENDER_SCALE,
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: '#111827',
  scene: [MenuScene, RankScene, SnakeScene, DodgeScene, WhackScene],
};
