import { hexToRgba } from '../../utils/color';

export interface ClipPresentation {
  waveformColor: string;
  titleColor: string;
  metaColor: string;
  headerBackground: string;
  bodyBackground: string;
  bodyBorderColor: string;
  bodyInnerShadow: string;
  containerShadow: string;
  clipBorder: string;
}

export function getClipPresentation(clipColor: string, isSelected: boolean): ClipPresentation {
  if (isSelected) {
    return {
      waveformColor: 'rgba(0, 0, 0, 0.72)',
      titleColor: '#181b22',
      metaColor: 'rgba(24, 27, 34, 0.72)',
      headerBackground: hexToRgba(clipColor, 0.95),
      bodyBackground: 'rgba(250, 248, 244, 0.97)',
      bodyBorderColor: 'transparent',
      bodyInnerShadow: 'none',
      containerShadow: `0 0 0 2px rgba(255,255,255,0.9), 0 0 8px ${hexToRgba(clipColor, 0.2)}`,
      clipBorder: 'none',
    };
  }

  return {
    waveformColor: 'rgba(0, 0, 0, 0.6)',
    titleColor: '#18161a',
    metaColor: 'rgba(24, 22, 26, 0.7)',
    headerBackground: hexToRgba(clipColor, 0.92),
    bodyBackground: hexToRgba(clipColor, 0.45),
    bodyBorderColor: 'transparent',
    bodyInnerShadow: 'none',
    containerShadow: 'none',
    clipBorder: 'none',
  };
}
