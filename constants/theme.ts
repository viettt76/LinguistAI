/**
 * Design system tokens based on 03_DESIGN_SYSTEM.md
 */

export const COLORS = {
  primary: '#0052CC',
  primaryLight: '#F0F4FF',
  danger: '#CC0000',
  dangerLight: '#FFF0F0',
  warning: '#E87722',
  success: '#00875A',
  successLight: '#F0FFF8',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  textMuted: '#AAAAAA',
  border: '#EBEBEB',
};

export const LAYOUT = {
  radiusLarge: 20,
  radiusMedium: 12,
  radiusSmall: 8,
  radiusXSmall: 6,
  spacing: (factor: number) => factor * 4,
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
};

export const ICON_OPTIONS = [
  '📚', '💼', '✈️', '🍕', '🏀', '🎮', '🌿', '💡', '💰', '💻', '🧪', '💬',
  '🎨', '🏠', '❤️', '⏳', '🛠️', '🎵', '⚖️', '🌌', '🚀', '🎯', '🧠', '🌍'
];

