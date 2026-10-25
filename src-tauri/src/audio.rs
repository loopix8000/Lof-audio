use crate::models::PlaybackState;
use rodio::{OutputStream, Sink, Source};
use std::fs::File;
use std::path::Path;
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use symphonia::core::audio::{AudioBufferRef, SampleBuffer, SignalSpec};
use symphonia::core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::{MediaSource, MediaSourceStream};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::{self, Time};
use symphonia::default::{get_codecs, get_probe};

const MAX_DECODE_RETRIES: usize = 1024;

pub struct ResilientSymphoniaSource {
    decoder: Box<dyn Decoder>,
    current_frame_offset: usize,
    format: Box<dyn FormatReader>,
    total_duration: Option<Duration>,
    buffer: SampleBuffer<i16>,
    spec: SignalSpec,
    track_id: u32,
}

impl ResilientSymphoniaSource {
    pub fn new(file: File, file_path: &str) -> Result<Self, String> {
        let mss = MediaSourceStream::new(Box::new(file) as Box<dyn MediaSource>, Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = Path::new(file_path).extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let format_opts = FormatOptions {
            enable_gapless: true,
            ..Default::default()
        };
        let metadata_opts = MetadataOptions::default();

        let mut probed = get_probe()
            .format(&hint, mss, &format_opts, &metadata_opts)
            .map_err(|e| format!("오디오 포맷 인식 실패: {}", e))?;

        let track = probed
            .format
            .tracks()
            .iter()
            .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            .ok_or_else(|| "재생 가능한 오디오 스트림이 없습니다.".to_string())?;

        let track_id = track.id;
        let total_duration = track
            .codec_params
            .time_base
            .zip(track.codec_params.n_frames)
            .map(|(base, frames)| {
                let Time { seconds, frac } = base.calc_time(frames);
                Duration::from_secs(seconds) + Duration::from_secs_f64(frac)
            });

        let mut decoder = get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .map_err(|e| format!("코덱 디코더 초기화 실패: {}", e))?;

        let mut retries = 0usize;
        let decoded = loop {
            let packet = match probed.format.next_packet() {
                Ok(p) => p,
                Err(e) => return Err(format!("오디오 패킷 읽기 실패: {}", e)),
            };

            if packet.track_id() != track_id {
                continue;
            }

            match decoder.decode(&packet) {
                Ok(decoded) => break decoded,
                Err(SymphoniaError::DecodeError(_)) => {
                    retries += 1;
                    if retries > MAX_DECODE_RETRIES {
                        return Err("손상된 오디오 프레임이 너무 많습니다.".to_string());
                    }
                }
                Err(SymphoniaError::ResetRequired) => {
                    decoder.reset();
                }
                Err(e) => return Err(format!("오디오 디코딩 오류: {}", e)),
            }
        };

        let spec = *decoded.spec();
        let buffer = Self::copy_buffer(decoded, &spec);

        Ok(Self {
            decoder,
            current_frame_offset: 0,
            format: probed.format,
            total_duration,
            buffer,
            spec,
            track_id,
        })
    }

    #[inline]
    fn copy_buffer(decoded: AudioBufferRef<'_>, spec: &SignalSpec) -> SampleBuffer<i16> {
        let duration = units::Duration::from(decoded.capacity() as u64);
        let mut buffer = SampleBuffer::<i16>::new(duration, *spec);
        buffer.copy_interleaved_ref(decoded);
        buffer
    }
}

impl Iterator for ResilientSymphoniaSource {
    type Item = i16;

    #[inline]
    fn next(&mut self) -> Option<i16> {
        while self.current_frame_offset >= self.buffer.len() {
            let mut retries = 0usize;
            let decoded_opt = loop {
                let packet = match self.format.next_packet() {
                    Ok(p) => p,
                    Err(_) => break None,
                };

                if packet.track_id() != self.track_id {
                    continue;
                }

                match self.decoder.decode(&packet) {
                    Ok(decoded) => break Some(decoded),
                    Err(SymphoniaError::DecodeError(_)) => {
                        retries += 1;
                        if retries > MAX_DECODE_RETRIES {
                            break None;
                        }
                    }
                    Err(SymphoniaError::ResetRequired) => {
                        self.decoder.reset();
                    }
                    Err(_) => break None,
                }
            };

            let decoded = decoded_opt?;
            decoded.spec().clone_into(&mut self.spec);
            self.buffer = Self::copy_buffer(decoded, &self.spec);
            self.current_frame_offset = 0;
        }

        let sample = *self.buffer.samples().get(self.current_frame_offset)?;
        self.current_frame_offset += 1;
        Some(sample)
    }
}

impl Source for ResilientSymphoniaSource {
    #[inline]
    fn current_frame_len(&self) -> Option<usize> {
        Some(self.buffer.samples().len())
    }

    #[inline]
    fn channels(&self) -> u16 {
        self.spec.channels.count() as u16
    }

    #[inline]
    fn sample_rate(&self) -> u32 {
        self.spec.rate
    }

    #[inline]
    fn total_duration(&self) -> Option<Duration> {
        self.total_duration
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), rodio::source::SeekError> {
        let target_secs = pos.as_secs();
        let target_frac = pos.subsec_nanos() as f64 / 1_000_000_000.0;
        let time = Time::new(target_secs, target_frac);

        let seek_res = self
            .format
            .seek(
                SeekMode::Accurate,
                SeekTo::Time {
                    time,
                    track_id: Some(self.track_id),
                },
            )
            .or_else(|_| {
                self.format.seek(
                    SeekMode::Coarse,
                    SeekTo::Time {
                        time,
                        track_id: Some(self.track_id),
                    },
                )
            });

        if seek_res.is_err() {
            return Err(rodio::source::SeekError::NotSupported {
                underlying_source: "SymphoniaSeek",
            });
        }

        self.decoder.reset();
        self.current_frame_offset = self.buffer.len();
        Ok(())
    }
}

pub enum AudioCommand {
    Play {
        track_id: i64,
        file_path: String,
        duration_secs: f64,
        reply: Sender<Result<PlaybackState, String>>,
    },
    Pause {
        reply: Sender<PlaybackState>,
    },
    Resume {
        reply: Sender<PlaybackState>,
    },
    Stop {
        reply: Sender<PlaybackState>,
    },
    Seek {
        position_secs: f64,
        reply: Sender<Result<PlaybackState, String>>,
    },
    SetVolume {
        volume: f32,
        reply: Sender<PlaybackState>,
    },
    SetSpeed {
        speed: f32,
        reply: Sender<PlaybackState>,
    },
    GetState {
        reply: Sender<PlaybackState>,
    },
}

pub struct AudioEngine {
    tx: Mutex<Sender<AudioCommand>>,
}

struct InternalState {
    current_track_id: Option<i64>,
    file_path: Option<String>,
    is_playing: bool,
    accumulated_secs: f64,
    started_at: Option<Instant>,
    duration_secs: f64,
    volume: f32,
    speed: f32,
    has_active_track: bool,
}

impl InternalState {
    fn current_position(&self) -> f64 {
        let elapsed = if let Some(started) = self.started_at {
            started.elapsed().as_secs_f64() * (self.speed as f64)
        } else {
            0.0
        };
        let pos = self.accumulated_secs + elapsed;
        if self.duration_secs > 0.0 {
            pos.min(self.duration_secs)
        } else {
            pos
        }
    }

    fn snapshot(&mut self, sink_empty: bool) -> PlaybackState {
        let mut is_ended = false;
        if self.has_active_track && sink_empty && self.is_playing {
            self.is_playing = false;
            self.started_at = None;
            self.accumulated_secs = self.duration_secs;
            is_ended = true;
        }
        PlaybackState {
            current_track_id: self.current_track_id,
            file_path: self.file_path.clone(),
            is_playing: self.is_playing,
            position_secs: self.current_position(),
            duration_secs: self.duration_secs,
            volume: self.volume,
            speed: self.speed,
            is_ended,
        }
    }
}

impl AudioEngine {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<AudioCommand>();

        thread::spawn(move || {
            let stream_result = OutputStream::try_default();
            let (_stream, stream_handle) = match stream_result {
                Ok((s, h)) => (Some(s), Some(h)),
                Err(e) => {
                    eprintln!("Warning: Failed to initialize audio output stream: {}", e);
                    (None, None)
                }
            };

            let mut sink: Option<Sink> = stream_handle
                .as_ref()
                .and_then(|h| Sink::try_new(h).ok());

            let mut state = InternalState {
                current_track_id: None,
                file_path: None,
                is_playing: false,
                accumulated_secs: 0.0,
                started_at: None,
                duration_secs: 0.0,
                volume: 0.85,
                speed: 1.0,
                has_active_track: false,
            };

            if let Some(ref s) = sink {
                s.set_volume(state.volume);
            }

            while let Ok(cmd) = rx.recv() {
                match cmd {
                    AudioCommand::Play {
                        track_id,
                        file_path,
                        duration_secs,
                        reply,
                    } => {
                        let file = match File::open(&file_path) {
                            Ok(f) => f,
                            Err(e) => {
                                let _ = reply.send(Err(format!("파일을 열 수 없습니다: {}", e)));
                                continue;
                            }
                        };

                        let source = match ResilientSymphoniaSource::new(file, &file_path) {
                            Ok(d) => d,
                            Err(e) => {
                                let _ = reply.send(Err(e));
                                continue;
                            }
                        };

                        let detected_dur = source
                            .total_duration()
                            .map(|d| d.as_secs_f64())
                            .unwrap_or(0.0);
                        let final_dur = if duration_secs > 0.1 {
                            duration_secs
                        } else {
                            detected_dur
                        };

                        if let Some(old_sink) = sink.take() {
                            old_sink.stop();
                        }

                        if let Some(ref handle) = stream_handle {
                            match Sink::try_new(handle) {
                                Ok(new_sink) => {
                                    new_sink.set_volume(state.volume);
                                    new_sink.set_speed(state.speed);
                                    new_sink.append(source);
                                    new_sink.play();
                                    sink = Some(new_sink);

                                    state.current_track_id = Some(track_id);
                                    state.file_path = Some(file_path);
                                    state.is_playing = true;
                                    state.accumulated_secs = 0.0;
                                    state.started_at = Some(Instant::now());
                                    state.duration_secs = final_dur;
                                    state.has_active_track = true;

                                    let snap = state.snapshot(false);
                                    let _ = reply.send(Ok(snap));
                                }
                                Err(e) => {
                                    let _ = reply.send(Err(format!("오디오 싱크 생성 실패: {}", e)));
                                }
                            }
                        } else {
                            state.current_track_id = Some(track_id);
                            state.file_path = Some(file_path);
                            state.is_playing = true;
                            state.accumulated_secs = 0.0;
                            state.started_at = Some(Instant::now());
                            state.duration_secs = final_dur;
                            state.has_active_track = true;
                            let snap = state.snapshot(false);
                            let _ = reply.send(Ok(snap));
                        }
                    }
                    AudioCommand::Pause { reply } => {
                        if let Some(ref s) = sink {
                            s.pause();
                        }
                        if state.is_playing {
                            state.accumulated_secs = state.current_position();
                            state.started_at = None;
                            state.is_playing = false;
                        }
                        let empty = sink.as_ref().map(|s| s.empty()).unwrap_or(false);
                        let _ = reply.send(state.snapshot(empty));
                    }
                    AudioCommand::Resume { reply } => {
                        if let Some(ref s) = sink {
                            s.play();
                        }
                        if state.has_active_track && !state.is_playing {
                            state.started_at = Some(Instant::now());
                            state.is_playing = true;
                        }
                        let empty = sink.as_ref().map(|s| s.empty()).unwrap_or(false);
                        let _ = reply.send(state.snapshot(empty));
                    }
                    AudioCommand::Stop { reply } => {
                        if let Some(ref s) = sink {
                            s.stop();
                        }
                        state.is_playing = false;
                        state.accumulated_secs = 0.0;
                        state.started_at = None;
                        state.has_active_track = false;
                        let _ = reply.send(state.snapshot(true));
                    }
                    AudioCommand::Seek {
                        position_secs,
                        reply,
                    } => {
                        let target = if state.duration_secs > 0.0 {
                            position_secs.clamp(0.0, (state.duration_secs - 0.1).max(0.0))
                        } else {
                            position_secs.max(0.0)
                        };
                        if let Some(ref s) = sink {
                            let seek_res = s.try_seek(Duration::from_secs_f64(target));
                            if seek_res.is_err() {
                                if let Some(ref path) = state.file_path {
                                    if let Ok(file) = File::open(path) {
                                        if let Ok(source) = ResilientSymphoniaSource::new(file, path) {
                                            if let Some(ref handle) = stream_handle {
                                                if let Ok(new_sink) = Sink::try_new(handle) {
                                                    new_sink.set_volume(state.volume);
                                                    new_sink.set_speed(state.speed);
                                                    new_sink.append(
                                                        source.skip_duration(Duration::from_secs_f64(target)),
                                                    );
                                                    if !state.is_playing {
                                                        new_sink.pause();
                                                    }
                                                    sink = Some(new_sink);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        state.accumulated_secs = target;
                        if state.is_playing {
                            state.started_at = Some(Instant::now());
                        }
                        let empty = sink.as_ref().map(|s| s.empty()).unwrap_or(false);
                        let _ = reply.send(Ok(state.snapshot(empty)));
                    }
                    AudioCommand::SetVolume { volume, reply } => {
                        let clamped = volume.clamp(0.0, 1.5);
                        state.volume = clamped;
                        if let Some(ref s) = sink {
                            s.set_volume(clamped);
                        }
                        let empty = sink.as_ref().map(|s| s.empty()).unwrap_or(false);
                        let _ = reply.send(state.snapshot(empty));
                    }
                    AudioCommand::SetSpeed { speed, reply } => {
                        let clamped = speed.clamp(0.5, 2.0);
                        if state.is_playing {
                            state.accumulated_secs = state.current_position();
                            state.started_at = Some(Instant::now());
                        }
                        state.speed = clamped;
                        if let Some(ref s) = sink {
                            s.set_speed(clamped);
                        }
                        let empty = sink.as_ref().map(|s| s.empty()).unwrap_or(false);
                        let _ = reply.send(state.snapshot(empty));
                    }
                    AudioCommand::GetState { reply } => {
                        let empty = sink.as_ref().map(|s| s.empty()).unwrap_or(false);
                        let _ = reply.send(state.snapshot(empty));
                    }
                }
            }
        });

        Self { tx: Mutex::new(tx) }
    }

    pub fn send_cmd(&self, cmd: AudioCommand) -> Result<(), String> {
        let guard = self.tx.lock().map_err(|e| e.to_string())?;
        guard.send(cmd).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_user_tracks() {
        let dir = std::path::Path::new(r"D:\[RJ441315]");
        if !dir.exists() {
            return;
        }
        let mut entries: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .flatten()
            .filter(|e| e.path().extension().map(|x| x == "mp3").unwrap_or(false))
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let p = e.path();
            let p_str = p.to_string_lossy().to_string();
            let f = File::open(&p).unwrap();
            let dec = ResilientSymphoniaSource::new(f, &p_str);
            match dec {
                Ok(mut d) => {
                    let count = (&mut d).take(96000 * 5).count();
                    println!(
                        "FILE {:?} -> OK, 5_sec_samples={}",
                        p.file_name().unwrap(),
                        count
                    );
                    assert_eq!(count, 96000 * 5);
                }
                Err(err) => {
                    panic!("FILE {:?} -> ERR: {}", p.file_name().unwrap(), err);
                }
            }
        }
    }
}
