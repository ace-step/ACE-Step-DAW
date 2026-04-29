//! End-to-end VST3 host roundtrip — hands-on walkthrough of every
//! API shipped in Phase 4A/4B/4C.
//!
//! Usage:
//!     cargo run --example roundtrip -p ace-plugin-host
//!     cargo run --example roundtrip -p ace-plugin-host -- /Library/Audio/Plug-Ins/VST3/ACE\ Bridge.vst3
//!
//! Defaults to known-compatible plugins in the standard macOS VST3
//! directories. Pass a `.vst3` bundle path to force a specific one.

use std::path::PathBuf;
use std::time::Instant;

use ace_plugin_host::{AudioConfig, MidiEvent, PluginHost, PluginScanner, RESTART_LATENCY_CHANGED};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Route tracing events to stderr so the reader can see what
    // the host crate logs as each step runs.
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    let bundle_path = pick_bundle_path()?;
    println!("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!(" VST3 roundtrip: {}", bundle_path.display());
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    let host = PluginHost::new();

    // -----------------------------------------------------------------
    // 1. Instantiate
    // -----------------------------------------------------------------
    println!("[1/8] Instantiate ────────────────────────────────────");
    let t = Instant::now();
    // SAFETY: the bundle path was produced by the scanner or typed by
    // the user; we trust both for this demo binary.
    let info = unsafe { host.instantiate(&bundle_path)? };
    println!("      instance_id         = {}", info.instance_id);
    println!("      plugin_uid          = {}", info.plugin_uid);
    println!(
        "      params              = {} exposed",
        info.parameters.len()
    );
    println!("      output_busses       = {}", info.output_busses.len());
    for (i, bus) in info.output_busses.iter().enumerate() {
        println!("        [{}] {:<20} {}ch", i, bus.name, bus.channels);
    }
    println!(
        "      reported latency    = {} samples",
        info.latency_samples
    );
    println!("      tail                = {} samples", info.tail_samples);
    println!("      load time           = {:?}\n", t.elapsed());

    let id = info.instance_id.clone();

    // -----------------------------------------------------------------
    // 2. setupProcessing + activate
    // -----------------------------------------------------------------
    println!("[2/8] setupProcessing + activate ─────────────────────");
    let cfg = AudioConfig::new(48_000.0, 512)?;
    println!(
        "      cfg                 = {} Hz, {} samples/block",
        cfg.sample_rate, cfg.block_size
    );
    host.configure_instance(&id, cfg)?;
    host.activate_instance(&id)?;
    println!("      lifecycle           = setup_done, active, processing\n");

    // -----------------------------------------------------------------
    // 3. Live latency re-query (PDC reporting, Phase 4C-2)
    // -----------------------------------------------------------------
    println!("[3/8] Live latency re-query ──────────────────────────");
    let live = host.instance_latency(&id)?;
    println!("      current latency     = {} samples", live);
    if live == info.latency_samples {
        println!("      ✓ matches load-time snapshot");
    } else {
        println!(
            "      ⚠ drifted from load-time ({} → {})",
            info.latency_samples, live
        );
    }
    println!();

    // -----------------------------------------------------------------
    // 4. Queue MIDI + parameter automation (Phase 4B-2a/b)
    // -----------------------------------------------------------------
    println!("[4/8] Queue MIDI + parameters ────────────────────────");
    host.queue_instance_midi(
        &id,
        &[
            MidiEvent::note_on(0, 60, 100, 0),
            MidiEvent::note_on(0, 64, 90, 64),
            MidiEvent::note_on(0, 67, 80, 128),
            MidiEvent::note_off(0, 60, 0, 384),
            MidiEvent::note_off(0, 64, 0, 384),
            MidiEvent::note_off(0, 67, 0, 384),
        ],
    )?;
    println!("      queued 6 MIDI events (C major triad, offset 0-384)");

    if let Some(first) = info.parameters.first() {
        host.set_instance_parameter(&id, first.id, 0, 0.5)?;
        host.set_instance_parameter(&id, first.id, 256, 0.8)?;
        println!(
            "      queued 2 param points for \"{}\" (id={})",
            first.name, first.id
        );
    } else {
        println!("      plugin exposes no parameters — skipping automation");
    }
    println!();

    // -----------------------------------------------------------------
    // 5. Run a few process_block calls (Phase 4B-1)
    // -----------------------------------------------------------------
    println!("[5/8] process_block ×100 ─────────────────────────────");
    let preferred_in_ch = info
        .output_busses
        .first()
        .map(|b| b.channels)
        .filter(|channels| matches!(channels, 1 | 2))
        .unwrap_or(2);
    let channel_candidates = if preferred_in_ch == 1 { [1, 2] } else { [2, 1] };
    let block_size = cfg.block_size as usize;
    let t = Instant::now();
    let mut last_out_len = 0;
    let mut processed_blocks = 0;
    let mut selected_in_ch = 0;
    let mut last_error = String::new();
    for in_ch in channel_candidates {
        let input = vec![0.0f32; (in_ch as usize) * block_size];
        match host.process_instance_block(&id, &input, in_ch, cfg.block_size) {
            Ok(out) => {
                last_out_len = out.len();
                processed_blocks = 1;
                selected_in_ch = in_ch;
                for _ in processed_blocks..100 {
                    let out = host.process_instance_block(&id, &input, in_ch, cfg.block_size)?;
                    last_out_len = out.len();
                    processed_blocks += 1;
                }
                break;
            }
            Err(err) => {
                last_error = err.to_string();
            }
        }
    }
    if processed_blocks == 0 {
        return Err(
            format!("process_block failed for mono and stereo inputs: {last_error}").into(),
        );
    }
    let elapsed = t.elapsed();
    println!("      selected input bus  = {}ch", selected_in_ch);
    println!("      last out size       = {} f32 samples", last_out_len);
    println!("      total wall time     = {:?}", elapsed);
    println!(
        "      avg per block       = {:?}  ({:.1}x real-time at {} Hz/{})",
        elapsed / processed_blocks,
        (cfg.sample_rate / f64::from(cfg.block_size) * f64::from(processed_blocks))
            / elapsed.as_secs_f64(),
        cfg.sample_rate,
        cfg.block_size
    );
    println!();

    // -----------------------------------------------------------------
    // 6. Restart notifications (Phase 4C-2)
    // -----------------------------------------------------------------
    println!("[6/8] Restart notifications ──────────────────────────");
    let restarts = host.take_pending_restart_notifications();
    if restarts.is_empty() {
        println!("      no plugin-side restart requests — latency stable");
    } else {
        for n in restarts {
            println!(
                "      instance {} flags=0x{:x}{}",
                n.instance_id,
                n.flags,
                if n.flags & RESTART_LATENCY_CHANGED != 0 {
                    " (latency changed)"
                } else {
                    ""
                }
            );
        }
    }
    let param_changes = host.take_pending_param_changes();
    println!(
        "      pending param changes = {} (from plugin GUI edits)",
        param_changes.len()
    );
    println!();

    // -----------------------------------------------------------------
    // 7. Preset state round-trip (Phase 4C-1)
    // -----------------------------------------------------------------
    println!("[7/8] Preset state round-trip ────────────────────────");
    // save_state / load_state require the instance be not-active.
    host.deactivate_instance(&id)?;
    let blob = host.save_instance_state(&id)?;
    println!("      saved blob          = {} bytes", blob.len());
    if blob.len() >= 4 {
        let comp_len = u32::from_le_bytes([blob[0], blob[1], blob[2], blob[3]]);
        let ctrl_len = blob.len().saturating_sub(4 + comp_len as usize);
        println!(
            "        header says comp={} bytes, controller={} bytes",
            comp_len, ctrl_len
        );
    }
    host.load_instance_state(&id, &blob)?;
    let blob2 = host.save_instance_state(&id)?;
    if blob == blob2 {
        println!("      ✓ save → load → save round-trips byte-for-byte");
    } else {
        return Err(format!(
            "state drifted after save → load → save: first={} bytes, second={} bytes",
            blob.len(),
            blob2.len()
        )
        .into());
    }
    println!();

    // -----------------------------------------------------------------
    // 8. Release
    // -----------------------------------------------------------------
    println!("[8/8] Release ────────────────────────────────────────");
    host.release(&id)?;
    println!("      instance dropped — dylib unloaded, COM handles released");
    assert!(host.list()?.is_empty());
    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("  All 8 steps passed ✓");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    Ok(())
}

/// Pick a bundle path to exercise: command-line arg wins, then scan
/// the standard macOS directories and take the first hit.
fn pick_bundle_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Some(arg) = std::env::args().nth(1) {
        let p = PathBuf::from(arg);
        if !p.exists() {
            return Err(format!("path not found: {}", p.display()).into());
        }
        return Ok(p);
    }

    let candidates = [
        "/Library/Audio/Plug-Ins/VST3/ACE Bridge.vst3",
        "/Library/Audio/Plug-Ins/VST3/Samplab.vst3",
    ];
    for c in candidates {
        let p = PathBuf::from(c);
        if p.exists() {
            return Ok(p);
        }
    }

    // Fallback: scan the standard macOS VST3 directories only to
    // provide a helpful explicit-path hint. Loading an arbitrary first
    // plugin would make the smoke example depend on filesystem order
    // and plugin-specific state/IO support.
    let scanner = PluginScanner::new();
    let search_dirs: Vec<PathBuf> = [
        "/Library/Audio/Plug-Ins/VST3",
        &format!(
            "{}/Library/Audio/Plug-Ins/VST3",
            std::env::var("HOME").unwrap_or_default()
        ),
    ]
    .iter()
    .map(PathBuf::from)
    .collect();
    let mut plugins: Vec<_> = scanner.scan(&search_dirs).into_iter().collect();
    plugins.sort_by(|a, b| a.path.cmp(&b.path));
    if plugins.is_empty() {
        Err("no VST3 plugins found in the standard directories — pass a path as arg".into())
    } else {
        Err(format!(
            "found {} VST3 plugin(s), but none are in the known-compatible default list; pass a .vst3 path as arg",
            plugins.len()
        )
        .into())
    }
}
