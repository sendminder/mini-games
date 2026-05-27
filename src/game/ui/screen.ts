export type ScreenChrome = {
  portrait: boolean;
  width: number;
  height: number;
  titleY: number;
  subtitleY: number;
  topRowY: number;
  footerY: number;
  backButtonX: number;
  backButtonY: number;
  titleFontSize: number;
  subtitleFontSize: number;
  bodyFontSize: number;
  smallFontSize: number;
};

export function createScreenChrome(width: number, height: number): ScreenChrome {
  const portrait = height > width;

  return {
    portrait,
    width,
    height,
    titleY: portrait ? 18 : 34,
    subtitleY: portrait ? 62 : 90,
    topRowY: portrait ? 42 : 53,
    footerY: portrait ? height - 24 : height - 30,
    backButtonX: width - 56,
    backButtonY: portrait ? 18 : 48,
    titleFontSize: portrait ? 19 : 27,
    subtitleFontSize: portrait ? 11 : 14,
    bodyFontSize: portrait ? 11 : 16,
    smallFontSize: portrait ? 10 : 12,
  };
}
