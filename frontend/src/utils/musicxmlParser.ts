export interface LyricWord {
  text: string;
  measureNumber: number;
  partId: string;
}

export function extractLyricsFromMusicXML(xmlString: string): LyricWord[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  
  const lyrics: LyricWord[] = [];
  
  // Find all parts
  const parts = xmlDoc.getElementsByTagName('part');
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partId = part.getAttribute('id') || `P${i+1}`;
    
    // Find all measures in this part
    const measures = part.getElementsByTagName('measure');
    
    for (let j = 0; j < measures.length; j++) {
      const measure = measures[j];
      const measureNumber = parseInt(measure.getAttribute('number') || `${j+1}`, 10);
      
      // Find all notes in this measure
      const notes = measure.getElementsByTagName('note');
      
      for (let k = 0; k < notes.length; k++) {
        const note = notes[k];
        
        // Find lyric tags in this note
        const lyricElements = note.getElementsByTagName('lyric');
        if (lyricElements.length > 0) {
          for (let l = 0; l < lyricElements.length; l++) {
            const textElement = lyricElements[l].getElementsByTagName('text')[0];
            if (textElement && textElement.textContent) {
              const text = textElement.textContent.trim();
              if (text) {
                lyrics.push({
                  text,
                  measureNumber,
                  partId
                });
              }
            }
          }
        }
      }
    }
  }
  
  return lyrics;
}
