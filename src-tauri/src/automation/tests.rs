use super::*;
use crate::{audio::AudioEngine, db::Database, scanner::ScanQueue, tags, AppState};
use serde_json::json;
use std::{
    fs,
    io::{Read, Write},
    net::TcpStream,
    path::Path,
    sync::Mutex,
    time::Duration,
};

fn request(server: &ApiServer, path: &str, body: &str, extra: &str, auth: bool) -> (u16, Value) {
    let authorization = if auth {
        format!("Authorization: Bearer {}\r\n", server.token)
    } else {
        String::new()
    };
    let mut stream = TcpStream::connect(("127.0.0.1", server.port)).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    write!(stream,"POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n{authorization}Content-Type: application/json\r\nContent-Length: {}\r\n{extra}\r\n{body}",server.port,body.len()).unwrap();
    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    let (headers, body) = response.split_once("\r\n\r\n").unwrap();
    let status = headers.split_whitespace().nth(1).unwrap().parse().unwrap();
    (
        status,
        if body.is_empty() {
            Value::Null
        } else {
            serde_json::from_str(body).unwrap()
        },
    )
}

fn rpc(server: &ApiServer, name: &str, args: Value) -> (u16, Value) {
    request(
        server,
        "/rpc",
        &json!({"name":name,"arguments":args}).to_string(),
        "",
        true,
    )
}

fn fixture(root: &Path) -> (Arc<AppState>, i64) {
    let file = root.join("tone.wav");
    fs::copy(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/tone.wav"),
        &file,
    )
    .unwrap();
    let db = Database::new(&root.join("test.sqlite3")).unwrap();
    db.add_workspace_folder(1, root.to_str().unwrap()).unwrap();
    let mut track = tags::read_track_from_path(&file).unwrap();
    track.title = "Original title".into();
    track.genre = "Keep genre".into();
    track.year = Some(2024);
    track.track_number = Some(7);
    let id = db.upsert_track(&track).unwrap();
    let (scanner, _rx) = ScanQueue::new();
    (
        Arc::new(AppState {
            db,
            audio: AudioEngine::new(),
            app_data_dir: root.to_path_buf(),
            scanner,
            metadata_lock: Mutex::new(()),
            visibility_lock: tokio::sync::RwLock::new(()),
        }),
        id,
    )
}

#[test]
fn http_rpc_and_mcp_share_scoped_tools_and_revision_checked_file_writes() {
    let dir = tempfile::tempdir().unwrap();
    let (state, id) = fixture(dir.path());
    let copy = Arc::clone(&state);
    let handler: Handler = Arc::new(move |name, args| {
        let state = Arc::clone(&copy);
        Box::pin(async move { dispatch::call(&state, &name, &args).await })
    });
    let server = ApiServer::start(&dir.path().join("runtime.json"), handler).unwrap();
    assert_eq!(rpc(&server, "workspace_list", json!({})).0, 200);
    assert_eq!(
        rpc(&server, "playback_seek", json!({"positionSecs":1e308})).0,
        400
    );
    assert_eq!(
        rpc(&server, "playback_status", json!({})).1["result"]["currentTrackId"],
        Value::Null
    );
    let (status, volume) = rpc(&server, "playback_volume", json!({"volume":0.42}));
    assert_eq!(status, 200, "{volume}");
    assert!((volume["result"]["volume"].as_f64().unwrap() - 0.42).abs() < 0.00001);
    assert_eq!(
        rpc(&server, "playback_speed", json!({"speed":1.25})).1["result"]["speed"],
        1.25
    );
    assert_eq!(rpc(&server, "playback_stop", json!({})).0, 200);
    assert_eq!(
        rpc(&server, "library_search", json!({"workspaceId":1})).1["result"]["total"],
        1
    );
    let (_, read) = rpc(&server, "track_read", json!({"workspaceId":1,"trackId":id}));
    let revision = read["result"]["revision"].as_str().unwrap();
    let (status, saved) = rpc(
        &server,
        "track_update",
        json!({"workspaceId":1,"trackId":id,"expectedRevision":revision,"saveLrcFile":false,"changes":{"title":"Updated title"}}),
    );
    assert_eq!(status, 200, "{saved}");
    assert_eq!(saved["result"]["track"]["genre"], "Keep genre");
    assert_eq!(saved["result"]["track"]["year"], 2024);
    assert_eq!(saved["result"]["track"]["trackNumber"], 7);
    assert_eq!(
        tags::read_track_from_path(&dir.path().join("tone.wav"))
            .unwrap()
            .title,
        "Updated title"
    );
    assert_eq!(rpc(&server,"track_update",json!({"workspaceId":1,"trackId":id,"expectedRevision":revision,"changes":{"title":"Stale overwrite"}})).0,409);
    assert_eq!(
        state.db.get_track_by_id(id).unwrap().unwrap().title,
        "Updated title"
    );
    let second = state
        .db
        .create_workspace("Other")
        .unwrap()
        .active_workspace_id;
    assert_eq!(
        rpc(
            &server,
            "track_read",
            json!({"workspaceId":second,"trackId":id})
        )
        .0,
        400
    );
    assert_eq!(
        rpc(&server, "library_search", json!({"workspaceId":second})).1["result"]["total"],
        0
    );
    assert_eq!(
        rpc(
            &server,
            "album_search",
            json!({"workspaceId":second,"trackId":id})
        )
        .0,
        400
    );
    assert_eq!(rpc(&server, "album_preview", json!({"workspaceId":second,"trackIds":[id],"releaseId":"22b48d61-1822-47fc-980c-fd597424c28a"})).0, 400);
    assert_eq!(rpc(&server, "album_preview", json!({"workspaceId":1,"trackIds":[id],"releaseId":"...................................."})).0, 400);
    assert_eq!(
        rpc(
            &server,
            "playlist_create",
            json!({"workspaceId":1,"name":"Mix"})
        )
        .0,
        200
    );
    let playlist = state.db.get_playlists().unwrap()[0].id;
    assert_eq!(
        rpc(
            &server,
            "playlist_add_tracks",
            json!({"workspaceId":second,"playlistId":playlist,"trackIds":[id]})
        )
        .0,
        400
    );
    assert_eq!(
        rpc(
            &server,
            "track_favorite",
            json!({"workspaceId":1,"trackId":id,"favorite":true})
        )
        .0,
        200
    );
    assert_eq!(
        rpc(
            &server,
            "track_favorite",
            json!({"workspaceId":1,"trackId":id,"favorite":true})
        )
        .0,
        200
    );
    assert!(state.db.get_track_by_id(id).unwrap().unwrap().is_favorite);
    let (status, response)=request(&server,"/mcp",&json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}).to_string(),"",true);
    assert_eq!(status, 200);
    assert_eq!(response["result"]["protocolVersion"], "2025-11-25");
    let (_, response) = request(
        &server,
        "/mcp",
        r#"{"jsonrpc":"2.0","id":"list","method":"tools/list"}"#,
        "",
        true,
    );
    assert_eq!(response["result"]["tools"], *tools::definitions());
    let (_, response)=request(&server,"/mcp",&json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"track_read","arguments":{"workspaceId":second,"trackId":id}}}).to_string(),"",true);
    assert_eq!(response["result"]["isError"], true);
    assert!(response["result"]["structuredContent"]["error"].is_string());
    assert_eq!(
        request(
            &server,
            "/mcp",
            r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
            "",
            true
        )
        .0,
        202
    );
}

#[test]
fn rejects_cross_origin_bad_auth_invalid_shapes_and_unsafe_http_framing() {
    let dir = tempfile::tempdir().unwrap();
    let handler: Handler = Arc::new(|name, args| {
        Box::pin(async move {
            let tool = tools::definitions()
                .as_array()
                .unwrap()
                .iter()
                .find(|t| t["name"] == name)
                .ok_or("Unknown tool")?;
            tools::validate(&args, &tool["inputSchema"], "arguments")?;
            Ok(json!({"ok":true}))
        })
    });
    let server = ApiServer::start(&dir.path().join("runtime.json"), handler).unwrap();
    let body = r#"{"name":"app_status"}"#;
    assert_eq!(request(&server, "/rpc", body, "", false).0, 401);
    assert_eq!(
        request(
            &server,
            "/rpc",
            body,
            "Origin: https://untrusted.example\r\n",
            true
        )
        .0,
        403
    );
    assert_eq!(
        request(&server, "/rpc", body, "Host: evil.example\r\n", true).0,
        403
    );
    assert_eq!(
        request(
            &server,
            "/rpc",
            body,
            "Transfer-Encoding: chunked\r\n",
            true
        )
        .0,
        400
    );
    assert_eq!(
        request(&server, "/rpc", body, "Content-Length: 1\r\n", true).0,
        400
    );
    assert_eq!(request(&server, "/mcp", "[]", "", true).0, 400);
    assert_eq!(
        request(&server, "/mcp", "{", "", true).1["error"]["code"],
        -32700
    );
    assert_eq!(rpc(&server,"track_update",json!({"workspaceId":1,"trackId":1,"expectedRevision":"a".repeat(64),"changes":{"filePath":"/other"}})).0,400);
    assert_eq!(
        rpc(
            &server,
            "track_remove",
            json!({"workspaceId":1,"trackIds":[18446744073709551615u64]})
        )
        .0,
        400
    );
    assert_eq!(
        rpc(&server, "playback_volume", json!({"volume":1.1})).0,
        400
    );
    assert_eq!(rpc(&server, "app_status", json!({"unknown":true})).0, 400);
    assert_eq!(
        rpc(
            &server,
            "track_update",
            json!({"workspaceId":1,"trackId":1,"expectedRevision":"a".repeat(64),"changes":{}})
        )
        .0,
        400
    );
    server.shutdown();
    assert!(!dir.path().join("runtime.json").exists());
}
