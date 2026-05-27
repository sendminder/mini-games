import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import { getDodgeHighScore, saveDodgeHighScore } from '../storage/highScore';

type FallingObstacle = {
  x: number;
  y: number;
  radius: number;
  speedOffset: number;
};

const FIELD = {
  left: 150,
  right: 810,
  top: 92,
  bottom: 474,
} as const;

const FIELD_WIDTH = FIELD.right - FIELD.left;
const GROUND_Y = FIELD.bottom - 16;
const PLAYER_Y = GROUND_Y - 27;
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
  private graphics!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private playerX = (FIELD.left + FIELD.right) / 2;
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
    this.resetState();
    this.highScore = getDodgeHighScore();

    this.add.text(150, 34, '똥피하기', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: '27px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });

    this.timeText = this.add.text(480, 46, '생존  0.0초', {
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

    this.scoreText = this.add.text(810, 53, '피함  0', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.scoreText.setOrigin(1, 0);

    this.add
      .rectangle(
        (FIELD.left + FIELD.right) / 2,
        (FIELD.top + FIELD.bottom) / 2,
        FIELD_WIDTH + 4,
        FIELD.bottom - FIELD.top + 4,
        0x0d1727,
      )
      .setStrokeStyle(2, 0x243655);

    this.graphics = this.add.graphics();

    this.add
      .text(480, 509, '← → 길게 눌러 가속  |  양 끝은 연결됨  |  Esc: 목록  R: 재시작', {
        color: '#94a3b8',
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

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
    this.playerX = (FIELD.left + FIELD.right) / 2;
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
    keyboard.on('keydown-ESC', this.openMenu, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-R', this.restart, this);
      keyboard.off('keydown-ESC', this.openMenu, this);
    });
  }

  private movePlayer(step: number): void {
    if (!this.cursors) {
      return;
    }

    let inputDirection = 0;

    if (this.cursors.left.isDown && !this.cursors.right.isDown) {
      inputDirection = -1;
    } else if (this.cursors.right.isDown && !this.cursors.left.isDown) {
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

    while (this.playerX < FIELD.left) {
      this.playerX += FIELD_WIDTH;
    }
    while (this.playerX > FIELD.right) {
      this.playerX -= FIELD_WIDTH;
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

      if (obstacle.y - obstacle.radius > FIELD.bottom) {
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
    const wrappedDistance = FIELD_WIDTH - directDistance;
    const horizontalDistance = Math.min(directDistance, wrappedDistance);
    const verticalDistance = Math.abs(obstacle.y - PLAYER_Y);

    return (
      horizontalDistance < obstacle.radius + PLAYER_HALF_WIDTH - 4 &&
      verticalDistance < obstacle.radius + PLAYER_HALF_HEIGHT - 4
    );
  }

  private drawGame(): void {
    this.graphics.clear();

    this.graphics.lineStyle(1, 0x172439, 1);
    for (let y = FIELD.top + 38; y < FIELD.bottom; y += 38) {
      this.graphics.lineBetween(FIELD.left, y, FIELD.right, y);
    }

    this.graphics.lineStyle(2, 0x334155, 1);
    this.graphics.lineBetween(FIELD.left, GROUND_Y, FIELD.right, GROUND_Y);

    for (const obstacle of this.obstacles) {
      this.drawPoop(obstacle.x, obstacle.y, obstacle.radius);
    }

    this.drawPlayer(this.playerX);

    if (this.playerX - PLAYER_HALF_WIDTH < FIELD.left) {
      this.drawPlayer(this.playerX + FIELD_WIDTH);
    } else if (this.playerX + PLAYER_HALF_WIDTH > FIELD.right) {
      this.drawPlayer(this.playerX - FIELD_WIDTH);
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
    const headY = GROUND_Y - 45 - bob;
    const shoulderX = x + lean * 0.7;
    const shoulderY = GROUND_Y - 34 - bob;
    const hipX = x - lean * 0.2;
    const hipY = GROUND_Y - 19 - bob;
    const forwardLegX = x + stride;
    const backLegX = x - stride;
    const armSwing = -stride * 0.8;

    if (this.turnAnimation > 0.1) {
      this.graphics.lineStyle(2, 0xfacc15, this.turnAnimation * 0.8);
      const skidDirection = -this.facingDirection;
      this.graphics.lineBetween(x + skidDirection * 9, GROUND_Y + 1, x + skidDirection * 22, GROUND_Y + 1);
      this.graphics.lineBetween(x + skidDirection * 5, GROUND_Y + 5, x + skidDirection * 16, GROUND_Y + 5);
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
    this.graphics.lineBetween(hipX, hipY, forwardLegX, GROUND_Y);
    this.graphics.lineBetween(hipX, hipY, backLegX, GROUND_Y);

    this.graphics.fillStyle(0xffdbac);
    this.graphics.fillCircle(headX, headY, 8);
    this.graphics.lineStyle(2, 0x0c4a6e, 1);
    this.graphics.strokeCircle(headX, headY, 8);
    this.graphics.fillStyle(0x0c4a6e);
    this.graphics.fillCircle(headX + this.facingDirection * 3, headY - 1, 1.4);
  }

  private spawnObstacle(yOffset: number): void {
    const radius = Phaser.Math.Between(12, 19);

    this.obstacles.push({
      x: Phaser.Math.Between(FIELD.left + radius, FIELD.right - radius),
      y: FIELD.top - radius - yOffset,
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

    this.add
      .rectangle(480, 285, 406, 176, 0x060d18, 0.96)
      .setStrokeStyle(2, 0x334155);
    this.add
      .text(480, 246, '게임 오버', {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);
    this.add
      .text(480, 288, `피한 똥 ${this.score}개  |  ${(this.elapsedMs / 1000).toFixed(1)}초 생존`, {
        color: '#cbd5e1',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);
    this.add
      .text(480, 328, 'R: 다시 시작   Esc: 게임 목록', {
        color: '#f59e0b',
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
