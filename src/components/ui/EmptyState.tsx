import { StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/icons';
import { PillButton } from '@/components/ui/controls';
import { Palette, Font, Type } from '@/constants/theme';

/**
 * The app's one empty state.
 *
 * Two rules it exists to enforce. The icon is an `IconName` from the inline-SVG
 * set, never a string glyph or emoji — the previous version of this component
 * took `icon?: string` and rendered it as 40pt text, which is a large part of
 * why it sat unused while six screens hand-rolled their own `empty` style.
 *
 * And an empty state the user can *act* on gets a button. Telling someone in
 * prose to go to Pod › Storage when we could put them there is the kind of
 * thing that reads as unfinished — and an empty Pod is the highest-intent
 * moment in the product.
 */
export function EmptyState({ icon, title, subtitle, actionLabel, onAction, compact }: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Sits inside a list rather than owning the screen — no vertical centring. */
  compact?: boolean;
}) {
  return (
    <View style={[s.wrap, compact ? s.compact : s.full]}>
      {icon && (
        <View style={s.mark}>
          <Icon name={icon} size={22} color={Palette.textMuted} />
        </View>
      )}
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <PillButton label={actionLabel} onPress={onAction} variant="accent" style={s.action} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 36, gap: 10 },
  full: { flex: 1, justifyContent: 'center' },
  compact: { paddingTop: 64 },
  mark: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Palette.rail, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  title: { color: Palette.text, fontFamily: Font.bold, fontSize: Type.title3, textAlign: 'center' },
  subtitle: {
    color: Palette.textSecondary, fontFamily: Font.regular, fontSize: Type.body,
    lineHeight: 21, textAlign: 'center',
  },
  action: { alignSelf: 'stretch', marginTop: 12 },
});
