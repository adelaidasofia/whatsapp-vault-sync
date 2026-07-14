#!/usr/bin/env python3
"""
rename-contacts.py  (macOS only)

After sync.mjs runs, chat files are named by phone number (+1234567890.md).
This script cross-references macOS Contacts to rename them to real names
and updates the frontmatter + message lines inside each file.

Requirements:
  - macOS
  - Terminal must have Contacts permission:
    System Settings › Privacy & Security › Contacts › Terminal (enable)

Usage:
  VAULT_ROOT=/path/to/vault python3 rename-contacts.py
  python3 rename-contacts.py --vault /path/to/vault
  python3 rename-contacts.py --vault /path/to/vault --output "Notes/WhatsApp"
"""

import os
import platform
import re
import sys
import subprocess
import tempfile
import argparse
from pathlib import Path

# macOS only: contact resolution reads Contacts.app via a Swift snippet.
# Fail with a clear message instead of a FileNotFoundError traceback when
# `swift` is missing (Windows/Linux). sync.mjs itself runs on any OS.
if platform.system() != "Darwin":
    print("rename-contacts.py is macOS-only (it reads Contacts.app via Swift).")
    print("The sync itself (sync.mjs) works on any OS — this optional step just")
    print("renames +phone-number files to contact names using macOS Contacts.")
    sys.exit(1)

# ── Args ──────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--vault",  default=os.environ.get("VAULT_ROOT", ""),
                    help="Vault root path (or set VAULT_ROOT env var)")
parser.add_argument("--output", default="🤖 AI Chats/WhatsApp",
                    help="Subfolder within vault (default: 🤖 AI Chats/WhatsApp)")
args = parser.parse_args()

if not args.vault:
    print("Error: provide --vault /path/to/vault or set VAULT_ROOT env var")
    sys.exit(1)

WA_DIR = Path(args.vault) / args.output
if not WA_DIR.exists():
    print(f"Error: {WA_DIR} not found. Run sync.mjs first.")
    sys.exit(1)

# ── Export contacts from macOS Contacts via Swift ─────────────────────────────

SWIFT = """
import Contacts, Foundation
let store = CNContactStore()
let keys = [CNContactGivenNameKey, CNContactFamilyNameKey,
            CNContactOrganizationNameKey, CNContactPhoneNumbersKey] as [CNKeyDescriptor]
var out = ""
do {
    let req = CNContactFetchRequest(keysToFetch: keys)
    try store.enumerateContacts(with: req) { c, _ in
        var name = "\\(c.givenName) \\(c.familyName)".trimmingCharacters(in: .whitespaces)
        if name.isEmpty { name = c.organizationName }
        if name.isEmpty { return }
        for ph in c.phoneNumbers { out += "\\(name)\\t\\(ph.value.stringValue)\\n" }
    }
} catch { fputs("Error: \\(error)\\n", stderr); exit(1) }
print(out, terminator: "")
"""

print("Reading macOS Contacts...")
with tempfile.NamedTemporaryFile(suffix=".swift", mode="w", delete=False) as f:
    f.write(SWIFT)
    swift_path = f.name

result = subprocess.run(["swift", swift_path], capture_output=True, text=True)
os.unlink(swift_path)

if result.returncode != 0:
    err = result.stderr.strip()
    print(f"\nCould not read Contacts: {err}")
    if "Access Denied" in err:
        print("\nFix: System Settings › Privacy & Security › Contacts")
        print("     Enable access for Terminal, then re-run.")
    sys.exit(1)

# ── Phone → name lookup ───────────────────────────────────────────────────────

def normalize(phone: str) -> str:
    return re.sub(r"\D", "", phone)

phone_map: dict[str, str] = {}
for line in result.stdout.splitlines():
    if "\t" not in line:
        continue
    name, phone = line.split("\t", 1)
    d = normalize(phone)
    if len(d) < 7:
        continue
    phone_map[d] = name
    if d.startswith("1") and len(d) == 11:
        phone_map[d[1:]] = name          # US: try without country code
    if d.startswith("57") and len(d) == 12:
        phone_map[d[2:]] = name          # Colombia: try without country code

print(f"Loaded {len(phone_map):,} phone entries")

def lookup(digits: str) -> str | None:
    return (phone_map.get(digits)
         or phone_map.get(digits[1:]  if digits.startswith("1")  else "")
         or phone_map.get("1" + digits)
         or phone_map.get(digits[2:]  if digits.startswith("57") else "")
         or phone_map.get("57" + digits))

# ── Rename and update files ───────────────────────────────────────────────────

def sanitize(name: str) -> str:
    s = re.sub(r'[/\\?%*:|"<>\[\]]', "-", name).strip()
    s = re.sub(r"[. ]+$", "", s)  # Windows forbids trailing dots/spaces
    if re.fullmatch(r"(?i)CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]", s):
        s += "_"  # Windows reserved device names
    return s or "Unknown"

matched, unmatched = 0, 0

for filepath in sorted(WA_DIR.glob("+*.md")):
    digits = normalize(filepath.stem)
    name   = lookup(digits)

    if not name:
        unmatched += 1
        continue

    new_stem = sanitize(name)
    dst      = WA_DIR / (new_stem + ".md")

    if dst.exists() and dst != filepath:
        dst = WA_DIR / f"{new_stem} ({digits[-4:]}).md"

    filepath.rename(dst)

    content = dst.read_text(encoding="utf-8")
    content = re.sub(r'^contact: "?\+?\d+"?',   f'contact: "{name}"',     content, flags=re.MULTILINE)
    content = re.sub(r'^# WhatsApp: \+\d+',      f'# WhatsApp: {name}',   content, flags=re.MULTILINE)
    content = re.sub(r'(\*\*\d+:\d+ [AP]M\*\* )\+\d+:', rf'\g<1>{name}:', content)
    dst.write_text(content, encoding="utf-8")

    matched += 1

total = matched + unmatched
print(f"\nRenamed:     {matched} / {total}")
print(f"Unmatched:   {unmatched}  (not in Contacts — international or unsaved numbers)")
