import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import { getDodgeHighScore, saveDodgeHighScore } from '../storage/highScore';
import { createScreenChrome } from '../ui/screen';
import { createGameHud } from '../ui/gameHud';
import { showGameOverPanel } from '../ui/gameOver';

type FallingObstacle = {
  x: number;
  y: number;
  radius: number;
  speedOffset: number;
};

type FieldLayout = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const LANDSCAPE_FIELD: FieldLayout = {
  left: 150,
  right: 810,
  top: 92,
  bottom: 474,
};

const PLAYER_HALF_WIDTH = 15;
const PLAYER_HALF_HEIGHT = 27;
const PLAYER_ACCELERATION = 980;
const PLAYER_TURN_ACCELERATION = 2200;
const PLAYER_DECELERATION = 1250;
const PLAYER_MAX_SPEED = 470;
const INITIAL_FALL_SPEED = 180;
const MAX_FALL_SPEED = 760;
const INITIAL_SPAWN_DELAY = 680;
const MIN_SPAWN_DELAY = 195;

export class DodgeScene extends Phaser.Scene {
  private field: FieldLayout = { ...LANDSCAPE_FIELD };
  private graphics!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private virtualLeft = false;
  private virtualRight = false;
  private playerX = 0;
  private playerVelocity = 0;
  private facingDirection = 1;
  private runPhase = 0;
  private turnAnimation = 0;
  private obstacles: FallingObstacle[] = [];
  private elapsedMs = 0;
  private nextSpawnMs = 500;
  private score = 0;
  private highScore = 0;
  private finished = false;

  constructor() {
    super('DodgeScene');
  }

  create(): void {
    configureHiDpiCamera(this.cameras.main);
    this.cameras.main.setBackgroundColor('#08111f');
    this.field = this.getFieldLayout();
    this.resetState();
    this.highScore = getDodgeHighScore();
    const chrome = createScreenChrome(this.scale.width, this.scale.height);
    const portrait = chrome.portrait;
    const width = chrome.width;
    const timeX = portrait ? width / 2 : 480;
    const timeY = portrait ? 56 : 46;
    const hintText = portrait
      ? '좌/우 버튼 또는 키보드  |  양 끝은 연결됨'
      : '← → 길게 눌러 가속  |  양 끝은 연결됨';

    this.timeText = this.add.text(timeX, timeY, '생존  0.0초', {
      color: '#94a3b8',
      fontFamily: 'Arial, sans-serif',
      fontSize: `${chrome.bodyFontSize}px`,
      resolution: TEXT_RESOLUTION,
    });
    this.timeText.setOrigin(0.5);

    const hud = createGameHud(this, chrome, {
      title: '똥피하기',
      scoreLabel: '피함',
      scoreValue: 0,
      highScoreLabel: '최고',
      highScoreValue: this.highScore,
      footerText: hintText,
      onBack: () => {
        this.openMenu();
      },
      titleFontSize: chrome.titleFontSize,
      scoreFontSize: portrait ? 15 : 19,
      highScoreFontSize: portrait ? 14 : 18,
    });
    this.highScoreText = hud.highScoreText;
    this.scoreText = hud.scoreText;

    this.add
      .rectangle(
        (this.field.left + this.field.right) / 2,
        (this.field.top + this.field.bottom) / 2,
        this.fieldWidth + 4,
        this.field.bottom - this.field.top + 4,
        0x0d1727,
      )
      .setStrokeStyle(2, 0x243655);

    this.graphics = this.add.graphics();

    if (portrait) {
      this.createTouchControls();
    }
    this.bindControls();
    this.drawGame();
  }

  update(_time: number, delta: number): void {
    if (this.finished) {
      return;
    }

    const frameMs = Math.min(delta, 50);
    const step = frameMs / 1000;

    this.elapsedMs += frameMs;
    this.movePlayer(step);
    this.spawnObstacles(frameMs);
    this.updateObstacles(step);

    if (!this.finished) {
      this.timeText.setText(`생존  ${(this.elapsedMs / 1000).toFixed(1)}초`);
      this.drawGame();
    }
  }

  private resetState(): void {
    this.playerX = (this.field.left + this.field.right) / 2;
    this.playerVelocity = 0;
    this.facingDirection = 1;
    this.runPhase = 0;
    this.turnAnimation = 0;
    this.obstacles = [];
    this.elapsedMs = 0;
    this.nextSpawnMs = 500;
    this.score = 0;
    this.finished = false;
  }

  private bindControls(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    keyboard.addCapture(['LEFT', 'RIGHT']);
    this.cursors = keyboard.createCursorKeys();
    keyboard.on('keydown-R', this.restart, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-R', this.restart, this);
    });
  }

  private movePlayer(step: number): void {
    if (!this.cursors) {
      return;
    }

    let inputDirection = 0;
    const leftDown = this.cursors.left.isDown || this.virtualLeft;
    const rightDown = this.cursors.right.isDown || this.virtualRight;

    if (leftDown && !rightDown) {
      inputDirection = -1;
    } else if (rightDown && !leftDown) {
      inputDirection = 1;
    }

    if (inputDirection !== 0) {
      const reversing =
        Math.abs(this.playerVelocity) > 16 &&
        Math.sign(this.playerVelocity) !== inputDirection;
      const acceleration = reversing ? PLAYER_TURN_ACCELERATION : PLAYER_ACCELERATION;

      if (reversing) {
        this.turnAnimation = 1;
      }

      this.facingDirection = inputDirection;
      this.playerVelocity = this.approach(
        this.playerVelocity,
        inputDirection * PLAYER_MAX_SPEED,
        acceleration * step,
      );
    } else {
      this.playerVelocity = this.approach(
        this.playerVelocity,
        0,
        PLAYER_DECELERATION * step,
      );
    }

    this.playerX += this.playerVelocity * step;
    this.runPhase += Math.abs(this.playerVelocity) * step * 0.058;
    this.turnAnimation = Math.max(0, this.turnAnimation - step * 4.8);

    while (this.playerX < this.field.left) {
      this.playerX += this.fieldWidth;
    }
    while (this.playerX > this.field.right) {
      this.playerX -= this.fieldWidth;
    }
  }

  private spawnObstacles(delta: number): void {
    this.nextSpawnMs -= delta;

    if (this.nextSpawnMs > 0) {
      return;
    }

    const seconds = this.elapsedMs / 1000;
    let waveSize = seconds >= 18 ? 2 : 1;

    if (seconds >= 8 && Math.random() < Math.min(0.48, seconds / 75)) {
      waveSize += 1;
    }

    for (let index = 0; index < waveSize; index += 1) {
      this.spawnObstacle(index * 20);
    }

    this.nextSpawnMs += this.getSpawnDelay();
  }

  private updateObstacles(step: number): void {
    const remaining: FallingObstacle[] = [];

    for (const obstacle of this.obstacles) {
      obstacle.y += (this.getFallSpeed() + obstacle.speedOffset) * step;

      if (this.isColliding(obstacle)) {
        this.finishGame();
        return;
      }

      if (obstacle.y - obstacle.radius > this.field.bottom) {
        this.score += 1;
        this.scoreText.setText(`피함  ${this.score}`);
        this.updateHighScore();
      } else {
        remaining.push(obstacle);
      }
    }

    this.obstacles = remaining;
  }

  private getFallSpeed(): number {
    return Math.min(MAX_FALL_SPEED, INITIAL_FALL_SPEED + (this.elapsedMs / 1000) * 14);
  }

  private getSpawnDelay(): number {
    return Math.max(MIN_SPAWN_DELAY, INITIAL_SPAWN_DELAY - (this.elapsedMs / 1000) * 17);
  }

  private isColliding(obstacle: FallingObstacle): boolean {
    const directDistance = Math.abs(obstacle.x - this.playerX);
    const wrappedDistance = this.fieldWidth - directDistance;
    const horizontalDistance = Math.min(directDistance, wrappedDistance);
    const verticalDistance = Math.abs(obstacle.y - this.playerY);

    return (
      horizontalDistance < obstacle.radius + PLAYER_HALF_WIDTH - 8 &&
      verticalDistance < obstacle.radius + PLAYER_HALF_HEIGHT - 8
    );
  }

  private drawGame(): void {
    this.graphics.clear();

    this.graphics.lineStyle(1, 0x172439, 1);
    for (let y = this.field.top + this.gridSpacing; y < this.field.bottom; y += this.gridSpacing) {
      this.graphics.lineBetween(this.field.left, y, this.field.right, y);
    }

    this.graphics.lineStyle(2, 0x334155, 1);
    this.graphics.lineBetween(this.field.left, this.groundY, this.field.right, this.groundY);

    for (const obstacle of this.obstacles) {
      this.drawPoopWrapped(obstacle.x, obstacle.y, obstacle.radius);
    }

    this.drawPlayer(this.playerX);
  }

  private drawPoopWrapped(x: number, y: number, radius: number): void {
    this.drawPoop(x, y, radius);

    if (x - radius < this.field.left) {
      this.drawPoop(x + this.fieldWidth, y, radius);
    }

    if (x + radius > this.field.right) {
      this.drawPoop(x - this.fieldWidth, y, radius);
    }
  }

  private drawPoop(x: number, y: number, radius: number): void {
    this.graphics.fillStyle(0x8b451f);
    this.graphics.fillEllipse(x, y + radius * 0.5, radius * 2.1, radius * 1.35);
    this.graphics.fillCircle(x, y, radius * 0.75);
    this.graphics.fillCircle(x + radius * 0.14, y - radius * 0.6, radius * 0.45);

    this.graphics.fillStyle(0xf8fafc);
    this.graphics.fillCircle(x - radius * 0.27, y + radius * 0.15, 2.3);
    this.graphics.fillCircle(x + radius * 0.27, y + radius * 0.15, 2.3);
    this.graphics.fillStyle(0x111827);
    this.graphics.fillCircle(x - radius * 0.27, y + radius * 0.15, 1);
    this.graphics.fillCircle(x + radius * 0.27, y + radius * 0.15, 1);
  }

  private drawPlayer(x: number): void {
    const speedRatio = Math.min(1, Math.abs(this.playerVelocity) / PLAYER_MAX_SPEED);
    const stride = Math.sin(this.runPhase) * (2 + speedRatio * 11);
    const bob = Math.abs(Math.cos(this.runPhase)) * speedRatio * 2;
    const lean = this.facingDirection * (speedRatio * 4 + this.turnAnimation * 5);
    const headX = x + lean;
    const headY = this.groundY - 45 - bob;
    const shoulderX = x + lean * 0.7;
    const shoulderY = this.groundY - 34 - bob;
    const hipX = x - lean * 0.2;
    const hipY = this.groundY - 19 - bob;
    const forwardLegX = x + stride;
    const backLegX = x - stride;
    const armSwing = -stride * 0.8;

    if (this.turnAnimation > 0.1) {
      this.graphics.lineStyle(2, 0xfacc15, this.turnAnimation * 0.8);
      const skidDirection = -this.facingDirection;
      this.graphics.lineBetween(x + skidDirection * 9, this.groundY + 1, x + skidDirection * 22, this.groundY + 1);
      this.graphics.lineBetween(x + skidDirection * 5, this.groundY + 5, x + skidDirection * 16, this.groundY + 5);
    }

    this.graphics.lineStyle(4, 0x38bdf8, 1);
    this.graphics.lineBetween(shoulderX, shoulderY, hipX, hipY);
    this.graphics.lineBetween(
      shoulderX,
      shoulderY + 3,
      shoulderX + armSwing,
      shoulderY + 13,
    );
    this.graphics.lineBetween(
      shoulderX,
      shoulderY + 3,
      shoulderX - armSwing,
      shoulderY + 13,
    );
    this.graphics.lineBetween(hipX, hipY, forwardLegX, this.groundY);
    this.graphics.lineBetween(hipX, hipY, backLegX, this.groundY);

    this.graphics.fillStyle(0xffdbac);
    this.graphics.fillCircle(headX, headY, 8);
    this.graphics.lineStyle(2, 0x0c4a6e, 1);
    this.graphics.strokeCircle(headX, headY, 8);
    this.graphics.fillStyle(0x0c4a6e);
    this.graphics.fillCircle(headX + this.facingDirection * 3, headY - 1, 1.4);
  }

  private spawnObstacle(yOffset: number): void {
    const radius = Phaser.Math.Between(12, 19);
    const edgeChance = Math.min(0.22, 0.08 + this.elapsedMs / 14000);
    const edgeSpan = Math.max(radius * 2, 42);
    const spawnNearEdge = Math.random() < edgeChance;
    const x = spawnNearEdge
      ? (Math.random() < 0.5
        ? Phaser.Math.Between(this.field.left + radius, this.field.left + edgeSpan)
        : Phaser.Math.Between(this.field.right - edgeSpan, this.field.right - radius))
      : Phaser.Math.Between(this.field.left + radius, this.field.right - radius);

    this.obstacles.push({
      x,
      y: this.field.top - radius - yOffset,
      radius,
      speedOffset: Phaser.Math.Between(-15, 58),
    });
  }

  private approach(value: number, target: number, amount: number): number {
    if (value < target) {
      return Math.min(target, value + amount);
    }

    return Math.max(target, value - amount);
  }

  private updateHighScore(): void {
    if (this.score <= this.highScore) {
      return;
    }

    this.highScore = saveDodgeHighScore(this.score);
    this.highScoreText.setText(`최고  ${this.highScore}`);
  }

  private finishGame(): void {
    this.finished = true;
    this.drawGame();
    void this.showGameOver();
  }

  private async showGameOver(): Promise<void> {
    void showGameOverPanel(this, {
      gameKey: 'dodge',
      score: this.score,
      onRank: () => {
        this.scene.start('RankScene', { gameKey: 'dodge' });
      },
      onRestart: () => {
        this.restart();
      },
    });
  }

  private createTouchControls(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const centerX = width / 2;
    const centerY = height - 132;
    const buttonWidth = 128;
    const buttonHeight = 72;
    const gap = 20;
    const createButton = (
      x: number,
      y: number,
      label: string,
      onDown: () => void,
      onUp: () => void,
    ): void => {
      const button = this.add
        .rectangle(x, y, buttonWidth, buttonHeight, 0x111c30, 0.88)
        .setStrokeStyle(2, 0x334155)
        .setInteractive({ useHandCursor: true });

      button.on('pointerdown', () => {
        onDown();
      });
      button.on('pointerup', () => {
        onUp();
      });
      button.on('pointerout', () => {
        onUp();
        button.setFillStyle(0x111c30, 0.88).setStrokeStyle(2, 0x334155);
      });
      button.on('pointerover', () => {
        button.setFillStyle(0x1a2a45, 0.95).setStrokeStyle(2, 0x60a5fa);
      });

      this.add
        .text(x, y, label, {
          color: '#f8fafc',
          fontFamily: 'Arial, sans-serif',
          fontSize: '17px',
          fontStyle: 'bold',
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5);
    };

    createButton(
      centerX - buttonWidth / 2 - gap,
      centerY,
      '←',
      () => {
        this.virtualLeft = true;
      },
      () => {
        this.virtualLeft = false;
      },
    );
    createButton(
      centerX + buttonWidth / 2 + gap,
      centerY,
      '→',
      () => {
        this.virtualRight = true;
      },
      () => {
        this.virtualRight = false;
      },
    );
  }

  private get fieldWidth(): number {
    return this.field.right - this.field.left;
  }

  private get groundY(): number {
    return this.field.bottom - 16;
  }

  private get playerY(): number {
    return this.groundY - 27;
  }

  private get gridSpacing(): number {
    return this.isPortrait() ? 46 : 38;
  }

  private isPortrait(): boolean {
    return this.scale.height > this.scale.width;
  }

  private getFieldLayout(): FieldLayout {
    if (!this.isPortrait()) {
      return { ...LANDSCAPE_FIELD };
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const fieldWidth = Math.min(width - 24, 520);
    const left = Math.round((width - fieldWidth) / 2);
    const top = 112;
    const bottom = Math.max(top + 380, Math.floor(height - 170));

    return {
      left,
      right: left + fieldWidth,
      top,
      bottom,
    };
  }

  private restart(): void {
    this.scene.restart();
  }

  private openMenu(): void {
    this.scene.start('MenuScene');
  }
}
