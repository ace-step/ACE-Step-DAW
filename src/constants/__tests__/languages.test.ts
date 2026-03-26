import { describe, expect, it } from 'vitest';
import { VOCAL_LANGUAGES, DEFAULT_VOCAL_LANGUAGE } from '../languages';

// Server-side VALID_LANGUAGES from acestep/constants.py
const SERVER_VALID_LANGUAGES = [
  'ar', 'az', 'bg', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en',
  'es', 'fa', 'fi', 'fr', 'he', 'hi', 'hr', 'ht', 'hu', 'id',
  'is', 'it', 'ja', 'ko', 'la', 'lt', 'ms', 'ne', 'nl', 'no',
  'pa', 'pl', 'pt', 'ro', 'ru', 'sa', 'sk', 'sr', 'sv', 'sw',
  'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'yue', 'zh',
  'unknown',
];

describe('VOCAL_LANGUAGES', () => {
  it('every value is a valid server-side language', () => {
    for (const lang of VOCAL_LANGUAGES) {
      expect(SERVER_VALID_LANGUAGES).toContain(lang.value);
    }
  });

  it('has no duplicate values', () => {
    const values = VOCAL_LANGUAGES.map((l) => l.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('does not contain "auto" (unsupported by server)', () => {
    const values = VOCAL_LANGUAGES.map((l) => l.value);
    expect(values).not.toContain('auto');
  });

  it('first option is the default (unknown/Auto)', () => {
    expect(VOCAL_LANGUAGES[0].value).toBe('unknown');
  });

  it('contains core languages: en, zh, ja, ko', () => {
    const values = VOCAL_LANGUAGES.map((l) => l.value);
    expect(values).toContain('en');
    expect(values).toContain('zh');
    expect(values).toContain('ja');
    expect(values).toContain('ko');
  });
});

describe('DEFAULT_VOCAL_LANGUAGE', () => {
  it('is "unknown" (triggers server CoT auto-detection)', () => {
    expect(DEFAULT_VOCAL_LANGUAGE).toBe('unknown');
  });

  it('exists in VOCAL_LANGUAGES', () => {
    const values = VOCAL_LANGUAGES.map((l) => l.value);
    expect(values).toContain(DEFAULT_VOCAL_LANGUAGE);
  });
});
