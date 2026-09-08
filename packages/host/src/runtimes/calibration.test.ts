import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDataDir } from '../paths.js';
import { CALIBRATION_DEFAULTS, overheadFloorFor, recordMeasurement, resetCalibration } from './calibration.js';

const MB = 1024 * 1024;
const GB = 1024 ** 3;

describe('calibration', () => {
  beforeEach(() => {
    setDataDir(mkdtempSync(join(tmpdir(), 'nekko-calib-')));
    resetCalibration();
  });

  it('starts at the default floor with no samples', () => {
    expect(overheadFloorFor('ollama', '0.5.7')).toBe(CALIBRATION_DEFAULTS.DEFAULT_FLOOR_BYTES);
  });

  it('moves toward a measured residual without jumping all the way', () => {
    // We projected 10 GB with 256 MB of overhead; it actually took 10.5 GB, so
    // the implied overhead is 756 MB.
    recordMeasurement('ollama', '0.5.7', 10 * GB + 512 * MB, 10 * GB, 256 * MB);
    const floor = overheadFloorFor('ollama', '0.5.7');
    expect(floor).toBeGreaterThan(CALIBRATION_DEFAULTS.DEFAULT_FLOOR_BYTES);
    expect(floor).toBeLessThan(756 * MB);
  });

  it('converges toward the truth over repeated samples', () => {
    for (let i = 0; i < 20; i++) {
      recordMeasurement('ollama', '0.5.7', 10 * GB + 512 * MB, 10 * GB, 256 * MB);
    }
    expect(overheadFloorFor('ollama', '0.5.7')).toBeGreaterThan(700 * MB);
  });

  it('discards a residual that is obviously measurement noise', () => {
    recordMeasurement('ollama', '0.5.7', 200 * GB, 10 * GB, 256 * MB); // absurdly high
    recordMeasurement('ollama', '0.5.7', 1 * MB, 10 * GB, 256 * MB); // absurdly low
    expect(overheadFloorFor('ollama', '0.5.7')).toBe(CALIBRATION_DEFAULTS.DEFAULT_FLOOR_BYTES);
  });

  it('ignores a nonsense measurement outright', () => {
    recordMeasurement('ollama', '0.5.7', 0, 10 * GB, 256 * MB);
    recordMeasurement('ollama', '0.5.7', Number.NaN, 10 * GB, 256 * MB);
    expect(overheadFloorFor('ollama', '0.5.7')).toBe(CALIBRATION_DEFAULTS.DEFAULT_FLOOR_BYTES);
  });

  it('keeps calibration per runtime version, since an upgrade can change behaviour', () => {
    recordMeasurement('ollama', '0.5.7', 10 * GB + 512 * MB, 10 * GB, 256 * MB);
    expect(overheadFloorFor('ollama', '0.6.0')).toBe(CALIBRATION_DEFAULTS.DEFAULT_FLOOR_BYTES);
    expect(overheadFloorFor('lmstudio', '0.5.7')).toBe(CALIBRATION_DEFAULTS.DEFAULT_FLOOR_BYTES);
  });
});
