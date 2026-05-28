from pathlib import Path
from ml_pipeline.instrument_detector import StemBasedDetector

def test_indian_percussion_mode():
    detector = StemBasedDetector(indian_percussion_mode=True)
    stems = {"drums": Path("dummy.wav"), "bass": Path("dummy.wav")}
    instruments = detector.detect(stems)
    
    # Drums should map to Indian Percussion
    assert instruments[0].name == "Indian Percussion"
    assert instruments[0].is_percussion is True
    
    # Bass should remain Bass
    assert instruments[1].name == "Bass"
    
def test_normal_percussion_mode():
    detector = StemBasedDetector(indian_percussion_mode=False)
    stems = {"drums": Path("dummy.wav")}
    instruments = detector.detect(stems)
    
    assert instruments[0].name == "Drum Kit"
    assert instruments[0].is_percussion is True
