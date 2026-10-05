//! Custom distribution storage. The locator lives outside release packages. A switch is
//! committed only after a verified copy, at startup before any config/usage writers run.
use crate::{acquire_app_instance_guard_for, AppInstanceGuard};
use rusqlite::{Connection, DatabaseName, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::OnceLock,
};
use tauri_plugin_opener::OpenerExt;

const MARKER: &str = "storage-profile.json";
const MANIFEST: &str = "storage-backup.json";
// Never copy an executable installation wholesale: it can be a build/repository folder.
const DATA_ENTRIES: &[&str] = &[
    "config.toml",
    "cpa-gui.yaml",
    "oauth",
    "usage-records",
    "cpa-core",
    "agents",
    "backups",
];
static DIRECTORY: OnceLock<PathBuf> = OnceLock::new();
static RESTART_REQUESTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub(crate) fn restart_requested() -> bool {
    RESTART_REQUESTED.load(std::sync::atomic::Ordering::Acquire)
}

type Result<T> = std::result::Result<T, String>;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum StorageMode {
    Portable,
    User,
    Custom,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    mode: StorageMode,
    directory: PathBuf,
    id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum Operation {
    Move {
        mode: StorageMode,
        destination: PathBuf,
    },
    Backup {
        destination: PathBuf,
    },
    Restore {
        backup: PathBuf,
        destination: PathBuf,
    },
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Locator {
    version: u32,
    active: Profile,
    pending: Option<Operation>,
    last_result: Option<String>,
    last_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StorageSettings {
    mode: StorageMode,
    directory: PathBuf,
    user_directory: PathBuf,
    application_directory: PathBuf,
    locator: PathBuf,
    pending: Option<Operation>,
    last_result: Option<String>,
    last_error: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    version: u32,
    app_version: String,
    created_at: String,
    files: Vec<BackupFile>,
}
#[derive(Serialize, Deserialize)]
struct BackupFile {
    path: PathBuf,
    sha256: String,
    bytes: u64,
}

pub(crate) fn resolved_directory() -> Option<PathBuf> {
    DIRECTORY.get().cloned()
}

fn settings_home() -> Result<PathBuf> {
    #[cfg(windows)]
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    #[cfg(target_os = "macos")]
    let base =
        std::env::var_os("HOME").map(|p| PathBuf::from(p).join("Library/Application Support"));
    #[cfg(all(unix, not(target_os = "macos")))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".local/share")));
    base.filter(|p| p.is_absolute())
        .map(|p| p.join("EasyCLIProxyAPI-Custom"))
        .ok_or_else(|| "Cannot determine the per-user storage directory".into())
}

fn locator_path() -> Result<PathBuf> {
    Ok(settings_home()?.join("storage.json"))
}
fn lock_locator(path: &Path) -> Result<AppInstanceGuard> {
    let lock = path.with_file_name("storage.lock");
    // Create before deriving the lock identity so canonicalization cannot change
    // the identity between the first launch and subsequent launches on Windows.
    fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(&lock)
        .map_err(error)?;
    acquire_app_instance_guard_for(&lock)
}
fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    serde_json::from_slice(
        &fs::read(path).map_err(|e| format!("Cannot read {}: {e}", path.display()))?,
    )
    .map_err(|_| format!("Invalid storage file: {}", path.display()))
}
fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    crate::write_bytes_atomically(path, &serde_json::to_vec_pretty(value).map_err(error)?)
}
fn load_locator(path: &Path) -> Result<Locator> {
    let locator: Locator = read_json(path)?;
    if locator.version != 1 {
        return Err("This storage configuration needs a newer application version".into());
    }
    validate_profile(&locator.active)?;
    Ok(locator)
}
fn unique_id() -> Result<String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(error)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn validate_profile(profile: &Profile) -> Result<()> {
    if !profile.directory.is_absolute() || !profile.directory.is_dir() {
        return Err(format!("Saved data folder is unavailable: {}. Reconnect it before opening the app; no empty replacement was created.", profile.directory.display()));
    }
    let id: String = read_json(&profile.directory.join(MARKER))?;
    if id != profile.id {
        return Err("The saved data folder belongs to a different storage profile".into());
    }
    validate_config(&profile.directory)
}
fn validate_config(root: &Path) -> Result<()> {
    let path = root.join("config.toml");
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(error)?;
        toml::from_str::<crate::GuiConfigFile>(&content)
            .map_err(|_| format!("Configuration is invalid: {}. Restore or repair it before starting; it has not been replaced.", path.display()))?;
    }
    Ok(())
}

pub(crate) fn initialize() -> Result<Vec<AppInstanceGuard>> {
    let path = locator_path()?;
    fs::create_dir_all(path.parent().unwrap()).map_err(error)?;
    let _locator_guard = lock_locator(&path)?;
    // An update helper expects a prompt startup acknowledgment. Never run a long
    // scheduled copy during that acknowledgment window; leave it for the next restart.
    let executable = crate::executable_dir()?;
    let (initial_directory, initial_mode) = if path.exists() {
        (crate::legacy_core_base_dir()?, StorageMode::Portable)
    } else {
        initial_storage_directory(
            &executable,
            &crate::legacy_core_base_dir()?,
            &settings_home()?.join("data"),
        )?
    };
    let (locator, guards) = initialize_at_with_mode(
        &path,
        &initial_directory,
        &executable,
        crate::portable_update_ack_argument().is_none(),
        initial_mode,
    )?;
    DIRECTORY
        .set(locator.active.directory)
        .map_err(|_| "Storage initialized twice".to_string())?;
    Ok(guards)
}

fn initial_storage_directory(
    executable: &Path,
    legacy: &Path,
    user_data: &Path,
) -> Result<(PathBuf, StorageMode)> {
    let marker = executable.join("installation.json");
    if !marker.exists() {
        return Ok((legacy.to_path_buf(), StorageMode::Portable));
    }
    let installation: serde_json::Value = read_json(&marker)?;
    if installation
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
        || installation
            .get("distribution")
            .and_then(serde_json::Value::as_str)
            != Some("installer")
    {
        return Err(
            "Invalid installation marker; reinstall the application without deleting your data"
                .into(),
        );
    }
    let hint = executable.join("initial-data-directory.txt");
    if hint.exists() {
        let bytes = fs::read(&hint).map_err(error)?;
        if bytes.len() > 65536 || bytes.len() % 2 != 0 {
            return Err("Invalid initial data folder hint".into());
        }
        let wide = bytes
            .chunks_exact(2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .collect::<Vec<_>>();
        let text = String::from_utf16(&wide)
            .map_err(|_| "Invalid initial data folder encoding".to_string())?;
        let directory = PathBuf::from(
            text.trim_start_matches('\u{feff}')
                .trim_end_matches(['\r', '\n', '\0']),
        );
        if !directory.is_absolute() || !directory.join("config.toml").is_file() {
            return Err(format!("The portable data folder selected in Setup is unavailable: {}. Reconnect it before starting; no empty replacement was created.", directory.display()));
        }
        validate_config(&directory)?;
        return Ok((directory, StorageMode::Custom));
    }
    // Installing over a legacy portable directory must also preserve that data.
    if legacy.join("config.toml").is_file() || legacy.join("cpa-gui.yaml").is_file() {
        return Ok((legacy.to_path_buf(), StorageMode::Portable));
    }
    Ok((user_data.to_path_buf(), StorageMode::User))
}

#[cfg(test)]
fn initialize_at(
    path: &Path,
    legacy: &Path,
    executable: &Path,
) -> Result<(Locator, Vec<AppInstanceGuard>)> {
    initialize_at_with_pending(path, legacy, executable, true)
}

#[cfg(test)]
fn initialize_at_with_pending(
    path: &Path,
    legacy: &Path,
    executable: &Path,
    apply_pending: bool,
) -> Result<(Locator, Vec<AppInstanceGuard>)> {
    initialize_at_with_mode(
        path,
        legacy,
        executable,
        apply_pending,
        StorageMode::Portable,
    )
}

fn initialize_at_with_mode(
    path: &Path,
    legacy: &Path,
    executable: &Path,
    apply_pending: bool,
    initial_mode: StorageMode,
) -> Result<(Locator, Vec<AppInstanceGuard>)> {
    let mut guards = Vec::new();
    let mut locator = if path.exists() {
        load_locator(path)?
    } else {
        fs::create_dir_all(legacy).map_err(error)?;
        validate_config(legacy)?;
        let directory = fs::canonicalize(legacy).map_err(error)?;
        let marker = directory.join(MARKER);
        let id = if marker.exists() {
            read_json(&marker)?
        } else {
            let id = unique_id()?;
            write_json(&marker, &id)?;
            id
        };
        Locator {
            version: 1,
            active: Profile {
                mode: initial_mode,
                directory,
                id,
            },
            pending: None,
            last_result: None,
            last_error: None,
        }
    };
    if crate::app_instance_key(&locator.active.directory) != crate::app_instance_key(executable) {
        guards.push(acquire_app_instance_guard_for(&locator.active.directory)?);
    }
    if let Some(operation) = if apply_pending {
        locator.pending.take()
    } else {
        None
    } {
        // Clear the pending plan durably first. A failed/interrupted copy is never
        // retried as an overwrite, and the last committed profile remains active.
        locator.last_error = Some("The previous storage operation did not complete. The original data folder is still active.".into());
        write_json(path, &locator)?;
        match execute_operation(&locator.active, &operation, &mut guards, executable) {
            Ok((profile, result)) => {
                if let Some(profile) = profile {
                    locator.active = profile;
                }
                locator.last_result = Some(result);
                locator.last_error = None;
            }
            Err(e) => {
                locator.last_error = Some(e);
            }
        }
    }
    // Commit last; all source data and completed snapshots remain available on failure.
    write_json(path, &locator)?;
    Ok((locator, guards))
}

fn execute_operation(
    active: &Profile,
    operation: &Operation,
    guards: &mut Vec<AppInstanceGuard>,
    executable: &Path,
) -> Result<(Option<Profile>, String)> {
    if crate::find_core_binary(&active.directory.join("cpa-core"))
        .is_some_and(|binary| crate::is_core_running(&binary))
    {
        return Err("The proxy is still running. Stop it before retrying the storage operation; the original data folder remains active.".into());
    }
    let destination = match operation {
        Operation::Move { destination, .. }
        | Operation::Backup { destination }
        | Operation::Restore { destination, .. } => destination,
    };
    validate_operation_destination(&active.directory, operation, executable)?;
    if let Operation::Restore { backup, .. } = operation {
        validate_backup(backup)?;
        reject_overlap(backup, destination)?;
    }
    // Reserve a brand-new directory; never merge into or overwrite existing data.
    fs::create_dir(destination).map_err(|e| {
        format!(
            "Cannot create new data folder {}: {e}",
            destination.display()
        )
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(destination, fs::Permissions::from_mode(0o700)).map_err(error)?;
    }
    if crate::app_instance_key(destination) != crate::app_instance_key(executable) {
        guards.push(acquire_app_instance_guard_for(destination)?);
    }
    let stage = destination.join(".storage-staging");
    fs::create_dir(&stage).map_err(error)?;
    // Failed staging folders are retained for inspection, never activated.
    match operation {
        Operation::Restore { backup, .. } => {
            let manifest = validate_backup(backup)?;
            for entry in &manifest.files {
                copy_file(&backup.join(&entry.path), &stage.join(&entry.path))?;
            }
            write_json(&stage.join(MANIFEST), &manifest)?;
            validate_backup(&stage)?;
        }
        _ => {
            create_snapshot(&active.directory, &stage)?;
        }
    }
    // Publish the verified data inside the reserved destination. The locator is
    // still pointing at the source until every rename and profile write succeeds.
    for entry in fs::read_dir(&stage).map_err(error)? {
        let entry = entry.map_err(error)?;
        fs::rename(entry.path(), destination.join(entry.file_name())).map_err(error)?;
    }
    fs::remove_dir(&stage).map_err(error)?;
    if matches!(operation, Operation::Backup { .. }) {
        return Ok((
            None,
            format!("Verified backup created: {}", destination.display()),
        ));
    }
    // A working database changes after startup; its snapshot manifest must not be
    // mistaken for an immutable backup. The original folder is the recovery copy.
    fs::remove_file(destination.join(MANIFEST)).map_err(error)?;
    let id = unique_id()?;
    write_json(&destination.join(MARKER), &id)?;
    let mode = match operation {
        Operation::Move { mode, .. } => mode.clone(),
        _ => StorageMode::Custom,
    };
    let profile = Profile {
        mode,
        directory: fs::canonicalize(destination).map_err(error)?,
        id,
    };
    validate_profile(&profile)?;
    Ok((
        Some(profile),
        format!(
            "Data folder changed. Original data retained at {}",
            active.directory.display()
        ),
    ))
}

fn canonical_target(path: &Path) -> Result<PathBuf> {
    if !path.is_absolute() || path.components().any(|p| matches!(p, Component::ParentDir)) {
        return Err("Choose an absolute folder path without '..'".into());
    }
    if path.exists() {
        return fs::canonicalize(path).map_err(error);
    }
    let parent = path.parent().ok_or("Folder has no parent")?;
    let parent = fs::canonicalize(parent)
        .map_err(|_| "The destination's parent folder must already exist".to_string())?;
    Ok(parent.join(path.file_name().ok_or("Folder has no name")?))
}
fn reject_overlap(source: &Path, destination: &Path) -> Result<()> {
    let source = canonical_target(source)?;
    let destination = canonical_target(destination)?;
    // Case-fold on Windows even for the not-yet-created last component.
    #[cfg(windows)]
    let (source, destination) = (
        PathBuf::from(source.to_string_lossy().to_lowercase()),
        PathBuf::from(destination.to_string_lossy().to_lowercase()),
    );
    if source.starts_with(&destination) || destination.starts_with(&source) {
        return Err("Choose a destination outside the current data and backup folders".into());
    }
    Ok(())
}
fn validate_destination(source: &Path, destination: &Path) -> Result<()> {
    reject_overlap(source, destination)?;
    if destination.exists() {
        return Err("Destination already exists. Choose a new folder name; existing data will never be overwritten.".into());
    }
    Ok(())
}
fn validate_operation_destination(
    source: &Path,
    operation: &Operation,
    executable: &Path,
) -> Result<()> {
    let destination = match operation {
        Operation::Move { destination, .. }
        | Operation::Backup { destination }
        | Operation::Restore { destination, .. } => destination,
    };
    // The explicit portable data/ child is safe because snapshots copy only the
    // allowlisted data entries, never the installation's data/ or app binaries.
    if matches!(
        operation,
        Operation::Move {
            mode: StorageMode::Portable,
            ..
        }
    ) && canonical_target(source)? == canonical_target(executable)?
        && canonical_target(destination)? == canonical_target(&executable.join("data"))?
    {
        if destination.exists() {
            return Err("Portable data folder already exists; it will not be overwritten".into());
        }
        return Ok(());
    }
    validate_destination(source, destination)
}
fn no_link(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path).map_err(error)?;
    let mut linked = metadata.file_type().is_symlink();
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        linked |= metadata.file_attributes() & 0x400 != 0;
    }
    if linked {
        return Err(format!(
            "Linked folders/files cannot be copied safely: {}",
            path.display()
        ));
    }
    if !metadata.is_file() && !metadata.is_dir() {
        return Err(format!("Unsupported file type: {}", path.display()));
    }
    Ok(())
}
fn copy_file(source: &Path, destination: &Path) -> Result<()> {
    no_link(source)?;
    let expected = hash_file(source)?;
    fs::create_dir_all(destination.parent().ok_or("Missing parent folder")?).map_err(error)?;
    fs::copy(source, destination).map_err(|e| format!("Cannot copy {}: {e}", source.display()))?;
    fs::OpenOptions::new()
        .write(true)
        .open(destination)
        .and_then(|file| file.sync_all())
        .map_err(error)?;
    if hash_file(destination)? != expected {
        return Err(format!(
            "Copied file failed verification: {}",
            source.display()
        ));
    }
    Ok(())
}
fn copy_tree(source: &Path, destination: &Path) -> Result<()> {
    no_link(source)?;
    if source.is_dir() {
        fs::create_dir_all(destination).map_err(error)?;
        for entry in fs::read_dir(source).map_err(error)? {
            let entry = entry.map_err(error)?;
            let name = entry.file_name();
            if source.file_name().is_some_and(|n| n == "usage-records")
                && (name == "usage.db-wal" || name == "usage.db-shm")
            {
                continue;
            }
            copy_tree(&entry.path(), &destination.join(name))?;
        }
    } else if source.file_name().is_some_and(|n| n == "usage.db")
        && source
            .parent()
            .and_then(Path::file_name)
            .is_some_and(|n| n == "usage-records")
    {
        let connection =
            Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(error)?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(error)?;
        connection
            .backup(DatabaseName::Main, destination, None)
            .map_err(error)?;
        Connection::open(destination)
            .and_then(|db| db.execute_batch("PRAGMA journal_mode=DELETE;"))
            .map_err(error)?;
        check_database(destination)?;
        fs::OpenOptions::new()
            .write(true)
            .open(destination)
            .and_then(|file| file.sync_all())
            .map_err(error)?;
    } else {
        copy_file(source, destination)?;
    }
    Ok(())
}
fn check_database(path: &Path) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }
    let connection =
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(error)?;
    let result: String = connection
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(error)?;
    if result != "ok" {
        return Err("Usage database failed its integrity check".into());
    }
    Ok(())
}
fn hash_file(path: &Path) -> Result<(String, u64)> {
    let mut file = fs::File::open(path).map_err(error)?;
    let mut hash = Sha256::new();
    let mut bytes = 0;
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer).map_err(error)?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
        bytes += count as u64;
    }
    Ok((format!("{:x}", hash.finalize()), bytes))
}
fn inventory(root: &Path, directory: &Path, files: &mut Vec<BackupFile>) -> Result<()> {
    for entry in fs::read_dir(directory).map_err(error)? {
        let path = entry.map_err(error)?.path();
        no_link(&path)?;
        if path.is_dir() {
            inventory(root, &path, files)?;
        } else {
            let relative = path.strip_prefix(root).map_err(error)?.to_path_buf();
            if relative == Path::new(MANIFEST) {
                continue;
            }
            let (sha256, bytes) = hash_file(&path)?;
            files.push(BackupFile {
                path: relative,
                sha256,
                bytes,
            });
        }
    }
    Ok(())
}
fn create_snapshot(source: &Path, destination: &Path) -> Result<()> {
    validate_config(source)?;
    for name in DATA_ENTRIES {
        // The configured OAuth folder is copied below, including external folders.
        if *name == "oauth" {
            continue;
        }
        let path = source.join(name);
        if path.exists() {
            copy_tree(&path, &destination.join(name))?;
        }
    }
    let config_path = source.join("config.toml");
    if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(error)?;
        let config: crate::GuiConfigFile =
            toml::from_str(&content).map_err(|_| "Invalid configuration".to_string())?;
        let auth = crate::auth_dir_path_for_core(&config.auth_dir, &source.join("cpa-core"))?;
        if auth.exists() {
            copy_tree(&auth, &destination.join("oauth"))?;
        } else {
            return Err(format!(
                "Credential folder is unavailable: {}",
                auth.display()
            ));
        }
        // Snapshots are self-contained. Rebase credentials to the copied OAuth
        // folder; never leave a relative path pointing at an old installation.
        let mut document = content
            .parse::<toml_edit::Document>()
            .map_err(|_| "Invalid configuration".to_string())?;
        document["auth-dir"] = toml_edit::value("../oauth");
        document["auth-dir-user-selected"] = toml_edit::value(false);
        crate::write_bytes_atomically(
            &destination.join("config.toml"),
            document.to_string().as_bytes(),
        )?;
        let core_config = destination.join("cpa-core/config.yaml");
        if core_config.exists() {
            let mut yaml: serde_yaml::Value =
                serde_yaml::from_slice(&fs::read(&core_config).map_err(error)?)
                    .map_err(|_| "Invalid core configuration".to_string())?;
            let mapping = yaml
                .as_mapping_mut()
                .ok_or("Core configuration must be a mapping")?;
            let oauth = mapping
                .entry(serde_yaml::Value::String("oauth".into()))
                .or_insert_with(|| serde_yaml::Value::Mapping(Default::default()));
            oauth
                .as_mapping_mut()
                .ok_or("Core OAuth configuration must be a mapping")?
                .insert(
                    serde_yaml::Value::String("auth-dir".into()),
                    serde_yaml::Value::String("../oauth".into()),
                );
            if let Some(auth) = mapping.get_mut(serde_yaml::Value::String("auth-dir".into())) {
                *auth = serde_yaml::Value::String("../oauth".into());
            }
            crate::write_bytes_atomically(
                &core_config,
                serde_yaml::to_string(&yaml).map_err(error)?.as_bytes(),
            )?;
        }
    } else {
        return Err("Open the application once to initialize config.toml before backing up or changing storage".into());
    }
    let mut files = Vec::new();
    inventory(destination, destination, &mut files)?;
    let manifest = BackupManifest {
        version: 1,
        app_version: env!("CARGO_PKG_VERSION").into(),
        created_at: chrono::Utc::now().to_rfc3339(),
        files,
    };
    write_json(&destination.join(MANIFEST), &manifest)?;
    validate_backup(destination)?;
    Ok(())
}
fn validate_backup(root: &Path) -> Result<BackupManifest> {
    no_link(root)?;
    no_link(&root.join(MANIFEST))?;
    let manifest: BackupManifest = read_json(&root.join(MANIFEST))?;
    if manifest.version != 1 || manifest.files.is_empty() {
        return Err("Unsupported or empty backup".into());
    }
    if semver::Version::parse(&manifest.app_version).map_err(error)?
        > semver::Version::parse(env!("CARGO_PKG_VERSION")).map_err(error)?
    {
        return Err(
            "Install the same or a newer application version before restoring this backup".into(),
        );
    }
    let mut expected = std::collections::HashSet::new();
    for entry in &manifest.files {
        if entry
            .path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
            || entry.path.as_os_str().is_empty()
        {
            return Err("Backup contains an unsafe file path".into());
        }
        let first = entry.path.components().next().unwrap().as_os_str();
        if !DATA_ENTRIES.iter().any(|name| first == *name) || !expected.insert(entry.path.clone()) {
            return Err("Backup contains an unexpected or duplicate file".into());
        }
    }
    let mut actual = Vec::new();
    inventory(root, root, &mut actual)?;
    if actual.len() != manifest.files.len() {
        return Err("Backup file list does not match its manifest".into());
    }
    let actual = actual
        .into_iter()
        .map(|file| (file.path.clone(), file))
        .collect::<std::collections::HashMap<_, _>>();
    for entry in &manifest.files {
        let found = actual.get(&entry.path).ok_or("Backup file is missing")?;
        if found.sha256 != entry.sha256 || found.bytes != entry.bytes {
            return Err(format!(
                "Backup checksum mismatch: {}",
                entry.path.display()
            ));
        }
    }
    if !root.join("config.toml").is_file() {
        return Err("Backup has no application configuration".into());
    }
    validate_config(root)?;
    check_database(&root.join("usage-records/usage.db"))?;
    Ok(manifest)
}

#[tauri::command]
pub(crate) fn get_data_storage_settings() -> Result<StorageSettings> {
    let path = locator_path()?;
    let locator = load_locator(&path)?;
    Ok(StorageSettings {
        mode: locator.active.mode,
        directory: locator.active.directory,
        user_directory: settings_home()?.join("data"),
        application_directory: crate::executable_dir()?,
        locator: path,
        pending: locator.pending,
        last_result: locator.last_result,
        last_error: locator.last_error,
    })
}

#[tauri::command]
pub(crate) async fn schedule_storage_operation(operation: Operation) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = locator_path()?;
        let _guard = lock_locator(&path)?;
        let mut locator = load_locator(&path)?;
        if Some(locator.active.directory.clone()) != resolved_directory() {
            return Err(
                "Storage selection changed in another app. Restart before continuing.".into(),
            );
        }
        if locator.pending.is_some() {
            return Err("A storage operation is already scheduled".into());
        }
        validate_operation_destination(
            &locator.active.directory,
            &operation,
            &crate::executable_dir()?,
        )?;
        if let Operation::Move { mode, destination } = &operation {
            let expected = match mode {
                StorageMode::User => Some(settings_home()?.join("data")),
                StorageMode::Portable => Some(crate::executable_dir()?.join("data")),
                StorageMode::Custom => None,
            };
            if expected.as_ref().is_some_and(|p| p != destination) {
                return Err("Invalid destination for the selected storage mode".into());
            }
        }
        if let Operation::Restore {
            backup,
            destination,
        } = &operation
        {
            validate_backup(backup)?;
            reject_overlap(backup, destination)?;
        }
        locator.pending = Some(operation);
        locator.last_error = None;
        write_json(&path, &locator)
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub(crate) fn cancel_storage_operation() -> Result<()> {
    let path = locator_path()?;
    let _guard = lock_locator(&path)?;
    let mut locator = load_locator(&path)?;
    locator.pending = None;
    write_json(&path, &locator)
}

#[tauri::command]
pub(crate) fn open_data_directory(app: tauri::AppHandle) -> Result<()> {
    app.opener()
        .open_path(crate::core_base_dir()?.to_string_lossy(), None::<&str>)
        .map_err(error)
}

#[tauri::command]
pub(crate) fn restart_for_storage_operation(app: tauri::AppHandle) -> Result<()> {
    if load_locator(&locator_path()?)?.pending.is_none() {
        return Err("No storage operation is scheduled".into());
    }
    // Ordinary exit can be deferred by the existing graceful core shutdown handler.
    // Tauri's direct RESTART_EXIT_CODE cannot be prevented, so request it only after
    // that handler has finished stopping the managed proxy.
    RESTART_REQUESTED.store(true, std::sync::atomic::Ordering::Release);
    app.exit(0);
    Ok(())
}

pub(crate) fn show_startup_error(message: &str) {
    use tauri_plugin_dialog::DialogExt;
    eprintln!("{message}");
    if let Ok(app) = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .build(tauri::generate_context!())
    {
        app.dialog()
            .message(message)
            .title("EasyCLIProxyAPI — data folder unavailable")
            .blocking_show();
    }
}

#[cfg(test)]
mod tests;
