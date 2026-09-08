import { describe, expect, it } from 'vitest';
import { parseIoregAccelerators, toGpuDevices } from './gpu-macos.js';

/**
 * A real `ioreg -r -d 1 -w 0 -c IOAccelerator` capture (Apple M1 Max, 64 GB),
 * with the properties this parser never reads stripped out. Verbatim otherwise:
 * the point of the test is that the registry's actual text format parses.
 */
const appleSilicon = `+-o AGXAcceleratorG13X  <class AGXAcceleratorG13X, id 0x100000a90, registered, matched, active, busy 0 (144910 ms), retain 104>
    {
      "vendor-id" = <6b100000>
      "MetalPluginName" = "AGXMetalG13X"
      "IONameMatched" = "gpu,t6000"
      "PerformanceStatistics" = {"In use system memory (driver)"=0,"Alloc system memory"=23611097088,"Tiler Utilization %"=25,"recoveryCount"=0,"lastRecoveryTime"=0,"Renderer Utilization %"=23,"TiledSceneBytes"=1540096,"Device Utilization %"=25,"SplitSceneCount"=0,"Allocated PB Size"=120979456,"In use system memory"=745570304}
      "model" = "Apple M1 Max"
      "gpu-core-count" = 32
      "IOClass" = "AGXAcceleratorG13X"
    }
`;

describe('parseIoregAccelerators', () => {
  it('reads the driver counters out of a real Apple Silicon dump', () => {
    expect(parseIoregAccelerators(appleSilicon)).toEqual([
      {
        name: 'Apple M1 Max',
        allocatedBytes: 23_611_097_088,
        utilizationPct: 25,
        cores: 32,
      },
    ]);
  });

  it('does not mistake the driver-private counter for the allocation', () => {
    // "In use system memory (driver)"=0 sits directly before the figure we want,
    // and a loose key match would read the allocation as zero.
    const [gpu] = parseIoregAccelerators(appleSilicon);
    expect(gpu.allocatedBytes).toBeGreaterThan(0);
  });

  it('lists every accelerator on a machine with more than one GPU', () => {
    const dual = `${appleSilicon}
+-o IntelAccelerator  <class IntelAccelerator, id 0x1000004c1, registered>
    {
      "PerformanceStatistics" = {"Alloc system memory"=1073741824,"Device Utilization %"=7}
      "IOClass" = "IntelAccelerator"
    }
`;
    expect(parseIoregAccelerators(dual).map((g) => g.name)).toEqual(['Apple M1 Max', 'IntelAccelerator']);
  });

  it('falls back to the newer in-use counter when no allocation is published', () => {
    const entry = `+-o AGXAcceleratorG16  <class AGXAcceleratorG16>
    {
      "PerformanceStatistics" = {"In use system memory"=2097152}
      "model" = "Apple M4"
    }
`;
    expect(parseIoregAccelerators(entry)).toEqual([
      { name: 'Apple M4', allocatedBytes: 2_097_152, utilizationPct: undefined, cores: undefined },
    ]);
  });

  it('skips entries with no statistics dictionary, and empty output', () => {
    expect(parseIoregAccelerators('+-o Something  <class Something>\n    {\n      "IOClass" = "Something"\n    }\n')).toEqual([]);
    expect(parseIoregAccelerators('')).toEqual([]);
  });
});

describe('toGpuDevices', () => {
  const total = 65_536; // 64 GB of unified memory, in MB

  it('measures the allocation against the unified pool', () => {
    const [device] = toGpuDevices(parseIoregAccelerators(appleSilicon), total);
    expect(device).toEqual({
      name: 'Apple M1 Max (32-core GPU)',
      memoryTotalMB: total,
      memoryUsedMB: 22_517,
      memoryFreeMB: total - 22_517,
      utilizationPct: 25,
    });
  });

  it('never reports more memory used than the pool holds', () => {
    // The counter and the memory total are read a moment apart, so a reading can
    // land above the total; the meter must not run past 100%.
    const [device] = toGpuDevices([{ name: 'GPU', allocatedBytes: 999e9 }], total);
    expect(device.memoryUsedMB).toBe(total);
    expect(device.memoryFreeMB).toBe(0);
  });

  it('leaves the core count off a GPU that does not publish one', () => {
    expect(toGpuDevices([{ name: 'IntelAccelerator', allocatedBytes: 0 }], total)[0].name).toBe('IntelAccelerator');
  });
});
