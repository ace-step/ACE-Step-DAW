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
      waveformColor: '#16181f',
      titleColor: '#181b22',
      metaColor: 'rgba(24, 27, 34, 0.72)',
      headerBackground: `linear-gradient(180deg, ${hexToRgba(clipColor, 0.96)} 0%, ${hexToRgba(clipColor, 0.88)} 100%)`,
      bodyBackground: 'linear-gradient(180deg, rgba(253, 251, 246, 0.98) 0%, rgba(244, 238, 228, 0.96) 100%)',
      bodyBorderColor: 'rgba(255, 255, 255, 0.92)',
      bodyInnerShadow: 'inset 0 1px 3px rgba(0,0,0,0.15)',
      containerShadow: `0 0 0 2px rgba(255,255,255,0.96), 0 0 12px ${hexToRgba(clipColor, 0.3)}, 0 14px 28px rgba(0,0,0,0.22)`,
      clipBorder: `1px solid rgba(255,255,255,0.96)`,
    };
  }

  return {
    waveformColor: '#1a1d26',
    titleColor: '#18161a',
    metaColor: 'rgba(24, 22, 26, 0.7)',
    headerBackground: `linear-gradient(180deg, ${hexToRgba(clipColor, 0.96)} 0%, ${hexToRgba(clipColor, 0.9)} 100%)`,
    bodyBackground: `linear-gradient(180deg, ${hexToRgba(clipColor, 0.56)} 0%, ${hexToRgba(clipColor, 0.42)} 100%)`,
    bodyBorderColor: hexToRgba(clipColor, 0.34),
    bodyInnerShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
    containerShadow: '0 8px 18px rgba(0,0,0,0.14)',
    clipBorder: `1px solid ${hexToRgba(clipColor, 0.5)}`,
  };
}
