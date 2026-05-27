import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import {
  getBrickHighScore,
  getDodgeHighScore,
  getSnakeHighScore,
  getTetrisHighScore,
  getWhackHighScore,
} from '../storage/highScore';

type GameCardConfig = {
  y: number;
  label: string;
  title: string;
  description: string;
  highScore: number;
  accent: number;
  accentColor: string;
  start: () => void;
};

type MenuLayout = {
  portrait: boolean;
  titleX: number;
  titleY: number;
  subtitleY: number;
  cardX: number;
  cardWidth: number;
  cardHeight: number;
  cardYs: number[];
  footerY: number;
};

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create(): void {
    configureHiDpiCamera(this.cameras.main);
    this.cameras.main.setBackgroundColor('#08111f');
    const snakeHighScore = getSnakeHighScore();
    const dodgeHighScore = getDodgeHighScore();
    const whackHighScore = getWhackHighScore();
    const tetrisHighScore = getTetrisHighScore();
    const brickHighScore = getBrickHighScore();
    const layout = this.getLayout();
    const width = this.scale.width;

    this.add
      .text(layout.titleX, layout.titleY, 'MINI GAMES', {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: layout.portrait ? '28px' : '38px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.add
      .text(layout.titleX, layout.subtitleY, '플레이할 게임을 선택하세요', {
        color: '#94a3b8',
        fontFamily: 'Arial, sans-serif',
        fontSize: layout.portrait ? '14px' : '18px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.createActionButton(
      layout.portrait ? width - 54 : width - 4,
      layout.portrait ? 42 : 44,
      layout.portrait ? 80 : 90,
      layout.portrait ? 24 : 26,
      '순위보기',
      () => {
        this.scene.start('RankScene');
      },
    );

    const startSnake = (): void => {
      this.scene.start('SnakeScene');
    };
    const startDodge = (): void => {
      this.scene.start('DodgeScene');
    };
    const startTetris = (): void => {
      this.scene.start('TetrisScene');
    };

    this.createGameCard({
      y: layout.cardYs[0],
      label: '1  SNAKE',
      title: '사과 먹는 애벌레',
      description: '사과를 먹으며 길어지는 뱀을 조종하세요.',
      highScore: snakeHighScore,
      accent: 0x4ade80,
      accentColor: '#4ade80',
      start: startSnake,
    }, layout);
    this.createGameCard({
      y: layout.cardYs[1],
      label: '2  DODGE',
      title: '똥피하기',
      description: '양 끝이 연결된 바닥에서 떨어지는 똥을 피하세요.',
      highScore: dodgeHighScore,
      accent: 0xf59e0b,
      accentColor: '#f59e0b',
      start: startDodge,
    }, layout);
    this.createGameCard({
      y: layout.cardYs[2],
      label: '3  WHACK',
      title: '두더지 잡기',
      description: '두더지를 터치하고 폭탄 두더지는 피하세요.',
      highScore: whackHighScore,
      accent: 0x60a5fa,
      accentColor: '#60a5fa',
      start: () => {
        this.scene.start('WhackScene');
      },
    }, layout);
    this.createGameCard({
      y: layout.cardYs[3],
      label: '4  TETRIS',
      title: '테트리스 라이트',
      description: '좌우 이동과 회전으로 줄을 완성하세요.',
      highScore: tetrisHighScore,
      accent: 0xf87171,
      accentColor: '#f87171',
      start: startTetris,
    }, layout);
    this.createGameCard({
      y: layout.cardYs[4],
      label: '5  BRICK',
      title: '벽돌깨기',
      description: '패들을 좌우로 움직여 공을 튕기고 벽돌을 깨세요.',
      highScore: brickHighScore,
      accent: 0xf5f1e8,
      accentColor: '#f5f1e8',
      start: () => {
        this.scene.start('BrickBreakerScene');
      },
    }, layout);

    this.add
      .text(layout.titleX, layout.footerY, '카드 클릭 또는 숫자 키로 시작', {
        color: '#64748b',
        fontFamily: 'Arial, sans-serif',
        fontSize: layout.portrait ? '13px' : '16px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ONE', startSnake);
    this.input.keyboard?.once('keydown-NUMPAD_ONE', startSnake);
    this.input.keyboard?.once('keydown-TWO', startDodge);
    this.input.keyboard?.once('keydown-NUMPAD_TWO', startDodge);
    this.input.keyboard?.once('keydown-THREE', () => {
      this.scene.start('WhackScene');
    });
    this.input.keyboard?.once('keydown-NUMPAD_THREE', () => {
      this.scene.start('WhackScene');
    });
    this.input.keyboard?.once('keydown-FOUR', startTetris);
    this.input.keyboard?.once('keydown-NUMPAD_FOUR', startTetris);
  }

  private createGameCard(config: GameCardConfig, layout: MenuLayout): void {
    const card = this.add
      .rectangle(layout.titleX, config.y, layout.cardWidth, layout.cardHeight, 0x111c30)
      .setStrokeStyle(2, 0x243655)
      .setInteractive({ useHandCursor: true });

    const leftX = layout.cardX + 18;
    const rightX = layout.cardX + layout.cardWidth - 18;

    this.add.text(leftX, config.y - layout.cardHeight * 0.32, config.label, {
      color: config.accentColor,
      fontFamily: 'Arial, sans-serif',
      fontSize: layout.portrait ? '10px' : '14px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.add.text(leftX, config.y - layout.cardHeight * 0.08, config.title, {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: layout.portrait ? '17px' : '25px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.add.text(leftX, config.y + layout.cardHeight * 0.15, config.description, {
      color: '#9aa9c2',
      fontFamily: 'Arial, sans-serif',
      fontSize: layout.portrait ? '10px' : '14px',
      lineSpacing: layout.portrait ? 2 : 0,
      wordWrap: { width: layout.cardWidth - (layout.portrait ? 170 : 170) },
      resolution: TEXT_RESOLUTION,
    });
    this.add
      .text(rightX, config.y - layout.cardHeight * 0.32, `최고 점수  ${config.highScore}`, {
        color: '#facc15',
        fontFamily: 'Arial, sans-serif',
        fontSize: layout.portrait ? '10px' : '14px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(1, 0);

    card.on('pointerover', () => {
      card.setFillStyle(0x182942).setStrokeStyle(2, config.accent);
    });
    card.on('pointerout', () => {
      card.setFillStyle(0x111c30).setStrokeStyle(2, 0x243655);
    });
    card.on('pointerdown', config.start);
  }

  private createActionButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void,
  ): void {
    const button = this.add
      .rectangle(x, y, width, height, 0x1d4ed8, 0.96)
      .setStrokeStyle(2, 0x93c5fd)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);

    button.on('pointerdown', onClick);
    button.on('pointerover', () => {
      button.setFillStyle(0x2563eb, 1).setStrokeStyle(2, 0xbfdbfe);
    });
    button.on('pointerout', () => {
      button.setFillStyle(0x1d4ed8, 0.96).setStrokeStyle(2, 0x93c5fd);
    });

    this.add
      .text(x, y, label, {
        color: '#eff6ff',
        fontFamily: 'Arial, sans-serif',
        fontSize: height <= 36 ? '14px' : '15px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(51);
  }

  private getLayout(): MenuLayout {
    const width = this.cameras.main.width || this.scale.width;
    const height = this.cameras.main.height || this.scale.height;
    const portrait = height > width;

    if (!portrait) {
      return {
        portrait: false,
        titleX: 480,
        titleY: 45,
        subtitleY: 88,
        cardX: 230,
        cardWidth: 560,
        cardHeight: 86,
        cardYs: [138, 232, 326, 420, 514],
        footerY: 516,
      };
    }

    const cardX = 24;
    const cardWidth = width - 48;
    const cardHeight = Math.min(108, Math.floor((height - 330) / 5));
    const gap = 12;
    const firstCardY = 134;

    return {
      portrait: true,
      titleX: width / 2,
      titleY: 46,
      subtitleY: 82,
      cardX,
      cardWidth,
      cardHeight,
      cardYs: [
        firstCardY,
        firstCardY + cardHeight + gap,
        firstCardY + (cardHeight + gap) * 2,
        firstCardY + (cardHeight + gap) * 3,
        firstCardY + (cardHeight + gap) * 4,
      ],
      footerY: height - 30,
    };
  }
}
