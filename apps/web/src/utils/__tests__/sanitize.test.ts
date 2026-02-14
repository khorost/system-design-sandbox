import { describe, it, expect } from 'vitest';
import { stripHtml, sanitizeLabel, sanitizeString, sanitizeConfig } from '../sanitize.ts';

describe('stripHtml', () => {
  it('removes <script> tags', () => {
    expect(stripHtml('hello<script>alert(1)</script>world')).toBe('helloalert(1)world');
  });

  it('removes <b> tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
  });

  it('removes <img> with onerror', () => {
    expect(stripHtml('<img onerror="alert(1)" src=x>')).toBe('');
  });

  it('removes nested tags', () => {
    expect(stripHtml('<div><span>text</span></div>')).toBe('text');
  });

  it('returns plain string unchanged', () => {
    expect(stripHtml('no tags here')).toBe('no tags here');
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });
});

describe('sanitizeLabel', () => {
  it('strips HTML and trims', () => {
    expect(sanitizeLabel('  <b>My Service</b>  ')).toBe('My Service');
  });

  it('truncates to 100 characters', () => {
    const long = 'A'.repeat(150);
    expect(sanitizeLabel(long)).toBe('A'.repeat(100));
  });

  it('handles label with script injection', () => {
    expect(sanitizeLabel('<script>alert("xss")</script>Service')).toBe('alert("xss")Service');
  });
});

describe('sanitizeString', () => {
  it('strips HTML and trims', () => {
    expect(sanitizeString('  <i>value</i>  ')).toBe('value');
  });

  it('truncates to default 500 characters', () => {
    const long = 'B'.repeat(600);
    expect(sanitizeString(long)).toBe('B'.repeat(500));
  });

  it('supports custom maxLength', () => {
    const long = 'C'.repeat(50);
    expect(sanitizeString(long, 20)).toBe('C'.repeat(20));
  });
});

describe('sanitizeConfig', () => {
  it('sanitizes string values', () => {
    const config = { name: '<b>test</b>', region: '  <script>x</script>us-east  ' };
    const result = sanitizeConfig(config);
    expect(result.name).toBe('test');
    expect(result.region).toBe('xus-east');
  });

  it('preserves number values', () => {
    const config = { replicas: 3, memory_gb: 16.5 };
    const result = sanitizeConfig(config);
    expect(result.replicas).toBe(3);
    expect(result.memory_gb).toBe(16.5);
  });

  it('preserves boolean values', () => {
    const config = { enabled: true, debug: false };
    const result = sanitizeConfig(config);
    expect(result.enabled).toBe(true);
    expect(result.debug).toBe(false);
  });

  it('preserves arrays and objects', () => {
    const tags = [{ tag: 'read', weight: 1 }];
    const config = { tagDistribution: tags };
    const result = sanitizeConfig(config);
    expect(result.tagDistribution).toBe(tags);
  });
});
