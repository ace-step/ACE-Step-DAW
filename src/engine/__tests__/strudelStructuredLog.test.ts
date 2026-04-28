/**
 * Tests for the Strudel structured logging system.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  StrudelEventLog,
  type StrudelLogEntry,
  type StrudelLogLevel,
} from '../strudelStructuredLog';

describe('StrudelEventLog', () => {
  let eventLog: StrudelEventLog;

  beforeEach(() => {
    eventLog = new StrudelEventLog(100);
  });

  it('records events with timestamps', () => {
    eventLog.emit('evaluate', { code: 's("bd sd")' });
    const entries = eventLog.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].event).toBe('evaluate');
    expect(entries[0].data.code).toBe('s("bd sd")');
    expect(typeof entries[0].timestamp).toBe('number');
  });

  it('records with different log levels', () => {
    eventLog.emit('evaluate', { code: 'test' }, 'info');
    eventLog.emit('error', { message: 'parse failed' }, 'error');
    const entries = eventLog.getEntries();
    expect(entries[0].level).toBe('info');
    expect(entries[1].level).toBe('error');
  });

  it('caps entries at maxSize', () => {
    const smallLog = new StrudelEventLog(3);
    smallLog.emit('a', {});
    smallLog.emit('b', {});
    smallLog.emit('c', {});
    smallLog.emit('d', {});
    const entries = smallLog.getEntries();
    expect(entries.length).toBe(3);
    expect(entries[0].event).toBe('b');
    expect(entries[2].event).toBe('d');
  });

  it('filters by event type', () => {
    eventLog.emit('evaluate', { code: 'a' });
    eventLog.emit('error', { message: 'fail' });
    eventLog.emit('evaluate', { code: 'b' });
    const filtered = eventLog.getEntries({ event: 'evaluate' });
    expect(filtered.length).toBe(2);
    expect(filtered.every((e) => e.event === 'evaluate')).toBe(true);
  });

  it('filters by log level', () => {
    eventLog.emit('a', {}, 'info');
    eventLog.emit('b', {}, 'error');
    eventLog.emit('c', {}, 'warn');
    const errors = eventLog.getEntries({ level: 'error' });
    expect(errors.length).toBe(1);
    expect(errors[0].event).toBe('b');
  });

  it('filters by time range', () => {
    const now = Date.now();
    eventLog.emit('old', {});
    // Entries are timestamped on creation, so filter by since
    const entries = eventLog.getEntries({ since: now - 1 });
    expect(entries.length).toBeGreaterThan(0);
  });

  it('clear removes all entries', () => {
    eventLog.emit('a', {});
    eventLog.emit('b', {});
    eventLog.clear();
    expect(eventLog.getEntries().length).toBe(0);
  });

  it('provides JSON-serializable output', () => {
    eventLog.emit('evaluate', { code: 's("bd")' });
    const json = JSON.stringify(eventLog.getEntries());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('notifies subscribers on new events', () => {
    const received: StrudelLogEntry[] = [];
    const unsubscribe = eventLog.subscribe((entry) => received.push(entry));
    eventLog.emit('test', { value: 42 });
    expect(received.length).toBe(1);
    expect(received[0].event).toBe('test');
    unsubscribe();
    eventLog.emit('after', {});
    expect(received.length).toBe(1); // no new notification
  });
});
