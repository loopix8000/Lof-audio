use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

static INSTALL_LOCK: Mutex<()> = Mutex::new(());
type Files = Vec<(String, Vec<u8>)>;

fn bundle() -> Files {
    vec![
        (
            "SKILL.md".into(),
            include_bytes!("../../skills/lof-audio/SKILL.md").to_vec(),
        ),
        (
            "references/api.md".into(),
            include_bytes!("../../skills/lof-audio/references/api.md").to_vec(),
        ),
        (
            "references/metadata-research.md".into(),
            include_bytes!("../../skills/lof-audio/references/metadata-research.md").to_vec(),
        ),
        (
            "references/tools.json".into(),
            serde_json::to_vec_pretty(crate::automation::tools::definitions()).unwrap(),
        ),
    ]
}

fn revision(files: &Files) -> String {
    let mut hash = Sha256::new();
    for (path, bytes) in files {
        hash.update((path.len() as u64).to_be_bytes());
        hash.update(path.as_bytes());
        hash.update((bytes.len() as u64).to_be_bytes());
        hash.update(bytes);
    }
    hex::encode(hash.finalize())
}

fn info(files: &Files) -> Value {
    json!({"name":"lof-audio","version":env!("CARGO_PKG_VERSION"),"revision":revision(files),"files":files.iter().map(|(path,content)|json!({"path":path,"size":content.len(),"sha256":hex::encode(Sha256::digest(content))})).collect::<Vec<_>>()})
}

fn root(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.is_absolute()
        || path.components().any(|c| c == Component::ParentDir)
        || path.parent().is_none()
    {
        return Err("SKILL_PATH: 스킬 상위 디렉터리의 절대 경로가 필요합니다.".into());
    }
    Ok(if path.exists() {
        path.canonicalize().map_err(|e| e.to_string())?
    } else {
        path.to_path_buf()
    })
}

fn linked(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}

fn inventory(path: &Path) -> Result<Files, String> {
    fn walk(
        base: &Path,
        path: &Path,
        files: &mut Files,
        bytes: &mut u64,
        entries: &mut usize,
    ) -> Result<(), String> {
        let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if linked(&meta) {
            return Err("SKILL_PATH: 스킬 내부의 링크나 연결 폴더는 교체하지 않습니다.".into());
        }
        *entries += 1;
        if *entries > 256 {
            return Err("SKILL_PATH: 설치본의 항목 수가 너무 많습니다.".into());
        }
        if meta.is_dir() {
            for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
                walk(
                    base,
                    &entry.map_err(|e| e.to_string())?.path(),
                    files,
                    bytes,
                    entries,
                )?;
            }
        } else if meta.is_file() {
            *bytes += meta.len();
            if *bytes > 8_000_000 {
                return Err("SKILL_PATH: 설치본의 크기가 너무 큽니다.".into());
            }
            files.push((
                path.strip_prefix(base)
                    .map_err(|e| e.to_string())?
                    .to_str()
                    .ok_or("SKILL_PATH: UTF-8 파일 경로가 필요합니다.")?
                    .replace('\\', "/"),
                fs::read(path).map_err(|e| e.to_string())?,
            ));
        } else {
            return Err("SKILL_PATH: 일반 파일과 디렉터리만 지원합니다.".into());
        }
        Ok(())
    }
    let mut files = Vec::new();
    walk(path, path, &mut files, &mut 0, &mut 0)?;
    files.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(files)
}

fn installed(root: &Path, files: &Files) -> Result<Value, String> {
    let target = root.join("lof-audio");
    match fs::symlink_metadata(&target) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(json!({"exists":false,"upToDate":false,"revision":null}))
        }
        Err(e) => return Err(e.to_string()),
        Ok(meta) if !meta.is_dir() || linked(&meta) => {
            return Err("SKILL_PATH: lof-audio 대상은 링크가 아닌 디렉터리여야 합니다.".into())
        }
        _ => {}
    }
    let current = revision(&inventory(&target)?);
    Ok(
        json!({"exists":true,"path":target,"revision":current,"upToDate":current == revision(files)}),
    )
}

pub fn status(directory: Option<&str>) -> Result<Value, String> {
    let files = bundle();
    let mut result = info(&files);
    if let Some(directory) = directory {
        result["installed"] = installed(&root(directory)?, &files)?;
    }
    Ok(result)
}

pub fn get(known_revision: Option<&str>) -> Result<Value, String> {
    let files = bundle();
    let mut result = info(&files);
    let unchanged = known_revision == result["revision"].as_str();
    result["unchanged"] = json!(unchanged);
    if !unchanged {
        result["files"] = json!(files.iter().map(|(path,bytes)|json!({"path":path,"content":String::from_utf8_lossy(bytes),"sha256":hex::encode(Sha256::digest(bytes))})).collect::<Vec<_>>());
    }
    Ok(result)
}

pub fn install(
    directory: &str,
    expected_revision: &str,
    expected_installed: Option<&str>,
) -> Result<Value, String> {
    let _guard = INSTALL_LOCK.lock().map_err(|e| e.to_string())?;
    let files = bundle();
    if revision(&files) != expected_revision {
        return Err("SKILL_CHANGED: 앱의 스킬 패키지를 다시 조회하세요.".into());
    }
    let root = root(directory)?;
    let before = installed(&root, &files)?;
    if before["upToDate"] == true {
        let mut result = status(root.to_str())?;
        result["changed"] = json!(false);
        result["backupPath"] = Value::Null;
        return Ok(result);
    }
    if before["revision"].as_str() != expected_installed {
        return Err("SKILL_CHANGED: 설치본이 바뀌었습니다. skill_status로 다시 확인하세요.".into());
    }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let staging = tempfile::Builder::new()
        .prefix(".lof-audio-stage-")
        .tempdir_in(&root)
        .map_err(|e| e.to_string())?;
    for (path, content) in &files {
        let path = staging.path().join(path);
        fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::write(path, content).map_err(|e| e.to_string())?;
    }
    // Re-check immediately before replacing the directory, including user-added files.
    if installed(&root, &files)?["revision"] != before["revision"] {
        return Err("SKILL_CHANGED: 설치 중 기존 스킬이 바뀌었습니다.".into());
    }
    let target = root.join("lof-audio");
    let backup = if before["exists"] == true {
        let parent = root
            .parent()
            .ok_or("SKILL_PATH: 백업 상위 경로가 없습니다.")?
            .join(".lof-audio-skill-backups");
        fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
        let path = tempfile::Builder::new()
            .prefix("lof-audio-")
            .tempdir_in(parent)
            .map_err(|e| e.to_string())?
            .keep()
            .join("lof-audio");
        fs::rename(&target, &path).map_err(|e| e.to_string())?;
        Some(path)
    } else {
        None
    };
    if let Err(error) = fs::rename(staging.path(), &target) {
        if let Some(path) = &backup {
            fs::rename(path, &target).map_err(|restore| {
                format!(
                    "SKILL_INSTALL: {error}; 복원 실패: {restore}; 백업: {}",
                    path.display()
                )
            })?;
        }
        return Err(format!("SKILL_INSTALL: {error}"));
    }
    let mut result = status(root.to_str())?;
    result["changed"] = json!(true);
    result["backupPath"] = json!(backup);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installs_current_bundle_and_preserves_customized_installations_in_backups() {
        for (path, content) in bundle() {
            assert_eq!(
                fs::read(
                    Path::new(env!("CARGO_MANIFEST_DIR"))
                        .join("../skills/lof-audio")
                        .join(path)
                )
                .unwrap(),
                content
            );
        }
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("skills");
        let directory = root.to_str().unwrap();
        let initial = status(Some(directory)).unwrap();
        let revision = initial["revision"].as_str().unwrap();
        let result = install(directory, revision, None).unwrap();
        assert_eq!(result["installed"]["upToDate"], true);
        assert_eq!(
            install(directory, revision, None).unwrap()["changed"],
            false
        );
        assert_eq!(get(Some(revision)).unwrap()["unchanged"], true);
        let tools: Value = serde_json::from_slice(
            &fs::read(root.join("lof-audio/references/tools.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(tools, *crate::automation::tools::definitions());
        fs::write(root.join("lof-audio/custom.md"), "Keep this customization").unwrap();
        assert!(install(directory, revision, Some(revision))
            .unwrap_err()
            .starts_with("SKILL_CHANGED:"));
        let current = status(Some(directory)).unwrap();
        let result = install(
            directory,
            revision,
            current["installed"]["revision"].as_str(),
        )
        .unwrap();
        assert_eq!(result["installed"]["upToDate"], true);
        let backup = Path::new(result["backupPath"].as_str().unwrap());
        assert!(!backup.starts_with(&root));
        assert_eq!(
            fs::read_to_string(backup.join("custom.md")).unwrap(),
            "Keep this customization"
        );
        assert!(!root.join("lof-audio/custom.md").exists());
        assert!(install(directory, &"0".repeat(64), None)
            .unwrap_err()
            .starts_with("SKILL_CHANGED:"));
        assert!(status(Some("../skills")).is_err());
    }

    #[test]
    fn refuses_a_file_or_link_as_the_installation_target() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("lof-audio"), "keep").unwrap();
        assert!(status(temp.path().to_str()).is_err());
        assert_eq!(
            fs::read_to_string(temp.path().join("lof-audio")).unwrap(),
            "keep"
        );
    }
}
