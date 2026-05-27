const SNAKE_HIGH_SCORE_KEY = 'shift.snake.highScore';
const DODGE_HIGH_SCORE_KEY = 'shift.dodge.highScore';
const WHACK_HIGH_SCORE_KEY = 'shift.whack.highScore';
const TETRIS_HIGH_SCORE_KEY = 'shift.tetris.highScore';
const BRICK_HIGH_SCORE_KEY = 'shift.brick.highScore';

export function getSnakeHighScore(): number {
  return getHighScore(SNAKE_HIGH_SCORE_KEY);
}

export function saveSnakeHighScore(score: number): number {
  return saveHighScore(SNAKE_HIGH_SCORE_KEY, score);
}

export function getDodgeHighScore(): number {
  return getHighScore(DODGE_HIGH_SCORE_KEY);
}

export function saveDodgeHighScore(score: number): number {
  return saveHighScore(DODGE_HIGH_SCORE_KEY, score);
}

export function getWhackHighScore(): number {
  return getHighScore(WHACK_HIGH_SCORE_KEY);
}

export function saveWhackHighScore(score: number): number {
  return saveHighScore(WHACK_HIGH_SCORE_KEY, score);
}

export function getTetrisHighScore(): number {
  return getHighScore(TETRIS_HIGH_SCORE_KEY);
}

export function saveTetrisHighScore(score: number): number {
  return saveHighScore(TETRIS_HIGH_SCORE_KEY, score);
}

export function getBrickHighScore(): number {
  return getHighScore(BRICK_HIGH_SCORE_KEY);
}

export function saveBrickHighScore(score: number): number {
  return saveHighScore(BRICK_HIGH_SCORE_KEY, score);
}

function getHighScore(key: string): number {
  try {
    const storedScore = window.localStorage.getItem(key);
    const score = Number.parseInt(storedScore ?? '0', 10);

    return Number.isFinite(score) && score > 0 ? score : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(key: string, score: number): number {
  const highScore = Math.max(score, getHighScore(key));

  try {
    window.localStorage.setItem(key, String(highScore));
  } catch {
    // Storage may be disabled; keep the current session playable.
  }

  return highScore;
}
