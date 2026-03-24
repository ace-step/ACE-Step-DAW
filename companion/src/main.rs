mod gui_manager;

fn main() {
    println!("ACE-Step Companion — VST3 plugin host (stub)");

    let mut mgr = gui_manager::GuiManager::new();

    // Demo: open and close an editor window (stub)
    match mgr.open_editor("demo-plugin-1", 800, 600) {
        Ok((w, h)) => println!("Opened editor: {w}x{h}"),
        Err(e) => eprintln!("Failed to open editor: {e}"),
    }

    mgr.process_events();

    if mgr.is_editor_open("demo-plugin-1") {
        println!("Editor is open");
    }

    mgr.close_all();
    println!("All editors closed");
}
