import Phaser from 'phaser';
import { TEXT_RESOLUTION } from '../render';
import { fetchMyBestRecord, submitScore, type GameKey } from '../storage/leaderboard';

type GameOverOptions = {
  gameKey: GameKey;
  score: number;
  onRank: () => void;
  onRestart: () => void;
};

export async function showGameOverPanel(
  scene: Phaser.Scene,
  options: GameOverOptions,
): Promise<void> {
  await submitScore(options.gameKey, options.score);
  const myBest = await fetchMyBestRecord(options.gameKey);

  const portrait = scene.scale.height > scene.scale.width;
  const width = scene.scale.width;
  const height = scene.scale.height;
  const panelWidth = portrait ? Math.min(360, width - 24) : 430;
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

  scene.add.rectangle(panelX + 3, panelY + 4, panelWidth, panelHeight, 0x020617, 0.55).setDepth(999);
  scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x060d18, 0.96).setStrokeStyle(2, 0x334155).setDepth(1000);

  scene.add.text(panelX, titleY, '게임 오버', {
    color: '#f8fafc',
    fontFamily: 'Arial, sans-serif',
    fontSize: portrait ? '26px' : '30px',
    fontStyle: 'bold',
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5).setDepth(1001);

  scene.add.text(panelX, currentScoreY, `지금점수  ${options.score}`, {
    color: '#cbd5e1',
    fontFamily: 'Arial, sans-serif',
    fontSize: portrait ? '14px' : '16px',
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5).setDepth(1001);

  scene.add.text(panelX, bestScoreY, bestScoreText, {
    color: '#f8fafc',
    fontFamily: 'Arial, sans-serif',
    fontSize: portrait ? '13px' : '15px',
    fontStyle: 'bold',
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5).setDepth(1001);

  scene.add.text(panelX, rankY, bestRankText, {
    color: '#facc15',
    fontFamily: 'Arial, sans-serif',
    fontSize: portrait ? '13px' : '15px',
    fontStyle: 'bold',
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5).setDepth(1001);

  const rankButton = scene.add.rectangle(panelX, rankButtonY, primaryWidth, buttonHeight, 0x1d4ed8, 0.96)
    .setStrokeStyle(3, 0x93c5fd)
    .setInteractive({ useHandCursor: true })
    .setDepth(1002);
  rankButton.on('pointerdown', options.onRank);
  rankButton.on('pointerover', () => {
    rankButton.setFillStyle(0x2563eb, 0.98).setStrokeStyle(3, 0xbfdbfe);
  });
  rankButton.on('pointerout', () => {
    rankButton.setFillStyle(0x1d4ed8, 0.96).setStrokeStyle(3, 0x93c5fd);
  });
  scene.add.text(panelX, rankButtonY, '순위 확인하기', {
    color: '#eff6ff',
    fontFamily: 'Arial, sans-serif',
    fontSize: portrait ? '14px' : '15px',
    fontStyle: 'bold',
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5).setDepth(1003);

  const restartButton = scene.add.rectangle(panelX, restartButtonY, primaryWidth, buttonHeight, 0x2563eb, 1)
    .setStrokeStyle(3, 0xbfdbfe)
    .setInteractive({ useHandCursor: true })
    .setDepth(1002);
  restartButton.on('pointerdown', options.onRestart);
  restartButton.on('pointerover', () => {
    restartButton.setFillStyle(0x3b82f6, 1).setStrokeStyle(3, 0xffffff);
  });
  restartButton.on('pointerout', () => {
    restartButton.setFillStyle(0x2563eb, 1).setStrokeStyle(3, 0xbfdbfe);
  });
  scene.add.text(panelX, restartButtonY, '다시 시작', {
    color: '#eff6ff',
    fontFamily: 'Arial, sans-serif',
    fontSize: portrait ? '15px' : '16px',
    fontStyle: 'bold',
    resolution: TEXT_RESOLUTION,
  }).setOrigin(0.5).setDepth(1003);
}
