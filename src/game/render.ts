import Phaser from 'phaser';

export const RENDER_SCALE = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
export const TEXT_RESOLUTION = RENDER_SCALE;

export function configureHiDpiCamera(camera: Phaser.Cameras.Scene2D.Camera): void {
  camera.setZoom(1);
  camera.setScroll(0, 0);
}
