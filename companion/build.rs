/// Build script for ACE-Step Companion.
///
/// In the future this will invoke cmake to build the C++ VST3 bridge.
/// For now it is a no-op stub.
fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    // TODO: invoke cmake to compile the C++ VST3 bridge code
    // e.g. cmake::Config::new("cpp_bridge").build();
}
