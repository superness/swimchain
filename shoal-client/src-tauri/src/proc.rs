//! Child-process spawn helpers.
//!
//! Copied from `trench-client/src-tauri/src/proc.rs` — the shell itself is a GUI
//! (`windows_subsystem = "windows"`) binary, but the node binary `sw.exe` is a
//! *console* subsystem binary. When a GUI process spawns a console child, Windows
//! allocates a fresh console for it — a blank command prompt sitting next to the
//! game window. The node's stdout/stderr already go to the log file, so that
//! console shows nothing and does nothing except confuse players. `CREATE_NO_WINDOW`
//! suppresses it; stdio pipes keep working as before.
//!
//! No-ops on non-Windows platforms.

/// <https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags>
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Suppress the console window for a `tokio::process::Command` child.
pub fn no_console(cmd: &mut tokio::process::Command) -> &mut tokio::process::Command {
    #[cfg(windows)]
    {
        // `creation_flags` is an inherent method on `tokio::process::Command` under
        // Windows — no `std::os::windows::process::CommandExt` import (that trait
        // extends `std::process::Command`, and importing it here is just an unused
        // import warning).
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A hidden child must still spawn, run, and let us read its piped output —
    /// the flag hides the console, it must not detach or break stdio.
    #[tokio::test]
    async fn hidden_child_still_runs_and_pipes_output() {
        #[cfg(windows)]
        let (prog, args): (&str, &[&str]) = ("cmd", &["/C", "echo", "hi"]);
        #[cfg(not(windows))]
        let (prog, args): (&str, &[&str]) = ("echo", &["hi"]);

        let mut cmd = tokio::process::Command::new(prog);
        cmd.args(args);
        let out = no_console(&mut cmd).output().await.expect("spawn failed");
        assert!(out.status.success());
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "hi");
    }
}
