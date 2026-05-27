import Phaser from 'phaser';
import { configureHiDpiCamera, TEXT_RESOLUTION } from '../render';
import {
  fetchLeaderboard,
  fetchMyBestRecord,
  getDisplayNickname,
  type GameKey,
  hasLeaderboardConfig,
  getStoredPlayerKey,
} from '../storage/leaderboard';
import { createScreenChrome } from '../ui/screen';

type GameTab = {
  key: GameKey;
  label: string;
  accent: number;
  color: string;
};

const GAME_TABS: GameTab[] = [
  { key: 'snake', label: '애벌레', accent: 0x4ade80, color: '#4ade80' },
  { key: 'dodge', label: '똥피하기', accent: 0xf59e0b, color: '#f59e0b' },
  { key: 'whack', label: '두더지', accent: 0x60a5fa, color: '#60a5fa' },
  { key: 'tetris', label: '테트리스', accent: 0x38bdf8, color: '#38bdf8' },
  { key: 'brick', label: '벽돌깨기', accent: 0xfb7185, color: '#fb7185' },
];

export class RankScene extends Phaser.Scene {
  private currentGame: GameKey = 'snake';
  private rows: Phaser.GameObjects.GameObject[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private summaryText!: Phaser.GameObjects.Text;
  private identityText!: Phaser.GameObjects.Text;
  private requestToken = 0;

  constructor() {
    super('RankScene');
  }

  create(data?: { gameKey?: GameKey }): void {
    configureHiDpiCamera(this.cameras.main);
    this.cameras.main.setBackgroundColor('#08111f');
    this.currentGame = data?.gameKey ?? 'snake';

    const chrome = createScreenChrome(this.scale.width, this.scale.height);
    const width = chrome.width;
    const portrait = chrome.portrait;
    const titleX = width / 2;
    const titleY = portrait ? 36 : 50;
    const subtitleY = portrait ? 62 : 90;
    const backButtonX = portrait ? 72 : 84;
    const backButtonY = chrome.backButtonY;
    const tabY = portrait ? 132 : 138;
    const startY = portrait ? 226 : 198;

    this.add
      .text(titleX, titleY, '글로벌 순위', {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: portrait ? '28px' : '42px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.add
      .text(titleX, subtitleY, '닉네임이 같아도 player key로 개별 기록을 저장합니다', {
        color: '#94a3b8',
        fontFamily: 'Arial, sans-serif',
        fontSize: portrait ? '12px' : '15px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.summaryText = this.add
      .text(titleX, portrait ? 88 : 112, '', {
        color: '#cbd5e1',
        fontFamily: 'Arial, sans-serif',
        fontSize: portrait ? '12px' : '17px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.identityText = this.add
      .text(titleX, portrait ? 102 : 132, '', {
        color: '#94a3b8',
        fontFamily: 'Arial, sans-serif',
        fontSize: portrait ? '12px' : '16px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(titleX, portrait ? 214 : startY + 52, '불러오는 중...', {
        color: '#94a3b8',
        fontFamily: 'Arial, sans-serif',
        fontSize: portrait ? '12px' : '17px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.createBackButton(backButtonX, backButtonY);
    this.createTabs(tabY);
    this.updateIdentitySummary(null);
    void this.loadLeaderboard(this.currentGame);
  }

  private createTabs(y: number): void {
    const width = this.scale.width;
    const portrait = this.isPortrait();
    const tabHeight = portrait ? 36 : 50;

    if (portrait) {
      const topRowTabs = GAME_TABS.slice(0, 3);
      const bottomRowTabs = GAME_TABS.slice(3);
      const topWidth = Math.min(108, Math.floor((width - 56) / 3));
      const topGap = 10;
      const topTotalWidth = topWidth * topRowTabs.length + topGap * (topRowTabs.length - 1);
      const topStartX = width / 2 - topTotalWidth / 2 + topWidth / 2;
      const secondWidth = Math.min(150, Math.floor((width - 48) / 2));
      const secondGap = 14;
      const secondTotalWidth = secondWidth * bottomRowTabs.length + secondGap * (bottomRowTabs.length - 1);
      const secondStartX = width / 2 - secondTotalWidth / 2 + secondWidth / 2;

      topRowTabs.forEach((tab, index) => {
        this.createRankTab(tab, topStartX + index * (topWidth + topGap), y, topWidth, tabHeight);
      });

      bottomRowTabs.forEach((tab, index) => {
        this.createRankTab(tab, secondStartX + index * (secondWidth + secondGap), y + tabHeight + 12, secondWidth, tabHeight);
      });
      return;
    }

    const tabWidth = 160;
    const totalWidth = tabWidth * GAME_TABS.length + 12 * (GAME_TABS.length - 1);
    const startX = width / 2 - totalWidth / 2 + tabWidth / 2;

    GAME_TABS.forEach((tab, index) => {
      this.createRankTab(tab, startX + index * (tabWidth + 12), y, tabWidth, tabHeight);
    });
  }

  private createRankTab(
    tab: GameTab,
    x: number,
    y: number,
    tabWidth: number,
    tabHeight: number,
  ): void {
    const isActive = tab.key === this.currentGame;
    const button = this.add
      .rectangle(x, y, tabWidth, tabHeight, isActive ? tab.accent : 0x111c30, isActive ? 1 : 0.94)
      .setStrokeStyle(2, isActive ? tab.accent : 0x334155)
      .setInteractive({ useHandCursor: true });

    button.on('pointerdown', () => {
      this.currentGame = tab.key;
      void this.loadLeaderboard(tab.key);
    });
    button.on('pointerover', () => {
      button.setFillStyle(tab.accent, 1).setStrokeStyle(2, 0xffffff);
    });
    button.on('pointerout', () => {
      const active = tab.key === this.currentGame;
      button.setFillStyle(active ? tab.accent : 0x111c30, active ? 1 : 0.94).setStrokeStyle(2, active ? tab.accent : 0x334155);
    });

    this.add
      .text(x, y, tab.label, {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: this.isPortrait() ? '11px' : '15px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
        wordWrap: { width: tabWidth - 18 },
      })
      .setOrigin(0.5);
  }

  private async loadLeaderboard(gameKey: GameKey): Promise<void> {
    const token = ++this.requestToken;
    this.clearRows();

    if (!hasLeaderboardConfig()) {
      this.statusText.setText('Supabase 설정이 없습니다.');
      return;
    }

    this.statusText.setText('불러오는 중...');
    const [entries, myBest] = await Promise.all([
      fetchLeaderboard(gameKey, 10),
      fetchMyBestRecord(gameKey),
    ]);

    if (token !== this.requestToken || !this.scene.isActive()) {
      return;
    }

    this.statusText.setText(entries.length > 0 ? '' : '아직 등록된 점수가 없습니다.');
    this.renderRows(entries);
    this.updateSummary(gameKey, myBest, entries);
    this.updateIdentitySummary(myBest);
  }

  private renderRows(entries: Awaited<ReturnType<typeof fetchLeaderboard>>): void {
    const width = this.scale.width;
    const portrait = this.isPortrait();
    const rowStartY = portrait ? 248 : 218;
    const rowGap = portrait ? 36 : 50;
    const rankX = portrait ? 34 : 90;
    const nameX = portrait ? 92 : 220;
    const scoreX = width - (portrait ? 16 : 90);
    const playerKey = getStoredPlayerKey();

    entries.forEach((entry, index) => {
      const y = rowStartY + index * rowGap;
      const highlight = playerKey !== null && entry.player_key === playerKey;
      const row = this.add
        .rectangle(width / 2, y, width - (portrait ? 18 : 120), rowGap - 4, highlight ? 0x1d4ed8 : 0x111c30, highlight ? 0.28 : 0.88)
        .setStrokeStyle(1, highlight ? 0x93c5fd : 0x243655);
      const rankText = this.add
        .text(rankX, y, `${index + 1}`, {
          color: highlight ? '#93c5fd' : '#94a3b8',
          fontFamily: 'Arial, sans-serif',
          fontSize: portrait ? '12px' : '18px',
          fontStyle: 'bold',
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5);
      const nameText = this.add
        .text(nameX, y, entry.nickname, {
          color: '#f8fafc',
          fontFamily: 'Arial, sans-serif',
          fontSize: portrait ? '12px' : '19px',
          fontStyle: highlight ? 'bold' : 'normal',
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0, 0.5);
      const scoreText = this.add
        .text(scoreX, y, String(entry.score), {
          color: highlight ? '#facc15' : '#f8fafc',
          fontFamily: 'Arial, sans-serif',
          fontSize: portrait ? '12px' : '20px',
          fontStyle: 'bold',
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(1, 0.5);

      this.rows.push(row, rankText, nameText, scoreText);
    });
  }

  private updateSummary(
    gameKey: GameKey,
    myBest: Awaited<ReturnType<typeof fetchMyBestRecord>>,
    entries: Awaited<ReturnType<typeof fetchLeaderboard>>,
  ): void {
    const label = GAME_TABS.find((tab) => tab.key === gameKey)?.label ?? gameKey;
    const bestText = myBest === null ? '아직 등록 기록 없음' : `내 최고점 ${myBest.score}`;
    const topText = entries[0] ? `1위 ${entries[0].nickname} ${entries[0].score}` : '상위 기록 없음';

    this.summaryText.setText(`${label} | ${bestText} | ${topText}`);
  }

  private updateIdentitySummary(
    myBest: Awaited<ReturnType<typeof fetchMyBestRecord>> | null = null,
  ): void {
    const nickname = getDisplayNickname();
    const rankText = myBest === null ? '아직 순위 없음' : `내 순위 ${myBest.rank}위`;
    this.identityText.setText(`닉네임: ${nickname} | ${rankText}`);
  }

  private clearRows(): void {
    for (const item of this.rows) {
      item.destroy();
    }
    this.rows = [];
  }

  private createBackButton(x: number, y: number): void {
    const buttonWidth = 100;
    const buttonHeight = 32;

    const button = this.add
      .rectangle(x, y, buttonWidth, buttonHeight, 0x111c30, 0.94)
      .setStrokeStyle(2, 0x334155)
      .setInteractive({ useHandCursor: true });

    button.on('pointerdown', () => {
      this.scene.start('MenuScene');
    });
    button.on('pointerover', () => {
      button.setFillStyle(0x1a2a45, 0.98).setStrokeStyle(2, 0x60a5fa);
    });
    button.on('pointerout', () => {
      button.setFillStyle(0x111c30, 0.94).setStrokeStyle(2, 0x334155);
    });

    this.add
      .text(x, y, '뒤로가기', {
        color: '#f8fafc',
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);
  }

  private isPortrait(): boolean {
    return this.scale.height > this.scale.width;
  }
}
