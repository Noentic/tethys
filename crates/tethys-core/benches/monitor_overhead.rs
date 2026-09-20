//! Milestone criterion (MON-01): process-tree sampling costs < 1% CPU.
//!
//! Run manually, once, on an otherwise idle machine (never in CI):
//! `cargo bench -p tethys-core --bench monitor_overhead`
//! `cargo bench -p tethys-core --bench monitor_overhead -- --samples 30`
//!
//! Spawns a small process tree, samples it through the shared `Monitor` on the
//! architecture §7.5 cadence (every 2 s), and reports this process's own CPU
//! time as a share of wall time. The process exits non-zero when the budget is
//! exceeded. `sysinfo` is a dependency with its own tests; this measures only
//! our sampler around it.

#[cfg(unix)]
fn main() {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    use sysinfo::{Pid, ProcessesToUpdate, System};
    use tethys_core::monitor::Monitor;

    const BUDGET_PERCENT: f64 = 1.0;
    const CADENCE: Duration = Duration::from_secs(2);

    let samples = parse_samples_arg().unwrap_or(15);
    let own = Pid::from_u32(std::process::id());

    let mut child = Command::new("sh")
        .arg("-c")
        .arg("sleep 600 & sleep 600 & wait")
        .stdout(Stdio::null())
        .process_group(0)
        .spawn()
        .expect("spawn the sampled tree");
    let leader = child.id();

    // A separate meter, refreshed only before and after the run, so measuring
    // the sampler does not itself add samples.
    let mut meter = System::new();
    meter.refresh_processes(ProcessesToUpdate::All, true);
    let machine_processes = meter.processes().len();
    let cpu_ms = |meter: &mut System| -> u64 {
        meter.refresh_processes(ProcessesToUpdate::Some(&[own]), true);
        meter
            .process(own)
            .map_or(0, |process| process.accumulated_cpu_time())
    };

    let monitor = Monitor::new();
    // Let the shell fork its children before the first sample.
    std::thread::sleep(Duration::from_millis(200));
    let tree_size = monitor.sample(leader).len();

    let cpu_before = cpu_ms(&mut meter);
    let started = Instant::now();
    let mut durations_ms: Vec<f64> = Vec::with_capacity(samples);
    for tick in 0..samples {
        let sampled_at = Instant::now();
        let _ = monitor.sample(leader);
        durations_ms.push(sampled_at.elapsed().as_secs_f64() * 1000.0);
        if let Some(rest) = (CADENCE * (tick as u32 + 1)).checked_sub(started.elapsed()) {
            std::thread::sleep(rest);
        }
    }
    let wall_ms = started.elapsed().as_secs_f64() * 1000.0;
    let cpu_used_ms = cpu_ms(&mut meter).saturating_sub(cpu_before) as f64;

    // Kill the whole group: killing only the shell would orphan its `sleep`s.
    // SAFETY: `kill` with a negative pid signals the group the child leads.
    unsafe { libc::kill(-(leader as i32), libc::SIGKILL) };
    let _ = child.wait();

    durations_ms.sort_by(|a, b| a.total_cmp(b));
    let mean = durations_ms.iter().sum::<f64>() / durations_ms.len().max(1) as f64;
    let p95 = durations_ms
        .get(((durations_ms.len() as f64) * 0.95).ceil() as usize - 1)
        .copied()
        .unwrap_or_default();
    let overhead = cpu_used_ms / wall_ms * 100.0;

    println!("machine processes: {machine_processes}");
    println!("sampled tree size: {tree_size}");
    println!("samples: {samples} at {} ms", CADENCE.as_millis());
    println!("per-sample wall time: mean {mean:.2} ms, p95 {p95:.2} ms");
    println!("sampler CPU: {cpu_used_ms:.0} ms over {wall_ms:.0} ms wall");
    println!("overhead: {overhead:.3}% (budget < {BUDGET_PERCENT}%)");

    if overhead >= BUDGET_PERCENT {
        eprintln!("FAIL: sampling overhead {overhead:.3}% exceeds {BUDGET_PERCENT}%");
        std::process::exit(1);
    }
}

#[cfg(not(unix))]
fn main() {
    eprintln!("monitor_overhead is measured on Unix only; skipping");
}

#[cfg(unix)]
fn parse_samples_arg() -> Option<usize> {
    let mut args = std::env::args();
    while let Some(arg) = args.next() {
        if arg == "--samples" {
            return args.next()?.parse().ok();
        }
    }
    None
}
