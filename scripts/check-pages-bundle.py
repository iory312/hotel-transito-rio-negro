"""Fail the Pages build if a secret key is embedded, and require the anon key."""

from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path


def main() -> None:
    blob = "\n".join(
        path.read_text(errors="replace")
        for path in Path("dist").rglob("*")
        if path.is_file() and path.suffix in {".js", ".html", ".css"}
    )
    if "supabase.co" not in blob:
        sys.exit("O build não aponta para o Supabase.")
    if re.search(r"sb_secret_[A-Za-z0-9]{8,}", blob):
        sys.exit("O build contém uma chave sb_secret.")
    found_anon = False
    for token in re.findall(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+", blob):
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        try:
            data = json.loads(base64.urlsafe_b64decode(payload))
        except (json.JSONDecodeError, ValueError):
            continue
        role = data.get("role")
        if role == "service_role":
            sys.exit("O build contém um JWT service_role.")
        if role == "anon":
            found_anon = True
    if not found_anon:
        sys.exit("O build não contém a chave anon.")
    print("bundle ok: chave anon presente, service_role ausente")


if __name__ == "__main__":
    main()
