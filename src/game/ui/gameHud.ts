import Phaser from 'phaser';
import { TEXT_RESOLUTION } from '../render';
import type { ScreenChrome } from './screen';

export type GameHudOptions = {
  title: string;
  scoreLabel: string;
  scoreValue: string | number;
  highScoreLabel: string;
  highScoreValue: number;
  footerText: string;
  onBack: () => void;
  titleX?: number;
  titleY?: number;
  scoreX?: number;
  scoreY?: number;
  highScoreX?: number;
  highScoreY?: number;
  footerY?: number;
  titleFontSize?: number;
  scoreFontSize?: number;
  highScoreFontSize?: number;
  footerFontSize?: number;
  footerColor?: string;
};

export type GameHudResult = {
  scoreText: Phaser.GameObjects.Text;
  highScoreText: Phaser.GameObjects.Text;
  footerText: Phaser.GameObjects.Text;
};

export function createGameHud(
  scene: Phaser.Scene,
  chrome: ScreenChrome,
  options: GameHudOptions,
): GameHudResult {
  const portrait = chrome.portrait;
  const width = chrome.width;
  const titleX = options.titleX ?? width / 2;
  const titleY = options.titleY ?? chrome.titleY;
  const scoreX = options.scoreX ?? (portrait ? 16 : 810);
  const scoreY = options.scoreY ?? chrome.topRowY;
  const highScoreX = options.highScoreX ?? (portrait ? 16 : 810);
  const highScoreY = options.highScoreY ?? (portrait ? 24 : 30);
  const footerY = options.footerY ?? chrome.footerY;

  scene.add
    .text(titleX, titleY, options.title, {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: `${options.titleFontSize ?? chrome.titleFontSize}px`,
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    })
    .setOrigin(0.5);

  const highScoreText = scene.add.text(
    highScoreX,
    highScoreY,
    `${options.highScoreLabel}  ${options.highScoreValue}`,
    {
      color: '#facc15',
      fontFamily: 'Arial, sans-serif',
      fontSize: `${options.highScoreFontSize ?? (portrait ? 14 : 18)}px`,
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    },
  );
  highScoreText.setOrigin(0, 0);

  const scoreText = scene.add.text(scoreX, scoreY, `${options.scoreLabel}  ${options.scoreValue}`, {
    color: '#f8fafc',
    fontFamily: 'Arial, sans-serif',
    fontSize: `${options.scoreFontSize ?? (portrait ? 15 : 19)}px`,
    fontStyle: 'bold',
    resolution: TEXT_RESOLUTION,
  });
  scoreText.setOrigin(0, 0);

  const footerText = scene.add
    .text(portrait ? width / 2 : 480, footerY, options.footerText, {
      color: options.footerColor ?? '#94a3b8',
      fontFamily: 'Arial, sans-serif',
      fontSize: `${options.footerFontSize ?? (portrait ? 12 : 15)}px`,
      resolution: TEXT_RESOLUTION,
    })
    .setOrigin(0.5);

  createBackButton(scene, chrome.backButtonX, chrome.backButtonY, options.onBack);

  return { scoreText, highScoreText, footerText };
}

export function createBackButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onClick: () => void,
): Phaser.GameObjects.Rectangle {
  const buttonWidth = 100;
  const buttonHeight = 32;

  const button = scene.add
    .rectangle(x, y, buttonWidth, buttonHeight, 0x111c30, 0.94)
    .setStrokeStyle(2, 0x334155)
    .setInteractive({ useHandCursor: true });

  button.on('pointerdown', onClick);
  button.on('pointerover', () => {
    button.setFillStyle(0x1a2a45, 0.98).setStrokeStyle(2, 0x60a5fa);
  });
  button.on('pointerout', () => {
    button.setFillStyle(0x111c30, 0.94).setStrokeStyle(2, 0x334155);
  });

  scene.add
    .text(x, y, '뒤로가기', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    })
    .setOrigin(0.5);

  return button;
}
