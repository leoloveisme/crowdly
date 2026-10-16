#!/usr/bin/env python3
"""Checks that every interface string id the Android app uses has an entry
in backend/scripts/data/interface-translations.seed.json (page key
/__android__), with Russian and German. Run from the repo root:

    python3 apps/android/scripts/check-translations.py
"""
import glob
import json
import re
import sys

ids = {}
for f in sorted(glob.glob("apps/android/app/src/main/java/**/*.kt", recursive=True)):
    s = open(f, encoding="utf-8").read()
    for m in re.finditer(r'(?:AppText|tr)\(\s*"(android-[a-z0-9-]+)"\s*,\s*"((?:[^"\\]|\\.)*)"', s):
        ids.setdefault(m.group(1), m.group(2))
    for m in re.finditer(r'"(android-[a-z0-9-]+)"\s*(?:to|,)\s*"((?:[^"\\]|\\.)*)"', s):
        ids.setdefault(m.group(1), m.group(2))

seed = json.load(open("backend/scripts/data/interface-translations.seed.json", encoding="utf-8"))
have = {e["element_id"]: e for e in seed if e.get("page_key") == "/__android__"}
missing = [i for i in ids if i not in have]
untranslated = [i for i, e in have.items() if not e.get("ru") or not e.get("de")]
templated = [i for i, en in ids.items() if "${" in en]
for name, items in (("missing from the seed", missing), ("without ru/de", untranslated), ("with Kotlin templates (untranslatable)", templated)):
    if items:
        print(f"{len(items)} id(s) {name}: {', '.join(items)}")
if missing or untranslated or templated:
    sys.exit(1)
print(f"all {len(ids)} Android interface strings are in the seed with ru and de")
