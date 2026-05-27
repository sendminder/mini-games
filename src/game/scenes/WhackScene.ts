import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import { getWhackHighScore, saveWhackHighScore } from '../storage/highScore';
import { fetchMyBestRecord, submitScore } from '../storage/leaderboard';
import { createScreenChrome } from '../ui/screen';

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

type BoardLayout = {
  left: number;
  top: number;
  cell: number;
  gap: number;
  size: number;
};

const LANDSCAPE_BOARD: BoardLayout = {
  left: 288,
  top: 96,
  cell: 120,
  gap: 12,
  size: 3,
};

const HOLE_RADIUS = 46;
const BASE_SHOW_MS = 1500;
const MIN_SHOW_MS = 600;
const BASE_SPAWN_MS = 820;
const MIN_SPAWN_MS = 340;
const START_LIVES = 3;

export class WhackScene extends Phaser.Scene {
  private board: BoardLayout = { ...LANDSCAPE_BOARD };
  private graphics!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private lifeLabelText!: Phaser.GameObjects.Text;
  private lifeHearts: Phaser.GameObjects.Text[] = [];
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
    this.board = this.getBoardLayout();
    this.resetState();
    this.createBoard();
    const chrome = createScreenChrome(this.scale.width, this.scale.height);
    const portrait = chrome.portrait;
    const width = chrome.width;
    const titleX = width / 2;
    const titleY = chrome.titleY;
    const highScoreX = portrait ? 16 : 810;
    const scoreX = portrait ? 16 : 810;
    const timeX = portrait ? width / 2 : 480;
    const timeY = portrait ? 56 : 46;
    const scoreY = chrome.topRowY;
    const lifeY = portrait ? 72 : 515;
    const footerY = chrome.footerY;
    const footerText = portrait
      ? '두더지 탭 / 클릭  |  폭탄은 피하기'
      : '두더지 탭 / 클릭  |  폭탄은 피하기';
    const backButtonX = chrome.backButtonX;
    const backButtonY = chrome.backButtonY;

    this.add.text(titleX, titleY, '두더지 잡기', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: `${chrome.titleFontSize}px`,
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);

    this.timeText = this.add.text(timeX, timeY, '경과  0.0초', {
      color: '#94a3b8',
      fontFamily: 'Arial, sans-serif',
      fontSize: `${chrome.bodyFontSize}px`,
      resolution: TEXT_RESOLUTION,
    });
    this.timeText.setOrigin(0.5);

    this.highScoreText = this.add.text(highScoreX, portrait ? 24 : 30, `최고  ${this.highScore}`, {
      color: '#facc15',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '14px' : '18px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.highScoreText.setOrigin(0, 0);

    this.scoreText = this.add.text(scoreX, scoreY, '점수  0', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '15px' : '19px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.scoreText.setOrigin(0, 0);

    this.lifeLabelText = this.add.text(portrait ? 16 : 156, lifeY, '목숨', {
      color: '#f59e0b',
      fontFamily: 'Arial, sans-serif',
      fontSize: `${Math.max(chrome.smallFontSize, 14)}px`,
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.lifeLabelText.setOrigin(0, 0);

    this.createLifeHearts((portrait ? 72 : 206), lifeY + 1, chrome.smallFontSize);

    this.add
      .text(portrait ? width / 2 : 480, footerY, footerText, {
        color: '#94a3b8',
        fontFamily: 'Arial, sans-serif',
        fontSize: portrait ? '12px' : '15px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.createBackButton(backButtonX, backButtonY);
    this.updateLifeDisplay();
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
          this.updateLifeDisplay();
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

  private createLifeHearts(startX: number, y: number, fontSize: number): void {
    const heartSize = Math.round(fontSize * 2.2);
    const gap = Math.max(28, Math.round(heartSize * 0.92));

    this.lifeHearts = [0, 1, 2].map((index) =>
      this.add
        .text(startX + index * gap, y, '♥', {
          color: '#fb7185',
          fontFamily: 'Arial, sans-serif',
          fontSize: `${heartSize}px`,
          fontStyle: 'bold',
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0, 0),
    );
  }

  private updateLifeDisplay(): void {
    this.lifeHearts.forEach((heart, index) => {
      heart.setVisible(index < this.lives);
    });
  }

  private createBoard(): void {
    const boardWidth = this.board.size * this.board.cell + (this.board.size - 1) * this.board.gap;
    const boardHeight = boardWidth;
    const boardX = this.board.left + boardWidth / 2;
    const boardY = this.board.top + boardHeight / 2;

    this.add
      .rectangle(boardX, boardY, boardWidth + 8, boardHeight + 8, 0x0d1727)
      .setStrokeStyle(2, 0x243655);

    this.graphics = this.add.graphics();
    this.graphics.setDepth(10);

    this.holes = [];

    for (let row = 0; row < this.board.size; row += 1) {
      for (let column = 0; column < this.board.size; column += 1) {
        const x = this.board.left + column * (this.board.cell + this.board.gap) + this.board.cell / 2;
        const y = this.board.top + row * (this.board.cell + this.board.gap) + this.board.cell / 2;
        const target = this.add.zone(x, y, this.board.cell, this.board.cell);
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-R', this.restart, this);
    });
  }

  private spawnEntity(): void {
    const hole = this.holes[Phaser.Math.Between(0, this.holes.length - 1)];
    const seconds = this.elapsedMs / 1000;
    const spawnChance = Math.min(0.6, 0.22 + seconds * 0.012);
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

    for (let row = 0; row < this.board.size; row += 1) {
      for (let column = 0; column < this.board.size; column += 1) {
        const x = this.board.left + column * (this.board.cell + this.board.gap) + this.board.cell / 2;
        const y = this.board.top + row * (this.board.cell + this.board.gap) + this.board.cell / 2;

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
    void this.showGameOver();
  }

  private async showGameOver(): Promise<void> {
    await submitScore('whack', this.score);
    const myBest = await fetchMyBestRecord('whack');
    const portrait = this.isPortrait();
    const width = this.scale.width;
    const height = this.scale.height;
    const panelWidth = portrait ? Math.min(360, width - 32) : 430;
    const panelHeight = portrait ? 244 : 170;
    const panelX = width / 2;
    const panelY = portrait ? Math.round(height * 0.37) : 282;
    const titleY = portrait ? panelY - 78 : 244;
    const currentScoreY = portrait ? panelY - 42 : 274;
    const bestScoreY = portrait ? panelY - 16 : 302;
    const rankY = portrait ? panelY + 10 : 330;
    const rankButtonY = portrait ? panelY + 48 : 356;
    const restartButtonY = portrait ? panelY + 92 : 392;
    const primaryWidth = portrait ? 204 : 190;
    const buttonHeight = portrait ? 38 : 40;
    const bestScoreText = myBest ? `나의 최고점수  ${myBest.score}` : '나의 최고점수  없음';
    const bestRankText = myBest ? `글로벌 등수  ${myBest.rank}위` : '글로벌 등수  -';

    this.add.rectangle(panelX + 3, panelY + 4, panelWidth, panelHeight, 0x020617, 0.55).setDepth(999);
    this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x060d18, 0.96).setStrokeStyle(2, 0x334155).setDepth(1000);
    this.add.text(panelX, titleY, '게임 오버', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '26px' : '30px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setDepth(1001);
    this.add.text(panelX, currentScoreY, `지금점수  ${this.score}`, {
      color: '#cbd5e1',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '14px' : '16px',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setDepth(1001);
    this.add.text(panelX, bestScoreY, bestScoreText, {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '13px' : '15px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setDepth(1001);
    this.add.text(panelX, rankY, bestRankText, {
      color: '#facc15',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '13px' : '15px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setDepth(1001);

    const rankButton = this.add.rectangle(panelX, rankButtonY, primaryWidth, buttonHeight, 0x1d4ed8, 0.96)
      .setStrokeStyle(3, 0x93c5fd)
      .setInteractive({ useHandCursor: true })
      .setDepth(1002);
    rankButton.on('pointerdown', () => {
      this.scene.start('RankScene', { gameKey: 'whack' });
    });
    rankButton.on('pointerover', () => {
      rankButton.setFillStyle(0x2563eb, 0.98).setStrokeStyle(3, 0xbfdbfe);
    });
    rankButton.on('pointerout', () => {
      rankButton.setFillStyle(0x1d4ed8, 0.96).setStrokeStyle(3, 0x93c5fd);
    });
    this.add.text(panelX, rankButtonY, '순위 확인하기', {
      color: '#eff6ff',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '14px' : '15px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setDepth(1003);

    const restartButton = this.add.rectangle(panelX, restartButtonY, primaryWidth, buttonHeight, 0x1d4ed8, 0.96)
      .setStrokeStyle(3, 0x93c5fd)
      .setInteractive({ useHandCursor: true })
      .setDepth(1002);
    restartButton.on('pointerdown', () => {
      this.restart();
    });
    restartButton.on('pointerover', () => {
      restartButton.setFillStyle(0x2563eb, 0.98).setStrokeStyle(3, 0xbfdbfe);
    });
    restartButton.on('pointerout', () => {
      restartButton.setFillStyle(0x1d4ed8, 0.96).setStrokeStyle(3, 0x93c5fd);
    });
    this.add.text(panelX, restartButtonY, '다시 시작', {
      color: '#eff6ff',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '15px' : '16px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setDepth(1003);
  }

  private restart(): void {
    this.scene.restart();
  }

  private openMenu(): void {
    this.scene.start('MenuScene');
  }

  private createBackButton(x: number, y: number): void {
    const buttonWidth = 96;
    const buttonHeight = 34;

    const button = this.add
      .rectangle(x, y, buttonWidth, buttonHeight, 0x111c30, 0.9)
      .setStrokeStyle(2, 0x334155)
      .setInteractive({ useHandCursor: true });

    button.on('pointerdown', () => {
      this.openMenu();
    });
    button.on('pointerover', () => {
      button.setFillStyle(0x1a2a45, 0.96).setStrokeStyle(2, 0x60a5fa);
    });
    button.on('pointerout', () => {
      button.setFillStyle(0x111c30, 0.9).setStrokeStyle(2, 0x334155);
    });

    this.add
      .text(x, y, '뒤로가기', {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);
  }

  private isPortrait(): boolean {
    return this.scale.height > this.scale.width;
  }

  private getBoardLayout(): BoardLayout {
    if (!this.isPortrait()) {
      return { ...LANDSCAPE_BOARD };
    }

    const width = this.scale.width;
    const gap = 10;
    const cell = Math.min(120, Math.floor((width - 60 - gap * 2) / 3));
    const boardWidth = 3 * cell + 2 * gap;

    return {
      left: Math.round((width - boardWidth) / 2),
      top: Math.round(Math.max(150, this.scale.height * 0.16)),
      cell,
      gap,
      size: 3,
    };
  }
}
