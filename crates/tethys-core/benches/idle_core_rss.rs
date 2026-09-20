//! Milestone criterion (M1.13): Core RSS at idle is within architecture §9
//! (≤ 50 MB, hard) with this chunk's machinery running.
//!
//! Run manually, once (never in CI):
//! `cargo bench -p tethys-core --bench idle_core_rss`
//!
//! Opens `Core` the way the app does (store, hydrated profiles, health poller
//! armed at its default interval, monitor constructed), lets it settle with no
//! thread running, and reports this process's resident set. The process exits
//! non-zero when the budget is exceeded. Webview RSS needs the packaged app and
//! is not measured here.

use std::time::Duration;

use sysinfo::{Pid, ProcessesToUpdate, System};
use tethys_api::AgentApi;
use tethys_core::{Core, CorePaths};
use tethys_schema::agents::{LaunchSpecInput, ProfileInput};

const BUDGET_MB: f64 = 50.0;
const SETTLE: Duration = Duration::from_secs(5);
const PROFILES: usize = 8;

fn resident_mb(system: &mut System, own: Pid) -> f64 {
    system.refresh_processes(ProcessesToUpdate::Some(&[own]), true);
    system
        .process(own)
        .map_or(0.0, |process| process.memory() as f64 / (1024.0 * 1024.0))
}

fn main() {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("runtime");
    let home = tempfile::tempdir().expect("home");
    let own = Pid::from_u32(std::process::id());
    let mut system = System::new();
    let before = resident_mb(&mut system, own);

    let core = runtime.block_on(async {
        let core = Core::open(CorePaths::new(home.path())).await.expect("open");
        for index in 0..PROFILES {
            core.agent_profiles_create(ProfileInput {
                id: Some(format!("profile-{index}")),
                name: format!("Profile {index}"),
                launch_spec: LaunchSpecInput {
                    program: format!("not-installed-{index}"),
                    args: vec![],
                    cwd: None,
                    env: vec![],
                },
                projection_target: None,
                preferred_protocol: None,
                enabled: true,
            })
            .await
            .expect("profile");
        }
        tokio::time::sleep(SETTLE).await;
        core
    });

    let idle = resident_mb(&mut system, own);
    drop(core);

    println!("profiles registered: {PROFILES}");
    println!("RSS before open: {before:.1} MB");
    println!("RSS idle after {} s: {idle:.1} MB (budget ≤ {BUDGET_MB} MB)", SETTLE.as_secs());
    if idle > BUDGET_MB {
        eprintln!("FAIL: idle core RSS {idle:.1} MB exceeds {BUDGET_MB} MB");
        std::process::exit(1);
    }
}
