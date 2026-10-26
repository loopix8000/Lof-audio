use super::dispatch::{apply_track_changes, require_track};
use crate::{metadata, models::Track, AppState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};

const FIELDS: &[&str] = &[
    "title",
    "artist",
    "album",
    "albumArtist",
    "year",
    "trackNumber",
    "genre",
];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Source {
    source_id: String,
    url: String,
    title: String,
    publisher: String,
    independence_key: String,
    source_kind: String,
    identity_verified: bool,
    identity_note: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    accessed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
    claims: Map<String, Value>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Proposal {
    workspace_id: i64,
    track_id: i64,
    expected_revision: String,
    changes: Map<String, Value>,
    sources: Vec<Source>,
}

fn invalid(message: impl AsRef<str>) -> String {
    format!("INVALID_ARGUMENT: {}", message.as_ref())
}

fn validate_values(values: &Map<String, Value>) -> Result<(), String> {
    if values.is_empty() {
        return Err(invalid("메타정보 필드를 하나 이상 지정하세요."));
    }
    for (field, value) in values {
        if !FIELDS.contains(&field.as_str()) {
            return Err(invalid(format!("지원하지 않는 조사 필드: {field}")));
        }
        let valid = match field.as_str() {
            "year" => value.is_null() || value.as_u64().is_some_and(|n| n <= 9999),
            "trackNumber" => value.is_null() || value.as_u64().is_some_and(|n| n <= 65535),
            _ => value.as_str().is_some_and(|text| {
                text.chars().count() <= 4096 && (field != "title" || !text.trim().is_empty())
            }),
        };
        if !valid {
            return Err(invalid(format!("{field}의 값이나 자료형을 확인하세요.")));
        }
    }
    Ok(())
}

fn source_url(source: &Source) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(&source.url)
        .map_err(|_| invalid("출처의 실제 HTTP(S) URL이 필요합니다."))?;
    if !["http", "https"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(invalid(
            "출처 URL은 인증 정보가 없는 HTTP(S) 주소여야 합니다.",
        ));
    }
    Ok(url)
}

fn read_proposal(args: &Value) -> Result<Proposal, String> {
    let mut proposal: Proposal = serde_json::from_value(json!({
        "workspaceId":args["workspaceId"], "trackId":args["trackId"],
        "expectedRevision":args["expectedRevision"], "changes":args["changes"], "sources":args["sources"],
    })).map_err(|e| invalid(e.to_string()))?;
    validate_values(&proposal.changes)?;
    for value in proposal.changes.values_mut() {
        if let Some(text) = value.as_str() {
            *value = Value::String(text.trim().into());
        }
    }
    if proposal.sources.is_empty() || proposal.sources.len() > 16 {
        return Err(invalid("출처는 1~16개를 지정하세요."));
    }
    let mut ids = HashSet::new();
    let mut urls = HashSet::new();
    for source in &proposal.sources {
        if [
            &source.source_id,
            &source.title,
            &source.publisher,
            &source.independence_key,
            &source.identity_note,
        ]
        .iter()
        .any(|s| s.trim().is_empty())
        {
            return Err(invalid(
                "출처 ID·제목·발행자·독립 출처 구분·동일 곡 확인 근거가 필요합니다.",
            ));
        }
        if !ids.insert(&source.source_id) {
            return Err(invalid("sourceId는 서로 달라야 합니다."));
        }
        let mut url = source_url(source)?;
        url.set_fragment(None);
        if !urls.insert(url.to_string()) {
            return Err(invalid("같은 출처 URL을 여러 근거로 중복 제출하지 마세요."));
        }
        validate_values(&source.claims)?;
    }
    Ok(proposal)
}

fn plan_hash(proposal: &Proposal) -> Result<String, String> {
    Ok(hex::encode(Sha256::digest(
        serde_json::to_vec(proposal).map_err(|e| e.to_string())?,
    )))
}

fn equal(a: &Value, b: &Value) -> bool {
    match (a.as_str(), b.as_str()) {
        (Some(a), Some(b)) => a.trim() == b.trim(),
        _ => a == b,
    }
}

fn host(source: &Source) -> String {
    source_url(source)
        .ok()
        .and_then(|url| {
            url.host_str()
                .map(|host| host.trim_start_matches("www.").to_lowercase())
        })
        .unwrap_or_default()
}

fn independent_pair(sources: &[&Source]) -> bool {
    let key = |text: &str| {
        text.chars()
            .filter(|c| c.is_alphanumeric())
            .flat_map(char::to_lowercase)
            .collect::<String>()
    };
    sources.iter().enumerate().any(|(index, source)| {
        sources[index + 1..].iter().any(|other| {
            host(source) != host(other)
                && key(&source.publisher) != key(&other.publisher)
                && key(&source.independence_key) != key(&other.independence_key)
        })
    })
}

fn analysis(track: &Track, proposal: &Proposal) -> Result<Value, String> {
    let current = serde_json::to_value(track).map_err(|e| e.to_string())?;
    let mut diffs = Vec::new();
    let mut ready = Vec::new();
    let mut blocked = Vec::new();
    for (field, after) in &proposal.changes {
        let mut supporting = Vec::new();
        let mut conflicting = Vec::new();
        let mut unverified = Vec::new();
        for source in &proposal.sources {
            if let Some(value) = source.claims.get(field) {
                if !source.identity_verified {
                    unverified.push(source.source_id.clone());
                } else if equal(value, after) {
                    supporting.push(source);
                } else {
                    conflicting.push(source.source_id.clone());
                }
            }
        }
        let status = if equal(&current[field], after) {
            "unchanged"
        } else if !conflicting.is_empty() {
            "blocked_conflict"
        } else if independent_pair(&supporting) {
            "corroborated"
        } else {
            "blocked_insufficient_sources"
        };
        if status == "corroborated" {
            ready.push(field.clone());
        } else if status != "unchanged" {
            blocked.push(field.clone());
        }
        diffs.push(
            json!({"field":field,"before":current[field],"after":after,"status":status,
            "supportingSourceIds":supporting.iter().map(|s| &s.source_id).collect::<Vec<_>>(),
            "conflictingSourceIds":conflicting,"unverifiedIdentitySourceIds":unverified}),
        );
    }
    Ok(
        json!({"planHash":plan_hash(proposal)?,"proposal":proposal,"diff":diffs,"readyFields":ready,"blockedFields":blocked,
        "sourceVerification":"agent_reported","serverFetchedSources":false,
        "independenceAssessment":"Distinct hosts, publisher labels and agent-declared independenceKey; actual publisher independence and page contents must be checked by the AI."}),
    )
}

pub(super) fn prepare(state: &AppState, args: &Value) -> Result<Value, String> {
    let workspace_id = args["workspaceId"]
        .as_i64()
        .ok_or_else(|| invalid("workspaceId가 필요합니다."))?;
    let ids = args["trackIds"]
        .as_array()
        .ok_or_else(|| invalid("trackIds가 필요합니다."))?;
    let fields: Vec<String> = args["fields"]
        .as_array()
        .map(|fields| {
            fields
                .iter()
                .filter_map(Value::as_str)
                .map(String::from)
                .collect()
        })
        .unwrap_or_else(|| FIELDS.iter().map(|field| (*field).into()).collect());
    if fields.is_empty() || fields.iter().any(|field| !FIELDS.contains(&field.as_str())) {
        return Err(invalid("지원하는 메타정보 필드를 지정하세요."));
    }
    let _guard = state.metadata_lock.lock().map_err(|e| e.to_string())?;
    let mut tracks = Vec::new();
    let mut albums: BTreeMap<(String, String), Vec<i64>> = BTreeMap::new();
    for id in ids {
        let id = id
            .as_i64()
            .ok_or_else(|| invalid("trackId는 정수여야 합니다."))?;
        require_track(state, workspace_id, id)?;
        let track = state
            .db
            .get_track_by_id(id)?
            .ok_or("NOT_FOUND: 트랙을 찾을 수 없습니다.")?;
        let full = serde_json::to_value(&track).map_err(|e| e.to_string())?;
        let tags: Map<String, Value> = fields
            .iter()
            .map(|field| (field.clone(), full[field].clone()))
            .collect();
        let artist = if track.album_artist.is_empty() || track.album_artist == "Unknown Artist" {
            &track.artist
        } else {
            &track.album_artist
        };
        albums
            .entry((artist.clone(), track.album.clone()))
            .or_default()
            .push(id);
        tracks.push(json!({"trackId":id,"revision":metadata::revision(&track),"fileName":track.file_name,"tags":tags,
            "identity":{"title":track.title,"artist":track.artist,"album":track.album,"albumArtist":track.album_artist,"durationSecs":track.duration_secs,"trackNumber":track.track_number,"mbidRecording":track.mbid_recording,"mbidRelease":track.mbid_release},
            "searchQueries":[format!("{} {} {} official credits", track.artist, track.album, track.title),format!("{} {} tracklist catalogue release", artist, track.album)]}));
    }
    Ok(json!({"workspaceId":workspace_id,"tracks":tracks,
        "albums":albums.into_iter().map(|((artist,album),ids)|json!({"artist":artist,"album":album,"trackIds":ids})).collect::<Vec<_>>(),
        "externalResearchRequired":true,"supportedFields":FIELDS,"minimumIndependentSourcesPerChangedField":2,
        "workflow":["Use available web search, browser or other MCP tools to inspect multiple sources","metadata_research_preview","metadata_research_apply","track_read","metadata_research_history"]}))
}

pub(super) fn preview(state: &AppState, args: &Value) -> Result<Value, String> {
    let proposal = read_proposal(args)?;
    let _guard = state.metadata_lock.lock().map_err(|e| e.to_string())?;
    require_track(state, proposal.workspace_id, proposal.track_id)?;
    let track = state
        .db
        .get_track_by_id(proposal.track_id)?
        .ok_or("NOT_FOUND: 트랙을 찾을 수 없습니다.")?;
    if metadata::revision(&track) != proposal.expected_revision {
        return Err(
            "CONFLICT: 조사 중 트랙이 변경되었습니다. 최신 값과 근거를 다시 확인하세요.".into(),
        );
    }
    analysis(&track, &proposal)
}

pub(super) fn apply(state: &AppState, args: &Value) -> Result<Value, String> {
    let proposal = read_proposal(args)?;
    let hash = plan_hash(&proposal)?;
    if args["expectedPlanHash"].as_str() != Some(hash.as_str()) {
        return Err("CONFLICT: 미리보기와 다른 수정안입니다. 다시 미리보기를 확인하세요.".into());
    }
    let selected: Vec<String> = args["selectedFields"]
        .as_array()
        .ok_or_else(|| invalid("selectedFields가 필요합니다."))?
        .iter()
        .map(|field| {
            field
                .as_str()
                .map(String::from)
                .ok_or_else(|| invalid("필드 이름을 확인하세요."))
        })
        .collect::<Result<_, _>>()?;
    if selected.is_empty() || selected.iter().collect::<HashSet<_>>().len() != selected.len() {
        return Err(invalid("중복 없이 저장할 필드를 선택하세요."));
    }
    require_track(state, proposal.workspace_id, proposal.track_id)?;
    let proposal_json = serde_json::to_value(&proposal).map_err(|e| e.to_string())?;
    let mut audit_id = None;
    let result = metadata::edit_track_checked_with_revision(
        &state.db,
        &state.metadata_lock,
        proposal.track_id,
        Some(&proposal.expected_revision),
        false,
        |track| {
            require_track(state, proposal.workspace_id, proposal.track_id)?;
            let report = analysis(track, &proposal)?;
            let ready = report["readyFields"].as_array().ok_or("수정안 분석 실패")?;
            if selected
                .iter()
                .any(|field| !ready.contains(&Value::String(field.clone())))
            {
                return Err("EVIDENCE_REQUIRED: 선택한 필드에 상충되는 근거가 있거나 독립 출처가 부족합니다. 수정안을 다시 확인하세요.".into());
            }
            let changes: Map<String, Value> = selected
                .iter()
                .map(|field| (field.clone(), proposal.changes[field].clone()))
                .collect();
            let mut record = proposal_json.clone();
            record["diff"] = report["diff"].clone();
            audit_id = Some(
                state
                    .db
                    .begin_metadata_research(&record, &selected, &hash)?,
            );
            apply_track_changes(track, &changes)
        },
    );
    match result {
        Ok((track, revision)) => {
            let id = audit_id.ok_or("조사 기록 ID가 없습니다.")?;
            let audit_error = state
                .db
                .finish_metadata_research(id, "applied", Some(&revision), None)
                .err();
            Ok(
                json!({"applied":true,"track":track,"revision":revision,"appliedFields":selected,"planHash":hash,
                "audit":{"id":id,"status":if audit_error.is_some(){"pending"}else{"applied"},"error":audit_error},"sourceVerification":"agent_reported"}),
            )
        }
        Err(error) => {
            if let Some(id) = audit_id {
                let _ = state.db.finish_metadata_research(
                    id,
                    "failed_or_incomplete",
                    None,
                    Some(&error),
                );
                Err(format!(
                    "{error} (researchAuditId={id}; 파일과 최신 태그를 확인한 뒤 재시도하세요.)"
                ))
            } else {
                Err(error)
            }
        }
    }
}

pub(super) fn history(state: &AppState, args: &Value) -> Result<Value, String> {
    let ws = args["workspaceId"]
        .as_i64()
        .ok_or_else(|| invalid("workspaceId가 필요합니다."))?;
    let id = args["trackId"]
        .as_i64()
        .ok_or_else(|| invalid("trackId가 필요합니다."))?;
    require_track(state, ws, id)?;
    let limit = args["limit"].as_u64().unwrap_or(10).clamp(1, 20) as usize;
    Ok(json!({"records":state.db.metadata_research_history(ws,id,limit)?}))
}
