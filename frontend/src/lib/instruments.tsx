import { AudioLines, Drum, Guitar, Mic2, Music2, Piano, Waves } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

export interface InstrumentStyle {
  color: string;
  Icon: React.ComponentType<LucideProps>;
}

const STYLES: Record<string, InstrumentStyle> = {
  vocals: { color: '#ff7eb6', Icon: Mic2 },
  keys: { color: '#a78bfa', Icon: Piano },
  guitar: { color: '#fbbf24', Icon: Guitar },
  generic_melodic: { color: '#60a5fa', Icon: Music2 },
  strings: { color: '#f472b6', Icon: Music2 },
  winds: { color: '#34d399', Icon: Music2 },
  bass: { color: '#22d3ee', Icon: Waves },
  drums: { color: '#a3e635', Icon: Drum },
  generic_percussion: { color: '#a3e635', Icon: Drum },
  mix: { color: '#ff6a3d', Icon: AudioLines },
};

export function instrumentStyle(family: string): InstrumentStyle {
  return STYLES[family] ?? STYLES.generic_melodic;
}
