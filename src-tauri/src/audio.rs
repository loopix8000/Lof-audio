use crate::models::{PlaybackState, Track};
use rodio::{OutputStream, Sink, Source};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use symphonia::core::audio::{AudioBufferRef, SampleBuffer, SignalSpec};
use symphonia::core::codecs::{CodecRegistry, Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::{MediaSource, MediaSourceStream};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::{self, Time, TimeBase};
use symphonia::default::{get_probe, register_enabled_codecs};
use symphonia_adapter_libopus::OpusDecoder;

fn codecs() -> &'static CodecRegistry {
    static REGISTRY: OnceLock<CodecRegistry> = OnceLock::new();
    REGISTRY.get_or_init(|| {
        let mut registry = CodecRegistry::new();
        register_enabled_codecs(&mut registry);
        registry.register_all::<OpusDecoder>();
        registry
    })
}

const MAX_DECODE_RETRIES: usize = 1024;

struct ReleasingFile {
    file: Option<File>,
    released: Sender<()>,
}

impl Read for ReleasingFile {
    fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
        self.file.as_mut().unwrap().read(bytes)
    }
}

impl Seek for ReleasingFile {
    fn seek(&mut self, position: SeekFrom) -> std::io::Result<u64> {
        self.file.as_mut().unwrap().seek(position)
    }
}

impl MediaSource for ReleasingFile {
    fn is_seekable(&self) -> bool {
        true
    }
    fn byte_len(&self) -> Option<u64> {
        self.file.as_ref()?.metadata().ok().map(|meta| meta.len())
    }
}

impl Drop for ReleasingFile {
    fn drop(&mut self) {
        // 디코더의 파일 핸들을 실제로 닫은 뒤 완료를 알린다.
        drop(self.file.take());
        let _ = self.released.send(());
    }
}

fn release_playback_file(
    sink: &mut Option<Sink>,
    released: &mut Option<Receiver<()>>,
) -> Result<(), String> {
    if let Some(old) = sink.take() {
        old.stop();
    }
    if let Some(receiver) = released.as_ref() {
        receiver.recv_timeout(Duration::from_secs(2)).map_err(|_| {
            "재생 파일 해제를 확인하지 못했습니다. 잠시 후 다시 시도하세요.".to_string()
        })?;
    }
    *released = None;
    Ok(())
}

pub struct ResilientSymphoniaSource {
    decoder: Box<dyn Decoder>,
    current_frame_offset: usize,
    format: Box<dyn FormatReader>,
    total_duration: Option<Duration>,
    buffer: SampleBuffer<f32>,
    spec: SignalSpec,
    track_id: u32,
    time_base: Option<TimeBase>,
    pending_seek_samples: usize,
}

impl ResilientSymphoniaSource {
    pub fn new(file: File, file_path: &str) -> Result<Self, String> {
        Self::from_media_source(Box::new(file), file_path)
    }

    fn for_playback(file_path: &str) -> Result<(Self, Receiver<()>), String> {
        let file = File::open(file_path).map_err(|e| format!("파일을 열 수 없습니다: {}", e))?;
        let (released, receiver) = mpsc::channel();
        let source = Self::from_media_source(
            Box::new(ReleasingFile {
                file: Some(file),
                released,
            }),
            file_path,
        )?;
        Ok((source, receiver))
    }

    fn from_media_source(file: Box<dyn MediaSource>, file_path: &str) -> Result<Self, String> {
        let mss = MediaSourceStream::new(file, Default::default());

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
        let time_base = track.codec_params.time_base;
        let total_duration = track
            .codec_params
            .time_base
            .zip(track.codec_params.n_frames)
            .map(|(base, frames)| {
                let Time { seconds, frac } = base.calc_time(frames);
                Duration::from_secs(seconds) + Duration::from_secs_f64(frac)
            });

        let mut decoder = codecs()
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
            time_base,
            pending_seek_samples: 0,
        })
    }

    #[inline]
    fn copy_buffer(decoded: AudioBufferRef<'_>, spec: &SignalSpec) -> SampleBuffer<f32> {
        let duration = units::Duration::from(decoded.capacity() as u64);
        let mut buffer = SampleBuffer::<f32>::new(duration, *spec);
        buffer.copy_interleaved_ref(decoded);
        buffer
    }
}

impl Iterator for ResilientSymphoniaSource {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<f32> {
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
            let spec = *decoded.spec();
            if self.buffer.capacity() < decoded.capacity() * spec.channels.count() {
                self.buffer = Self::copy_buffer(decoded, &spec);
            } else {
                self.buffer.copy_interleaved_ref(decoded);
            }
            self.spec = spec;
            self.current_frame_offset = self.pending_seek_samples.min(self.buffer.len());
            self.pending_seek_samples -= self.current_frame_offset;
        }

        let sample = *self.buffer.samples().get(self.current_frame_offset)?;
        self.current_frame_offset += 1;
        Some(sample)
    }
}

impl Source for ResilientSymphoniaSource {
    #[inline]
    fn current_frame_len(&self) -> Option<usize> {
        Some(self.buffer.len().saturating_sub(self.current_frame_offset))
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

        let seeked = seek_res.map_err(|_| rodio::source::SeekError::NotSupported {
            underlying_source: "SymphoniaSeek",
        })?;
        self.pending_seek_samples = self
            .time_base
            .map(|base| {
                let delta = base.calc_time(seeked.required_ts.saturating_sub(seeked.actual_ts));
                (((delta.seconds as f64 + delta.frac) * self.spec.rate as f64).round() as usize)
                    * self.spec.channels.count()
            })
            .unwrap_or(0);
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
        reply: Sender<Result<PlaybackState, String>>,
    },
    WriteTags {
        track: Box<Track>,
        save_lrc_file: bool,
        reply: Sender<Result<(), String>>,
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
    ended: bool,
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
        if self.has_active_track && sink_empty && self.is_playing {
            self.is_playing = false;
            self.started_at = None;
            self.accumulated_secs = self.duration_secs;
            self.ended = true;
        }
        PlaybackState {
            current_track_id: self.current_track_id,
            file_path: self.file_path.clone(),
            is_playing: self.is_playing,
            position_secs: self.current_position(),
            duration_secs: self.duration_secs,
            volume: self.volume,
            speed: self.speed,
            is_ended: self.ended,
        }
    }
}

impl Default for AudioEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioEngine {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<AudioCommand>();

        thread::spawn(move || {
            let stream_result = OutputStream::try_default();
            let (mut _stream, mut stream_handle) = match stream_result {
                Ok((s, h)) => (Some(s), Some(h)),
                Err(e) => {
                    eprintln!("Warning: Failed to initialize audio output stream: {}", e);
                    (None, None)
                }
            };

            let mut sink: Option<Sink> = stream_handle.as_ref().and_then(|h| Sink::try_new(h).ok());
            let mut source_released = None;

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
                ended: false,
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
                        if stream_handle.is_none() {
                            match OutputStream::try_default() {
                                Ok((stream, handle)) => {
                                    _stream = Some(stream);
                                    stream_handle = Some(handle);
                                }
                                Err(e) => {
                                    let _ = reply.send(Err(format!(
                                        "오디오 출력 장치를 열 수 없습니다: {}",
                                        e
                                    )));
                                    continue;
                                }
                            }
                        }
                        let (source, released) =
                            match ResilientSymphoniaSource::for_playback(&file_path) {
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

                        if let Some(ref handle) = stream_handle {
                            match Sink::try_new(handle) {
                                Ok(new_sink) => {
                                    new_sink.set_volume(state.volume);
                                    new_sink.set_speed(state.speed);
                                    new_sink.pause();
                                    new_sink.append(source);
                                    if let Some(old_sink) = sink.take() {
                                        old_sink.stop();
                                    }
                                    new_sink.play();
                                    sink = Some(new_sink);
                                    source_released = Some(released);

                                    state.current_track_id = Some(track_id);
                                    state.file_path = Some(file_path);
                                    state.is_playing = true;
                                    state.accumulated_secs = 0.0;
                                    state.started_at = Some(Instant::now());
                                    state.duration_secs = final_dur;
                                    state.has_active_track = true;
                                    state.ended = false;

                                    let snap = state.snapshot(false);
                                    let _ = reply.send(Ok(snap));
                                }
                                Err(e) => {
                                    let _ =
                                        reply.send(Err(format!("오디오 싱크 생성 실패: {}", e)));
                                }
                            }
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
                        if let Err(error) = release_playback_file(&mut sink, &mut source_released) {
                            state.accumulated_secs = state.current_position();
                            state.is_playing = false;
                            state.started_at = None;
                            let _ = reply.send(Err(error));
                            continue;
                        }
                        state.is_playing = false;
                        state.accumulated_secs = 0.0;
                        state.started_at = None;
                        state.has_active_track = false;
                        state.ended = false;
                        state.current_track_id = None;
                        state.file_path = None;
                        state.duration_secs = 0.0;
                        let _ = reply.send(Ok(state.snapshot(true)));
                    }
                    AudioCommand::WriteTags {
                        track,
                        save_lrc_file,
                        reply,
                    } => {
                        let active = state.file_path.as_deref() == Some(track.file_path.as_str())
                            && source_released.is_some();
                        if !active {
                            let _ = reply.send(crate::tags::write_track(&track, save_lrc_file));
                            continue;
                        }
                        let playing = state.is_playing;
                        let position = state.current_position();
                        state.accumulated_secs = position;
                        state.started_at = None;
                        state.is_playing = false;
                        if let Err(error) = release_playback_file(&mut sink, &mut source_released) {
                            let _ = reply.send(Err(error));
                            continue;
                        }
                        let saved = crate::tags::write_track(&track, save_lrc_file);
                        // 저장 실패 때도 기존 음원을 같은 위치와 상태로 다시 연결한다.
                        let restored = (|| -> Result<(), String> {
                            let (mut source, mut released) =
                                ResilientSymphoniaSource::for_playback(&track.file_path)?;
                            let target = Duration::from_secs_f64(position);
                            let source: Box<dyn Source<Item = f32> + Send> =
                                if source.try_seek(target).is_ok() {
                                    Box::new(source)
                                } else {
                                    drop(source);
                                    let (source, fallback_released) =
                                        ResilientSymphoniaSource::for_playback(&track.file_path)?;
                                    released = fallback_released;
                                    // 탐색을 지원하지 않는 코덱은 처음부터 해당 위치까지 건너뛴다.
                                    Box::new(source.skip_duration(target))
                                };
                            let handle = stream_handle
                                .as_ref()
                                .ok_or("오디오 출력 장치가 없습니다.")?;
                            let new_sink = Sink::try_new(handle)
                                .map_err(|e| format!("재생 복원 실패: {}", e))?;
                            new_sink.pause();
                            new_sink.set_volume(state.volume);
                            new_sink.set_speed(state.speed);
                            new_sink.append(source);
                            if playing {
                                new_sink.play();
                            }
                            sink = Some(new_sink);
                            source_released = Some(released);
                            state.is_playing = playing;
                            state.started_at = playing.then(Instant::now);
                            Ok(())
                        })();
                        // 태그가 저장된 경우 DB 갱신은 계속하고 재생 복원 오류를 별도로 알린다.
                        if let Err(error) = restored {
                            state.has_active_track = false;
                            eprintln!("태그 저장 후 재생 복원 실패: {}", error);
                        }
                        let _ = reply.send(saved);
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
                        let seek_to = match Duration::try_from_secs_f64(target) {
                            Ok(value) => value,
                            Err(_) => {
                                let _ = reply.send(Err("지원하지 않는 탐색 위치입니다.".into()));
                                continue;
                            }
                        };
                        if let Some(ref s) = sink {
                            let seek_res = s.try_seek(seek_to);
                            if seek_res.is_err() {
                                let mut restored = false;
                                if let Some(ref path) = state.file_path {
                                    if let Ok((source, released)) =
                                        ResilientSymphoniaSource::for_playback(path)
                                    {
                                        if let Some(ref handle) = stream_handle {
                                            if let Ok(new_sink) = Sink::try_new(handle) {
                                                new_sink.set_volume(state.volume);
                                                new_sink.set_speed(state.speed);
                                                new_sink.append(source.skip_duration(seek_to));
                                                if !state.is_playing {
                                                    new_sink.pause();
                                                }
                                                sink = Some(new_sink);
                                                source_released = Some(released);
                                                restored = true;
                                            }
                                        }
                                    }
                                }
                                if !restored {
                                    let _ = reply.send(Err("탐색에 실패했습니다.".to_string()));
                                    continue;
                                }
                            }
                        } else {
                            let _ = reply.send(Err("재생 중인 오디오가 없습니다.".to_string()));
                            continue;
                        }
                        state.ended = false;
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

    pub fn write_tags(&self, track: &Track, save_lrc_file: bool) -> Result<(), String> {
        let (reply, receiver) = mpsc::channel();
        self.send_cmd(AudioCommand::WriteTags {
            track: Box::new(track.clone()),
            save_lrc_file,
            reply,
        })?;
        receiver
            .recv()
            .map_err(|_| "태그 저장 작업의 응답이 중단되었습니다.".to_string())?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoder_release_notification_arrives_after_file_is_closed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tone.wav");
        std::fs::copy(fixture("tone.wav"), &path).unwrap();
        let (source, released) =
            ResilientSymphoniaSource::for_playback(path.to_str().unwrap()).unwrap();
        let (sink, output) = Sink::new_idle();
        sink.pause();
        sink.append(source);
        let worker = thread::spawn(move || for _ in output.take(20000) {});
        release_playback_file(&mut Some(sink), &mut Some(released)).unwrap();
        let mut track = crate::tags::read_track_from_path(&path).unwrap();
        track.title = "핸들 해제 후 저장".into();
        crate::tags::write_track(&track, false).unwrap();
        worker.join().unwrap();
        assert_eq!(
            crate::tags::read_track_from_path(&path).unwrap().title,
            track.title
        );
    }

    #[test]
    #[ignore = "실제 오디오 출력 장치가 있는 로컬 환경에서 실행"]
    fn tag_save_restores_playing_and_paused_state_and_position() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("silence.wav");
        let data_len = 48000u32 * 2 * 2 * 4;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&48000u32.to_le_bytes());
        bytes.extend_from_slice(&192000u32.to_le_bytes());
        bytes.extend_from_slice(&4u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());
        bytes.resize(44 + data_len as usize, 0);
        std::fs::write(&path, bytes).unwrap();
        let audio = AudioEngine::new();
        let (reply, rx) = mpsc::channel();
        audio
            .send_cmd(AudioCommand::SetVolume { volume: 0.0, reply })
            .unwrap();
        rx.recv().unwrap();
        let (reply, rx) = mpsc::channel();
        audio
            .send_cmd(AudioCommand::Play {
                track_id: 1,
                file_path: path.to_string_lossy().into_owned(),
                duration_secs: 4.0,
                reply,
            })
            .unwrap();
        rx.recv().unwrap().unwrap();
        let (reply, rx) = mpsc::channel();
        audio
            .send_cmd(AudioCommand::Seek {
                position_secs: 0.7,
                reply,
            })
            .unwrap();
        rx.recv().unwrap().unwrap();
        let (reply, rx) = mpsc::channel();
        audio
            .send_cmd(AudioCommand::SetSpeed { speed: 1.25, reply })
            .unwrap();
        rx.recv().unwrap();
        let (reply, rx) = mpsc::channel();
        audio.send_cmd(AudioCommand::Pause { reply }).unwrap();
        let paused = rx.recv().unwrap();
        let mut track = crate::tags::read_track_from_path(&path).unwrap();
        for playing in [false, true] {
            if playing {
                let (reply, rx) = mpsc::channel();
                audio.send_cmd(AudioCommand::Resume { reply }).unwrap();
                rx.recv().unwrap();
            }
            track.title = format!("재생 상태 {}에서 저장", playing);
            #[cfg(windows)]
            {
                use std::os::windows::fs::OpenOptionsExt;
                let before = std::fs::read(&path).unwrap();
                let held = std::fs::OpenOptions::new()
                    .read(true)
                    .share_mode(1)
                    .open(&path)
                    .unwrap();
                assert!(audio.write_tags(&track, false).is_err());
                assert_eq!(std::fs::read(&path).unwrap(), before);
                let (reply, rx) = mpsc::channel();
                audio.send_cmd(AudioCommand::GetState { reply }).unwrap();
                assert_eq!(rx.recv().unwrap().is_playing, playing);
                drop(held);
            }
            audio.write_tags(&track, false).unwrap();
            let (reply, rx) = mpsc::channel();
            audio.send_cmd(AudioCommand::GetState { reply }).unwrap();
            let after = rx.recv().unwrap();
            assert_eq!(after.is_playing, playing);
            assert!((after.position_secs - paused.position_secs).abs() < 0.2);
            assert_eq!(after.volume, 0.0);
            assert_eq!(after.speed, 1.25);
            assert_eq!(
                crate::tags::read_track_from_path(&path).unwrap().title,
                track.title
            );
        }
        let (reply, rx) = mpsc::channel();
        audio.send_cmd(AudioCommand::Stop { reply }).unwrap();
        assert_eq!(rx.recv().unwrap().unwrap().current_track_id, None);
        crate::tags::write_track(&track, false).unwrap();
    }
    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }
    #[test]
    fn decodes_every_supported_codec_without_user_files() {
        for name in [
            "tone.wav",
            "tone.mp3",
            "tone.flac",
            "tone.ogg",
            "tone.m4a",
            "tone.opus",
            "tone.aac",
        ] {
            let p = fixture(name);
            let source =
                ResilientSymphoniaSource::new(File::open(&p).unwrap(), p.to_str().unwrap())
                    .unwrap_or_else(|e| panic!("{}: {}", name, e));
            let samples: Vec<_> = source.collect();
            assert!(samples.len() > 1000, "{} was not decoded", name);
            assert!(
                samples.iter().any(|s| s.abs() > 0.01),
                "{} was silent",
                name
            );
        }
    }
    #[test]
    fn wav_seek_discards_samples_before_the_requested_position() {
        let p = fixture("tone.wav");
        let open =
            || ResilientSymphoniaSource::new(File::open(&p).unwrap(), p.to_str().unwrap()).unwrap();
        let source = open();
        let target = Duration::from_millis(73);
        let skip = (target.as_secs_f64() * source.sample_rate() as f64).floor() as usize
            * source.channels() as usize;
        let expected: Vec<_> = source.skip(skip).take(100).collect();
        let mut sought = open();
        sought.try_seek(target).unwrap();
        assert_eq!(sought.take(100).collect::<Vec<_>>(), expected);
    }
    #[test]
    fn completion_remains_visible_until_a_new_playback_action() {
        let mut state = InternalState {
            current_track_id: Some(1),
            file_path: None,
            is_playing: true,
            accumulated_secs: 0.0,
            started_at: None,
            duration_secs: 1.0,
            volume: 0.5,
            speed: 1.0,
            has_active_track: true,
            ended: false,
        };
        assert!(state.snapshot(true).is_ended);
        assert!(state.snapshot(true).is_ended);
    }
}
