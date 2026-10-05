//! Custom subscription analytics. Keep account/fee persistence independent of upstream usage schema.
use super::*;
use chrono::{Datelike, NaiveDate, TimeZone};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountSeed {
    provider: String,
    auth_index: String,
    name: String,
    label: String,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubscriptionValue {
    month: String,
    accounts: Vec<ValueAccount>,
    other_requests: u64,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValueAccount {
    id: String,
    provider: String,
    label: String,
    current: bool,
    monthly_fee_cents: Option<i64>,
    requests: u64,
    priced_requests: u64,
    estimated_cost: f64,
    models: BTreeMap<String, ValueTotals>,
    days: BTreeMap<String, ValueTotals>,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValueTotals {
    requests: u64,
    priced_requests: u64,
    estimated_cost: f64,
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_creation_tokens: u64,
}

impl ValueTotals {
    fn add(&mut self, group: &UsageCostGroup, cost: Option<f64>) {
        self.requests += group.requests;
        self.priced_requests += if cost.is_some() { group.requests } else { 0 };
        self.estimated_cost += cost.unwrap_or(0.0);
        self.input_tokens += group.tokens.input;
        self.output_tokens += group.tokens.output;
        self.cache_read_tokens += group.tokens.cache_read;
        self.cache_creation_tokens += group.tokens.cache_creation;
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FeeChange {
    account_id: String,
    // Null explicitly clears the fee from this month onward; zero is a known free plan.
    monthly_fee_cents: Option<i64>,
}

fn schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS subscription_value_accounts (
        id TEXT PRIMARY KEY, provider TEXT NOT NULL, auth_index TEXT NOT NULL,
        name TEXT NOT NULL, label TEXT NOT NULL, current INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS subscription_value_fees (
        account_id TEXT NOT NULL, effective_month TEXT NOT NULL, amount_cents INTEGER,
        PRIMARY KEY(account_id, effective_month));",
        )
        .map_err(|e| format!("Failed to initialize subscription value storage: {e}"))
}

fn provider_id(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "anthropic" => "claude".into(),
        "openai" => "codex".into(),
        "anti-gravity" => "antigravity".into(),
        "cognition" => "devin".into(),
        other => other.into(),
    }
}

fn account_id(provider: &str, auth_index: &str, source: &str) -> String {
    // Never return/store a raw source key as the identifier. Provider scoping keeps
    // Claude models used through Antigravity on their Google subscription.
    let (kind, identity) = if auth_index.trim().is_empty() {
        ("source", source.trim())
    } else {
        ("index", auth_index.trim())
    };
    hash_text(&format!("{}|{kind}|{identity}", provider_id(provider)))
}

fn month_bounds(month: &str) -> Result<(i64, i64), String> {
    if month.len() != 7 {
        return Err("Month must be YYYY-MM".into());
    }
    let start = NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d")
        .map_err(|_| "Month must be YYYY-MM".to_string())?;
    if start.year() < 1970 || start.year() > 9998 || start.format("%Y-%m").to_string() != month {
        return Err("Month is out of range".into());
    }
    let next = if start.month() == 12 {
        NaiveDate::from_ymd_opt(start.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(start.year(), start.month() + 1, 1)
    }
    .unwrap();
    let local = |date: NaiveDate| {
        Local
            .from_local_datetime(&date.and_hms_opt(0, 0, 0).unwrap())
            .earliest()
            .map(|d| d.timestamp_millis())
            .ok_or_else(|| "Month boundary unavailable in local timezone".to_string())
    };
    Ok((local(start)?, local(next)?))
}

fn sync_accounts(connection: &Connection, seeds: &[AccountSeed]) -> Result<(), String> {
    // A failed credential fetch must pass None, never an empty successful roster.
    let tx = connection
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;
    tx.execute("UPDATE subscription_value_accounts SET current = 0", [])
        .map_err(|e| e.to_string())?;
    for seed in seeds {
        if seed.provider.trim().is_empty() || seed.name.trim().is_empty() {
            continue;
        }
        let provider = provider_id(&seed.provider);
        let id = account_id(&provider, &seed.auth_index, &seed.name);
        tx.execute("INSERT INTO subscription_value_accounts (id, provider, auth_index, name, label, current)
            VALUES (?1, ?2, ?3, ?4, ?5, 1) ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, label=excluded.label, current=1",
            params![id, provider, seed.auth_index.trim(), seed.name.trim(), seed.label.trim()])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

fn load_accounts(
    connection: &Connection,
    month: &str,
) -> Result<BTreeMap<String, ValueAccount>, String> {
    let mut stmt = connection
        .prepare(
            "SELECT a.id, a.provider, a.label, a.current,
        (SELECT amount_cents FROM subscription_value_fees f WHERE f.account_id=a.id
         AND f.effective_month <= ?1 ORDER BY f.effective_month DESC LIMIT 1)
        FROM subscription_value_accounts a",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([month], |row| {
            Ok(ValueAccount {
                id: row.get(0)?,
                provider: row.get(1)?,
                label: row.get(2)?,
                current: row.get(3)?,
                monthly_fee_cents: row.get(4)?,
                ..Default::default()
            })
        })
        .map_err(|e| e.to_string())?;
    rows.map(|row| row.map(|a| (a.id.clone(), a)))
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())
}

fn fully_priced_cost(group: &UsageCostGroup, prices: &HashMap<String, ModelPrice>) -> Option<f64> {
    let (model, price) = resolve_model_price(&group.model, &group.alias, prices)?;
    let price = enriched_model_price(model, &price);
    let tokens = &group.tokens;
    let needed = [
        (
            tokens
                .input
                .saturating_sub(tokens.cache_read.saturating_add(tokens.cache_creation)),
            price.prompt,
            price.prompt_configured,
        ),
        (tokens.output, price.completion, price.completion_configured),
        (
            tokens.cache_read,
            price.cache_read,
            price.cache_read_configured,
        ),
        (
            tokens.cache_creation,
            price.cache_creation,
            price.cache_creation_configured,
        ),
    ];
    // A missing cache price is not a free token. Explicitly configured zero rates are valid.
    if needed.iter().any(|(tokens, rate, configured)| {
        *tokens > 0 && (!rate.is_finite() || *rate < 0.0 || (!configured && *rate == 0.0))
    }) {
        return None;
    }
    let cost = sum_usage_cost(std::slice::from_ref(group), prices).0;
    cost.is_finite().then_some(cost)
}

fn load_value(
    connection: &Connection,
    month: &str,
    config: &GuiConfigFile,
) -> Result<SubscriptionValue, String> {
    let (start, end) = month_bounds(month)?;
    let prices = load_model_prices(connection)?;
    let mut accounts = load_accounts(connection, month)?;
    let mut aliases: HashMap<(String, String), Vec<String>> = HashMap::new();
    {
        let mut stmt = connection
            .prepare("SELECT id, provider, name FROM subscription_value_accounts")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (id, provider, name) = row.map_err(|e| e.to_string())?;
            aliases.entry((provider, name)).or_default().push(id);
        }
    }
    let long = format!("input_tokens > {LONG_CONTEXT_INPUT_TOKEN_THRESHOLD} OR (input_tokens > {GROK_47_LONG_CONTEXT_INPUT_TOKEN_THRESHOLD} AND {GROK_47_MODEL_SQL})");
    // Aggregate in SQLite, not by loading a limited page of events into the UI.
    // Presence buckets keep partially priced requests from hiding fully priced ones.
    let sql = format!("SELECT source, auth_index, strftime('%Y-%m-%d', timestamp_ms / 1000.0, 'unixepoch', 'localtime'),
        model, alias, service_tier, response_service_tier, executor_type, provider, auth_type, COUNT(*),
        SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens), SUM(cache_creation_tokens),
        SUM(CASE WHEN ({long}) THEN input_tokens ELSE 0 END),
        SUM(CASE WHEN ({long}) THEN output_tokens ELSE 0 END),
        SUM(CASE WHEN ({long}) THEN cache_read_tokens ELSE 0 END),
        SUM(CASE WHEN ({long}) THEN cache_creation_tokens ELSE 0 END), SUM(total_tokens)
        FROM usage_events WHERE timestamp_ms >= ?1 AND timestamp_ms < ?2
        GROUP BY source, auth_index, 3, model, alias, service_tier, response_service_tier, executor_type, provider, auth_type,
        (input_tokens > cache_read_tokens + cache_creation_tokens), (output_tokens > 0),
        (cache_read_tokens > 0), (cache_creation_tokens > 0)");
    let mut stmt = connection.prepare(&sql).map_err(|e| e.to_string())?;
    let groups = stmt
        .query_map(params![start, end], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                UsageCostGroup {
                    model: r.get(3)?,
                    alias: r.get(4)?,
                    service_tier: r.get(5)?,
                    response_service_tier: r.get(6)?,
                    executor_type: r.get(7)?,
                    provider: r.get(8)?,
                    auth_type: r.get(9)?,
                    requests: from_sql_i64(r.get(10)?),
                    tokens: CostTokens {
                        input: from_sql_i64(r.get(11)?),
                        output: from_sql_i64(r.get(12)?),
                        cache_read: from_sql_i64(r.get(13)?),
                        cache_creation: from_sql_i64(r.get(14)?),
                        long_input: from_sql_i64(r.get(15)?),
                        long_output: from_sql_i64(r.get(16)?),
                        long_cache_read: from_sql_i64(r.get(17)?),
                        long_cache_creation: from_sql_i64(r.get(18)?),
                    },
                    total_tokens: from_sql_i64(r.get(19)?),
                },
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut other_requests = 0;
    for row in groups {
        let (source, index, day, group) = row.map_err(|e| e.to_string())?;
        let provider = provider_id(&group.provider);
        let mut id = account_id(&provider, &index, &source);
        let oauth = group.auth_type.trim().eq_ignore_ascii_case("oauth");
        let unspecified =
            group.auth_type.trim().is_empty() || group.auth_type.eq_ignore_ascii_case("unknown");
        // Never infer a subscription from a model name or charge API-key traffic to it.
        if !oauth && !unspecified {
            other_requests += group.requests;
            continue;
        }
        if !accounts.contains_key(&id) {
            if let Some(ids) = aliases
                .get(&(provider.clone(), source.clone()))
                .filter(|ids| ids.len() == 1)
            {
                id = ids[0].clone();
            }
        }
        if (!oauth && !accounts.contains_key(&id))
            || (index.trim().is_empty() && source.trim().is_empty())
        {
            other_requests += group.requests;
            continue;
        }
        let account = accounts.entry(id.clone()).or_insert_with(|| ValueAccount {
            id,
            provider: provider.clone(),
            label: if source.trim().is_empty() {
                format!("{} · {}", provider, &hash_text(&index)[..8])
            } else {
                usage_source_display(config, &group.provider, &source)
            },
            ..Default::default()
        });
        let cost = fully_priced_cost(&group, &prices);
        account.requests += group.requests;
        account.priced_requests += if cost.is_some() { group.requests } else { 0 };
        account.estimated_cost += cost.unwrap_or(0.0);
        account
            .models
            .entry(group.model.clone())
            .or_default()
            .add(&group, cost);
        account.days.entry(day).or_default().add(&group, cost);
    }
    // Retain historical OAuth identities so fees can be assigned while the core is offline.
    for a in accounts.values().filter(|a| a.requests > 0) {
        connection.execute("INSERT OR IGNORE INTO subscription_value_accounts (id, provider, auth_index, name, label, current)
            VALUES (?1, ?2, '', '', ?3, 0)", params![a.id, a.provider, a.label]).map_err(|e| e.to_string())?;
    }
    let mut rows: Vec<_> = accounts
        .into_values()
        .filter(|a| a.current || a.requests > 0 || a.monthly_fee_cents.is_some())
        .collect();
    rows.sort_by(|a, b| {
        b.estimated_cost
            .total_cmp(&a.estimated_cost)
            .then_with(|| a.label.cmp(&b.label))
    });
    Ok(SubscriptionValue {
        month: month.into(),
        accounts: rows,
        other_requests,
    })
}

#[tauri::command]
pub(crate) async fn get_subscription_value(
    month: String,
    accounts: Option<Vec<AccountSeed>>,
    gui_config_state: tauri::State<'_, GuiConfigState>,
) -> Result<SubscriptionValue, String> {
    month_bounds(&month)?;
    let config = gui_config_state.snapshot()?;
    run_usage_task(move || {
        let connection = open_usage_database()?;
        schema(&connection)?;
        if let Some(seeds) = accounts {
            sync_accounts(&connection, &seeds)?;
        }
        load_value(&connection, &month, &config)
    })
    .await
}

fn save_fees(connection: &Connection, month: &str, fees: &[FeeChange]) -> Result<(), String> {
    month_bounds(month)?;
    if fees.iter().any(|f| {
        f.monthly_fee_cents
            .is_some_and(|v| !(0..=100_000_000).contains(&v))
    }) {
        return Err("Monthly fee must be between $0 and $1,000,000".into());
    }
    let tx = connection
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;
    for fee in fees {
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM subscription_value_accounts WHERE id=?1)",
                [&fee.account_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err("Unknown subscription account; refresh and try again".into());
        }
        tx.execute("INSERT INTO subscription_value_fees (account_id, effective_month, amount_cents) VALUES (?1, ?2, ?3)
            ON CONFLICT(account_id, effective_month) DO UPDATE SET amount_cents=excluded.amount_cents",
            params![fee.account_id, month, fee.monthly_fee_cents]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn save_subscription_fees(
    month: String,
    fees: Vec<FeeChange>,
) -> Result<(), String> {
    run_usage_task(move || {
        let connection = open_usage_database()?;
        schema(&connection)?;
        save_fees(&connection, &month, &fees)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        initialize_usage_schema(&c).unwrap();
        schema(&c).unwrap();
        c
    }
    fn seed(provider: &str, index: &str) -> AccountSeed {
        AccountSeed {
            provider: provider.into(),
            auth_index: index.into(),
            name: format!("{index}.json"),
            label: index.into(),
        }
    }
    fn event(
        c: &Connection,
        id: &str,
        provider: &str,
        index: &str,
        model: &str,
        auth: &str,
        day: u32,
    ) {
        let stamp = Local.with_ymd_and_hms(2026, 9, day, 12, 0, 0).unwrap();
        c.execute("INSERT INTO usage_events (event_key,timestamp,timestamp_ms,local_hour,created_at,source,auth_index,provider,model,auth_type,input_tokens,output_tokens,total_tokens)
            VALUES (?1,?2,?3,'','',?4,?5,?6,?7,?8,1000000,1000000,2000000)", params![id,stamp.to_rfc3339(),stamp.timestamp_millis(),format!("{index}.json"),index,provider,model,auth]).unwrap();
    }
    fn price(c: &Connection) {
        c.execute("INSERT INTO model_prices (model,prompt_per_1m,completion_per_1m,cache_per_1m,cache_creation_per_1m,prompt_configured,completion_configured) VALUES ('test-priced',2,5,0,0,1,1)",[]).unwrap();
    }

    #[test]
    fn account_model_and_day_totals_are_scoped_and_missing_prices_are_not_free() {
        let c = database();
        price(&c);
        sync_accounts(
            &c,
            &[
                seed("claude", "one"),
                seed("claude", "idle"),
                seed("antigravity", "one"),
            ],
        )
        .unwrap();
        event(&c, "a", "claude", "one", "test-priced", "oauth", 2);
        event(&c, "b", "antigravity", "one", "test-priced", "oauth", 3);
        event(&c, "c", "claude", "one", "no-price", "oauth", 4);
        event(&c, "d", "claude", "one", "test-priced", "apikey", 4);
        let report = load_value(&c, "2026-09", &GuiConfigFile::default()).unwrap();
        assert_eq!(report.accounts.len(), 3);
        assert_eq!(report.other_requests, 1);
        let a = report
            .accounts
            .iter()
            .find(|a| a.provider == "claude" && a.requests > 0)
            .unwrap();
        assert_eq!(a.requests, 2);
        assert_eq!(a.priced_requests, 1);
        assert_eq!(a.estimated_cost, 11.5);
        assert_eq!(a.models.len(), 2);
        assert_eq!(a.days.values().map(|d| d.estimated_cost).sum::<f64>(), 11.5);
        assert_eq!(a.monthly_fee_cents, None);
        assert!(load_value(&c, "2026-08", &GuiConfigFile::default())
            .unwrap()
            .accounts
            .iter()
            .all(|a| a.requests == 0));
    }

    #[test]
    fn missing_cache_rate_is_excluded_but_explicit_zero_is_priced() {
        let c = database();
        price(&c);
        event(&c, "a", "claude", "one", "test-priced", "oauth", 2);
        event(&c, "b", "claude", "one", "test-priced", "oauth", 2);
        c.execute(
            "UPDATE usage_events SET cache_read_tokens=100 WHERE event_key='b'",
            [],
        )
        .unwrap();
        let report = load_value(&c, "2026-09", &GuiConfigFile::default()).unwrap();
        assert_eq!(report.accounts[0].priced_requests, 1);
        c.execute("UPDATE model_prices SET cache_read_configured=1", [])
            .unwrap();
        let report = load_value(&c, "2026-09", &GuiConfigFile::default()).unwrap();
        assert_eq!(report.accounts[0].priced_requests, 2);
        assert!((report.accounts[0].estimated_cost - 22.9996).abs() < 1e-8);
    }

    #[test]
    fn fees_are_effective_dated_clearable_atomic_and_survive_roster_refresh() {
        let c = database();
        sync_accounts(&c, &[seed("claude", "one")]).unwrap();
        let id = account_id("claude", "one", "");
        let set = |month: &str, amount| {
            save_fees(
                &c,
                month,
                &[FeeChange {
                    account_id: id.clone(),
                    monthly_fee_cents: amount,
                }],
            )
        };
        set("2026-08", Some(20000)).unwrap();
        set("2026-10", Some(10000)).unwrap();
        sync_accounts(&c, &[seed("claude", "one")]).unwrap();
        assert_eq!(
            load_accounts(&c, "2026-09").unwrap()[&id].monthly_fee_cents,
            Some(20000)
        );
        assert_eq!(
            load_accounts(&c, "2026-10").unwrap()[&id].monthly_fee_cents,
            Some(10000)
        );
        set("2026-11", None).unwrap();
        assert_eq!(
            load_accounts(&c, "2026-11").unwrap()[&id].monthly_fee_cents,
            None
        );
        assert!(set("2026-10", Some(-1)).is_err());
        assert!(set("2026-13", Some(1)).is_err());
        assert!(save_fees(
            &c,
            "2026-10",
            &[
                FeeChange {
                    account_id: id.clone(),
                    monthly_fee_cents: Some(1)
                },
                FeeChange {
                    account_id: "missing".into(),
                    monthly_fee_cents: Some(1)
                }
            ]
        )
        .is_err());
        assert_eq!(
            load_accounts(&c, "2026-10").unwrap()[&id].monthly_fee_cents,
            Some(10000)
        );
        sync_accounts(&c, &[]).unwrap();
        let history = load_value(&c, "2026-09", &GuiConfigFile::default()).unwrap();
        assert_eq!(history.accounts.len(), 1);
        assert_eq!(history.accounts[0].monthly_fee_cents, Some(20000));
        assert!(load_value(&c, "2026-11", &GuiConfigFile::default())
            .unwrap()
            .accounts
            .is_empty());
    }

    #[test]
    fn large_history_is_not_paginated_and_tier_estimates_match_existing_pricing() {
        let c = database();
        price(&c);
        event(&c, "template", "codex", "one", "test-priced", "oauth", 2);
        c.execute(
            "UPDATE usage_events SET input_tokens=1000, output_tokens=2000, service_tier='flex'",
            [],
        )
        .unwrap();
        c.execute("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<6000)
            INSERT INTO usage_events (event_key,timestamp,timestamp_ms,local_hour,created_at,source,auth_index,provider,model,auth_type,input_tokens,output_tokens,total_tokens,service_tier)
            SELECT 'copy-'||x,timestamp,timestamp_ms,'','',source,auth_index,provider,model,auth_type,input_tokens,output_tokens,total_tokens,service_tier FROM n,usage_events WHERE event_key='template'",[]).unwrap();
        let report = load_value(&c, "2026-09", &GuiConfigFile::default()).unwrap();
        assert_eq!(report.accounts[0].requests, 6001);
        let (start, end) = month_bounds("2026-09").unwrap();
        let filter = build_usage_filter(&UsageQuery {
            start: Some(DateTime::from_timestamp_millis(start).unwrap().to_rfc3339()),
            end: Some(
                DateTime::from_timestamp_millis(end - 1)
                    .unwrap()
                    .to_rfc3339(),
            ),
            ..Default::default()
        });
        let existing = load_estimated_cost(&c, &filter).unwrap();
        assert!((report.accounts[0].estimated_cost - existing.0).abs() < 1e-8);
        assert_eq!(report.accounts[0].priced_requests, existing.1);
    }

    #[test]
    fn unknown_auth_requires_roster_evidence_and_sources_are_redacted() {
        let c = database();
        price(&c);
        sync_accounts(&c, &[seed("claude", "known")]).unwrap();
        event(&c, "a", "claude", "known", "test-priced", "", 2);
        event(&c, "b", "claude", "unknown", "test-priced", "", 2);
        event(&c, "c", "claude", "", "test-priced", "oauth", 2);
        c.execute("UPDATE usage_events SET source='' WHERE event_key='c'", [])
            .unwrap();
        event(&c, "d", "claude", "historical", "test-priced", "oauth", 2);
        let secret = "sk-never-expose-this-test-key-0123456789";
        c.execute(
            "UPDATE usage_events SET source=?1 WHERE event_key='d'",
            [secret],
        )
        .unwrap();
        let report = load_value(&c, "2026-09", &GuiConfigFile::default()).unwrap();
        assert_eq!(report.other_requests, 2);
        assert_eq!(report.accounts.len(), 2);
        assert!(!serde_json::to_string(&report).unwrap().contains(secret));
        assert_ne!(
            account_id("claude", "same", ""),
            account_id("antigravity", "same", "")
        );
        assert!(month_bounds("2026-00").is_err());
        assert!(month_bounds("2026-9").is_err());
    }
}
