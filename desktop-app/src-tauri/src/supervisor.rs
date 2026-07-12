//! Tracks and manages child processes for launcher apps (SDD Phase 1, Task 5).
//!
//! The launcher spawns each app (feed, forum, chat, ...) as its own child
//! process, passing `--data-dir <node data dir>` so the app can talk to the
//! same node. `Supervisor` tracks live children by `app_id` so we can avoid
//! double-spawning single-instance apps and can kill everything on demand.

use std::collections::HashMap;
use std::path::Path;
use std::process::{Child, Command};
use std::sync::Mutex;

pub struct Supervisor {
    children: Mutex<HashMap<String, Child>>,
}

impl Supervisor {
    pub fn new() -> Self {
        Self {
            children: Mutex::new(HashMap::new()),
        }
    }

    /// Live == process hasn't exited. Reaps exited children lazily.
    pub fn is_running(&self, app_id: &str) -> bool {
        let mut map = self.children.lock().unwrap();
        if let Some(child) = map.get_mut(app_id) {
            match child.try_wait() {
                Ok(Some(_)) => {
                    map.remove(app_id);
                    false
                } // exited
                Ok(None) => true, // still running
                Err(_) => true,
            }
        } else {
            false
        }
    }

    pub fn running_count(&self) -> usize {
        let ids: Vec<String> = self.children.lock().unwrap().keys().cloned().collect();
        ids.into_iter().filter(|id| self.is_running(id)).count()
    }

    /// Spawn `program args... --data-dir <dir>` and track it under `app_id`.
    pub fn spawn_raw(
        &self,
        app_id: &str,
        program: &str,
        args: &[&str],
        data_dir: &Path,
    ) -> Result<(), String> {
        let child = Command::new(program)
            .args(args)
            .arg("--data-dir")
            .arg(data_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
        self.children
            .lock()
            .unwrap()
            .insert(app_id.to_string(), child);
        Ok(())
    }

    /// Single-instance-aware spawn: no-op if already running.
    pub fn spawn_raw_single(
        &self,
        app_id: &str,
        program: &str,
        args: &[&str],
        data_dir: &Path,
        single: bool,
    ) -> Result<(), String> {
        if single && self.is_running(app_id) {
            return Ok(());
        }
        self.spawn_raw(app_id, program, args, data_dir)
    }

    /// Public API: launch an app executable.
    pub fn launch(
        &self,
        app_id: &str,
        exec: &Path,
        data_dir: &Path,
        single_instance: bool,
    ) -> Result<(), String> {
        let program = exec.to_string_lossy().to_string();
        self.spawn_raw_single(app_id, &program, &[], data_dir, single_instance)
    }

    pub fn kill_all(&self) {
        for (_, mut c) in self.children.lock().unwrap().drain() {
            let _ = c.kill();
        }
    }
}

impl Default for Supervisor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Use the OS "sleep-like" no-op: on all platforms `std::process::Command` can run the
    // Rust test binary is overkill; instead spawn a portable long-lived process.
    #[cfg(windows)]
    const NOOP: (&str, &[&str]) = ("cmd", &["/C", "ping", "127.0.0.1", "-n", "30"]);
    #[cfg(not(windows))]
    const NOOP: (&str, &[&str]) = ("sleep", &["30"]);

    #[test]
    fn launch_tracks_child_and_single_instance_noops() {
        let sup = Supervisor::new();
        let dir = tempfile::tempdir().unwrap();
        // spawn_raw is a test seam that runs an arbitrary command instead of exec.
        sup.spawn_raw("feed", NOOP.0, NOOP.1, dir.path()).unwrap();
        assert!(sup.is_running("feed"));
        // single-instance: second launch must NOT spawn a new child.
        let before = sup.running_count();
        sup.spawn_raw_single("feed", NOOP.0, NOOP.1, dir.path(), true)
            .unwrap();
        assert_eq!(sup.running_count(), before, "single_instance should no-op");
        sup.kill_all();
    }
}
