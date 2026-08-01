import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Palette } from '@/constants/theme';

export function Sheet({ visible, onClose, title, children }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.titleRow}>
          <Text style={s.title}>{title}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <SymbolView name="xmark.circle.fill" style={s.closeIcon} type="monochrome" tintColor={Palette.textMuted} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Palette.bg, paddingTop: 12 },
  handle: { width: 36, height: 4, backgroundColor: Palette.surfaceHigh, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  title: { color: Palette.text, fontSize: 18, fontWeight: '700' },
  closeIcon: { width: 24, height: 24 },
});
