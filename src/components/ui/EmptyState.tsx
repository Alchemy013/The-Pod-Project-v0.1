import { StyleSheet, Text, View } from 'react-native';
import { Palette } from '@/constants/theme';

export function EmptyState({ icon, title, subtitle }: {
  icon?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={s.center}>
      {icon && <Text style={s.icon}>{icon}</Text>}
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center', gap: 10 },
  icon: { fontSize: 40, color: Palette.textMuted },
  title: { color: Palette.text, fontSize: 18, fontWeight: '700' },
  subtitle: { color: Palette.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
