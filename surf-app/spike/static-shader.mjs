// Honest static (spec §3.2): ONE canvas, 30fps budget (§8). Every visual
// parameter is a real node number:
//   fleck density <- peer_count       }
//   drift         <- mempool_actions  }  one get_sync_status call
//   ghost glyphs  <- tip_hash         }
// Node unreachable -> mapStats(null): sparse, still, ghostless. Dead sea.

export function mapStats(s) {
  const peers = Number(s?.peer_count ?? 0);
  const mempool = Number(s?.mempool_actions ?? 0);
  return {
    density: Math.min(0.35, 0.05 + peers * 0.03),
    drift: Math.min(3, mempool * 0.25),
    ghost: (s?.tip_hash ?? '').slice(0, 16),
  };
}

export async function rpcCall(method, params = {}) {
  const res = await fetch('/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'rpc error');
  return json.result;
}

export function createStatic(canvas, { pollMs = 2000 } = {}) {
  const ctx = canvas.getContext('2d');
  let params = mapStats(null);
  let running = false, visible = false;
  let raf = 0, poll = 0, last = 0, driftX = 0;

  function resize() { // quarter-ish res: period-correct chunk, cheap fills
    canvas.width = Math.max(120, Math.ceil(window.innerWidth / 3));
    canvas.height = Math.max(80, Math.ceil(window.innerHeight / 3));
  }
  window.addEventListener('resize', resize);
  resize();

  function paint() {
    const w = canvas.width, h = canvas.height;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() < params.density ? 140 + ((Math.random() * 90) | 0) : 8;
      d[i] = (v * 0.75) | 0; d[i + 1] = v; d[i + 2] = (v * 0.85) | 0; d[i + 3] = 255; // phosphor tint
    }
    ctx.putImageData(img, 0, 0);
    if (params.ghost) {
      driftX = (driftX + params.drift) % w;
      ctx.font = `bold ${Math.round(h / 6)}px monospace`;
      ctx.fillStyle = 'rgba(160,255,190,0.10)';
      ctx.fillText(params.ghost, w - driftX, h * 0.55);
      ctx.fillText(params.ghost, w - driftX - w, h * 0.55); // wrap
    }
  }

  function frame(t) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!visible || t - last < 33) return; // 30fps gate; idle when hidden
    last = t;
    paint();
  }

  async function tick() {
    try { params = mapStats(await rpcCall('get_sync_status')); }
    catch { params = mapStats(null); }
  }

  return {
    start() {
      if (running) return;
      running = true;
      tick(); poll = setInterval(tick, pollMs);
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; clearInterval(poll); cancelAnimationFrame(raf); },
    // Deviation from the brief (sanctioned, Task-4 finding handed to Task 5):
    // the canvas has an 80ms opacity transition (index.html #static), so a
    // naive `opacity = '1'` leaves a window early in the fade where the
    // still-transparent static shows whatever is beneath it (an unmounted or
    // hidden frame -> black) instead of live static. show() now paints one
    // frame synchronously and snaps to visible with the transition disabled,
    // so the very first frame it's visible on is already solid; the
    // transition is restored immediately after so hide() still fades.
    show() {
      visible = true;
      last = 0;
      canvas.style.transition = 'none';
      paint();
      canvas.style.opacity = '1';
      void canvas.offsetWidth; // flush the transition:none before restoring
      canvas.style.transition = '';
    },
    hide() { visible = false; canvas.style.opacity = '0'; },
  };
}
