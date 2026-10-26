use serde_json::{json, Value};
use std::sync::OnceLock;

pub const INSTRUCTIONS: &str = "Lof Audio 앱이 실행 중이어야 합니다. workspace_list로 실제 workspaceId를 확인하고 library_search로 trackId를 찾으세요. 조회와 변경은 지정한 워크스페이스만 대상으로 합니다. track_update 전 track_read의 revision을 expectedRevision으로 전달하고, CONFLICT이면 최신 내용을 다시 읽어 요청한 필드만 수정하세요. 음악 메타정보를 조사·정정할 때는 metadata_research_prepare로 맥락을 읽고 AI가 웹·다른 MCP 등 여러 독립 출처를 직접 확인한 뒤 metadata_research_preview/apply/history를 사용하세요. 서버의 근거 검사는 AI가 제출한 관측값을 비교하며 웹 페이지를 대신 읽지 않습니다. 음악 파일·가사 쓰기는 사용자 요청 범위에서만 수행하세요. folder_add/rescan은 비동기 색인이므로 scan_status와 library_search로 완료를 확인하세요. skill_status/skill_get으로 앱에 포함된 스킬을 받고, 같은 기기의 실제 스킬 폴더를 확인한 경우 skill_install로 설치할 수 있습니다. 오류 응답은 완료로 취급하지 마세요.";

pub fn definitions() -> &'static Value {
    static TOOLS: OnceLock<Value> = OnceLock::new();
    TOOLS.get_or_init(|| {
        let id = json!({"type":"integer","minimum":1,"maximum":9007199254740991u64});
        let text = json!({"type":"string","minLength":1,"maxLength":4096});
        let name = json!({"type":"string","minLength":1,"maxLength":80});
        let revision = json!({"type":"string","minLength":64,"maxLength":64});
        let ids = json!({"type":"array","items":id,"minItems":1,"maxItems":200,"uniqueItems":true});
        let nullable_text = json!({"type":["string","null"],"maxLength":2000000});
        let mut tools = Vec::new();
        let mut add = |tool_name: &str, description: &str, properties: Value, required: &[&str], read_only: bool, destructive: bool| {
            tools.push(json!({"name":tool_name,"description":description,"inputSchema":{"type":"object","properties":properties,"required":required,"additionalProperties":false},
                "annotations":{"readOnlyHint":read_only,"destructiveHint":destructive,"openWorldHint":(["lyrics_search","metadata_search","album_search","album_preview"].contains(&tool_name))}}));
        };
        add("app_status", "앱 버전, 선택한 워크스페이스, 색인 상태 확인", json!({}), &[], true, false);
        add("workspace_list", "워크스페이스 ID·이름·연결 폴더 및 현재 선택 조회", json!({}), &[], true, false);
        add("workspace_create", "빈 워크스페이스를 만들고 선택", json!({"name":name}), &["name"], false, false);
        add("workspace_rename", "워크스페이스 이름 변경", json!({"workspaceId":id,"name":name}), &["workspaceId","name"], false, false);
        add("workspace_select", "앱에서 볼 워크스페이스 선택", json!({"workspaceId":id}), &["workspaceId"], false, false);
        add("workspace_delete", "워크스페이스의 연결과 재생목록 삭제. 음악 파일은 유지", json!({"workspaceId":id}), &["workspaceId"], false, true);
        add("folder_add", "절대 경로의 음악 폴더 연결 후 백그라운드 색인 요청", json!({"workspaceId":id,"folderPath":text}), &["workspaceId","folderPath"], false, false);
        add("folder_remove", "해당 워크스페이스의 폴더 연결 해제. 다른 워크스페이스와 음악 파일은 유지", json!({"workspaceId":id,"folderPath":text}), &["workspaceId","folderPath"], false, true);
        add("library_rescan", "해당 워크스페이스 색인 요청. 완료는 scan_status로 확인", json!({"workspaceId":id,"force":{"type":"boolean"}}), &["workspaceId"], false, false);
        add("scan_status", "해당 워크스페이스의 현재 색인 진행 상황", json!({"workspaceId":id}), &["workspaceId"], true, false);
        add("library_search", "워크스페이스 안에서 제목·아티스트·앨범·장르·파일명 검색. 가사 본문은 track_read로 조회", json!({"workspaceId":id,"query":{"type":"string","maxLength":4096},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":200},"favoritesOnly":{"type":"boolean"}}), &["workspaceId"], true, false);
        add("track_read", "트랙의 현재 태그·가사 및 수정용 revision 조회. includeCover=true이면 커버 원본을 data URL로 포함", json!({"workspaceId":id,"trackId":id,"includeCover":{"type":"boolean"}}), &["workspaceId","trackId"], true, false);
        add("track_update", "revision이 일치할 때 명시한 태그·가사만 파일과 DB에 저장. null은 해당 값 제거", json!({"workspaceId":id,"trackId":id,"expectedRevision":revision,"saveLrcFile":{"type":"boolean"},"changes":{"type":"object","minProperties":1,"additionalProperties":false,"properties":{
            "title":{"type":"string","minLength":1,"maxLength":4096},"artist":{"type":"string","maxLength":4096},"album":{"type":"string","maxLength":4096},"albumArtist":{"type":"string","maxLength":4096},"genre":{"type":"string","maxLength":4096},
            "year":{"type":["integer","null"],"minimum":0,"maximum":9999},"trackNumber":{"type":["integer","null"],"minimum":0,"maximum":65535},
            "plainLyrics":nullable_text,"syncedLyrics":nullable_text,"coverDataUrl":{"type":["string","null"],"maxLength":6000000},"lyricOffsetMs":{"type":"integer","minimum":-600000,"maximum":600000}
        }}}), &["workspaceId","trackId","expectedRevision","changes"], false, true);
        add("track_remove", "현재 워크스페이스에서 곡 제외. 음악 파일과 다른 워크스페이스는 유지", json!({"workspaceId":id,"trackIds":ids}), &["workspaceId","trackIds"], false, true);
        add("track_favorite", "즐겨찾기를 지정한 값으로 설정. 같은 음악 파일을 공유하는 워크스페이스에도 적용", json!({"workspaceId":id,"trackId":id,"favorite":{"type":"boolean"}}), &["workspaceId","trackId","favorite"], false, false);
        add("playback_status", "현재 재생 상태 조회", json!({}), &[], true, false);
        add("playback_play", "지정한 워크스페이스의 곡 재생", json!({"workspaceId":id,"trackId":id}), &["workspaceId","trackId"], false, false);
        for (tool, description) in [("playback_pause","일시 정지"),("playback_resume","현재 곡 재생 재개"),("playback_stop","재생 중지")] { add(tool, description, json!({}), &[], false, false); }
        add("playback_seek", "현재 곡의 지정한 초로 이동", json!({"positionSecs":{"type":"number","minimum":0}}), &["positionSecs"], false, false);
        add("playback_volume", "음량 설정 (0~1)", json!({"volume":{"type":"number","minimum":0,"maximum":1}}), &["volume"], false, false);
        add("playback_speed", "재생 배속 설정 (0.5~2)", json!({"speed":{"type":"number","minimum":0.5,"maximum":2}}), &["speed"], false, false);
        add("lyrics_search", "LRCLIB 가사 후보 검색. 파일에 자동 적용하지 않음", json!({"query":text}), &["query"], true, false);
        add("metadata_search", "MusicBrainz 태그 후보 조회. 파일에 자동 적용하지 않음", json!({"workspaceId":id,"trackId":id,"query":text}), &["workspaceId","trackId"], true, false);
        add("album_search", "트랙의 앨범명·앨범 아티스트로 MusicBrainz 발매판 후보 검색. query로 검색어 지정 가능", json!({"workspaceId":id,"trackId":id,"query":text}), &["workspaceId","trackId"], true, false);
        add("album_preview", "선택한 발매판 전체 트랙을 한 번 조회해 지정한 곡들의 제목·재생 시간과 매칭. 파일에 자동 적용하지 않음", json!({"workspaceId":id,"trackIds":ids,"releaseId":{"type":"string","minLength":36,"maxLength":36}}), &["workspaceId","trackIds","releaseId"], true, false);
        add("playlist_list", "워크스페이스의 플레이리스트와 표시 가능한 trackIds 조회", json!({"workspaceId":id}), &["workspaceId"], true, false);
        add("playlist_create", "워크스페이스에 플레이리스트 생성", json!({"workspaceId":id,"name":name}), &["workspaceId","name"], false, false);
        add("playlist_delete", "해당 워크스페이스의 플레이리스트 삭제", json!({"workspaceId":id,"playlistId":id}), &["workspaceId","playlistId"], false, true);
        add("playlist_add_tracks", "플레이리스트에 워크스페이스의 곡 추가", json!({"workspaceId":id,"playlistId":id,"trackIds":ids}), &["workspaceId","playlistId","trackIds"], false, false);
        add("playlist_remove_track", "플레이리스트에서 한 곡 제거", json!({"workspaceId":id,"playlistId":id,"trackId":id}), &["workspaceId","playlistId","trackId"], false, true);
        add("skill_status", "번들 스킬 revision과 선택한 설치 경로의 상태 확인", json!({"skillsDirectory":text}), &[], true, false);
        add("skill_get", "앱에 포함된 스킬·API 안내·현재 도구 스키마를 UTF-8 파일로 조회", json!({"knownRevision":revision}), &[], true, false);
        add("skill_install", "실제 AI 스킬 폴더에 lof-audio 스킬 설치·업데이트. 기존 폴더는 별도로 백업", json!({"skillsDirectory":text,"expectedRevision":revision,"expectedInstalledRevision":revision}), &["skillsDirectory","expectedRevision"], false, true);
        tools.extend(serde_json::from_str::<Vec<Value>>(include_str!("research_tools.json")).expect("Bundled research schemas are valid JSON"));
        Value::Array(tools)
    })
}

pub fn validate(value: &Value, schema: &Value, path: &str) -> Result<(), String> {
    let matches_type = |kind: &str| match kind {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "integer" => value.is_i64() || value.is_u64(),
        "number" => value.is_number(),
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        _ => false,
    };
    let valid = match &schema["type"] {
        Value::String(kind) => matches_type(kind),
        Value::Array(kinds) => kinds
            .iter()
            .any(|kind| matches_type(kind.as_str().unwrap_or(""))),
        _ => true,
    };
    if !valid {
        return Err(format!("INVALID_ARGUMENT: {path}의 자료형을 확인하세요."));
    }
    if schema["enum"]
        .as_array()
        .is_some_and(|allowed| !allowed.contains(value))
    {
        return Err(format!("INVALID_ARGUMENT: {path}의 지원 값을 확인하세요."));
    }
    if let Some(fields) = value.as_object() {
        if fields.len() < schema["minProperties"].as_u64().unwrap_or(0) as usize {
            return Err(format!("INVALID_ARGUMENT: {path}가 비어 있습니다."));
        }
        for key in schema["required"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            if !fields.contains_key(key) {
                return Err(format!("INVALID_ARGUMENT: {path}.{key}가 필요합니다."));
            }
        }
        for (key, val) in fields {
            if let Some(property) = schema["properties"].get(key) {
                validate(val, property, &format!("{path}.{key}"))?;
            } else if schema["additionalProperties"] == false {
                return Err(format!(
                    "INVALID_ARGUMENT: {path}.{key}는 지원하지 않습니다."
                ));
            }
        }
    }
    if let Some(items) = value.as_array() {
        if items.len() < schema["minItems"].as_u64().unwrap_or(0) as usize
            || items.len() > schema["maxItems"].as_u64().unwrap_or(u64::MAX) as usize
        {
            return Err(format!("INVALID_ARGUMENT: {path} 항목 수를 확인하세요."));
        }
        for (index, val) in items.iter().enumerate() {
            validate(val, &schema["items"], &format!("{path}[{index}]"))?;
            if schema["uniqueItems"] == true && items[..index].contains(val) {
                return Err(format!("INVALID_ARGUMENT: {path}에 중복 항목이 있습니다."));
            }
        }
    }
    if let Some(text) = value.as_str() {
        let len = text.chars().count() as u64;
        if len < schema["minLength"].as_u64().unwrap_or(0)
            || len > schema["maxLength"].as_u64().unwrap_or(u64::MAX)
        {
            return Err(format!("INVALID_ARGUMENT: {path} 길이를 확인하세요."));
        }
    }
    if let Some(number) = value.as_f64() {
        if number < schema["minimum"].as_f64().unwrap_or(f64::NEG_INFINITY)
            || number > schema["maximum"].as_f64().unwrap_or(f64::INFINITY)
        {
            return Err(format!("INVALID_ARGUMENT: {path} 범위를 확인하세요."));
        }
    }
    Ok(())
}
