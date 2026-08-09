import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Circle, Rect, Polygon } from 'react-native-svg';

export type IconName =
  | 'chevron-down' | 'chevron-right' | 'chevron-left' | 'arrow-right'
  | 'search' | 'queue' | 'shuffle' | 'repeat' | 'repeat-one'
  | 'previous' | 'next' | 'play' | 'pause' | 'speaker'
  | 'quote' | 'check' | 'close' | 'power' | 'drag-handle' | 'layout'
  | 'home' | 'plus' | 'download' | 'settings' | 'more' | 'edit'
  | 'link-off' | 'sort' | 'refresh'
  | 'tab-home' | 'tab-search' | 'tab-library' | 'tab-playing' | 'tab-history' | 'tab-pod';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

const STROKE_PROPS = { fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function Icon({ name, size = 20, color = '#000', strokeWidth = 2.5, style }: Props) {
  const sw = strokeWidth;
  return <View style={style}>{glyph(name, size, color, sw)}</View>;
}

function glyph(name: IconName, size: number, color: string, sw: number) {
  switch (name) {
    case 'search':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={sw}>
          <Circle cx={11} cy={11} r={8} />
          <Path d="m21 21-4.3-4.3" />
        </Svg>
      );
    case 'chevron-down':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={sw}>
          <Path d="m6 9 6 6 6-6" />
        </Svg>
      );
    case 'chevron-right':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={sw}>
          <Path d="m9 18 6-6-6-6" />
        </Svg>
      );
    case 'chevron-left':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={sw}>
          <Path d="m15 18-6-6 6-6" />
        </Svg>
      );
    case 'arrow-right':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={sw}>
          <Path d="M5 12h14" />
          <Path d="m12 5 7 7-7 7" />
        </Svg>
      );
    case 'queue':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="M21 15V6" />
          <Circle cx={18.5} cy={18} r={2.5} />
          <Path d="M12 12H3" />
          <Path d="M16 6H3" />
          <Path d="M12 18H3" />
        </Svg>
      );
    case 'shuffle':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22" />
          <Path d="m18 2 4 4-4 4" />
          <Path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
          <Path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
          <Path d="m18 14 4 4-4 4" />
        </Svg>
      );
    case 'repeat':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="m17 2 4 4-4 4" />
          <Path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <Path d="m7 22-4-4 4-4" />
          <Path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </Svg>
      );
    case 'repeat-one':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="m17 2 4 4-4 4" />
          <Path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <Path d="m7 22-4-4 4-4" />
          <Path d="M21 13v1a4 4 0 0 1-4 4H3" />
          <Path d="M11 10h1v4" />
        </Svg>
      );
    case 'previous':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Polygon points="19 20 9 12 19 4 19 20" />
          <Rect x={5} y={4} width={2} height={16} />
        </Svg>
      );
    case 'next':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Polygon points="5 4 15 12 5 20 5 4" />
          <Rect x={17} y={4} width={2} height={16} />
        </Svg>
      );
    case 'play':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Polygon points="6 3 20 12 6 21 6 3" />
        </Svg>
      );
    case 'pause':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Rect x={14} y={4} width={4} height={16} />
          <Rect x={6} y={4} width={4} height={16} />
        </Svg>
      );
    case 'speaker':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        </Svg>
      );
    case 'quote':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="M3 21c3 0 4-2 4-4V5H3v8h4" />
          <Path d="M13 21c3 0 4-2 4-4V5h-4v8h4" />
        </Svg>
      );
    case 'check':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={sw}>
          <Path d="M20 6 9 17l-5-5" />
        </Svg>
      );
    case 'close':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2.5}>
          <Circle cx={12} cy={12} r={10} />
          <Path d="m15 9-6 6" />
          <Path d="m9 9 6 6" />
        </Svg>
      );
    case 'power':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2.5}>
          <Path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
          <Path d="M12 2v10" />
        </Svg>
      );
    case 'drag-handle':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2.5}>
          <Path d="M4 8h16M4 16h16" />
        </Svg>
      );
    case 'layout':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Rect x={3} y={3} width={8} height={8} />
          <Rect x={13} y={3} width={8} height={8} />
          <Rect x={3} y={13} width={8} height={8} />
          <Rect x={13} y={13} width={8} height={8} />
        </Svg>
      );
    case 'home':
    case 'tab-home':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="M3 10.5 12 3l9 7.5" />
          <Path d="M5.5 9.5V20h13V9.5" />
        </Svg>
      );
    case 'tab-search':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Circle cx={10.5} cy={10.5} r={7} />
          <Path d="m20.5 20.5-5-5" />
        </Svg>
      );
    case 'plus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="M12 5v14M5 12h14" />
        </Svg>
      );
    case 'download':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="M12 3v13" />
          <Path d="m7 11 5 5 5-5" />
          <Path d="M4 20h16" />
        </Svg>
      );
    case 'settings':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Circle cx={12} cy={12} r={3} />
          <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
        </Svg>
      );
    case 'more':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Circle cx={5} cy={12} r={1.9} />
          <Circle cx={12} cy={12} r={1.9} />
          <Circle cx={19} cy={12} r={1.9} />
        </Svg>
      );
    case 'edit':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
        </Svg>
      );
    case 'sort':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="M7 4v16M7 4 4 7.5M7 4l3 3.5" />
          <Path d="M17 20V4M17 20l3-3.5M17 20l-3-3.5" />
        </Svg>
      );
    case 'refresh':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="M21 12a9 9 0 1 1-2.6-6.4" />
          <Path d="M21 4v5h-5" />
        </Svg>
      );
    case 'link-off':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Circle cx={12} cy={12} r={8} />
          <Path d="M6 18 18 6" />
        </Svg>
      );
    case 'tab-library':
      return (
        // Three uneven bars — the spine-of-records mark from the design.
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Rect x={4} y={9} width={3.5} height={11} rx={1} />
          <Rect x={10.25} y={4} width={3.5} height={16} rx={1} />
          <Rect x={16.5} y={7} width={3.5} height={13} rx={1} />
        </Svg>
      );
    case 'tab-playing':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Circle cx={12} cy={12} r={10} />
          <Path d="M6 12c0-1.7.7-3.2 1.8-4.2" />
          <Circle cx={12} cy={12} r={2} />
          <Path d="M18 12c0 1.7-.7 3.2-1.8 4.2" />
        </Svg>
      );
    case 'tab-history':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Path d="M8 2v4" />
          <Path d="M16 2v4" />
          <Rect x={3} y={6} width={18} height={16} />
          <Path d="M3 12h18" />
        </Svg>
      );
    case 'tab-pod':
      return (
        // The device mark: an outer ring with a solid core.
        <Svg width={size} height={size} viewBox="0 0 24 24" {...STROKE_PROPS} stroke={color} strokeWidth={2}>
          <Circle cx={12} cy={12} r={8.5} />
          <Circle cx={12} cy={12} r={2.6} fill={color} stroke="none" />
        </Svg>
      );
  }
}
