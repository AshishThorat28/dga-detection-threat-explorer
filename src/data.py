from __future__ import annotations
import random
import re
import string
from dataclasses import dataclass
import pandas as pd
from .dga_internals import dictionary_dga, lcg_dga, md5_date_dga

FAMILIES = ["random", "hex", "numeric", "gozi_like", "matsnu_like", "suffix", "lcg", "md5_date"]
BENIGN = ["google.com", "microsoft.com", "github.com", "wikipedia.org", "python.org", "stanford.edu", "stackoverflow.com", "openai.com", "mozilla.org", "ubuntu.com", "apple.com", "cloudflare.com"]


def normalize_domain(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"^[a-z][a-z0-9+.-]*://", "", value)
    value = value.split("/", 1)[0].split(":", 1)[0].rstrip(".")
    if value.startswith("www."):
        value = value[4:]
    return value


def split_domain(domain: str) -> tuple[str, str]:
    parts = domain.split(".")
    return (parts[-2] if len(parts) >= 2 else parts[0], parts[-1] if len(parts) >= 2 else "")


def _synthetic(seed: int = 42, per_family: int = 300) -> pd.DataFrame:
    rng = random.Random(seed)
    rows = []
    benign = (BENIGN * ((per_family * len(FAMILIES)) // len(BENIGN) + 1))[: per_family * len(FAMILIES)]
    for domain in benign:
        sld, tld = split_domain(domain)
        rows.append({"domain": domain, "sld": sld, "tld": tld, "label": 0, "family": "benign"})
    for i in range(per_family):
        rows.append({"domain": "".join(rng.choice(string.ascii_lowercase) for _ in range(13)) + ".com", "sld": "", "tld": "", "label": 1, "family": "random"})
    for i in range(per_family):
        value = "".join(rng.choice("0123456789abcdef") for _ in range(16)) + ".net"
        rows.append({"domain": value, "sld": value.split(".")[0], "tld": "net", "label": 1, "family": "hex"})
    for family, generator in [("lcg", lcg_dga), ("md5_date", md5_date_dga), ("suffix", dictionary_dga)]:
        for domain in generator(42, "2026-01-01", per_family):
            sld, tld = split_domain(domain)
            rows.append({"domain": domain, "sld": sld, "tld": tld, "label": 1, "family": family})
    for family, suffix in [("gozi_like", "-update.com"), ("matsnu_like", ".biz"), ("numeric", ".xyz")]:
        for _ in range(per_family):
            stem = "".join(rng.choice(string.ascii_lowercase + string.digits) for _ in range(10))
            domain = stem + suffix
            sld, tld = split_domain(domain)
            rows.append({"domain": domain, "sld": sld, "tld": tld, "label": 1, "family": family})
    frame = pd.DataFrame(rows).drop_duplicates("domain")
    frame["sld"] = frame["domain"].map(lambda x: split_domain(x)[0])
    frame["tld"] = frame["domain"].map(lambda x: split_domain(x)[1])
    return frame.reset_index(drop=True)


def load_dataset(path: str | None = None, per_family: int = 300) -> pd.DataFrame:
    if path:
        frame = pd.read_csv(path)
    else:
        frame = _synthetic(per_family=per_family)
    frame["domain"] = frame["domain"].astype(str).map(normalize_domain)
    frame = frame.drop_duplicates("domain")
    frame = frame[frame["domain"].str.match(r"^[a-z0-9-]+\.[a-z]{2,63}$")]
    return frame.reset_index(drop=True)
