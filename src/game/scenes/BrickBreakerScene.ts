import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import { getBrickHighScore, saveBrickHighScore } from '../storage/highScore';
import { createScreenChrome } from '../ui/screen';
import { createGameHud } from '../ui/gameHud';
import { showGameOverPanel } from '../ui/gameOver';

type Brick = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  active: boolean;
};

type PlayField = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type BallState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  attached: boolean;
};

type BulletState = {
  x: number;
  y: number;
  vy: number;
  radius: number;
  active: boolean;
};

type ItemKind = 'multi' | 'wide' | 'narrow' | 'shoot' | 'life' | 'super';

type FallingItem = {
  x: number;
  y: number;
  vy: number;
  radius: number;
  kind: ItemKind;
  active: boolean;
  color: number;
  label: string;
};

const BRICK_ROWS = 5;
const LANDSCAPE_COLUMNS = 8;
const PORTRAIT_COLUMNS = 7;
const INITIAL_LIVES = 1;
const BASE_BALL_SPEED = 360;
const MAX_BALL_SPEED = 620;
const PADDLE_SPEED_PORTRAIT = 430;
const PADDLE_SPEED_LANDSCAPE = 470;
const SUPER_BALL_DURATION_MS = 15000;
const BULLET_COUNT = 10;
const PADDLE_MIN_WIDTH = 98;
const PADDLE_MAX_WIDTH = 206;

export class BrickBreakerScene extends Phaser.Scene {
  private field!: PlayField;
  private bricks: Brick[] = [];
  private graphics!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private lifeText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private paddleX = 0;
  private paddleWidth = 0;
  private basePaddleWidth = 0;
  private paddleHeight = 18;
  private balls: BallState[] = [];
  private bullets: BulletState[] = [];
  private items: FallingItem[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private virtualLeft = false;
  private virtualRight = false;
  private score = 0;
  private highScore = 0;
  private lives = INITIAL_LIVES;
  private level = 1;
  private finished = false;
  private shootAmmo = 0;
  private pendingMultiBall = false;
  private superBallUntil = 0;
  private shootFlashUntil = 0;

  constructor() {
    super('BrickBreakerScene');
  }

  create(): void {
    configureHiDpiCamera(this.cameras.main);
    this.cameras.main.setBackgroundColor('#08111f');
    this.highScore = getBrickHighScore();
    this.field = this.getFieldLayout();
    this.resetState();

    const chrome = createScreenChrome(this.scale.width, this.scale.height);
    const portrait = chrome.portrait;
    const width = chrome.width;
    const height = chrome.height;
    const footerText = portrait
      ? '좌우 버튼으로 패들 이동 | 발사 버튼 또는 스페이스'
      : '← → 이동 | 발사 버튼 또는 스페이스';

    const hud = createGameHud(this, chrome, {
      title: '벽돌깨기',
      scoreLabel: '점수',
      scoreValue: 0,
      highScoreLabel: '최고',
      highScoreValue: this.highScore,
      footerText,
      onBack: () => {
        this.openMenu();
      },
      titleFontSize: portrait ? 21 : 28,
      scoreFontSize: portrait ? 15 : 19,
      highScoreFontSize: portrait ? 14 : 18,
      footerFontSize: portrait ? 12 : 15,
    });
    this.scoreText = hud.scoreText;
    this.highScoreText = hud.highScoreText;
    this.lifeText = this.add.text(
      portrait ? 16 : 156,
      chrome.topRowY + (portrait ? 20 : 24),
      '',
      {
        color: '#fb7185',
        fontFamily: 'Arial, sans-serif',
        fontSize: `${portrait ? 14 : 18}px`,
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      },
    );
    this.lifeText.setDepth(4);
    this.updateLifeDisplay();

    this.statusText = this.add.text(
      portrait ? 16 : 156,
      chrome.topRowY + (portrait ? 38 : 42),
      '',
      {
        color: '#cbd5e1',
        fontFamily: 'Arial, sans-serif',
        fontSize: `${portrait ? 11 : 14}px`,
        resolution: TEXT_RESOLUTION,
      },
    );
    this.statusText.setDepth(4);

    this.graphics = this.add.graphics().setDepth(10);

    this.add
      .rectangle(
        (this.field.left + this.field.right) / 2,
        (this.field.top + this.field.bottom) / 2,
        this.field.right - this.field.left + 8,
        this.field.bottom - this.field.top + 8,
        0x0d1727,
      )
      .setStrokeStyle(2, 0x243655);

    this.createBricks();
    this.bindControls();

    if (portrait) {
      this.createTouchControls(width, height);
    }

    this.input.on('pointerdown', this.launchBall, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.launchBall, this);
    });

    this.resetBall(true);
    this.updateStatusDisplay();
    this.drawScene();
  }

  update(_time: number, delta: number): void {
    if (this.finished) {
      return;
    }

    const step = Math.min(delta, 50) / 1000;
    const now = this.time.now;
    this.updateEffects(now);
    this.movePaddle(step);

    this.updateBalls(step);
    this.updateBullets(step);

    this.updateItems(step);
    this.drawScene();
  }

  private updateEffects(now: number): void {
    if (this.superBallUntil > 0 && now >= this.superBallUntil) {
      this.superBallUntil = 0;
    }

    this.updateStatusDisplay();
  }

  private updateBalls(step: number): void {
    const nextBalls: BallState[] = [];

    for (const ball of this.balls) {
      if (ball.attached) {
        this.syncBallToPaddle(ball);
        nextBalls.push(ball);
        continue;
      }

      const alive = this.moveBall(ball, step);

      if (alive) {
        nextBalls.push(ball);
      }
    }

    this.balls = nextBalls;

    if (this.balls.length === 0) {
      this.loseLife();
      return;
    }

    if (this.pendingMultiBall && this.balls.length === 1 && !this.balls[0].attached) {
      this.spawnCloneBall(this.balls[0]);
      this.pendingMultiBall = false;
    }
  }

  private updateBullets(step: number): void {
    const nextBullets: BulletState[] = [];

    for (const bullet of this.bullets) {
      if (!bullet.active) {
        continue;
      }

      bullet.y += bullet.vy * step;
      let hit = false;

      for (const brick of this.bricks) {
        if (!brick.active || !this.isBulletOverlappingBrick(bullet, brick)) {
          continue;
        }

        brick.active = false;
        this.score += 1;
        this.updateHighScore();
        this.scoreText.setText(`점수  ${this.score}`);
        this.spawnItem(brick);
        hit = true;
        break;
      }

      if (!hit && bullet.y + bullet.radius < this.field.top) {
        nextBullets.push(bullet);
      }
    }

    this.bullets = nextBullets;
  }

  private resetState(): void {
    this.bricks = [];
    this.score = 0;
    this.lives = INITIAL_LIVES;
    this.level = 1;
    this.finished = false;
    this.items = [];
    this.bullets = [];
    this.balls = [];
    this.shootAmmo = 0;
    this.pendingMultiBall = false;
    this.superBallUntil = 0;
    this.shootFlashUntil = 0;
    this.basePaddleWidth = this.isPortrait() ? 118 : 146;
    this.paddleWidth = this.basePaddleWidth;
    this.paddleHeight = 18;
    this.paddleX = (this.field.left + this.field.right) / 2;
    this.balls = [{
      x: this.paddleX,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 8,
      attached: true,
    }];
  }

  private bindControls(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    keyboard.addCapture(['LEFT', 'RIGHT', 'SPACE']);
    this.cursors = keyboard.createCursorKeys();
    keyboard.on('keydown-SPACE', this.launchBall, this);
    keyboard.on('keydown-R', this.restart, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-SPACE', this.launchBall, this);
      keyboard.off('keydown-R', this.restart, this);
    });
  }

  private movePaddle(step: number): void {
    if (!this.cursors) {
      return;
    }

    let direction = 0;
    if ((this.cursors.left.isDown || this.virtualLeft) && !(this.cursors.right.isDown || this.virtualRight)) {
      direction = -1;
    } else if ((this.cursors.right.isDown || this.virtualRight) && !(this.cursors.left.isDown || this.virtualLeft)) {
      direction = 1;
    }

    if (direction === 0) {
      return;
    }

    const speed = this.isPortrait() ? PADDLE_SPEED_PORTRAIT : PADDLE_SPEED_LANDSCAPE;
    this.paddleX += direction * speed * step;

    const halfWidth = this.paddleWidth / 2;
    this.paddleX = Phaser.Math.Clamp(this.paddleX, this.field.left + halfWidth, this.field.right - halfWidth);
  }

  private syncBallToPaddle(ball: BallState): void {
    ball.x = this.paddleX;
    ball.y = this.getPaddleY() - this.paddleHeight / 2 - ball.radius - 2;
    ball.vx = 0;
    ball.vy = 0;
  }

  private launchBall(): void {
    if (this.finished) {
      return;
    }

    const attachedBalls = this.balls.filter((ball) => ball.attached);
    if (attachedBalls.length === 0) {
      if (this.shootAmmo > 0) {
        this.fireBullet();
      }
      return;
    }

    const tiltSource = this.virtualLeft ? -1 : this.virtualRight ? 1 : (Math.random() < 0.5 ? -1 : 1);
    const horizontalTilt = Phaser.Math.Clamp(tiltSource * Phaser.Math.FloatBetween(0.22, 0.48), -0.65, 0.65);
    const speed = this.getBallSpeed();
    const vx = speed * horizontalTilt;
    const vy = -Math.sqrt(Math.max(1, speed * speed - vx * vx));

    for (const ball of attachedBalls) {
      ball.attached = false;
      ball.vx = vx;
      ball.vy = vy;
      if (this.pendingMultiBall && this.balls.length < 2) {
        this.spawnCloneBall(ball);
        this.pendingMultiBall = false;
      }
    }

    if (this.shootAmmo > 0) {
      this.fireBullet();
    }
  }

  private moveBall(ball: BallState, step: number): boolean {
    ball.x += ball.vx * step;
    ball.y += ball.vy * step;

    const leftBound = this.field.left + ball.radius;
    const rightBound = this.field.right - ball.radius;
    const topBound = this.field.top + ball.radius;

    if (ball.x < leftBound) {
      ball.x = leftBound;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x > rightBound) {
      ball.x = rightBound;
      ball.vx = -Math.abs(ball.vx);
    }

    if (ball.y < topBound) {
      ball.y = topBound;
      ball.vy = Math.abs(ball.vy);
    }

    this.handlePaddleCollision(ball);

    const superBallActive = this.superBallUntil > this.time.now;
    let hitBrick = false;
    for (const brick of this.bricks) {
      if (!brick.active || !this.isBallOverlappingBrick(ball, brick)) {
        continue;
      }

      brick.active = false;
      this.score += 1;
      this.updateHighScore();
      this.scoreText.setText(`점수  ${this.score}`);
      this.spawnItem(brick);
      hitBrick = true;

      if (!superBallActive) {
        this.reflectBallFromBrick(ball, brick);
        break;
      }
    }

    if (hitBrick && this.bricks.every((brick) => !brick.active)) {
      this.level += 1;
      this.createBricks();
    }

    if (ball.y - ball.radius > this.field.bottom) {
      return false;
    }

    return true;
  }

  private handlePaddleCollision(ball: BallState): void {
    const paddleY = this.getPaddleY();
    const paddleLeft = this.paddleX - this.paddleWidth / 2;
    const paddleRight = this.paddleX + this.paddleWidth / 2;
    const paddleTop = paddleY - this.paddleHeight / 2;
    const paddleBottom = paddleY + this.paddleHeight / 2;

    if (
      ball.vy > 0 &&
      ball.y + ball.radius >= paddleTop &&
      ball.y - ball.radius <= paddleBottom &&
      ball.x >= paddleLeft &&
      ball.x <= paddleRight
    ) {
      ball.y = paddleTop - ball.radius - 1;
      const offset = Phaser.Math.Clamp((ball.x - this.paddleX) / (this.paddleWidth / 2), -1, 1);
      const speed = this.getBallSpeed();
      ball.vx = speed * offset * 0.9;
      ball.vy = -Math.sqrt(Math.max(1, speed * speed - ball.vx * ball.vx));
    }
  }

  private loseLife(): void {
    this.lives -= 1;
    this.updateLifeDisplay();

    if (this.lives <= 0) {
      this.finishGame();
      return;
    }

    this.pendingMultiBall = false;
    this.resetBall(true);
  }

  private resetBall(attached = true): void {
    this.pendingMultiBall = false;
    this.balls = [{
      x: this.paddleX,
      y: this.getPaddleY() - this.paddleHeight / 2 - 10,
      vx: 0,
      vy: 0,
      radius: 8,
      attached,
    }];
  }

  private createBricks(): void {
    const columns = this.isPortrait() ? PORTRAIT_COLUMNS : LANDSCAPE_COLUMNS;
    const gap = this.isPortrait() ? 7 : 9;
    const brickHeight = this.isPortrait() ? 24 : 25;
    const availableWidth = this.field.right - this.field.left;
    const brickWidth = Math.floor((availableWidth - gap * (columns - 1)) / columns);
    const totalWidth = brickWidth * columns + gap * (columns - 1);
    const startX = this.field.left + Math.round((availableWidth - totalWidth) / 2);
    const startY = this.field.top + (this.isPortrait() ? 34 : 38);
    const palette = [0xf87171, 0xfb923c, 0xfacc15, 0x4ade80, 0x60a5fa];

    this.bricks = [];

    for (let row = 0; row < BRICK_ROWS; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        this.bricks.push({
          x: startX + column * (brickWidth + gap),
          y: startY + row * (brickHeight + gap),
          width: brickWidth,
          height: brickHeight,
          color: palette[row % palette.length],
          active: true,
        });
      }
    }
  }

  private spawnItem(brick: Brick): void {
    if (Math.random() >= 0.28) {
      return;
    }

    const roll = Math.random();
    let kind: ItemKind;
    let color: number;
    let label: string;

    if (roll < 0.10) {
      kind = 'multi';
      color = 0xf472b6;
      label = '2';
    } else if (roll < 0.32) {
      kind = 'wide';
      color = 0x4ade80;
      label = '+';
    } else if (roll < 0.40) {
      kind = 'narrow';
      color = 0x38bdf8;
      label = '-';
    } else if (roll < 0.68) {
      kind = 'shoot';
      color = 0xf97316;
      label = '10';
    } else if (roll < 0.84) {
      kind = 'life';
      color = 0xfb7185;
      label = '♥';
    } else {
      kind = 'super';
      color = 0xfacc15;
      label = 'S';
    }

    this.items.push({
      x: brick.x + brick.width / 2,
      y: brick.y + brick.height / 2,
      vy: this.isPortrait() ? 150 : 170,
      radius: 11,
      kind,
      active: true,
      color,
      label,
    });
  }

  private updateItems(step: number): void {
    const nextItems: FallingItem[] = [];

    for (const item of this.items) {
      if (!item.active) {
        continue;
      }

      item.y += item.vy * step;

      if (this.isItemCollected(item)) {
        this.applyItem(item.kind);
        continue;
      }

      if (item.y - item.radius > this.field.bottom) {
        continue;
      }

      nextItems.push(item);
    }

    this.items = nextItems;
  }

  private reflectBallFromBrick(ball: BallState, brick: Brick): void {
    const centerX = brick.x + brick.width / 2;
    const centerY = brick.y + brick.height / 2;
    const deltaX = ball.x - centerX;
    const deltaY = ball.y - centerY;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      ball.vx = -ball.vx;
    } else {
      ball.vy = -ball.vy;
    }

    const speed = this.getBallSpeed();
    const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || 1;
    const ratio = speed / currentSpeed;
    ball.vx *= ratio;
    ball.vy *= ratio;
  }

  private isItemCollected(item: FallingItem): boolean {
    const paddleY = this.getPaddleY();
    const paddleLeft = this.paddleX - this.paddleWidth / 2;
    const paddleRight = this.paddleX + this.paddleWidth / 2;
    const paddleTop = paddleY - this.paddleHeight / 2;
    const paddleBottom = paddleY + this.paddleHeight / 2;

    return (
      item.y + item.radius >= paddleTop &&
      item.y - item.radius <= paddleBottom &&
      item.x >= paddleLeft &&
      item.x <= paddleRight
    );
  }

  private applyItem(kind: ItemKind): void {
    const now = this.time.now;

    if (kind === 'multi') {
      this.pendingMultiBall = true;
      return;
    }

    if (kind === 'wide') {
      this.paddleWidth = Math.min(PADDLE_MAX_WIDTH, this.paddleWidth + 28);
      this.updateStatusDisplay();
      return;
    }

    if (kind === 'narrow') {
      this.paddleWidth = Math.max(PADDLE_MIN_WIDTH, this.paddleWidth - 24);
      this.updateStatusDisplay();
      return;
    }

    if (kind === 'shoot') {
      this.shootAmmo = BULLET_COUNT;
      this.updateStatusDisplay();
      return;
    }

    if (kind === 'life') {
      this.lives = Math.min(3, this.lives + 1);
      this.updateLifeDisplay();
      this.updateStatusDisplay();
      return;
    }

    this.superBallUntil = now + SUPER_BALL_DURATION_MS;
    this.updateStatusDisplay();
  }

  private spawnCloneBall(source: BallState): void {
    if (this.balls.length >= 2) {
      return;
    }

    const cloneSpeed = Math.sqrt(source.vx * source.vx + source.vy * source.vy) || this.getBallSpeed();
    const tilt = source.vx === 0 ? 0.4 : -Math.sign(source.vx) * 0.42;
    const vx = cloneSpeed * tilt;
    const vy = -Math.sqrt(Math.max(1, cloneSpeed * cloneSpeed - vx * vx));

    this.balls.push({
      x: source.x,
      y: source.y,
      vx,
      vy,
      radius: source.radius,
      attached: false,
    });
  }

  private fireBullet(): void {
    if (this.shootAmmo <= 0) {
      return;
    }

    this.shootAmmo -= 1;
    this.shootFlashUntil = this.time.now + 120;
    this.updateStatusDisplay();
    this.bullets.push({
      x: this.paddleX,
      y: this.getPaddleY() - this.paddleHeight / 2 - 10,
      vy: -(this.isPortrait() ? 760 : 840),
      radius: 6,
      active: true,
    });
  }

  private isBulletOverlappingBrick(bullet: BulletState, brick: Brick): boolean {
    const left = brick.x;
    const right = brick.x + brick.width;
    const top = brick.y;
    const bottom = brick.y + brick.height;
    const nearestX = Phaser.Math.Clamp(bullet.x, left, right);
    const nearestY = Phaser.Math.Clamp(bullet.y, top, bottom);
    const dx = bullet.x - nearestX;
    const dy = bullet.y - nearestY;

    return dx * dx + dy * dy <= bullet.radius * bullet.radius;
  }

  private drawScene(): void {
    this.graphics.clear();

    this.graphics.lineStyle(1, 0x172439, 1);
    this.graphics.strokeRect(this.field.left, this.field.top, this.field.right - this.field.left, this.field.bottom - this.field.top);

    for (const brick of this.bricks) {
      if (!brick.active) {
        continue;
      }

      this.graphics.fillStyle(brick.color, 0.95);
      this.graphics.fillRoundedRect(brick.x, brick.y, brick.width, brick.height, 6);
      this.graphics.lineStyle(1, 0xffffff, 0.18);
      this.graphics.strokeRoundedRect(brick.x, brick.y, brick.width, brick.height, 6);
    }

    const paddleY = this.getPaddleY();
    this.graphics.fillStyle(0x38bdf8, 0.95);
    this.graphics.fillRoundedRect(
      this.paddleX - this.paddleWidth / 2,
      paddleY - this.paddleHeight / 2,
      this.paddleWidth,
      this.paddleHeight,
      8,
    );
    this.graphics.lineStyle(2, 0x93c5fd, 1);
    this.graphics.strokeRoundedRect(
      this.paddleX - this.paddleWidth / 2,
      paddleY - this.paddleHeight / 2,
      this.paddleWidth,
      this.paddleHeight,
      8,
    );

    if (this.superBallUntil > this.time.now) {
      this.graphics.fillStyle(0xfacc15, 0.16);
      this.graphics.fillRoundedRect(this.field.left, this.field.top, this.field.right - this.field.left, this.field.bottom - this.field.top, 10);
    }

    if (this.shootFlashUntil > this.time.now) {
      this.graphics.fillStyle(0xf97316, 0.35);
      this.graphics.fillRoundedRect(this.paddleX - 10, paddleY - 34, 20, 24, 4);
    }

    for (const ball of this.balls) {
      this.graphics.fillStyle(this.superBallUntil > this.time.now ? 0xfacc15 : 0xf8fafc);
      this.graphics.fillCircle(ball.x, ball.y, ball.radius);
      this.graphics.lineStyle(2, this.superBallUntil > this.time.now ? 0xf59e0b : 0x93c5fd, 0.9);
      this.graphics.strokeCircle(ball.x, ball.y, ball.radius);

      if (ball.attached) {
        this.graphics.lineStyle(2, 0x64748b, 0.8);
        this.graphics.lineBetween(ball.x, ball.y + 2, ball.x, paddleY - this.paddleHeight / 2 - 4);
      }
    }

    for (const bullet of this.bullets) {
      if (!bullet.active) {
        continue;
      }

      this.graphics.fillStyle(0xf97316, 0.98);
      this.graphics.fillCircle(bullet.x, bullet.y, bullet.radius);
      this.graphics.lineStyle(2, 0xffedd5, 0.95);
      this.graphics.strokeCircle(bullet.x, bullet.y, bullet.radius);
    }

    for (const item of this.items) {
      this.drawItemIcon(item);
    }
  }

  private drawItemIcon(item: FallingItem): void {
    this.graphics.fillStyle(item.color, 0.95);
    this.graphics.fillCircle(item.x, item.y, item.radius);
    this.graphics.lineStyle(2, 0x111827, 0.75);
    this.graphics.strokeCircle(item.x, item.y, item.radius);

    if (item.kind === 'multi') {
      this.graphics.fillStyle(0xfff1f2);
      this.graphics.fillCircle(item.x - 3, item.y, 2.4);
      this.graphics.fillCircle(item.x + 3, item.y, 2.4);
      return;
    }

    if (item.kind === 'wide') {
      this.graphics.lineStyle(2.6, 0xfff7ed, 1);
      this.graphics.lineBetween(item.x - 4, item.y, item.x + 4, item.y);
      this.graphics.lineBetween(item.x, item.y - 4, item.x, item.y + 4);
      return;
    }

    if (item.kind === 'narrow') {
      this.graphics.lineStyle(2.6, 0xfff7ed, 1);
      this.graphics.lineBetween(item.x - 4, item.y, item.x + 4, item.y);
      return;
    }

    if (item.kind === 'shoot') {
      this.graphics.fillStyle(0xffedd5);
      this.graphics.fillRect(item.x - 5, item.y - 2, 10, 4);
      this.graphics.fillRect(item.x - 1, item.y - 5, 2, 10);
      return;
    }

    if (item.kind === 'life') {
      this.graphics.fillStyle(0xfff1f2);
      this.graphics.fillCircle(item.x - 3, item.y - 2, 2.8);
      this.graphics.fillCircle(item.x + 3, item.y - 2, 2.8);
      this.graphics.fillTriangle(item.x - 6, item.y - 1, item.x + 6, item.y - 1, item.x, item.y + 6);
      return;
    }

    this.graphics.lineStyle(2.4, 0x92400e, 1);
    this.graphics.lineBetween(item.x - 4, item.y - 4, item.x + 4, item.y + 4);
    this.graphics.lineBetween(item.x - 4, item.y + 4, item.x + 4, item.y - 4);
  }

  private isBallOverlappingBrick(ball: BallState, brick: Brick): boolean {
    const left = brick.x;
    const right = brick.x + brick.width;
    const top = brick.y;
    const bottom = brick.y + brick.height;
    const nearestX = Phaser.Math.Clamp(ball.x, left, right);
    const nearestY = Phaser.Math.Clamp(ball.y, top, bottom);
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;

    return dx * dx + dy * dy <= ball.radius * ball.radius;
  }

  private getBallSpeed(): number {
    return Math.min(MAX_BALL_SPEED, BASE_BALL_SPEED + this.score * 1.6 + (this.level - 1) * 22);
  }

  private updateHighScore(): void {
    if (this.score <= this.highScore) {
      return;
    }

    this.highScore = saveBrickHighScore(this.score);
    this.highScoreText.setText(`최고  ${this.highScore}`);
  }

  private updateLifeDisplay(): void {
    this.lifeText.setText(`목숨  ${'♥'.repeat(Math.max(0, this.lives))}`);
  }

  private updateStatusDisplay(): void {
    const superRemaining = this.superBallUntil > this.time.now
      ? `${((this.superBallUntil - this.time.now) / 1000).toFixed(1)}초`
      : '없음';
    const paddleState = this.paddleWidth > this.basePaddleWidth
      ? '길어짐'
      : this.paddleWidth < this.basePaddleWidth
        ? '짧아짐'
        : '보통';

    this.statusText.setText(`슈퍼 ${superRemaining} | 탄약 ${this.shootAmmo} | 패들 ${paddleState}`);
  }

  private finishGame(): void {
    this.finished = true;
    void this.showGameOver();
  }

  private async showGameOver(): Promise<void> {
    void showGameOverPanel(this, {
      gameKey: 'brick',
      score: this.score,
      onRank: () => {
        this.scene.start('RankScene', { gameKey: 'brick' });
      },
      onRestart: () => {
        this.restart();
      },
    });
  }

  private restart(): void {
    this.scene.restart();
  }

  private openMenu(): void {
    this.scene.start('MenuScene');
  }

  private getPaddleY(): number {
    return this.field.bottom - 26;
  }

  private isPortrait(): boolean {
    return this.scale.height > this.scale.width;
  }

  private getFieldLayout(): PlayField {
    const width = this.scale.width;
    const height = this.scale.height;
    const portrait = this.isPortrait();
    const sideMargin = portrait ? 18 : 140;
    const top = portrait ? 92 : 100;
    const bottom = height - (portrait ? 128 : 104);

    return {
      left: sideMargin,
      right: width - sideMargin,
      top,
      bottom,
    };
  }

  private createTouchControls(width: number, height: number): void {
    const centerX = width / 2;
    const centerY = height - 66;
    const buttonWidth = 84;
    const buttonHeight = 56;
    const launchWidth = 96;
    const gap = 12;

    const createButton = (
      x: number,
      y: number,
      widthValue: number,
      label: string,
      onDown: () => void,
      onUp?: () => void,
    ): void => {
      const button = this.add
        .rectangle(x, y, widthValue, buttonHeight, 0x111c30, 0.9)
        .setStrokeStyle(2, 0x334155)
        .setInteractive({ useHandCursor: true })
        .setDepth(20);

      button.on('pointerdown', onDown);
      if (onUp) {
        button.on('pointerup', onUp);
      }
      button.on('pointerout', () => {
        onUp?.();
        button.setFillStyle(0x111c30, 0.9).setStrokeStyle(2, 0x334155);
      });
      button.on('pointerover', () => {
        button.setFillStyle(0x1a2a45, 0.96).setStrokeStyle(2, 0x60a5fa);
      });

      this.add
        .text(x, y, label, {
          color: '#f8fafc',
          fontFamily: 'Arial, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5)
        .setDepth(21);
    };

    createButton(
      centerX - buttonWidth - gap - launchWidth / 2,
      centerY,
      buttonWidth,
      '←',
      () => {
        this.virtualLeft = true;
      },
      () => {
        this.virtualLeft = false;
      },
    );

    createButton(
      centerX,
      centerY,
      launchWidth,
      '발사',
      () => {
        this.launchBall();
      },
    );

    createButton(
      centerX + buttonWidth + gap + launchWidth / 2,
      centerY,
      buttonWidth,
      '→',
      () => {
        this.virtualRight = true;
      },
      () => {
        this.virtualRight = false;
      },
    );
  }
}
