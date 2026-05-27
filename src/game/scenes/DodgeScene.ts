import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import { getDodgeHighScore, saveDodgeHighScore } from '../storage/highScore';

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
    const portrait = this.isPortrait();
    const width = this.scale.width;
    const height = this.scale.height;
    const titleX = portrait ? 24 : 150;
    const titleY = portrait ? 26 : 34;
    const highScoreX = portrait ? width - 24 : 810;
    const scoreX = portrait ? width - 24 : 810;
    const timeX = portrait ? width / 2 : 480;
    const timeY = portrait ? 60 : 46;
    const scoreY = portrait ? 44 : 53;
    const footerY = portrait ? height - 34 : 509;
    const backButtonX = width - 56;
    const backButtonY = portrait ? 76 : 48;
    const hintText = portrait
      ? '좌/우 버튼 또는 키보드  |  양 끝은 연결됨'
      : '← → 길게 눌러 가속  |  양 끝은 연결됨';

    this.add.text(titleX, titleY, '똥피하기', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '22px' : '27px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });

    this.timeText = this.add.text(timeX, timeY, '생존  0.0초', {
      color: '#94a3b8',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '13px' : '16px',
      resolution: TEXT_RESOLUTION,
    });
    this.timeText.setOrigin(0.5);

    this.highScoreText = this.add.text(highScoreX, portrait ? 24 : 30, `최고  ${this.highScore}`, {
      color: '#facc15',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '12px' : '15px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.highScoreText.setOrigin(1, 0);

    this.scoreText = this.add.text(scoreX, scoreY, '피함  0', {
      color: '#f8fafc',
      fontFamily: 'Arial, sans-serif',
      fontSize: portrait ? '15px' : '18px',
      fontStyle: 'bold',
      resolution: TEXT_RESOLUTION,
    });
    this.scoreText.setOrigin(1, 0);

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

    this.add
      .text(portrait ? width / 2 : 480, footerY, hintText, {
        color: '#94a3b8',
        fontFamily: 'Arial, sans-serif',
        fontSize: portrait ? '12px' : '15px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.createBackButton(backButtonX, backButtonY);
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
      horizontalDistance < obstacle.radius + PLAYER_HALF_WIDTH - 4 &&
      verticalDistance < obstacle.radius + PLAYER_HALF_HEIGHT - 4
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
      this.drawPoop(obstacle.x, obstacle.y, obstacle.radius);
    }

    this.drawPlayer(this.playerX);
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

    this.obstacles.push({
      x: Phaser.Math.Between(this.field.left + radius, this.field.right - radius),
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
    const portrait = this.isPortrait();
    const width = this.scale.width;
    const height = this.scale.height;
    const panelWidth = portrait ? Math.min(360, width - 24) : 406;
    const panelHeight = portrait ? 168 : 130;
    const panelX = width / 2;
    const panelY = portrait ? Math.round(height * 0.42) : 285;
    const titleY = portrait ? panelY - 42 : 246;
    const bodyY = portrait ? panelY - 2 : 288;
    const buttonY = portrait ? panelY + 42 : 334;
    const primaryWidth = portrait ? 200 : 170;
    const buttonHeight = portrait ? 50 : 42;

    this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0x060d18, 0.96)
      .setStrokeStyle(2, 0x334155)
      .setDepth(1000);
    this.add
      .text(panelX, titleY, '게임 오버', {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: portrait ? '26px' : '30px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(1001);
    this.add
      .text(panelX, bodyY, `피한 똥 ${this.score}개  |  ${(this.elapsedMs / 1000).toFixed(1)}초 생존`, {
        color: '#cbd5e1',
        fontFamily: 'Arial, sans-serif',
        fontSize: portrait ? '14px' : '16px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(1001);

    this.add
      .rectangle(panelX + 3, buttonY + 3, primaryWidth, buttonHeight, 0x020617, 0.55)
      .setDepth(1001);

    const restartButton = this.add
      .rectangle(panelX, buttonY, primaryWidth, buttonHeight, 0xf59e0b, 1)
      .setStrokeStyle(3, 0xfde68a)
      .setInteractive({ useHandCursor: true })
      .setDepth(1002);
    restartButton.on('pointerdown', () => {
      this.restart();
    });
    restartButton.on('pointerover', () => {
      restartButton.setFillStyle(0xfbbf24, 1).setStrokeStyle(3, 0xffffff);
    });
    restartButton.on('pointerout', () => {
      restartButton.setFillStyle(0xf59e0b, 1).setStrokeStyle(3, 0xfde68a);
    });

    this.add
      .text(panelX, buttonY, '다시 시작', {
        color: '#111827',
        fontFamily: 'Arial, sans-serif',
        fontSize: portrait ? '15px' : '16px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(1003);

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
      '왼쪽',
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
      '오른쪽',
      () => {
        this.virtualRight = true;
      },
      () => {
        this.virtualRight = false;
      },
    );
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
