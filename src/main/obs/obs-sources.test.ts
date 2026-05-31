// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { classifySource } from './obs-sources';

describe('classifySource', () => {
  it('classifies audio inputs', () => {
    expect(classifySource('wasapi_input_capture')).toBe('audio');
    expect(classifySource('coreaudio_input_capture')).toBe('audio');
    expect(classifySource('pulse_output_capture')).toBe('audio');
  });
  it('classifies browser sources', () => {
    expect(classifySource('browser_source')).toBe('browser');
  });
  it('classifies image sources', () => {
    expect(classifySource('image_source')).toBe('image');
  });
  it('classifies video/capture sources', () => {
    expect(classifySource('game_capture')).toBe('video');
    expect(classifySource('dshow_input')).toBe('video');
    expect(classifySource('monitor_capture')).toBe('video');
  });
  it('falls back to other for unknown or missing kinds', () => {
    expect(classifySource(undefined)).toBe('other');
    expect(classifySource('')).toBe('other');
    expect(classifySource('text_gdiplus_v2')).toBe('other');
  });
});
