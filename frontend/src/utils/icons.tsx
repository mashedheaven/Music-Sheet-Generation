import {
  Guitar,
  Drum,
  Piano,
  Mic,
  Music2, // fallback
  Wind, // for woodwind/flute/brass
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

/**
 * Map instrument family to a Lucide icon component.
 */
export function getInstrumentIcon(family: string, props: LucideProps = {}) {
  const f = family.toLowerCase();
  
  if (['guitar', 'bass', 'strings', 'violin', 'cello'].includes(f)) {
    return <Guitar {...props} />;
  }
  if (['drums', 'percussion'].includes(f)) {
    return <Drum {...props} />;
  }
  if (['piano', 'keyboard', 'keys'].includes(f)) {
    return <Piano {...props} />;
  }
  if (['vocals', 'voice'].includes(f)) {
    return <Mic {...props} />;
  }
  if (['brass', 'trumpet', 'woodwind', 'flute', 'saxophone'].includes(f)) {
    return <Wind {...props} />;
  }
  
  return <Music2 {...props} />;
}
