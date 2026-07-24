use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

struct AppState {
    db: Mutex<Connection>,
    data_dir: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarEvent {
    id: Option<i64>,
    title: String,
    starts_at: String,
    ends_at: String,
    all_day: bool,
    body: String,
    tags: Vec<String>,
    location: String,
    priority: String,
    remind_at: Option<String>,
    completed: bool,
    notified_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventSummary {
    id: i64,
    title: String,
    starts_at: String,
    ends_at: String,
    all_day: bool,
    body: String,
    tags: Vec<String>,
    location: String,
    priority: String,
    remind_at: Option<String>,
    completed: bool,
    notified_at: Option<String>,
}

fn init_database(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        all_day INTEGER NOT NULL DEFAULT 0,
        body TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        location TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal',
        remind_at TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        notified_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);
      CREATE INDEX IF NOT EXISTS idx_events_remind_at ON events(remind_at);
      ",
        )
        .map_err(|error| error.to_string())
}

fn row_to_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<EventSummary> {
    let tags_json: String = row.get("tags_json")?;
    let tags = serde_json::from_str(&tags_json).unwrap_or_default();

    Ok(EventSummary {
        id: row.get("id")?,
        title: row.get("title")?,
        starts_at: row.get("starts_at")?,
        ends_at: row.get("ends_at")?,
        all_day: row.get::<_, i64>("all_day")? == 1,
        body: row.get("body")?,
        tags,
        location: row.get("location")?,
        priority: row.get("priority")?,
        remind_at: row.get("remind_at")?,
        completed: row.get::<_, i64>("completed")? == 1,
        notified_at: row.get("notified_at")?,
    })
}

fn validate_event(event: &CalendarEvent) -> Result<(), String> {
    if event.title.trim().is_empty() {
        return Err("标题不能为空".to_string());
    }
    if event.starts_at.trim().is_empty() || event.ends_at.trim().is_empty() {
        return Err("开始和结束时间不能为空".to_string());
    }
    Ok(())
}

#[tauri::command]
fn list_events(state: State<'_, AppState>) -> Result<Vec<EventSummary>, String> {
    let connection = state.db.lock().map_err(|error| error.to_string())?;
    list_events_from_connection(&connection)
}

fn list_events_from_connection(connection: &Connection) -> Result<Vec<EventSummary>, String> {
    let mut statement = connection
        .prepare(
            "
      SELECT id, title, starts_at, ends_at, all_day, body, tags_json, location,
             priority, remind_at, completed, notified_at
      FROM events
      ORDER BY starts_at ASC, id ASC
      ",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], row_to_event)
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_event(event: CalendarEvent, state: State<'_, AppState>) -> Result<EventSummary, String> {
    validate_event(&event)?;
    let tags_json = serde_json::to_string(&event.tags).map_err(|error| error.to_string())?;
    let connection = state.db.lock().map_err(|error| error.to_string())?;

    let id = match event.id {
        Some(id) => {
            connection
                .execute(
                    "
          UPDATE events
          SET title = ?1, starts_at = ?2, ends_at = ?3, all_day = ?4,
              body = ?5, tags_json = ?6, location = ?7, priority = ?8,
              remind_at = ?9, completed = ?10, notified_at = ?11,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?12
          ",
                    params![
                        event.title.trim(),
                        event.starts_at,
                        event.ends_at,
                        event.all_day as i64,
                        event.body,
                        tags_json,
                        event.location,
                        event.priority,
                        event.remind_at,
                        event.completed as i64,
                        event.notified_at,
                        id
                    ],
                )
                .map_err(|error| error.to_string())?;
            id
        }
        None => {
            connection
                .execute(
                    "
          INSERT INTO events (
            title, starts_at, ends_at, all_day, body, tags_json, location,
            priority, remind_at, completed, notified_at
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ",
                    params![
                        event.title.trim(),
                        event.starts_at,
                        event.ends_at,
                        event.all_day as i64,
                        event.body,
                        tags_json,
                        event.location,
                        event.priority,
                        event.remind_at,
                        event.completed as i64,
                        event.notified_at
                    ],
                )
                .map_err(|error| error.to_string())?;
            connection.last_insert_rowid()
        }
    };

    get_event_by_id(id, &connection)?.ok_or_else(|| "日程保存失败".to_string())
}

fn get_event_by_id(id: i64, connection: &Connection) -> Result<Option<EventSummary>, String> {
    connection
        .query_row(
            "
      SELECT id, title, starts_at, ends_at, all_day, body, tags_json, location,
             priority, remind_at, completed, notified_at
      FROM events
      WHERE id = ?1
      ",
            [id],
            row_to_event,
        )
        .optional()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_event(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let connection = state.db.lock().map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM events WHERE id = ?1", [id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn due_reminders(now: String, state: State<'_, AppState>) -> Result<Vec<EventSummary>, String> {
    let connection = state.db.lock().map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "
      SELECT id, title, starts_at, ends_at, all_day, body, tags_json, location,
             priority, remind_at, completed, notified_at
      FROM events
      WHERE remind_at IS NOT NULL
        AND remind_at <= ?1
        AND notified_at IS NULL
        AND completed = 0
      ORDER BY remind_at ASC
      ",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([now], row_to_event)
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn mark_notified(id: i64, notified_at: String, state: State<'_, AppState>) -> Result<(), String> {
    let connection = state.db.lock().map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE events SET notified_at = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![notified_at, id],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn export_events_json(state: State<'_, AppState>) -> Result<String, String> {
    let connection = state.db.lock().map_err(|error| error.to_string())?;
    let events = list_events_from_connection(&connection)?;
    let export_dir = state.data_dir.join("exports");
    fs::create_dir_all(&export_dir).map_err(|error| error.to_string())?;
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let export_path = export_dir.join(format!("events-{seconds}.json"));
    let payload = serde_json::to_string_pretty(&events).map_err(|error| error.to_string())?;
    fs::write(&export_path, payload).map_err(|error| error.to_string())?;
    Ok(export_path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_events_json_to(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let connection = state.db.lock().map_err(|error| error.to_string())?;
    let events = list_events_from_connection(&connection)?;
    let export_path = PathBuf::from(path);
    let payload = serde_json::to_string_pretty(&events).map_err(|error| error.to_string())?;
    fs::write(&export_path, payload).map_err(|error| error.to_string())?;
    Ok(export_path.to_string_lossy().to_string())
}

#[tauri::command]
fn import_events_json_from(path: String, state: State<'_, AppState>) -> Result<usize, String> {
    let payload = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let events: Vec<CalendarEvent> =
        serde_json::from_str(&payload).map_err(|error| format!("JSON 格式无效: {error}"))?;
    let mut connection = state.db.lock().map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    for event in &events {
        validate_event(event)?;
        let tags_json = serde_json::to_string(&event.tags).map_err(|error| error.to_string())?;
        match event.id {
            Some(id) => {
                transaction
                    .execute(
                        "
                        INSERT INTO events (
                          id, title, starts_at, ends_at, all_day, body, tags_json,
                          location, priority, remind_at, completed, notified_at
                        )
                        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)
                        ON CONFLICT(id) DO UPDATE SET
                          title = excluded.title,
                          starts_at = excluded.starts_at,
                          ends_at = excluded.ends_at,
                          all_day = excluded.all_day,
                          body = excluded.body,
                          tags_json = excluded.tags_json,
                          location = excluded.location,
                          priority = excluded.priority,
                          remind_at = excluded.remind_at,
                          completed = excluded.completed,
                          notified_at = NULL,
                          updated_at = CURRENT_TIMESTAMP
                        ",
                        params![
                            id,
                            event.title.trim(),
                            event.starts_at,
                            event.ends_at,
                            event.all_day as i64,
                            event.body,
                            tags_json,
                            event.location,
                            event.priority,
                            event.remind_at,
                            event.completed as i64
                        ],
                    )
                    .map_err(|error| error.to_string())?;
            }
            None => {
                transaction
                    .execute(
                        "
                        INSERT INTO events (
                          title, starts_at, ends_at, all_day, body, tags_json,
                          location, priority, remind_at, completed
                        )
                        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                        ",
                        params![
                            event.title.trim(),
                            event.starts_at,
                            event.ends_at,
                            event.all_day as i64,
                            event.body,
                            tags_json,
                            event.location,
                            event.priority,
                            event.remind_at,
                            event.completed as i64
                        ],
                    )
                    .map_err(|error| error.to_string())?;
            }
        }
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(events.len())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir().expect("无法获取应用数据目录");
            fs::create_dir_all(&data_dir).expect("无法创建应用数据目录");
            let database_path = data_dir.join("my-calendar.sqlite3");
            let connection = Connection::open(database_path).expect("无法打开本地数据库");
            init_database(&connection).expect("无法初始化本地数据库");
            app.manage(AppState {
                db: Mutex::new(connection),
                data_dir,
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            list_events,
            save_event,
            delete_event,
            due_reminders,
            mark_notified,
            export_events_json,
            export_events_json_to,
            import_events_json_from
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
