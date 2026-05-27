// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--worker") {
        misfit_gsuite_lib::run_worker();
    } else {
        misfit_gsuite_lib::run();
    }
}
