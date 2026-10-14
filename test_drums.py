import sys
sys.path.append('.')
from music21 import stream, note, chord, meter, instrument, clef

part = stream.Part()
part.insert(0, instrument.UnpitchedPercussion())
part.insert(0, clef.PercussionClef())
part.insert(0, meter.TimeSignature("4/4"))

# Add simultaneous drum notes (Kick and Snare) at offset 3.75
duration_ql = 0.25
c = chord.Chord([36, 38], quarterLength=duration_ql)
part.insert(3.75, c)

# Add another at 3.999 (unquantized offset which triggers tuplet bug if not quantized)
c2 = chord.Chord([42], quarterLength=0.25)
part.insert(3.999, c2)

# Add a note that crosses the barline
c3 = chord.Chord([46], quarterLength=0.5)
part.insert(3.75, c3)

# Try quantizing and makeMeasures
part.quantize([4], processOffsets=True, processDurations=True, inPlace=True)
part.makeMeasures(inPlace=True)

try:
    part.write('musicxml', 'test_drums.xml')
    print("SUCCESS")
except Exception as e:
    print("FAILED:", e)
