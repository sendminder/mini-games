import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import { getWhackHighScore, saveWhackHighScore } from '../storage/highScore';

type MoleKind = 'mole' | 'bomb';

type Hole = {
  x: number;
  y: number;
  key: string;
  target: Phaser.GameObjects.Zone;
  active: boolean;
  kind: MoleKind | null;
  expiresAt: number;
  popProgress: number;
  scale: number;
  tweenOut: number;
};

const BOARD = {
  left: 156,
  top: 118,
  cell: 152,
  gap: 18,
  size: 3,
} as const;

const BOARD_SIZE = BOARD.size * BOARD.cell + (BOARD.size - 1) * BOARD.gap;
const HOLE_RADIUS = 46;
const BASE_SHOW_MS = 1050;
const MIN_SHOW_MS = 430;
const BASE_SPAWN_MS = 820;
const MIN_SPAWN_MS = 340;
const START_LIVES = 3;

export class WhackScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private lifeText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private holes: Hole[] = [];
  private activeHole: Hole | null = null;
  private elapsedMs = 0;
  private nextSpawnMs = 250;
  private score = 0;
  private lives = START_LIVES;
  private highScore = 0;
  private finished = false;

  constructor() {
    super('WhackScene');
  }

  create(): void {
    configureHiDpiCamera(this.cameras.main);
    this.cameras.main.setBackgroundColor('#08111f');
    this.highScore = getWhackHighScore();
    this.resetState();
    this.createBoard();

    this.add.text(156, 34, '두더지 잡기', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: '27px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });

    this.timeText = this.add.text(480, 46, '경과  0.0초', {
      color: '#94a3b8',
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      resolution: TEXT_RESOLUTION,
    });
    this.timeText.setOrigin(0.5);

    this.highScoreText = this.add.text(810, 30, `최고  ${this.highScore}`, {
      color: '#facc15',
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.highScoreText.setOrigin(1, 0);

    this.scoreText = this.add.text(810, 53, '점수  0', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.scoreText.setOrigin(1, 0);

    this.lifeText = this.add.text(156, 515, '목숨  3', {
      color: '#f59e0b',
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });

    this.add
      .text(480, 515, '두더지 탭 / 클릭  |  폭탄은 피하기  |  Esc: 목록  R: 재시작', {
        color: '#94a3b8',
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.bindControls();
    this.drawBoard();
    this.spawnEntity();
  }

  update(_time: number, delta: number): void {
    if (this.finished) {
      return;
    }

    const frameMs = Math.min(delta, 50);
    this.elapsedMs += frameMs;
    this.nextSpawnMs -= frameMs;

    for (const hole of this.holes) {
      if (!hole.active) {
        continue;
      }

      hole.scale = Math.min(1, hole.scale + frameMs / 110);
      hole.popProgress = Math.min(1, hole.popProgress + frameMs / 130);
      if (this.elapsedMs >= hole.expiresAt) {
        if (hole.kind === 'mole') {
          this.lives -= 1;
          this.lifeText.setText(`목숨  ${this.lives}`);
          if (this.lives <= 0) {
            this.finishGame();
            return;
          }
        }

        hole.active = false;
        hole.kind = null;
        hole.scale = 0;
        hole.tweenOut = 0;
        if (this.activeHole === hole) {
          this.activeHole = null;
        }
      }
    }

    if (this.nextSpawnMs <= 0 && !this.activeHole) {
      this.spawnEntity();
    }

    this.timeText.setText(`경과  ${(this.elapsedMs / 1000).toFixed(1)}초`);
    this.drawBoard();
  }

  private resetState(): void {
    this.holes = [];
    this.activeHole = null;
    this.elapsedMs = 0;
    this.nextSpawnMs = 200;
    this.score = 0;
    this.lives = START_LIVES;
    this.finished = false;
  }

  private createBoard(): void {
    const boardX = BOARD.left + BOARD_SIZE / 2;
    const boardY = BOARD.top + BOARD_SIZE / 2;

    this.add
      .rectangle(boardX, boardY, BOARD_SIZE + 8, BOARD_SIZE + 8, 0x0d1727)
      .setStrokeStyle(2, 0x243655);

    this.graphics = this.add.graphics();
    this.graphics.setDepth(10);

    this.holes = [];

    for (let row = 0; row < BOARD.size; row += 1) {
      for (let column = 0; column < BOARD.size; column += 1) {
        const x = BOARD.left + column * (BOARD.cell + BOARD.gap) + BOARD.cell / 2;
        const y = BOARD.top + row * (BOARD.cell + BOARD.gap) + BOARD.cell / 2;
        const target = this.add.zone(x, y, BOARD.cell, BOARD.cell);
        const hole: Hole = {
          x,
          y,
          key: `${row}-${column}`,
          target,
          active: false,
          kind: null,
          expiresAt: 0,
          popProgress: 0,
          scale: 0,
          tweenOut: 0,
        };

        target.setInteractive({ useHandCursor: true });
        target.on('pointerdown', () => {
          this.hitHole(hole);
        });

        this.holes.push(hole);
      }
    }
  }

  private bindControls(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    keyboard.on('keydown-R', this.restart, this);
    keyboard.on('keydown-ESC', this.openMenu, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-R', this.restart, this);
      keyboard.off('keydown-ESC', this.openMenu, this);
    });
  }

  private spawnEntity(): void {
    const hole = this.holes[Phaser.Math.Between(0, this.holes.length - 1)];
    const seconds = this.elapsedMs / 1000;
    const spawnChance = Math.min(0.68, 0.22 + seconds * 0.012);
    const isBomb = Math.random() < spawnChance;
    const showMs = Math.max(MIN_SHOW_MS, BASE_SHOW_MS - seconds * 22);

    this.activeHole = hole;
    hole.active = true;
    hole.kind = isBomb ? 'bomb' : 'mole';
    hole.expiresAt = this.elapsedMs + showMs;
    hole.popProgress = 0;
    hole.scale = 0.05;
    hole.tweenOut = 0;

    this.nextSpawnMs = Math.max(MIN_SPAWN_MS, BASE_SPAWN_MS - seconds * 28);
  }

  private hitHole(hole: Hole): void {
    if (this.finished || !hole.active || this.activeHole !== hole) {
      return;
    }

    if (hole.kind === 'bomb') {
      this.finishGame();
      return;
    }

    this.score += 1;
    hole.active = false;
    hole.kind = null;
    hole.scale = 0;
    hole.tweenOut = 0;
    this.activeHole = null;
    this.scoreText.setText(`점수  ${this.score}`);
    this.updateHighScore();
    this.spawnEntity();
  }

  private drawBoard(): void {
    this.graphics.clear();
    this.graphics.lineStyle(1, 0x172439, 1);

    for (let row = 0; row < BOARD.size; row += 1) {
      for (let column = 0; column < BOARD.size; column += 1) {
        const x = BOARD.left + column * (BOARD.cell + BOARD.gap) + BOARD.cell / 2;
        const y = BOARD.top + row * (BOARD.cell + BOARD.gap) + BOARD.cell / 2;

        this.graphics.fillStyle(0x0a1321);
        this.graphics.fillCircle(x, y + 8, HOLE_RADIUS);
        this.graphics.fillStyle(0x1b2433);
        this.graphics.fillCircle(x, y + 3, HOLE_RADIUS - 12);
        this.graphics.fillStyle(0x0d1727);
        this.graphics.fillCircle(x, y + 2, HOLE_RADIUS - 17);
      }
    }

    for (const hole of this.holes) {
      if (!hole.active || hole.scale <= 0) {
        continue;
      }

      this.drawEntity(hole.x, hole.y, hole.kind, hole.scale, hole.popProgress);
    }
  }

  private drawEntity(x: number, y: number, kind: MoleKind | null, scale: number, popProgress: number): void {
    const bounce = Math.sin(Math.min(1, popProgress) * Math.PI);
    const bodyY = y + 10 - bounce * 42;
    const bodyScale = 0.72 + scale * 0.34;

    if (kind === 'bomb') {
      this.graphics.fillStyle(0x111827);
      this.graphics.fillCircle(x, bodyY - 3, 25 * bodyScale);
      this.graphics.fillStyle(0xdc2626);
      this.graphics.fillCircle(x, bodyY - 5, 18 * bodyScale);
      this.graphics.fillStyle(0xfca5a5);
      this.graphics.fillCircle(x - 7, bodyY - 9, 4);
      this.graphics.fillCircle(x + 7, bodyY - 9, 4);
      this.graphics.lineStyle(4, 0xfde68a, 1);
      this.graphics.lineBetween(x, bodyY - 26, x + 12, bodyY - 38);
      this.graphics.lineBetween(x + 12, bodyY - 38, x + 18, bodyY - 34);
      return;
    }

    this.graphics.fillStyle(0x8b451f);
    this.graphics.fillCircle(x, bodyY + 1, 20 * bodyScale);
    this.graphics.fillCircle(x, bodyY - 16, 14 * bodyScale);
    this.graphics.fillStyle(0xf8fafc);
    this.graphics.fillCircle(x - 6, bodyY - 18, 2.8);
    this.graphics.fillCircle(x + 6, bodyY - 18, 2.8);
    this.graphics.fillStyle(0x111827);
    this.graphics.fillCircle(x - 6, bodyY - 18, 1.1);
    this.graphics.fillCircle(x + 6, bodyY - 18, 1.1);
    this.graphics.lineStyle(3, 0x5b3415, 1);
    this.graphics.lineBetween(x - 10, bodyY + 10, x - 18, bodyY + 20);
    this.graphics.lineBetween(x + 10, bodyY + 10, x + 18, bodyY + 20);
  }

  private updateHighScore(): void {
    if (this.score <= this.highScore) {
      return;
    }

    this.highScore = saveWhackHighScore(this.score);
    this.highScoreText.setText(`최고  ${this.highScore}`);
  }

  private finishGame(): void {
    this.finished = true;
    this.updateHighScore();

    this.add
      .rectangle(480, 284, 410, 174, 0x060d18, 0.96)
      .setStrokeStyle(2, 0x334155);
    this.add
      .text(480, 245, '게임 오버', {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);
    this.add
      .text(480, 287, `점수 ${this.score}  |  ${(this.elapsedMs / 1000).toFixed(1)}초`, {
        color: '#cbd5e1',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);
    this.add
      .text(480, 327, 'R: 다시 시작   Esc: 게임 목록', {
        color: '#60a5fa',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);
  }

  private restart(): void {
    this.scene.restart();
  }

  private openMenu(): void {
    this.scene.start('MenuScene');
  }
}
