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

# Add another at 3.999 (should trigger the tuplet bug if not quantized!)
# But wait, my code inserted EXACTLY 0.25 offsets.
# Let's add a note that crosses the barline
c2 = chord.Chord([42], quarterLength=0.5)
part.insert(3.75, c2)

# Try quantizing and makeMeasures
part.quantize([4], processOffsets=True, processDurations=True, inPlace=True)
part.makeMeasures(inPlace=True)

try:
    part.write('musicxml', 'test_drums.xml')
    print("SUCCESS")
except Exception as e:
    print("FAILED:", e)
