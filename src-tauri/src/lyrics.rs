#[derive(Debug, PartialEq)]
pub(crate) struct Cue {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

pub(crate) fn is_vtt(text: &str) -> bool {
    let first = text
        .trim_start_matches('\u{feff}')
        .split(['\r', '\n'])
        .next()
        .unwrap_or("");
    first == "WEBVTT" || first.starts_with("WEBVTT ") || first.starts_with("WEBVTT\t")
}

fn timestamp(text: &str) -> Option<f64> {
    let parts: Vec<_> = text.split(':').collect();
    let (hours, minutes, seconds) = match parts.as_slice() {
        [m, s] if m.len() == 2 => (0, m.parse::<u64>().ok()?, *s),
        [h, m, s] if h.len() >= 2 && m.len() == 2 => {
            (h.parse::<u64>().ok()?, m.parse::<u64>().ok()?, *s)
        }
        _ => return None,
    };
    let (seconds, fraction) = seconds.split_once('.')?;
    if seconds.len() != 2 || fraction.len() != 3 || !fraction.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let seconds = seconds.parse::<u64>().ok()?;
    if minutes >= 60 || seconds >= 60 {
        return None;
    }
    Some(
        hours as f64 * 3600.0
            + minutes as f64 * 60.0
            + seconds as f64
            + fraction.parse::<u64>().ok()? as f64 / 1000.0,
    )
}

fn cue_text(text: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in text.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", "\u{a0}")
        .replace("&lrm;", "\u{200e}")
        .replace("&rlm;", "\u{200f}")
        .replace("&amp;", "&")
        .trim()
        .to_string()
}

pub(crate) fn parse_vtt(text: &str) -> Vec<Cue> {
    if !is_vtt(text) {
        return Vec::new();
    }
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut cues = Vec::new();
    let mut block = Vec::new();
    for line in normalized.lines().chain(std::iter::once("")) {
        if !line.trim().is_empty() {
            block.push(line);
            continue;
        }
        if let Some(first) = block.first().copied() {
            if first != "NOTE"
                && !first.starts_with("NOTE ")
                && !first.starts_with("NOTE\t")
                && first != "STYLE"
                && first != "REGION"
            {
                let timing = if first.contains("-->") {
                    Some(0)
                } else {
                    block.get(1).filter(|line| line.contains("-->")).map(|_| 1)
                };
                if let Some(index) = timing {
                    if let Some((start, rest)) = block[index].split_once("-->") {
                        if let (Some(start), Some(end)) = (
                            timestamp(start.trim()),
                            rest.split_whitespace().next().and_then(timestamp),
                        ) {
                            if end > start {
                                cues.push(Cue {
                                    start,
                                    end,
                                    text: cue_text(&block[index + 1..].join("\n")),
                                });
                            }
                        }
                    }
                }
            }
        }
        block.clear();
    }
    cues.sort_by(|a, b| a.start.total_cmp(&b.start));
    cues
}

pub(crate) fn plain_vtt(text: &str) -> String {
    parse_vtt(text)
        .into_iter()
        .filter(|cue| !cue.text.is_empty())
        .map(|cue| cue.text)
        .collect::<Vec<_>>()
        .join("\n")
}

fn parse_lrc(text: &str, duration: f64) -> Vec<Cue> {
    let mut entries = Vec::new();
    let mut offset = 0.0;
    for line in text.lines() {
        let mut rest = line.trim();
        let mut times = Vec::new();
        while let Some(after) = rest.strip_prefix('[') {
            let Some((tag, tail)) = after.split_once(']') else {
                break;
            };
            if let Some(value) = tag.strip_prefix("offset:") {
                if let Ok(value) = value.parse::<f64>() {
                    offset = value / 1000.0;
                }
            } else if let Some((minutes, seconds)) = tag.split_once(':') {
                let seconds = seconds.replacen(':', ".", 1);
                if let (Ok(minutes), Ok(seconds)) = (minutes.parse::<u64>(), seconds.parse::<f64>())
                {
                    if seconds.is_finite() && (0.0..60.0).contains(&seconds) {
                        times.push(minutes as f64 * 60.0 + seconds);
                    }
                }
            }
            rest = tail.trim();
        }
        for time in times {
            entries.push((time, rest.to_string()));
        }
    }
    entries.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut cues: Vec<Cue> = Vec::new();
    for (time, text) in entries {
        let start = (time - offset).max(0.0);
        if let Some(last) = cues.last_mut() {
            if last.start == start {
                if !text.is_empty() {
                    if !last.text.is_empty() {
                        last.text.push('\n');
                    }
                    last.text.push_str(&text);
                }
                continue;
            }
            last.end = start;
        }
        cues.push(Cue {
            start,
            end: if duration > start {
                duration
            } else {
                start + 5.0
            },
            text,
        });
    }
    cues.retain(|cue| !cue.text.is_empty());
    cues
}

pub(crate) fn vtt_to_lrc(text: &str) -> String {
    let cues = parse_vtt(text);
    let mut lines = Vec::new();
    for (index, cue) in cues.iter().enumerate() {
        let millis = (cue.start * 1000.0).round() as u64;
        let prefix = format!(
            "[{:02}:{:02}.{:03}]",
            millis / 60000,
            millis / 1000 % 60,
            millis % 1000
        );
        for line in cue.text.split('\n') {
            lines.push(format!("{prefix}{line}"));
        }
        if cues.get(index + 1).is_none_or(|next| next.start > cue.end) {
            let end = (cue.end * 1000.0).round() as u64;
            lines.push(format!(
                "[{:02}:{:02}.{:03}]",
                end / 60000,
                end / 1000 % 60,
                end % 1000
            ));
        }
    }
    lines.join("\n")
}

pub(crate) fn lrc_to_vtt(text: &str, duration: f64) -> String {
    let time = |seconds: f64| {
        let ms = (seconds * 1000.0).round() as u64;
        format!(
            "{:02}:{:02}:{:02}.{:03}",
            ms / 3600000,
            ms / 60000 % 60,
            ms / 1000 % 60,
            ms % 1000
        )
    };
    let mut out = String::from("WEBVTT\n\n");
    for cue in parse_lrc(text, duration) {
        let escaped = cue
            .text
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;");
        out.push_str(&format!(
            "{} --> {}\n{}\n\n",
            time(cue.start),
            time(cue.end),
            escaped
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vtt_cues_ignore_metadata_and_decode_multiline_text() {
        let text = "\u{feff}WEBVTT 제목\r\n\r\nNOTE 주석\r\n00:00.000 --> 00:01.000\r\n무시\r\n\r\nSTYLE\r\n::cue { color: red; }\r\n\r\ncue-1\r\n01:02:03.456 --> 01:02:05.000 align:start\r\n<v 가수><b>첫 줄</b> &amp;\r\n<00:00:01.000>둘째 줄\r\n\r\n00:61.000 --> 00:62.000\r\n잘못된 시간\r\n";
        assert_eq!(
            parse_vtt(text),
            vec![Cue {
                start: 3723.456,
                end: 3725.0,
                text: "첫 줄 &\n둘째 줄".into()
            }]
        );
        assert_eq!(plain_vtt(text), "첫 줄 &\n둘째 줄");
    }

    #[test]
    fn sidecar_conversion_preserves_multiline_gaps_and_offsets() {
        let vtt = "WEBVTT\n\n00:01.250 --> 00:02.500\n첫 줄\n번역\n\n00:04.000 --> 00:06.000\n끝 &lt;가사&gt;\n";
        let lrc = vtt_to_lrc(vtt);
        assert!(lrc.contains("[00:02.500]"));
        assert_eq!(parse_vtt(&lrc_to_vtt(&lrc, 10.0)), parse_vtt(vtt));
        assert_eq!(
            parse_vtt(&lrc_to_vtt("[offset:500]\n[00:01.00]가사", 5.0))[0].start,
            0.5
        );
        assert!(parse_vtt("WEBVTT\n\n00:03.000 --> 00:01.000\n역순\n").is_empty());
    }
}
