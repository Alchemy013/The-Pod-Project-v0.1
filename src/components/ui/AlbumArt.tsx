import { StyleSheet, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Font } from '@/constants/theme';
import { getAlbumColor, getInitial } from '@/utils/albumColor';

type Props = {
  uri?: string | null;
  seedKey: string;
  title: string;
  size: number;
  /** Letter size as a fraction of `size`. Bigger on hero art blocks. */
  letterScale?: number;
  style?: object;
};

export function AlbumArt({ uri, seedKey, title, size, letterScale = 0.45, style }: Props) {
  const { bg, fg } = getAlbumColor(seedKey);
  return (
    <View style={[{ width: size, height: size, backgroundColor: bg, overflow: 'hidden' }, style]}>
      <Text
        style={{
          fontFamily: Font.heading,
          fontSize: size * letterScale,
          lineHeight: size * letterScale * 0.95,
          color: fg,
          position: 'absolute',
          left: size * 0.08,
          bottom: size * 0.04,
        }}
      >
        {getInitial(title)}
      </Text>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          transition={200}
          contentFit="cover"
        />
      ) : null}
    </View>
  );
}
