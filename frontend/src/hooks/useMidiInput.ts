import { useRef, useState, useEffect, useCallback } from 'react';
import type { MidiNoteEvent } from '../api/types';

interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

interface UseMidiInputReturn {
  devices: MidiDevice[];
  selectedDevice: MidiDevice | null;
  selectDevice: (id: string) => void;
  lastNote: MidiNoteEvent | null;
  isSupported: boolean;
  isConnected: boolean;
  error: string | null;
}

/**
 * React hook for Web MIDI API input.
 * Listens for note-on/note-off messages from connected MIDI devices.
 */
export function useMidiInput(enabled: boolean): UseMidiInputReturn {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<MidiDevice | null>(null);
  const [lastNote, setLastNote] = useState<MidiNoteEvent | null>(null);
  const [isSupported] = useState(() => 'requestMIDIAccess' in navigator);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const activeInputRef = useRef<MIDIInput | null>(null);

  // Handle incoming MIDI messages
  const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data.length < 3) return;

    const status = data[0] & 0xf0;
    const note = data[1];
    const velocity = data[2];

    if (status === 0x90 && velocity > 0) {
      // Note On
      setLastNote({
        note,
        velocity,
        type: 'on',
        timestamp: performance.now(),
      });
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      // Note Off
      setLastNote({
        note,
        velocity: 0,
        type: 'off',
        timestamp: performance.now(),
      });
    }
  }, []);

  // Request MIDI access and enumerate devices
  useEffect(() => {
    if (!enabled || !isSupported) return;

    let cancelled = false;

    (async () => {
      try {
        const access = await navigator.requestMIDIAccess();
        if (cancelled) return;
        midiAccessRef.current = access;

        const updateDevices = () => {
          const inputs: MidiDevice[] = [];
          access.inputs.forEach((input) => {
            inputs.push({
              id: input.id,
              name: input.name || 'Unknown Device',
              manufacturer: input.manufacturer || 'Unknown',
            });
          });
          setDevices(inputs);

          // Auto-select first device if none selected
          if (inputs.length > 0 && !activeInputRef.current) {
            const first = inputs[0];
            setSelectedDevice(first);
            const midiInput = access.inputs.get(first.id);
            if (midiInput) {
              midiInput.onmidimessage = handleMidiMessage;
              activeInputRef.current = midiInput;
              setIsConnected(true);
            }
          }
        };

        updateDevices();
        access.onstatechange = () => updateDevices();
      } catch (err) {
        if (!cancelled) {
          setError('Failed to access MIDI devices. Make sure you are using Chrome or Edge.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (activeInputRef.current) {
        activeInputRef.current.onmidimessage = null;
        activeInputRef.current = null;
      }
      setIsConnected(false);
    };
  }, [enabled, isSupported, handleMidiMessage]);

  // Select a specific device
  const selectDevice = useCallback(
    (id: string) => {
      if (!midiAccessRef.current) return;

      // Disconnect previous
      if (activeInputRef.current) {
        activeInputRef.current.onmidimessage = null;
        activeInputRef.current = null;
        setIsConnected(false);
      }

      const input = midiAccessRef.current.inputs.get(id);
      if (input) {
        input.onmidimessage = handleMidiMessage;
        activeInputRef.current = input;
        setIsConnected(true);
        const device = devices.find((d) => d.id === id) || null;
        setSelectedDevice(device);
      }
    },
    [devices, handleMidiMessage],
  );

  return {
    devices,
    selectedDevice,
    selectDevice,
    lastNote,
    isSupported,
    isConnected,
    error,
  };
}
