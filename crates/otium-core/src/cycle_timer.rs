/// Bare-metal hardware CPU cycle counter.
/// Directly queries the silicon clock counter without operating system syscall overhead.
#[inline(always)]
pub fn read_cpu_cycles() -> u64 {
    #[cfg(target_arch = "x86_64")]
    unsafe {
        core::arch::x86_64::_rdtsc()
    }

    #[cfg(target_arch = "aarch64")]
    unsafe {
        let val: u64;
        core::arch::asm!("mrs {}, cntvct_el0", out(reg) val, options(nomem, nostack));
        val
    }

    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64
    }
}

/// Precision hardware cycle stopwatch for micro-profiling zero-latency operations
pub struct CpuCycleTimer {
    start_cycle: u64,
}

impl Default for CpuCycleTimer {
    fn default() -> Self {
        Self::start()
    }
}

impl CpuCycleTimer {
    #[inline(always)]
    pub fn start() -> Self {
        Self {
            start_cycle: read_cpu_cycles(),
        }
    }

    #[inline(always)]
    pub fn elapsed_cycles(&self) -> u64 {
        read_cpu_cycles().saturating_sub(self.start_cycle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cpu_cycle_counter() {
        let timer = CpuCycleTimer::start();
        let mut x = 0u64;
        for i in 0..1000 {
            x = x.wrapping_add(i);
        }
        std::hint::black_box(x);
        let cycles = timer.elapsed_cycles();
        assert!(cycles > 0);
    }
}
