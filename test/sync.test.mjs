/**
 * Unit tests for the pure helpers exported by sync.mjs.
 * Run: node --test test/
 *
 * These cover the logic changed for Windows support + the history-sync
 * truncation fix, so regressions in either fail loudly on every OS in CI.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseArgs,
  sanitizeFilename,
  extractText,
  buildMarkdown,
  shouldFallbackExport,
  formatPairingCode,
} from '../sync.mjs'

// ── parseArgs ────────────────────────────────────────────────────────────────

test('parseArgs: defaults', () => {
  assert.deepEqual(parseArgs([]), { groups: false, vault: null, pair: null })
})

test('parseArgs: --groups flag', () => {
  assert.equal(parseArgs(['--groups']).groups, true)
})

test('parseArgs: --vault with space-separated value', () => {
  assert.equal(parseArgs(['--vault', '/Users/me/My Vault']).vault, '/Users/me/My Vault')
})

test('parseArgs: --vault= form', () => {
  assert.equal(parseArgs(['--vault=C:\\Users\\me\\Vault']).vault, 'C:\\Users\\me\\Vault')
})

test('parseArgs: --pair with phone number', () => {
  assert.equal(parseArgs(['--pair', '+15551234567']).pair, '+15551234567')
})

test('parseArgs: --pair= form and combined flags', () => {
  const a = parseArgs(['--vault', '/v', '--pair=+573001234567', '--groups'])
  assert.equal(a.vault, '/v')
  assert.equal(a.pair, '+573001234567')
  assert.equal(a.groups, true)
})

// ── sanitizeFilename (Windows-safe) ──────────────────────────────────────────

test('sanitizeFilename: strips path and shell-hostile characters', () => {
  assert.equal(sanitizeFilename('a/b\\c?d%e*f:g|h"i<j>k'), 'a-b-c-d-e-f-g-h-i-j-k')
})

test('sanitizeFilename: strips Windows-invalid trailing dots and spaces', () => {
  assert.equal(sanitizeFilename('name...'), 'name')
  assert.equal(sanitizeFilename('name   '), 'name')
  assert.equal(sanitizeFilename('name. . '), 'name')
})

test('sanitizeFilename: escapes Windows reserved device names', () => {
  assert.equal(sanitizeFilename('CON'), 'CON_')
  assert.equal(sanitizeFilename('nul'), 'nul_')
  assert.equal(sanitizeFilename('COM1'), 'COM1_')
  assert.equal(sanitizeFilename('lpt9'), 'lpt9_')
  // Not reserved: contains more than the device name
  assert.equal(sanitizeFilename('CONTRERAS'), 'CONTRERAS')
})

test('sanitizeFilename: control characters removed, empty falls back', () => {
  assert.equal(sanitizeFilename('a\u0007bc'), 'abc')
  assert.equal(sanitizeFilename('???'), '---')
  assert.equal(sanitizeFilename(''), 'Unknown')
  assert.equal(sanitizeFilename('. .'), 'Unknown')
})

// ── extractText ──────────────────────────────────────────────────────────────

test('extractText: plain conversation', () => {
  assert.equal(extractText({ message: { conversation: 'hola' } }), 'hola')
})

test('extractText: extended text', () => {
  assert.equal(extractText({ message: { extendedTextMessage: { text: 'link text' } } }), 'link text')
})

test('extractText: image with and without caption', () => {
  assert.equal(extractText({ message: { imageMessage: { caption: 'foto' } } }), '[Image: foto]')
  assert.equal(extractText({ message: { imageMessage: {} } }), '[Image]')
})

test('extractText: voice note vs audio', () => {
  assert.equal(extractText({ message: { audioMessage: { ptt: true } } }), '[Voice note]')
  assert.equal(extractText({ message: { audioMessage: { ptt: false } } }), '[Audio]')
})

test('extractText: reactions and protocol messages are skipped', () => {
  assert.equal(extractText({ message: { reactionMessage: { text: '❤️' } } }), null)
  assert.equal(extractText({ message: { protocolMessage: {} } }), null)
})

test('extractText: ephemeral unwraps to inner message', () => {
  const msg = { message: { ephemeralMessage: { message: { conversation: 'secreto' } } } }
  assert.equal(extractText(msg), 'secreto')
})

// ── buildMarkdown ────────────────────────────────────────────────────────────

test('buildMarkdown: builds frontmatter and message lines', () => {
  const messages = [
    { messageTimestamp: 1700000000, key: { fromMe: true }, message: { conversation: 'hey' } },
    { messageTimestamp: 1700000060, key: { fromMe: false }, message: { conversation: 'hi!' } },
  ]
  const md = buildMarkdown('Alex', '15551234567', messages)
  assert.ok(md.includes('type: whatsapp-chat'))
  assert.ok(md.includes('contact: "Alex"'))
  assert.ok(md.includes('phone: "+15551234567"'))
  assert.ok(md.includes('message_count: 2'))
  assert.ok(md.includes('# WhatsApp: Alex'))
  assert.ok(md.includes('You: hey'))
  assert.ok(md.includes('Alex: hi!'))
})

test('buildMarkdown: returns null when no usable messages', () => {
  const messages = [
    { messageTimestamp: 1700000000, message: { reactionMessage: { text: '👍' } } },
    { messageTimestamp: 0, message: { conversation: 'ts invalid' } },
  ]
  assert.equal(buildMarkdown('X', '1', messages), null)
})

// ── shouldFallbackExport (the 20 s truncation fix) ──────────────────────────

test('shouldFallbackExport: fires only when NO history chunk ever arrived', () => {
  // already-synced session, no history events → fallback exports
  assert.equal(shouldFallbackExport(false, 0), true)
  // chunks are streaming → the idle timer owns completion, fallback must NOT fire
  assert.equal(shouldFallbackExport(false, 1752400000000), false)
  // already exported → never re-export
  assert.equal(shouldFallbackExport(true, 0), false)
  assert.equal(shouldFallbackExport(true, 1752400000000), false)
})

// ── formatPairingCode ────────────────────────────────────────────────────────

test('formatPairingCode: groups into 4-char blocks', () => {
  assert.equal(formatPairingCode('ABCD1234'), 'ABCD-1234')
  assert.equal(formatPairingCode('ABC'), 'ABC')
})
