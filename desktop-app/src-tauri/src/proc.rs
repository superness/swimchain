//! Child-process spawn helpers.
//!
//! The launcher itself is a GUI (windows_subsystem = "windows") binary, but the
//! node binary `sw.exe` is a *console* subsystem binary. When a GUI process
//! spawns a console child, Windows allocates a fresh console for it — that's the
//! blank command prompt users see behind the app. We capture the node's stdout
//! and stderr into the log file anyway, so the console shows nothing and does
//! nothing except confuse people. `CREATE_NO_WINDOW` suppresses it; stdio pipes
//! keep working exactly as before.
//!
//! No-ops on non-Windows platforms.

/// <https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags>
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Suppress the console window for a `std::process::Command` child.
pub fn no_console_std(cmd: &mut std::process::Command) -> &mut std::process::Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Suppress the console window for a `tokio::process::Command` child.
pub fn no_console(cmd: &mut tokio::process::Command) -> &mut tokio::process::Command {
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A hidden child must still spawn, run, and let us read its piped output —
    /// the flag hides the console, it must not detach or break stdio.
    #[test]
    fn hidden_child_still_runs_and_pipes_output() {
        #[cfg(windows)]
        let (prog, args): (&str, &[&str]) = ("cmd", &["/C", "echo", "hi"]);
        #[cfg(not(windows))]
        let (prog, args): (&str, &[&str]) = ("echo", &["hi"]);

        let mut cmd = std::process::Command::new(prog);
        cmd.args(args);
        let out = no_console_std(&mut cmd).output().expect("spawn failed");
        assert!(out.status.success());
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "hi");
    }
}
