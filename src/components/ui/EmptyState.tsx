import { StyleSheet, Text, View } from 'react-native';
import { Palette, Font } from '@/constants/theme';

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
  title: { color: Palette.text, fontFamily: Font.bold, fontSize: 18 },
  subtitle: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
