/**
 * AppGrid - Home screen showing installed apps as launchable tiles
 */

import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface AppEntry {
  id: string;
  name: string;
  icon: string | null;
  version: string | null;
}

export default function AppGrid(): JSX.Element {
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [launching, setLaunching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppEntry[]>("list_apps")
      .then(setApps)
      .catch((e) => setError(String(e)));
  }, []);

  const open = useCallback(async (id: string) => {
    setLaunching(id);
    setError(null);
    try {
      await invoke("launch_app", { appId: id });
    } catch (e) {
      setError(`Failed to launch ${id}: ${e}`);
    } finally {
      setLaunching(null);
    }
  }, []);

  if (error) return <div className="app-grid-error">{error}</div>;
  if (apps.length === 0) return <div className="app-grid-empty">No apps installed.</div>;

  return (
    <div className="app-grid">
      {apps.map((a) => (
        <button
          key={a.id}
          className="app-tile"
          disabled={launching === a.id}
          onClick={() => open(a.id)}
        >
          {a.icon ? (
            <img className="app-tile-icon" src={convertFileSrc(a.icon)} alt="" />
          ) : (
            <div className="app-tile-icon app-tile-icon--default">{a.name.charAt(0)}</div>
          )}
          <span className="app-tile-name">{a.name}</span>
          {launching === a.id && <span className="app-tile-spinner">Opening…</span>}
        </button>
      ))}
    </div>
  );
}
