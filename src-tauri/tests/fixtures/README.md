These short stereo tones are generated test inputs, independent of the user's music library.

Source signal: 440 Hz sine, 0.2 seconds, 44.1 kHz, two channels.
Encoders: pcm_s16le (WAV), libmp3lame (MP3), FLAC, libvorbis (Ogg), ALAC (M4A), libopus (Opus), AAC (ADTS).

Example generation command:

```sh
ffmpeg -f lavfi -i sine=frequency=440:duration=0.2:sample_rate=44100 -ac 2 -c:a libopus tone.opus
```
