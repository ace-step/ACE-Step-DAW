mod audio_thread;
mod error;
mod gui_manager;
mod host_impl;
mod plugin_host;
mod plugin_scanner;
mod preset_storage;
mod protocol;
mod sidechain_router;
mod vst3_loader;
mod ws_server;

use std::net::SocketAddr;

use clap::Parser;
use tracing_subscriber::EnvFilter;

/// ACE-Step Companion — local VST3 plugin host for the ACE-Step DAW.
#[derive(Parser, Debug)]
#[command(name = "ace-step-companion", version = "0.1.0")]
struct Cli {
    /// WebSocket server port.
    #[arg(long, default_value_t = 9851)]
    port: u16,

    /// Enable verbose (debug-level) logging.
    #[arg(long)]
    verbose: bool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    // Initialise tracing.
    let filter = if cli.verbose {
        EnvFilter::new("debug")
    } else {
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))
    };
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let addr: SocketAddr = ([127, 0, 0, 1], cli.port).into();
    ws_server::run(addr).await?;

    Ok(())
}
