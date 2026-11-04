import { Pressable, StyleSheet, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from '../constants/theme';

type Props = {
  title: string;
  onPress?: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary';
};

export default function PrimaryButton({ title, onPress, icon: Icon, variant = 'primary' }: Props) {
  const secondary = variant === 'secondary';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, secondary && styles.secondary, pressed && { opacity: 0.85 }]}
    >
      {Icon && <Icon color={colors.text} size={24} strokeWidth={1.8} />}
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: { color: colors.text, fontSize: 19, fontWeight: '600' },
});
