import { spawnSync, execFile } from 'node:child_process';
import * as fmp4Module from '../../src/utils/fmp4';
import {
  hasSystemFfmpeg,
  resetFfmpegCache,
  mergeDashStreams,
  mergeWithFfmpeg,
} from '../../src/utils/media';

jest.mock('node:child_process', () => {
  const actual = jest.requireActual('node:child_process');
  return {
    ...actual,
    spawnSync: jest.fn(),
    execFile: jest.fn(),
  };
});

describe('media FFmpeg first priority & fallback', () => {
  const mockSpawnSync = spawnSync as unknown as jest.Mock;
  const mockExecFile = execFile as unknown as jest.Mock;

  beforeEach(() => {
    resetFfmpegCache();
    jest.clearAllMocks();
  });

  describe('hasSystemFfmpeg', () => {
    test('returns true when spawnSync succeeds with status 0', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });

      expect(hasSystemFfmpeg()).toBe(true);
      // Cache check: second call should not invoke spawnSync again
      expect(hasSystemFfmpeg()).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    });

    test('returns false when spawnSync returns non-zero or errors', () => {
      mockSpawnSync.mockReturnValue({ status: 1 });

      expect(hasSystemFfmpeg()).toBe(false);
    });

    test('returns false when spawnSync throws', () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(hasSystemFfmpeg()).toBe(false);
    });
  });

  describe('mergeWithFfmpeg', () => {
    test('calls ffmpeg with stream copy arguments', async () => {
      mockExecFile.mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        callback(null, { stdout: '', stderr: '' });
      });

      await mergeWithFfmpeg('v.m4v', 'a.m4a', 'out.mp4');

      expect(mockExecFile).toHaveBeenCalledWith(
        'ffmpeg',
        ['-y', '-loglevel', 'error', '-i', 'v.m4v', '-i', 'a.m4a', '-c', 'copy', 'out.mp4'],
        { windowsHide: true },
        expect.any(Function),
      );
    });

    test('throws when execFile returns error', async () => {
      mockExecFile.mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        callback(new Error('exit code 1'), { stdout: '', stderr: 'Invalid data' });
      });

      await expect(mergeWithFfmpeg('v.m4v', 'a.m4a', 'out.mp4')).rejects.toThrow('ffmpeg merge failed');
    });
  });

  describe('mergeDashStreams routing', () => {
    test('prioritizes ffmpeg when available', async () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      mockExecFile.mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        callback(null, { stdout: '', stderr: '' });
      });

      const fmp4Spy = jest.spyOn(fmp4Module, 'mergeFmp4').mockResolvedValue(undefined);

      await mergeDashStreams('v.m4v', 'a.m4a', 'out.mp4');

      expect(mockExecFile).toHaveBeenCalled();
      expect(fmp4Spy).not.toHaveBeenCalled();

      fmp4Spy.mockRestore();
    });

    test('falls back to builtin merge when ffmpeg fails', async () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      mockExecFile.mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        callback(new Error('ffmpeg crash'), { stdout: '', stderr: 'error' });
      });

      const fmp4Spy = jest.spyOn(fmp4Module, 'mergeFmp4').mockResolvedValue(undefined);

      await mergeDashStreams('v.m4v', 'a.m4a', 'out.mp4');

      expect(mockExecFile).toHaveBeenCalled();
      expect(fmp4Spy).toHaveBeenCalledWith('v.m4v', 'a.m4a', 'out.mp4');

      fmp4Spy.mockRestore();
    });

    test('skips ffmpeg when builtinMerge is true', async () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const fmp4Spy = jest.spyOn(fmp4Module, 'mergeFmp4').mockResolvedValue(undefined);

      await mergeDashStreams('v.m4v', 'a.m4a', 'out.mp4', { builtinMerge: true });

      expect(mockExecFile).not.toHaveBeenCalled();
      expect(fmp4Spy).toHaveBeenCalledWith('v.m4v', 'a.m4a', 'out.mp4');

      fmp4Spy.mockRestore();
    });

    test('directly calls builtin merge when ffmpeg is not installed', async () => {
      mockSpawnSync.mockReturnValue({ status: 1 });
      const fmp4Spy = jest.spyOn(fmp4Module, 'mergeFmp4').mockResolvedValue(undefined);

      await mergeDashStreams('v.m4v', 'a.m4a', 'out.mp4');

      expect(mockExecFile).not.toHaveBeenCalled();
      expect(fmp4Spy).toHaveBeenCalledWith('v.m4v', 'a.m4a', 'out.mp4');

      fmp4Spy.mockRestore();
    });
  });
});
