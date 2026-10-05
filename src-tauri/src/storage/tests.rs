use super::*;

#[test]
fn installer_defaults_to_user_data_and_keeps_portable_import_unicode_paths() {
    let fixture = Fixture::new();
    let installed = fixture.root.join("installed");
    fs::create_dir(&installed).unwrap();
    write_json(
        &installed.join("installation.json"),
        &serde_json::json!({"schemaVersion": 1, "distribution": "installer"}),
    )
    .unwrap();
    let user_data = fixture.root.join("user-data");
    let (directory, mode) = initial_storage_directory(&installed, &installed, &user_data).unwrap();
    assert_eq!(directory, user_data);
    assert_eq!(mode, StorageMode::User);
    let portable = fixture.root.join("portable 日本語");
    fs::create_dir(&portable).unwrap();
    fs::write(portable.join("config.toml"), "auth-dir = '../oauth'\n").unwrap();
    let bytes = portable
        .to_string_lossy()
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect::<Vec<_>>();
    fs::write(installed.join("initial-data-directory.txt"), bytes).unwrap();
    let (directory, mode) = initial_storage_directory(&installed, &installed, &user_data).unwrap();
    assert_eq!(directory, portable);
    assert_eq!(mode, StorageMode::Custom);
    fs::remove_file(portable.join("config.toml")).unwrap();
    assert!(initial_storage_directory(&installed, &installed, &user_data).is_err());
    assert!(!user_data.exists());
}

#[test]
fn reinstall_keeps_saved_profile_and_legacy_in_place_data() {
    let fixture = Fixture::new();
    write_json(
        &fixture.source.join("installation.json"),
        &serde_json::json!({"schemaVersion": 1, "distribution": "installer"}),
    )
    .unwrap();
    let user_data = fixture.root.join("new-default");
    let (directory, mode) =
        initial_storage_directory(&fixture.source, &fixture.source, &user_data).unwrap();
    assert_eq!(directory, fixture.source);
    assert_eq!(mode, StorageMode::Portable);
    let installed = fixture.root.join("installed");
    fs::create_dir(&installed).unwrap();
    let (locator, _guards) = initialize_at_with_mode(
        &fixture.locator,
        &user_data,
        &installed,
        false,
        StorageMode::User,
    )
    .unwrap();
    assert_eq!(
        locator.active.directory,
        fs::canonicalize(&fixture.source).unwrap()
    );
    assert_data(&locator.active.directory, 12345);
    assert!(!user_data.exists());
}

struct Fixture {
    root: PathBuf,
    source: PathBuf,
    locator: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("cpa-storage-test-{}", unique_id().unwrap()));
        let source = root.join("old-app");
        fs::create_dir_all(source.join("oauth")).unwrap();
        fs::create_dir_all(source.join("usage-records")).unwrap();
        fs::create_dir_all(source.join("cpa-core/plugins")).unwrap();
        fs::write(
            source.join("config.toml"),
            "auth-dir = '../oauth'\nusage-statistics-enabled = true\n",
        )
        .unwrap();
        fs::write(
            source.join("oauth/account.json"),
            "{\"fixture\":\"credential\"}",
        )
        .unwrap();
        fs::write(
            source.join("cpa-core/config.yaml"),
            "oauth:\n  auth-dir: ../oauth\n",
        )
        .unwrap();
        fs::write(source.join("cpa-core/plugins/local.txt"), "plugin settings").unwrap();
        fs::write(source.join("EasyCLIProxyAPI.exe"), "old executable").unwrap();
        let connection = Connection::open(source.join("usage-records/usage.db")).unwrap();
        connection.execute_batch("CREATE TABLE usage_events (tokens INTEGER); INSERT INTO usage_events VALUES (12345); CREATE TABLE subscription_value_fees (month TEXT, fee REAL); INSERT INTO subscription_value_fees VALUES ('2026-10', 20.0); CREATE TABLE model_prices (model TEXT, price REAL); INSERT INTO model_prices VALUES ('claude', 3.0);").unwrap();
        let locator = root.join("storage.json");
        let fixture = Self {
            root,
            source,
            locator,
        };
        fixture.start();
        fixture
    }
    fn start(&self) -> Locator {
        initialize_at(&self.locator, &self.source, &self.source)
            .unwrap()
            .0
    }
    fn schedule(&self, operation: Operation) {
        let mut locator = load_locator(&self.locator).unwrap();
        locator.pending = Some(operation);
        write_json(&self.locator, &locator).unwrap();
    }
    fn backup(&self) -> PathBuf {
        let destination = self.root.join("backup");
        self.schedule(Operation::Backup {
            destination: destination.clone(),
        });
        let result = self.start();
        assert_eq!(result.last_error, None);
        destination
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}
fn assert_data(root: &Path, tokens: i64) {
    let connection = Connection::open(root.join("usage-records/usage.db")).unwrap();
    assert_eq!(
        connection
            .query_row("SELECT sum(tokens) FROM usage_events", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        tokens
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT fee FROM subscription_value_fees WHERE month='2026-10'",
                [],
                |r| r.get::<_, f64>(0)
            )
            .unwrap(),
        20.0
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT price FROM model_prices WHERE model='claude'",
                [],
                |r| r.get::<_, f64>(0)
            )
            .unwrap(),
        3.0
    );
    assert_eq!(
        fs::read_to_string(root.join("oauth/account.json")).unwrap(),
        "{\"fixture\":\"credential\"}"
    );
    assert_eq!(
        fs::read_to_string(root.join("cpa-core/plugins/local.txt")).unwrap(),
        "plugin settings"
    );
}

#[test]
fn new_build_directory_reuses_saved_profile_and_all_history() {
    let fixture = Fixture::new();
    let new_app = fixture.root.join("new-app");
    fs::create_dir(&new_app).unwrap();
    fs::write(new_app.join("EasyCLIProxyAPI.exe"), "new executable").unwrap();
    let (locator, _guards) = initialize_at(&fixture.locator, &new_app, &new_app).unwrap();
    assert_eq!(
        locator.active.directory,
        fs::canonicalize(&fixture.source).unwrap()
    );
    assert_data(&locator.active.directory, 12345);
    assert!(!new_app.join("config.toml").exists());
}

#[test]
fn migration_captures_wal_fees_prices_credentials_and_leaves_source() {
    let fixture = Fixture::new();
    let connection = Connection::open(fixture.source.join("usage-records/usage.db")).unwrap();
    connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; INSERT INTO usage_events VALUES (55);").unwrap();
    assert!(fixture.source.join("usage-records/usage.db-wal").is_file());
    let destination = fixture.root.join("user-data");
    fixture.schedule(Operation::Move {
        mode: StorageMode::User,
        destination: destination.clone(),
    });
    let result = fixture.start();
    assert_eq!(result.last_error, None);
    assert_eq!(
        result.active.directory,
        fs::canonicalize(&destination).unwrap()
    );
    assert_data(&destination, 12400);
    assert_data(&fixture.source, 12400);
    assert!(!destination.join("EasyCLIProxyAPI.exe").exists());
    assert!(!destination.join(MANIFEST).exists());
    assert!(destination.join(MARKER).is_file());
}

#[test]
fn backup_and_restore_are_verified_and_never_merge_histories() {
    let fixture = Fixture::new();
    let backup = fixture.backup();
    validate_backup(&backup).unwrap();
    assert_data(&backup, 12345);
    let connection = Connection::open(fixture.source.join("usage-records/usage.db")).unwrap();
    connection
        .execute("INSERT INTO usage_events VALUES (20)", [])
        .unwrap();
    drop(connection);
    let destination = fixture.root.join("restored");
    fixture.schedule(Operation::Restore {
        backup,
        destination: destination.clone(),
    });
    let result = fixture.start();
    assert_eq!(result.last_error, None);
    assert_data(&destination, 12345);
    assert_data(&fixture.source, 12365);
}

#[test]
fn backup_rebases_external_credentials_without_modifying_original_settings() {
    let fixture = Fixture::new();
    let external = fixture.root.join("external-auth");
    fs::create_dir(&external).unwrap();
    fs::write(external.join("external.json"), "external credential").unwrap();
    let content = "auth-dir = '../../external-auth'\nauth-dir-user-selected = true\n";
    fs::write(fixture.source.join("config.toml"), content).unwrap();
    let backup = fixture.backup();
    assert_eq!(
        fs::read_to_string(backup.join("oauth/external.json")).unwrap(),
        "external credential"
    );
    assert!(!backup.join("oauth/account.json").exists());
    assert_eq!(
        fs::read_to_string(fixture.source.join("config.toml")).unwrap(),
        content
    );
    let copied: crate::GuiConfigFile =
        toml::from_str(&fs::read_to_string(backup.join("config.toml")).unwrap()).unwrap();
    assert_eq!(copied.auth_dir, "../oauth");
    assert!(!copied.auth_dir_user_selected);
}

#[test]
fn missing_saved_data_folder_does_not_create_an_empty_replacement() {
    let fixture = Fixture::new();
    let saved = fixture.root.join("source-kept");
    fs::rename(&fixture.source, &saved).unwrap();
    let newer = fixture.root.join("new-app");
    fs::create_dir(&newer).unwrap();
    assert!(initialize_at(&fixture.locator, &newer, &newer).is_err());
    assert!(!newer.join("config.toml").exists());
    assert!(!fixture.source.exists());
    assert_data(&saved, 12345);
}

#[test]
fn failed_copy_keeps_old_profile_and_clears_pending_without_overwriting() {
    let fixture = Fixture::new();
    fs::write(
        fixture.source.join("cpa-core/config.yaml"),
        "oauth: [invalid",
    )
    .unwrap();
    let destination = fixture.root.join("incomplete");
    fixture.schedule(Operation::Move {
        mode: StorageMode::Custom,
        destination: destination.clone(),
    });
    let result = fixture.start();
    assert!(result.last_error.is_some());
    assert_eq!(
        result.active.directory,
        fs::canonicalize(&fixture.source).unwrap()
    );
    assert!(result.pending.is_none());
    assert!(!destination.join(MARKER).exists());
    assert_data(&fixture.source, 12345);
    // Restart again does not retry the partially completed operation.
    assert_eq!(fixture.start().active.directory, result.active.directory);
}

#[test]
fn existing_destination_is_never_overwritten() {
    let fixture = Fixture::new();
    let destination = fixture.root.join("occupied");
    fs::create_dir(&destination).unwrap();
    fs::write(destination.join("keep.txt"), "keep me").unwrap();
    fixture.schedule(Operation::Move {
        mode: StorageMode::Custom,
        destination: destination.clone(),
    });
    assert!(fixture.start().last_error.is_some());
    assert_eq!(
        fs::read_to_string(destination.join("keep.txt")).unwrap(),
        "keep me"
    );
}

#[test]
fn corrupted_backup_or_traversal_is_rejected_before_destination_creation() {
    let fixture = Fixture::new();
    let backup = fixture.backup();
    fs::write(backup.join("oauth/account.json"), "tampered").unwrap();
    let destination = fixture.root.join("restored");
    fixture.schedule(Operation::Restore {
        backup: backup.clone(),
        destination: destination.clone(),
    });
    assert!(fixture.start().last_error.unwrap().contains("checksum"));
    assert!(!destination.exists());
    let mut manifest: BackupManifest = read_json(&backup.join(MANIFEST)).unwrap();
    manifest.files[0].path = PathBuf::from("../outside");
    write_json(&backup.join(MANIFEST), &manifest).unwrap();
    assert!(validate_backup(&backup).err().unwrap().contains("unsafe"));
}

#[test]
fn unavailable_credentials_fail_copy_instead_of_silently_losing_sign_ins() {
    let fixture = Fixture::new();
    fs::write(
        fixture.source.join("config.toml"),
        "auth-dir = '../../disconnected-disk'\n",
    )
    .unwrap();
    let destination = fixture.root.join("new-data");
    fixture.schedule(Operation::Move {
        mode: StorageMode::Custom,
        destination,
    });
    let result = fixture.start();
    assert!(result
        .last_error
        .unwrap()
        .contains("Credential folder is unavailable"));
    assert_eq!(
        result.active.directory,
        fs::canonicalize(&fixture.source).unwrap()
    );
}

#[test]
fn portable_subfolder_migration_excludes_app_and_does_not_recurse() {
    let fixture = Fixture::new();
    let destination = fixture.source.join("data");
    fixture.schedule(Operation::Move {
        mode: StorageMode::Portable,
        destination: destination.clone(),
    });
    assert_eq!(fixture.start().last_error, None);
    assert_data(&destination, 12345);
    assert!(!destination.join("data").exists());
    assert!(!destination.join("EasyCLIProxyAPI.exe").exists());
}

#[test]
fn shared_profile_is_locked_across_different_executable_folders() {
    let fixture = Fixture::new();
    let new_app = fixture.root.join("new-app");
    fs::create_dir(&new_app).unwrap();
    let (_locator, _guards) = initialize_at(&fixture.locator, &new_app, &new_app).unwrap();
    assert!(initialize_at(&fixture.locator, &new_app, &new_app).is_err());
}

#[test]
fn invalid_config_and_wrong_profile_identity_fail_closed() {
    let fixture = Fixture::new();
    fs::write(fixture.source.join("config.toml"), "invalid [ config").unwrap();
    assert!(load_locator(&fixture.locator).is_err());
    assert_eq!(
        fs::read_to_string(fixture.source.join("config.toml")).unwrap(),
        "invalid [ config"
    );
    fs::write(fixture.source.join("config.toml"), "").unwrap();
    write_json(&fixture.source.join(MARKER), &"other-profile").unwrap();
    assert!(load_locator(&fixture.locator)
        .err()
        .unwrap()
        .contains("different storage profile"));
}

#[test]
fn newer_backup_missing_files_and_nested_destinations_are_rejected() {
    let fixture = Fixture::new();
    let backup = fixture.backup();
    assert!(validate_destination(&fixture.source, &fixture.source.join("oauth/child")).is_err());
    assert!(validate_destination(&fixture.source, &fixture.root.join("../outside")).is_err());
    let mut manifest: BackupManifest = read_json(&backup.join(MANIFEST)).unwrap();
    manifest.app_version = "999.0.0".into();
    write_json(&backup.join(MANIFEST), &manifest).unwrap();
    assert!(validate_backup(&backup)
        .err()
        .unwrap()
        .contains("newer application"));
    manifest.app_version = env!("CARGO_PKG_VERSION").into();
    write_json(&backup.join(MANIFEST), &manifest).unwrap();
    fs::remove_file(backup.join("oauth/account.json")).unwrap();
    assert!(validate_backup(&backup).is_err());
}

#[test]
fn bundled_core_version_comes_from_new_executable_before_saved_data() {
    let source = Path::new("old-data");
    let executable = Path::new("new-app");
    let locations = crate::bundled_core_locations(source, executable);
    assert_eq!(locations[0].0, executable.join("core-version.txt"));
}

#[test]
fn update_acknowledgment_defers_scheduled_copy_until_next_start() {
    let fixture = Fixture::new();
    let destination = fixture.root.join("backup");
    fixture.schedule(Operation::Backup {
        destination: destination.clone(),
    });
    let (locator, _guards) =
        initialize_at_with_pending(&fixture.locator, &fixture.source, &fixture.source, false)
            .unwrap();
    assert!(locator.pending.is_some());
    assert!(!destination.exists());
    assert_eq!(fixture.start().last_error, None);
    assert_data(&destination, 12345);
}

#[test]
fn scalar_core_config_is_rejected_without_panic_or_profile_switch() {
    let fixture = Fixture::new();
    fs::write(
        fixture.source.join("cpa-core/config.yaml"),
        "oauth: invalid-scalar",
    )
    .unwrap();
    fixture.schedule(Operation::Backup {
        destination: fixture.root.join("backup"),
    });
    assert!(fixture
        .start()
        .last_error
        .unwrap()
        .contains("must be a mapping"));
}

#[cfg(unix)]
#[test]
fn backup_does_not_follow_symbolic_links() {
    let fixture = Fixture::new();
    std::os::unix::fs::symlink(
        fixture.source.join("config.toml"),
        fixture.source.join("oauth/link.json"),
    )
    .unwrap();
    let destination = fixture.root.join("backup");
    fixture.schedule(Operation::Backup {
        destination: destination.clone(),
    });
    assert!(fixture.start().last_error.unwrap().contains("Linked"));
    assert!(!destination.join(MANIFEST).exists());
}
