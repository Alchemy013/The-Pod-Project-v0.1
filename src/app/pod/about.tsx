import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Palette, Font } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NavRow } from '@/components/ui/NavRow';

export default function AboutScreen() {
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} contentInsetAdjustmentBehavior="automatic">
      <View style={s.hero}>
        <View style={s.iconCircle}>
          <Text style={s.iconText}>◉</Text>
        </View>
        <Text style={s.name}>ThePod</Text>
      </View>

      <SectionHeader>Hardware</SectionHeader>
      <Card style={{ padding: 0 }}>
        <NavRow label="Device" value="Raspberry Pi Zero 2W" />
        <NavRow label="Processor" value="ARM Cortex-A53 · 1.0GHz" />
        <NavRow label="Memory" value="512MB RAM" />
        <NavRow label="DAC" value="PCM5122 · I2S" />
        <NavRow label="Output" value="3.5mm Analog" />
        <NavRow label="Firmware" value="1.0.0" last />
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  content: { paddingBottom: 60 },

  hero: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  iconCircle: {
    width: 64, height: 64,
    backgroundColor: Palette.divider, alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 28, color: Palette.textSecondary },
  name: { color: Palette.text, fontFamily: Font.heading, fontSize: 20 },
});
