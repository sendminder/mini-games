import Phaser from 'phaser';

export const DISPLAY_WIDTH = 960;
export const DISPLAY_HEIGHT = 540;
export const RENDER_SCALE = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
export const RENDER_WIDTH = Math.round(DISPLAY_WIDTH * RENDER_SCALE);
export const RENDER_HEIGHT = Math.round(DISPLAY_HEIGHT * RENDER_SCALE);
export const TEXT_RESOLUTION = RENDER_SCALE;

export function configureHiDpiCamera(camera: Phaser.Cameras.Scene2D.Camera): void {
  const visibleWidth = RENDER_WIDTH / RENDER_SCALE;
  const visibleHeight = RENDER_HEIGHT / RENDER_SCALE;

  camera.setZoom(RENDER_SCALE);
  camera.setScroll(
    -(RENDER_WIDTH - visibleWidth) / 2,
    -(RENDER_HEIGHT - visibleHeight) / 2,
  );
}
