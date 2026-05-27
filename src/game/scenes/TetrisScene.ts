import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import { getTetrisHighScore, saveTetrisHighScore } from '../storage/highScore';
import { createScreenChrome } from '../ui/screen';
import { createGameHud } from '../ui/gameHud';
import { showGameOverPanel } from '../ui/gameOver';

type Cell = {
  x: number;
  y: number;
};

type ShapeKey = 'I' | 'O' | 'T' | 'L' | 'J' | 'S' | 'Z';

type Piece = {
  shape: ShapeKey;
  rotation: number;
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

const BOARD_COLUMNS = 10;
const BOARD_ROWS = 20;
const INITIAL_DROP_MS = 820;
const MIN_DROP_MS = 180;
const DROP_STEP_MS = 55;
const SOFT_DROP_MS = 65;
const PIECE_START_X = 3;
const PIECE_START_Y = 0;

const SHAPES: Record<ShapeKey, { color: number; rotations: Cell[][] }> = {
  I: {
    color: 0x67e8f9,
    rotations: [
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
      [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
      [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
    ],
  },
  O: {
    color: 0xfbbf24,
    rotations: [
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    ],
  },
  T: {
    color: 0xa78bfa,
    rotations: [
      [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
      [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
    ],
  },
  L: {
    color: 0xfb923c,
    rotations: [
      [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }],
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
    ],
  },
  J: {
    color: 0x60a5fa,
    rotations: [
      [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
    ],
  },
  S: {
    color: 0x4ade80,
    rotations: [
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    ],
  },
  Z: {
    color: 0xf87171,
    rotations: [
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    ],
  },
};

const SHAPE_KEYS: ShapeKey[] = ['I', 'O', 'T', 'L', 'J', 'S', 'Z'];
const SCORE_BY_LINES = [0, 1, 3, 5, 10];

export class TetrisScene extends Phaser.Scene {
  private board: (number | null)[][] = [];
  private boardLayout!: BoardLayout;
  private graphics!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private score = 0;
  private highScore = 0;
  private linesCleared = 0;
  private level = 0;
  private dropDelay = INITIAL_DROP_MS;
  private dropAccumulator = 0;
  private currentPiece: Piece | null = null;
  private nextPiece: Piece | null = null;
  private bag: ShapeKey[] = [];
  private finished = false;
  private softDropHeld = false;
  private moveLocked = false;

  constructor() {
    super('TetrisScene');
  }

  create(): void {
    configureHiDpiCamera(this.cameras.main);
    this.cameras.main.setBackgroundColor('#08111f');
    this.highScore = getTetrisHighScore();
    this.boardLayout = this.getBoardLayout();
    this.board = this.createEmptyBoard();
    this.resetState();

    const chrome = createScreenChrome(this.scale.width, this.scale.height);
    const portrait = chrome.portrait;
    const footerText = portrait
      ? '버튼으로 이동 / 회전 / 낙하'
      : '← → 이동  |  ↑ 회전  |  ↓ 빠르게  |  Space 낙하';

    const hud = createGameHud(this, chrome, {
      title: '테트리스 라이트',
      scoreLabel: '점수',
      scoreValue: 0,
      highScoreLabel: '최고',
      highScoreValue: this.highScore,
      footerText,
      onBack: () => {
        this.openMenu();
      },
      titleFontSize: chrome.titleFontSize,
      scoreFontSize: portrait ? 15 : 19,
      highScoreFontSize: portrait ? 14 : 18,
      footerFontSize: portrait ? 12 : 14,
    });
    this.highScoreText = hud.highScoreText;
    this.scoreText = hud.scoreText;

    this.graphics = this.add.graphics();
    this.graphics.setDepth(10);

    if (portrait) {
      this.createTouchControls();
    }

    this.bindControls();
    this.prepareNextPiece();
    this.spawnPiece();
    this.drawBoard();
  }

  update(_time: number, delta: number): void {
    if (this.finished) {
      return;
    }

    const frameMs = Math.min(delta, 50);
    this.dropAccumulator += frameMs;

    const effectiveDelay = this.softDropHeld ? SOFT_DROP_MS : this.dropDelay;
    let stepCount = 0;

    while (this.dropAccumulator >= effectiveDelay && stepCount < 4 && !this.finished) {
      this.dropAccumulator -= effectiveDelay;
      if (!this.stepDown()) {
        break;
      }
      stepCount += 1;
    }

    this.drawBoard();
  }

  private resetState(): void {
    this.board = this.createEmptyBoard();
    this.score = 0;
    this.linesCleared = 0;
    this.level = 0;
    this.dropDelay = INITIAL_DROP_MS;
    this.dropAccumulator = 0;
    this.currentPiece = null;
    this.nextPiece = null;
    this.bag = [];
    this.finished = false;
    this.softDropHeld = false;
    this.moveLocked = false;
  }

  private bindControls(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    keyboard.addCapture(['LEFT', 'RIGHT', 'UP', 'DOWN', 'SPACE', 'Z', 'X']);
    keyboard.on('keydown-LEFT', this.moveLeft, this);
    keyboard.on('keydown-RIGHT', this.moveRight, this);
    keyboard.on('keydown-UP', this.rotatePiece, this);
    keyboard.on('keydown-Z', this.rotatePiece, this);
    keyboard.on('keydown-X', this.rotatePiece, this);
    keyboard.on('keydown-SPACE', this.hardDrop, this);
    keyboard.on('keydown-DOWN', this.handleSoftDropStart, this);
    keyboard.on('keyup-DOWN', this.handleSoftDropEnd, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-LEFT', this.moveLeft, this);
      keyboard.off('keydown-RIGHT', this.moveRight, this);
      keyboard.off('keydown-UP', this.rotatePiece, this);
      keyboard.off('keydown-Z', this.rotatePiece, this);
      keyboard.off('keydown-X', this.rotatePiece, this);
      keyboard.off('keydown-SPACE', this.hardDrop, this);
      keyboard.off('keydown-DOWN', this.handleSoftDropStart, this);
      keyboard.off('keyup-DOWN', this.handleSoftDropEnd, this);
    });
  }

  private handleSoftDropStart(): void {
    this.softDropHeld = true;
  }

  private handleSoftDropEnd(): void {
    this.softDropHeld = false;
  }

  private moveLeft(): void {
    this.movePiece(-1);
  }

  private moveRight(): void {
    this.movePiece(1);
  }

  private movePiece(dx: number): void {
    if (this.finished || this.currentPiece === null || this.moveLocked) {
      return;
    }

    const candidate = { ...this.currentPiece, x: this.currentPiece.x + dx };
    if (this.canPlace(candidate)) {
      this.currentPiece = candidate;
      this.drawBoard();
    }
  }

  private rotatePiece(): void {
    if (this.finished || this.currentPiece === null || this.moveLocked) {
      return;
    }

    const nextRotation = (this.currentPiece.rotation + 1) % 4;
    const offsets = [0, -1, 1, -2, 2];

    for (const offset of offsets) {
      const candidate = {
        ...this.currentPiece,
        rotation: nextRotation,
        x: this.currentPiece.x + offset,
      };

      if (this.canPlace(candidate)) {
        this.currentPiece = candidate;
        this.drawBoard();
        return;
      }
    }
  }

  private hardDrop(): void {
    if (this.finished || this.currentPiece === null || this.moveLocked) {
      return;
    }

    while (this.canPlace({ ...this.currentPiece, y: this.currentPiece.y + 1 })) {
      this.currentPiece.y += 1;
    }

    this.lockPiece();
    this.drawBoard();
  }

  private stepDown(): boolean {
    if (this.finished || this.currentPiece === null || this.moveLocked) {
      return false;
    }

    const candidate = { ...this.currentPiece, y: this.currentPiece.y + 1 };

    if (this.canPlace(candidate)) {
      this.currentPiece = candidate;
      return true;
    }

    this.lockPiece();
    return false;
  }

  private lockPiece(): void {
    if (this.currentPiece === null) {
      return;
    }

    const blocks = this.getPieceBlocks(this.currentPiece);
    for (const block of blocks) {
      if (block.y < 0) {
        this.finishGame();
        return;
      }
      if (block.y >= 0 && block.y < BOARD_ROWS && block.x >= 0 && block.x < BOARD_COLUMNS) {
        this.board[block.y][block.x] = SHAPES[this.currentPiece.shape].color;
      }
    }

    const cleared = this.clearLines();
    if (cleared > 0) {
      this.linesCleared += cleared;
      this.addScore(SCORE_BY_LINES[cleared]);
    }

    this.spawnPiece();
  }

  private spawnPiece(): void {
    const shape = this.nextPiece?.shape ?? this.drawNextShape();
    this.nextPiece = {
      shape: this.drawNextShape(),
      rotation: 0,
      x: PIECE_START_X,
      y: PIECE_START_Y,
    };
    this.currentPiece = {
      shape,
      rotation: 0,
      x: PIECE_START_X,
      y: PIECE_START_Y,
    };
    this.moveLocked = false;

    if (!this.canPlace(this.currentPiece)) {
      this.finishGame();
      return;
    }

    this.drawBoard();
  }

  private prepareNextPiece(): void {
    if (this.nextPiece !== null) {
      return;
    }

    this.nextPiece = {
      shape: this.drawNextShape(),
      rotation: 0,
      x: PIECE_START_X,
      y: PIECE_START_Y,
    };
  }

  private drawNextShape(): ShapeKey {
    if (this.bag.length === 0) {
      this.bag = Phaser.Utils.Array.Shuffle([...SHAPE_KEYS]);
    }

    return this.bag.shift() ?? 'I';
  }

  private clearLines(): number {
    let cleared = 0;

    for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
      if (this.board[row].every((cell) => cell !== null)) {
        this.board.splice(row, 1);
        this.board.unshift(this.createEmptyRow());
        cleared += 1;
        row += 1;
      }
    }

    return cleared;
  }

  private drawBoard(): void {
    const { x, y, cellSize } = this.boardLayout;
    const boardWidth = BOARD_COLUMNS * cellSize;
    const boardHeight = BOARD_ROWS * cellSize;
    const preview = this.getPreviewLayout();

    this.graphics.clear();
    this.graphics.fillStyle(0x0d1727, 1);
    this.graphics.fillRoundedRect(x - 4, y - 4, boardWidth + 8, boardHeight + 8, 8);
    this.graphics.lineStyle(2, 0x243655);
    this.graphics.strokeRoundedRect(x - 4, y - 4, boardWidth + 8, boardHeight + 8, 8);

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let column = 0; column < BOARD_COLUMNS; column += 1) {
        const cellColor = this.board[row][column];
        const cellX = x + column * cellSize;
        const cellY = y + row * cellSize;

        this.graphics.fillStyle(0x111c30, 0.28);
        this.graphics.fillRect(cellX + 1, cellY + 1, cellSize - 2, cellSize - 2);

        if (cellColor !== null) {
          this.drawTetrisCell(cellX, cellY, cellSize, cellColor);
        }
      }
    }

    if (this.currentPiece !== null) {
      for (const block of this.getPieceBlocks(this.currentPiece)) {
        if (block.y < 0) {
          continue;
        }

        this.drawTetrisCell(
          x + block.x * cellSize,
          y + block.y * cellSize,
          cellSize,
          SHAPES[this.currentPiece.shape].color,
        );
      }
    }

    this.drawNextPreview(preview.x, preview.y, preview.cellSize, preview.width, preview.height);
  }

  private drawNextPreview(x: number, y: number, cellSize: number, width: number, height: number): void {
    if (this.nextPiece === null) {
      return;
    }

    const shape = SHAPES[this.nextPiece.shape];
    const blocks = shape.rotations[0];
    const offsetX = x + 6;
    const offsetY = y + 18;

    this.graphics.fillStyle(0x060d18, 0.88);
    this.graphics.fillRoundedRect(x, y, width, height, 8);
    this.graphics.lineStyle(2, 0x334155);
    this.graphics.strokeRoundedRect(x, y, width, height, 8);

    for (const block of blocks) {
      const cellX = offsetX + block.x * cellSize;
      const cellY = offsetY + block.y * cellSize;

      this.graphics.fillStyle(shape.color);
      this.graphics.fillRoundedRect(cellX, cellY, cellSize - 2, cellSize - 2, 4);
      this.graphics.lineStyle(1, 0xffffff, 0.14);
      this.graphics.strokeRoundedRect(cellX, cellY, cellSize - 2, cellSize - 2, 4);
    }
  }

  private drawTetrisCell(x: number, y: number, size: number, color: number): void {
    const padding = Math.max(2, Math.floor(size * 0.12));
    this.graphics.fillStyle(color);
    this.graphics.fillRoundedRect(x + padding, y + padding, size - padding * 2, size - padding * 2, 4);
    this.graphics.lineStyle(1, 0xffffff, 0.12);
    this.graphics.strokeRoundedRect(x + padding, y + padding, size - padding * 2, size - padding * 2, 4);
  }

  private getPieceBlocks(piece: Piece): Cell[] {
    return SHAPES[piece.shape].rotations[piece.rotation].map((block) => ({
      x: piece.x + block.x,
      y: piece.y + block.y,
    }));
  }

  private canPlace(piece: Piece): boolean {
    const blocks = this.getPieceBlocks(piece);

    for (const block of blocks) {
      if (block.x < 0 || block.x >= BOARD_COLUMNS || block.y >= BOARD_ROWS) {
        return false;
      }

      if (block.y >= 0 && this.board[block.y][block.x] !== null) {
        return false;
      }
    }

    return true;
  }

  private updateHighScore(): void {
    if (this.score <= this.highScore) {
      return;
    }

    this.highScore = saveTetrisHighScore(this.score);
    this.highScoreText.setText(`최고  ${this.highScore}`);
  }

  private addScore(amount: number): void {
    if (amount <= 0) {
      return;
    }

    this.score += amount;
    this.level = Math.floor(this.score / 15);
    this.dropDelay = Math.max(MIN_DROP_MS, INITIAL_DROP_MS - this.level * DROP_STEP_MS);
    this.scoreText.setText(`점수  ${this.score}`);
    this.updateHighScore();
  }

  private finishGame(): void {
    if (this.finished) {
      return;
    }

    this.finished = true;
    this.updateHighScore();
    void showGameOverPanel(this, {
      gameKey: 'tetris',
      score: this.score,
      onRank: () => {
        this.scene.start('RankScene', { gameKey: 'tetris' });
      },
      onRestart: () => {
        this.restart();
      },
    });
  }

  private createTouchControls(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const boardBottom = this.boardLayout.y + BOARD_ROWS * this.boardLayout.cellSize;
    const centerX = width / 2;
    const buttonSize = 60;
    const gap = 14;
    const downY = Math.min(height - 100, Math.max(boardBottom + 64, Math.round(height * 0.76)));
    const rowY = Math.max(boardBottom + 20, downY - buttonSize - 14);

    const createButton = (
      x: number,
      y: number,
      label: string,
      onDown: () => void,
      onUp?: () => void,
    ): void => {
      this.add
        .rectangle(x, y, buttonSize, buttonSize, 0x111c30, 0.88)
        .setStrokeStyle(2, 0x334155)
        .setInteractive({ useHandCursor: true })
        .setDepth(20)
        .on('pointerdown', onDown)
        .on('pointerup', () => {
          onUp?.();
        })
        .on('pointerover', function onOver(this: Phaser.GameObjects.Rectangle) {
          this.setFillStyle(0x1a2a45, 0.96).setStrokeStyle(2, 0x60a5fa);
        })
        .on('pointerout', function onOut(this: Phaser.GameObjects.Rectangle) {
          onUp?.();
          this.setFillStyle(0x111c30, 0.88).setStrokeStyle(2, 0x334155);
        });

      this.add.text(x, y, label, {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5).setDepth(21);
    };

    createButton(centerX - buttonSize - gap, rowY, '←', () => this.moveLeft());
    createButton(centerX, rowY, '⟳', () => this.rotatePiece());
    createButton(centerX + buttonSize + gap, rowY, '→', () => this.moveRight());
    createButton(centerX + (buttonSize + gap) * 2, rowY, 'DROP', () => this.hardDrop());
    createButton(
      centerX,
      downY,
      '↓',
      () => {
        this.softDropHeld = true;
      },
      () => {
        this.softDropHeld = false;
      },
    );
  }

  private getBoardLayout(): BoardLayout {
    const width = this.scale.width;
    const height = this.scale.height;
    const portrait = height > width;
    const top = portrait ? Math.max(112, Math.round(height * 0.13)) : 108;
    const availableWidth = portrait ? width - 48 : Math.min(380, width - 420);
    const availableHeight = portrait ? height - 240 : height - 220;
    const cellSize = Math.max(
      18,
      Math.min(
        24,
        Math.floor(availableWidth / BOARD_COLUMNS),
        Math.floor(availableHeight / BOARD_ROWS),
      ),
    );
    const boardWidth = BOARD_COLUMNS * cellSize;

    return {
      columns: BOARD_COLUMNS,
      rows: BOARD_ROWS,
      cellSize,
      x: Math.round((width - boardWidth) / 2),
      y: top,
    };
  }

  private getPreviewLayout(): { x: number; y: number; width: number; height: number; cellSize: number } {
    const width = this.scale.width;
    const height = this.scale.height;
    const portrait = height > width;
    const cellSize = portrait ? Math.max(14, Math.min(18, Math.floor((width - 48) / 10))) : 18;
    const panelWidth = cellSize * 4 + 12;
    const panelHeight = cellSize * 4 + 28;
    const x = portrait
      ? Math.max(12, width - panelWidth - 12)
      : Math.min(width - panelWidth - 12, this.boardLayout.x + this.boardLayout.cellSize * BOARD_COLUMNS + 24);
    const y = portrait
      ? this.boardLayout.y
      : this.boardLayout.y + 10;

    return { x, y, width: panelWidth, height: panelHeight, cellSize };
  }

  private createEmptyBoard(): (number | null)[][] {
    return Array.from({ length: BOARD_ROWS }, () => this.createEmptyRow());
  }

  private createEmptyRow(): (number | null)[] {
    return Array.from({ length: BOARD_COLUMNS }, () => null);
  }

  private restart(): void {
    this.scene.restart();
  }

  private openMenu(): void {
    this.scene.start('MenuScene');
  }
}
