import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type GameKey = 'snake' | 'dodge' | 'whack' | 'tetris' | 'brick';

export type LeaderboardEntry = {
  id: string;
  game_key: GameKey;
  player_key: string;
  nickname: string;
  score: number;
  created_at: string;
};

export type LeaderboardRankedEntry = LeaderboardEntry & {
  rank: number;
};

const TABLE_NAME = 'leaderboard_entries';
const RANKED_VIEW_NAME = 'leaderboard_ranked';
const PLAYER_KEY_STORAGE = 'shift.leaderboard.playerKey';
const NICKNAME_STORAGE = 'shift.leaderboard.nickname';
const NICKNAME_MAX_LENGTH = 12;
const FALLBACK_SUPABASE_URL = 'https://neoeceuzwrncwybtlawp.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_voseOmvtylPh_Q79YMT15A_KbQ2qU36';
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? FALLBACK_SUPABASE_URL;
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? FALLBACK_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function hasLeaderboardConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getStoredNickname(): string | null {
  try {
    return window.localStorage.getItem(NICKNAME_STORAGE);
  } catch {
    return null;
  }
}

export function getStoredPlayerKey(): string | null {
  try {
    return window.localStorage.getItem(PLAYER_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function getDisplayNickname(): string {
  return getStoredNickname() ?? '미등록';
}

export async function submitScore(gameKey: GameKey, score: number): Promise<boolean> {
  if (!hasLeaderboardConfig()) {
    return false;
  }

  if (!Number.isFinite(score) || score < 0) {
    return false;
  }

  const identity = await ensureIdentity();

  if (!identity) {
    return false;
  }

  const supabase = getClient();

  if (!supabase) {
    return false;
  }

  const nextScore = Math.floor(score);
  const { data: existing, error: fetchError } = await supabase
    .from(TABLE_NAME)
    .select('id, score')
    .eq('game_key', gameKey)
    .eq('player_key', identity.playerKey)
    .maybeSingle();

  if (fetchError) {
    return false;
  }

  if (existing) {
    if (nextScore <= existing.score) {
      return true;
    }

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({
        nickname: identity.nickname,
        score: nextScore,
      })
      .eq('id', existing.id);

    return !error;
  }

  const { error } = await supabase.from(TABLE_NAME).insert({
    game_key: gameKey,
    player_key: identity.playerKey,
    nickname: identity.nickname,
    score: nextScore,
  });

  return !error;
}

export async function fetchLeaderboard(
  gameKey: GameKey,
  limit = 10,
): Promise<LeaderboardRankedEntry[]> {
  const supabase = getClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from(RANKED_VIEW_NAME)
    .select('id, game_key, player_key, nickname, score, created_at, rank')
    .eq('game_key', gameKey)
    .order('rank', { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    ...row,
    game_key: row.game_key as GameKey,
    rank: Number(row.rank),
  }));
}

export async function fetchMyBestRecord(
  gameKey: GameKey,
): Promise<{ score: number; rank: number; nickname: string } | null> {
  const playerKey = getStoredPlayerKey();
  const supabase = getClient();

  if (!playerKey || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from(RANKED_VIEW_NAME)
    .select('score, rank, nickname')
    .eq('game_key', gameKey)
    .eq('player_key', playerKey)
    .order('rank', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    score: data.score,
    rank: Number(data.rank),
    nickname: data.nickname,
  };
}

export async function ensureIdentity(): Promise<{ playerKey: string; nickname: string } | null> {
  const playerKey = await getOrCreatePlayerKey();

  if (!playerKey) {
    return null;
  }

  const nickname = await getOrCreateNickname();

  if (!nickname) {
    return null;
  }

  return { playerKey, nickname };
}

async function getOrCreatePlayerKey(): Promise<string | null> {
  const stored = getStoredPlayerKey();

  if (stored) {
    return stored;
  }

  const key = generatePlayerKey();

  try {
    window.localStorage.setItem(PLAYER_KEY_STORAGE, key);
    return key;
  } catch {
    return null;
  }
}

async function getOrCreateNickname(): Promise<string | null> {
  const stored = getStoredNickname();

  if (stored) {
    return stored;
  }

  const initialValue = `Player${Math.floor(Math.random() * 9000 + 1000)}`;
  const nickname = window.prompt('닉네임을 입력하세요', initialValue)?.trim();

  if (!nickname) {
    return null;
  }

  const sanitized = sanitizeNickname(nickname);

  try {
    window.localStorage.setItem(NICKNAME_STORAGE, sanitized);
    return sanitized;
  } catch {
    return sanitized;
  }
}

function sanitizeNickname(nickname: string): string {
  const trimmed = nickname.replace(/\s+/g, ' ').trim();
  return trimmed.slice(0, NICKNAME_MAX_LENGTH);
}

function generatePlayerKey(): string {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 10);
  const timePart = Date.now().toString(36);
  return `${timePart}-${randomPart}`;
}

function getClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}
