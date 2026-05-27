import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import { getSnakeHighScore, saveSnakeHighScore } from '../storage/highScore';

type Cell = {
  x: number;
  y: number;
};

const BOARD = {
  columns: 26,
  rows: 16,
  cellSize: 24,
  x: 168,
  y: 100,
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
    this.resetState();
    this.highScore = getSnakeHighScore();

    this.add
      .text(168, 33, '사과 먹는 애벌레', {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: '27px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      });

    this.highScoreText = this.add.text(792, 30, `최고  ${this.highScore}`, {
      color: '#facc15',
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.highScoreText.setOrigin(1, 0);

    this.scoreText = this.add.text(792, 53, '점수  0', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.scoreText.setOrigin(1, 0);

    this.add
      .rectangle(
        BOARD.x + (BOARD.columns * BOARD.cellSize) / 2,
        BOARD.y + (BOARD.rows * BOARD.cellSize) / 2,
        BOARD.columns * BOARD.cellSize + 4,
        BOARD.rows * BOARD.cellSize + 4,
        0x0d1727,
      )
      .setStrokeStyle(2, 0x243655);

    this.graphics = this.add.graphics();
    this.hintText = this.add
      .text(480, 514, '화살표 키로 시작  |  Esc: 목록으로', {
        color: '#94a3b8',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

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
    const middleX = Math.floor(BOARD.columns / 2);
    const middleY = Math.floor(BOARD.rows / 2);

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
    keyboard.on('keydown-ESC', this.openMenu, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-UP', this.turnUp, this);
      keyboard.off('keydown-DOWN', this.turnDown, this);
      keyboard.off('keydown-LEFT', this.turnLeft, this);
      keyboard.off('keydown-RIGHT', this.turnRight, this);
      keyboard.off('keydown-R', this.restart, this);
      keyboard.off('keydown-ESC', this.openMenu, this);
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
    this.hintText.setText('Esc: 목록으로  |  R: 다시 시작');
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

    for (let y = 0; y < BOARD.rows; y += 1) {
      for (let x = 0; x < BOARD.columns; x += 1) {
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

    for (let column = 1; column < BOARD.columns; column += 1) {
      const x = BOARD.x + column * BOARD.cellSize;
      this.graphics.lineBetween(x, BOARD.y, x, BOARD.y + BOARD.rows * BOARD.cellSize);
    }

    for (let row = 1; row < BOARD.rows; row += 1) {
      const y = BOARD.y + row * BOARD.cellSize;
      this.graphics.lineBetween(BOARD.x, y, BOARD.x + BOARD.columns * BOARD.cellSize, y);
    }

    if (this.apple) {
      const appleX = BOARD.x + this.apple.x * BOARD.cellSize + BOARD.cellSize / 2;
      const appleY = BOARD.y + this.apple.y * BOARD.cellSize + BOARD.cellSize / 2;
      this.graphics.fillStyle(0xef4444);
      this.graphics.fillCircle(appleX, appleY + 1, 8);
      this.graphics.lineStyle(3, 0x4ade80);
      this.graphics.lineBetween(appleX, appleY - 7, appleX + 4, appleY - 12);
    }

    this.snake.forEach((part, index) => {
      const x = BOARD.x + part.x * BOARD.cellSize + 3;
      const y = BOARD.y + part.y * BOARD.cellSize + 3;
      this.graphics.fillStyle(index === 0 ? 0x86efac : 0x22c55e);
      this.graphics.fillRoundedRect(x, y, BOARD.cellSize - 6, BOARD.cellSize - 6, 5);
    });
  }

  private finishGame(message: string): void {
    this.finished = true;
    this.started = false;

    this.add
      .rectangle(480, 292, 390, 174, 0x060d18, 0.96)
      .setStrokeStyle(2, 0x334155);

    this.add
      .text(480, 255, '게임 오버', {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.add
      .text(480, 294, `${message}  |  점수 ${this.score}`, {
        color: '#cbd5e1',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.add
      .text(480, 335, 'R: 다시 시작   Esc: 게임 목록', {
        color: '#4ade80',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);
  }

  private updateHighScore(): void {
    if (this.score <= this.highScore) {
      return;
    }

    this.highScore = saveSnakeHighScore(this.score);
    this.highScoreText.setText(`최고  ${this.highScore}`);
  }

  private isOutsideBoard(cell: Cell): boolean {
    return cell.x < 0 || cell.x >= BOARD.columns || cell.y < 0 || cell.y >= BOARD.rows;
  }

  private sameCell(first: Cell, second: Cell | null): boolean {
    return second !== null && first.x === second.x && first.y === second.y;
  }

  private restart(): void {
    this.scene.restart();
  }

  private openMenu(): void {
    this.scene.start('MenuScene');
  }
}
