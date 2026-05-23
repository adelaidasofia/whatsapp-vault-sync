# whatsapp-vault-sync


<!-- mycelium-badges:start -->

<p>
  <a href="https://github.com/adelaidasofia/whatsapp-vault-sync/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/adelaidasofia/whatsapp-vault-sync?color=blue"></a>
  <a href="https://github.com/adelaidasofia/whatsapp-vault-sync/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/adelaidasofia/whatsapp-vault-sync?color=eab308"></a>
  <a href="https://github.com/adelaidasofia/whatsapp-vault-sync/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/adelaidasofia/whatsapp-vault-sync"></a>
  <a href="https://github.com/adelaidasofia/whatsapp-vault-sync/issues"><img alt="Open issues" src="https://img.shields.io/github/issues/adelaidasofia/whatsapp-vault-sync"></a>
  <a href="https://myceliumai.co"><img alt="Built by Mycelium AI" src="https://img.shields.io/badge/built_by-Mycelium_AI-15B89A"></a>
</p>

<!-- mycelium-badges:end -->

One QR scan → your entire WhatsApp history in Obsidian markdown.

Connects via the WhatsApp Web protocol (same as [WhatsApp Web](https://web.whatsapp.com)). Pulls full chat history, writes one searchable markdown file per contact, and keeps everything current with incremental re-runs. No manual per-chat exports. No third-party servers.

```
🤖 AI Chats/WhatsApp/
├── Silvia.md          # 4,312 messages · 2021-03-14 → 2026-04-23
├── Diego.md           # 892 messages   · 2024-01-08 → 2026-04-22
├── Mom.md             # 2,107 messages · 2019-11-01 → 2026-04-23
└── +573201234567.md   # contact not saved in phone
```

Each file:

```markdown
---
type: whatsapp-chat
contact: "Silvia"
phone: "+573001234567"
message_count: 4312
first_message: 2021-03-14
last_message: 2026-04-23
last_sync: 2026-04-23
---

# WhatsApp: Silvia

## 2026-04-23

**10:32 AM** You: viene a cenar hoy?
**10:45 AM** Silvia: si, a las 7
**11:02 AM** You: [Image: foto del apartamento]
```

YAML frontmatter makes every chat queryable with Dataview, searchable with Smart Connections, and graphable with the knowledge graph.

---

## What it captures

| Content | Exported |
|---------|----------|
| Text messages | Full text |
| Images / Videos | Caption (if any) + `[Image]` / `[Video]` marker |
| Voice notes | `[Voice note]` marker |
| Documents | `[Document: filename]` |
| Polls | `[Poll: question]` |
| Locations | `[Location]` |
| Contacts shared | `[Contact shared: Name]` |
| Reactions | Skipped (noise) |
| Groups | Skipped by default, `--groups` to include |
| Media files | Not downloaded (vault stays light) |

---

## Requirements

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **An iPhone or Android** with WhatsApp installed
- **macOS** for contact name resolution (`rename-contacts.py`). The sync itself (`sync.mjs`) works on any OS.

---

## Setup

```bash
git clone https://github.com/adelaidasofia/whatsapp-vault-sync
cd whatsapp-vault-sync
npm install
```

---

## First sync

```bash
VAULT_ROOT="/path/to/your/vault" node sync.mjs
```

1. A QR code appears in the terminal
2. On your phone: **Settings › Linked Devices › Link a Device**
3. Scan the code
4. Wait — WhatsApp delivers history in chunks. Large histories take a few minutes
5. Script exits when done. Files are in `<vault>/🤖 AI Chats/WhatsApp/`

Change the output folder:

```bash
VAULT_ROOT="/path/to/vault" WA_OUTPUT="Chats/WhatsApp" node sync.mjs
```

Include group chats:

```bash
VAULT_ROOT="/path/to/vault" node sync.mjs --groups
```

---

## Keep it current (incremental re-sync)

Run the same command any time. The session is saved in `baileys_auth/` so no QR scan is needed. Only messages since the last sync are fetched. Existing files are updated in place.

```bash
VAULT_ROOT="/path/to/vault" node sync.mjs
# Connected. Receiving history...
#   History: 547 chats | +23 messages
# Done. 3 conversations updated.
```

---

## Rename phone numbers to contact names (macOS)

On first sync, files for unsaved numbers land as `+1234567890.md`. To resolve them from your macOS Contacts:

**1. Grant Terminal access to Contacts**

System Settings › Privacy & Security › Contacts › enable Terminal

**2. Run the rename script**

```bash
VAULT_ROOT="/path/to/vault" python3 rename-contacts.py
```

This renames the files, updates `contact:` in the frontmatter, and fixes sender names in every message line. Safe to re-run — already-named files are left alone.

---

## How it works

WhatsApp Web uses a binary protocol over WebSocket. [Baileys](https://github.com/whiskeysockets/baileys) implements that protocol in Node.js — the same way your browser connects when you open web.whatsapp.com.

On first connect with `syncFullHistory: true`, WhatsApp pushes your message history in batches. This script accumulates those batches, then converts everything to markdown when the stream goes quiet. The session credentials are saved locally in `baileys_auth/` so subsequent runs look like a background reconnection, not a new device — WhatsApp only sends what's new.

**Nothing leaves your machine.** No relay server, no cloud, no analytics. Baileys connects directly from your computer to WhatsApp's servers.

---

## Troubleshooting

**QR code expired before I could scan**
The code refreshes automatically every ~20 seconds. Keep the terminal visible and scan the next one.

**"Logged out of WhatsApp" after re-running**
WhatsApp limits linked devices to 4. If you've exceeded that, unlink an old device in WhatsApp › Settings › Linked Devices, then delete `baileys_auth/` and run again.

**Files still named as phone numbers after renaming**
The number isn't saved in your macOS Contacts. Save it there and re-run `rename-contacts.py`.

**History seems incomplete (only ~90 days)**
WhatsApp retains roughly 90 days of messages on its servers. Older messages live only on your phone. If you have an iCloud or Google Drive backup, restoring it to the phone first will make more history available.

**"Access Denied" when running rename-contacts.py**
Terminal needs Contacts permission: System Settings › Privacy & Security › Contacts.

---

## Session files

| File | Purpose | Delete to... |
|------|---------|-------------|
| `baileys_auth/` | WhatsApp session credentials | Force re-scan QR on next run |
| `baileys_store.json` | Accumulated message cache | Reset to full re-sync |
| `.last_sync` | Timestamp of last run | No effect on sync |

---

## Part of the ai-brain-starter ecosystem

This tool is designed to work alongside [ai-brain-starter](https://github.com/adelaidasofia/ai-brain-starter) — a full operating system for Claude Code with memory, journaling, knowledge graphs, and pattern recognition. WhatsApp chats land in the same vault structure, become part of the same knowledge graph, and are searchable by Claude alongside your journals and notes.

---

## License

MIT
