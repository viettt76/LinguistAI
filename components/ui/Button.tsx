import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextStyle, TouchableOpacity, ViewStyle } from 'react-native';
import { COLORS, LAYOUT } from '../../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  style,
  textStyle,
  disabled,
  loading,
  icon,
}) => {
  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const getVariantStyle = () => {
    switch (variant) {
      case 'secondary': return styles.secondary;
      case 'danger': return styles.danger;
      case 'ghost': return styles.ghost;
      default: return styles.primary;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'secondary': return styles.textSecondary;
      case 'danger': return styles.textDanger;
      case 'ghost': return styles.textGhost;
      default: return styles.textPrimary;
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      disabled={disabled || loading}
      style={[
        styles.base,
        getVariantStyle(),
        size === 'small' && styles.small,
        size === 'large' && styles.large,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? 'white' : COLORS.primary} />
      ) : (
        <>
          {icon && <React.Fragment>{icon}</React.Fragment>}
          <Text style={[styles.textBase, getTextStyle(), textStyle]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: LAYOUT.radiusSmall,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  small: { paddingVertical: 6, paddingHorizontal: 10 },
  large: { paddingVertical: 14, paddingHorizontal: 20 },
  primary: { backgroundColor: COLORS.primary },
  secondary: { backgroundColor: COLORS.primaryLight },
  danger: { backgroundColor: COLORS.danger },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  textBase: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    marginLeft: 6,
  },
  textPrimary: { color: 'white' },
  textSecondary: { color: COLORS.primary },
  textDanger: { color: 'white' },
  textGhost: { color: COLORS.textSecondary },
});
