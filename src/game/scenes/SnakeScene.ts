import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import { getSnakeHighScore, saveSnakeHighScore } from '../storage/highScore';
import { createScreenChrome } from '../ui/screen';
import { createGameHud } from '../ui/gameHud';
import { showGameOverPanel } from '../ui/gameOver';

type Cell = {
  x: number;
  y: number;
};

type BoardLayout = {
  columns: number;
  rows: number;
  cellSize: number;
  x: number;
  y: number;
};

const LANDSCAPE_BOARD: BoardLayout = {
  columns: 26,
  rows: 16,
  cellSize: 24,
  x: 168,
  y: 100,
};

const PORTRAIT_BOARD = {
  columns: 24,
  rows: 20,
  topRatio: 0.12,
  footerGap: 184,
} as const;

const INITIAL_MOVE_DELAY = 125;
const SPEED_UP_PER_APPLE = 5;
const MIN_MOVE_DELAY = 60;

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;

export class SnakeScene extends Phaser.Scene {
  private board: BoardLayout = { ...LANDSCAPE_BOARD };
  private snake: Cell[] = [];
  private apple: Cell | null = null;
  private direction: Cell = { ...DIRECTIONS.right };
  private graphics!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private score = 0;
  private highScore = 0;
  private moveDelay = INITIAL_MOVE_DELAY;
  private nextMoveAt = 0;
  private started = false;
  private finished = false;

  constructor() {
    super('SnakeScene');
  }

  create(): void {
    configureHiDpiCamera(this.cameras.main);
    this.cameras.main.setBackgroundColor('#08111f');
    this.board = this.getBoardLayout();
    this.resetState();
    this.highScore = getSnakeHighScore();
    const chrome = createScreenChrome(this.scale.width, this.scale.height);
    const portrait = chrome.portrait;
    const width = chrome.width;
    const height = chrome.height;

    const hud = createGameHud(this, chrome, {
      title: '사과 먹는 애벌레',
      scoreLabel: '점수',
      scoreValue: 0,
      highScoreLabel: '최고',
      highScoreValue: this.highScore,
      footerText: '화살표 키로 시작',
      onBack: () => {
        this.openMenu();
      },
    });
    this.highScoreText = hud.highScoreText;
    this.scoreText = hud.scoreText;

    this.add
      .rectangle(
        this.board.x + (this.board.columns * this.board.cellSize) / 2,
        this.board.y + (this.board.rows * this.board.cellSize) / 2,
        this.board.columns * this.board.cellSize + 4,
        this.board.rows * this.board.cellSize + 4,
        0x0d1727,
      )
      .setStrokeStyle(2, 0x243655);

    this.graphics = this.add.graphics();
    this.hintText = hud.footerText;

    if (portrait) {
      this.createTouchControls(width, height);
    }

    this.placeApple();
    this.bindControls();
    this.drawBoard();
  }

  update(time: number): void {
    if (!this.started || this.finished || time < this.nextMoveAt) {
      return;
    }

    this.advanceSnake(time);
  }

  private resetState(): void {
    const middleX = Math.floor(this.board.columns / 2);
    const middleY = Math.floor(this.board.rows / 2);

    this.snake = [
      { x: middleX, y: middleY },
      { x: middleX - 1, y: middleY },
      { x: middleX - 2, y: middleY },
    ];
    this.apple = null;
    this.direction = { ...DIRECTIONS.right };
    this.score = 0;
    this.moveDelay = INITIAL_MOVE_DELAY;
    this.nextMoveAt = 0;
    this.started = false;
    this.finished = false;
  }

  private bindControls(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    keyboard.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT']);
    keyboard.on('keydown-UP', this.turnUp, this);
    keyboard.on('keydown-DOWN', this.turnDown, this);
    keyboard.on('keydown-LEFT', this.turnLeft, this);
    keyboard.on('keydown-RIGHT', this.turnRight, this);
    keyboard.on('keydown-R', this.restart, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-UP', this.turnUp, this);
      keyboard.off('keydown-DOWN', this.turnDown, this);
      keyboard.off('keydown-LEFT', this.turnLeft, this);
      keyboard.off('keydown-RIGHT', this.turnRight, this);
      keyboard.off('keydown-R', this.restart, this);
    });
  }

  private turnUp(): void {
    this.queueTurn(DIRECTIONS.up);
  }

  private turnDown(): void {
    this.queueTurn(DIRECTIONS.down);
  }

  private turnLeft(): void {
    this.queueTurn(DIRECTIONS.left);
  }

  private turnRight(): void {
    this.queueTurn(DIRECTIONS.right);
  }

  private queueTurn(nextDirection: Cell): void {
    if (
      this.finished ||
      this.isOpposite(nextDirection) ||
      (this.started && this.isSameDirection(nextDirection))
    ) {
      return;
    }

    this.direction = { ...nextDirection };
    this.started = true;
    this.hintText.setText('R: 다시 시작');
    this.advanceSnake(this.time.now);
  }

  private isOpposite(nextDirection: Cell): boolean {
    return (
      nextDirection.x === -this.direction.x &&
      nextDirection.y === -this.direction.y
    );
  }

  private isSameDirection(nextDirection: Cell): boolean {
    return nextDirection.x === this.direction.x && nextDirection.y === this.direction.y;
  }

  private advanceSnake(time: number): void {
    this.moveSnake();

    if (!this.finished) {
      this.nextMoveAt = time + this.moveDelay;
    }
  }

  private moveSnake(): void {
    const head = this.snake[0];
    const nextHead = {
      x: head.x + this.direction.x,
      y: head.y + this.direction.y,
    };

    if (this.isOutsideBoard(nextHead)) {
      this.finishGame('벽에 부딪혔습니다');
      return;
    }

    const ateApple = this.sameCell(nextHead, this.apple);
    const collisionBody = ateApple ? this.snake : this.snake.slice(0, -1);

    if (collisionBody.some((part) => this.sameCell(nextHead, part))) {
      this.finishGame('몸에 부딪혔습니다');
      return;
    }

    this.snake.unshift(nextHead);

    if (ateApple) {
      this.score += 1;
      this.moveDelay = Math.max(MIN_MOVE_DELAY, this.moveDelay - SPEED_UP_PER_APPLE);
      this.scoreText.setText(`점수  ${this.score}`);
      this.updateHighScore();

      if (!this.placeApple()) {
        this.finishGame('모든 사과를 먹었습니다!');
      }
    } else {
      this.snake.pop();
    }

    this.drawBoard();
  }

  private placeApple(): boolean {
    const availableCells: Cell[] = [];

    for (let y = 0; y < this.board.rows; y += 1) {
      for (let x = 0; x < this.board.columns; x += 1) {
        const candidate = { x, y };

        if (!this.snake.some((part) => this.sameCell(part, candidate))) {
          availableCells.push(candidate);
        }
      }
    }

    if (availableCells.length === 0) {
      this.apple = null;
      return false;
    }

    this.apple = availableCells[Phaser.Math.Between(0, availableCells.length - 1)];
    return true;
  }

  private drawBoard(): void {
    this.graphics.clear();
    this.graphics.lineStyle(1, 0x172439, 1);

    for (let column = 1; column < this.board.columns; column += 1) {
      const x = this.board.x + column * this.board.cellSize;
      this.graphics.lineBetween(x, this.board.y, x, this.board.y + this.board.rows * this.board.cellSize);
    }

    for (let row = 1; row < this.board.rows; row += 1) {
      const y = this.board.y + row * this.board.cellSize;
      this.graphics.lineBetween(this.board.x, y, this.board.x + this.board.columns * this.board.cellSize, y);
    }

    if (this.apple) {
      const appleX = this.board.x + this.apple.x * this.board.cellSize + this.board.cellSize / 2;
      const appleY = this.board.y + this.apple.y * this.board.cellSize + this.board.cellSize / 2;
      const appleRadius = Math.max(9, Math.floor(this.board.cellSize * 0.42));
      this.graphics.fillStyle(0xef4444);
      this.graphics.fillCircle(appleX, appleY + 1, appleRadius);
      this.graphics.lineStyle(3, 0x4ade80);
      this.graphics.lineBetween(appleX, appleY - appleRadius + 1, appleX + 5, appleY - appleRadius - 4);
    }

    this.snake.forEach((part, index) => {
      const padding = Math.max(1, Math.floor(this.board.cellSize * 0.08));
      const radius = Math.max(4, Math.floor(this.board.cellSize * 0.22));
      this.graphics.fillStyle(index === 0 ? 0x86efac : 0x22c55e);
      this.graphics.fillRoundedRect(
        this.board.x + part.x * this.board.cellSize + padding,
        this.board.y + part.y * this.board.cellSize + padding,
        this.board.cellSize - padding * 2,
        this.board.cellSize - padding * 2,
        radius,
      );
    });
  }

  private finishGame(_message: string): void {
    this.finished = true;
    this.started = false;
    this.drawBoard();
    void showGameOverPanel(this, {
      gameKey: 'snake',
      score: this.score,
      onRank: () => {
        this.scene.start('RankScene', { gameKey: 'snake' });
      },
      onRestart: () => {
        this.restart();
      },
    });
  }

  private updateHighScore(): void {
    if (this.score <= this.highScore) {
      return;
    }

    this.highScore = saveSnakeHighScore(this.score);
    this.highScoreText.setText(`최고  ${this.highScore}`);
  }

  private isOutsideBoard(cell: Cell): boolean {
    return cell.x < 0 || cell.x >= this.board.columns || cell.y < 0 || cell.y >= this.board.rows;
  }

  private sameCell(first: Cell, second: Cell | null): boolean {
    return second !== null && first.x === second.x && first.y === second.y;
  }

  private isPortrait(): boolean {
    return this.scale.height > this.scale.width;
  }

  private getBoardLayout(): BoardLayout {
    if (!this.isPortrait()) {
      return { ...LANDSCAPE_BOARD };
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const usableHeight = height - PORTRAIT_BOARD.footerGap;
    const maxCellByWidth = Math.floor((width - 24) / PORTRAIT_BOARD.columns);
    const cellSize = Math.max(
      14,
      Math.min(
        18,
        maxCellByWidth,
        Math.floor(usableHeight / PORTRAIT_BOARD.rows),
      ),
    );
    const boardWidth = PORTRAIT_BOARD.columns * cellSize;
    return {
      columns: PORTRAIT_BOARD.columns,
      rows: PORTRAIT_BOARD.rows,
      cellSize,
      x: Math.round((width - boardWidth) / 2),
      y: Math.round(Math.max(108, height * PORTRAIT_BOARD.topRatio)),
    };
  }

  private createTouchControls(width: number, height: number): void {
    const centerX = width / 2;
    const boardBottom = this.board.y + this.board.rows * this.board.cellSize;
    const sidePadding = 14;
    const buttonGap = 10;
    const buttonHeight = Phaser.Math.Clamp(Math.floor((height - boardBottom - 44) / 2), 48, 58);
    const buttonWidth = Math.min(86, Math.floor((width - sidePadding * 2 - buttonGap * 2) / 3));
    const topRowY = Math.min(
      height - buttonHeight * 1.5 - 30,
      Math.max(boardBottom + buttonHeight / 2 + 16, Math.round(height * 0.72)),
    );
    const bottomRowY = Math.min(
      height - buttonHeight / 2 - 20,
      topRowY + buttonHeight + 12,
    );
    const verticalButtonWidth = Math.min(106, Math.floor((width - sidePadding * 2 - buttonGap) / 2));

    const createButton = (
      x: number,
      y: number,
      widthValue: number,
      label: string,
      onDown: () => void,
    ): void => {
      this.add
        .rectangle(x, y, widthValue, buttonHeight, 0x111c30, 0.9)
        .setStrokeStyle(2, 0x334155)
        .setInteractive({ useHandCursor: true })
        .setDepth(20)
        .on('pointerdown', onDown)
        .on('pointerover', function onOver(this: Phaser.GameObjects.Rectangle) {
          this.setFillStyle(0x1a2a45, 0.95).setStrokeStyle(2, 0x60a5fa);
        })
        .on('pointerout', function onOut(this: Phaser.GameObjects.Rectangle) {
          this.setFillStyle(0x111c30, 0.86).setStrokeStyle(2, 0x334155);
        });

      this.add
        .text(x, y, label, {
          color: '#f8fafc',
          fontFamily: 'Arial, sans-serif',
          fontSize: '24px',
          fontStyle: 'bold',
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5)
        .setDepth(21);
    };

    createButton(centerX - buttonWidth - buttonGap, topRowY, buttonWidth, '←', this.turnLeft.bind(this));
    createButton(centerX, topRowY, buttonWidth, '↑', this.turnUp.bind(this));
    createButton(centerX + buttonWidth + buttonGap, topRowY, buttonWidth, '→', this.turnRight.bind(this));
    createButton(centerX, bottomRowY, verticalButtonWidth, '↓', this.turnDown.bind(this));
  }

  private restart(): void {
    this.scene.restart();
  }

  private openMenu(): void {
    this.scene.start('MenuScene');
  }
}
