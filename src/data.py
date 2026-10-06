from __future__ import annotations
import random
import re
import string
from dataclasses import dataclass
import pandas as pd
import tldextract
from .dga_internals import dictionary_dga, lcg_dga, md5_date_dga

FAMILIES = ["random", "hex", "numeric", "gozi_like", "matsnu_like", "suffix", "lcg", "md5_date"]
BENIGN = ["google.com", "microsoft.com", "github.com", "wikipedia.org", "python.org", "stanford.edu", "stackoverflow.com", "openai.com", "mozilla.org", "ubuntu.com", "apple.com", "cloudflare.com"]
_TLD_EXTRACTOR = tldextract.TLDExtract(suffix_list_urls=())


def normalize_domain(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"^[a-z][a-z0-9+.-]*://", "", value)
    value = value.split("/", 1)[0].split(":", 1)[0].rstrip(".")
    if value.startswith("www."):
        value = value[4:]
    return value


def split_domain(domain: str) -> tuple[str, str]:
    extracted = _TLD_EXTRACTOR(domain)
    if extracted.domain:
        return extracted.domain, extracted.suffix
    return domain, ""


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
    frame = frame[frame["domain"].str.match(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")]
    frame["sld"] = frame["domain"].map(lambda value: split_domain(value)[0])
    frame["tld"] = frame["domain"].map(lambda value: split_domain(value)[1])
    identity_counts = frame.groupby("sld").agg(
        labels=("label", "nunique"), families=("family", "nunique"),
    )
    conflicting_slds = identity_counts.index[
        (identity_counts["labels"] > 1) | (identity_counts["families"] > 1)
    ]
    frame = frame[~frame["sld"].isin(conflicting_slds)]
    frame = frame.drop_duplicates("sld")
    return frame.reset_index(drop=True)


_BENIGN_LABELS = {"0", "benign", "legit", "legitimate", "normal"}
_DOMAIN_PATTERN = r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"


def load_labeled_dataset(
    dga_path: str,
    tranco_path: str | None = None,
    max_per_class: int = 20_000,
    seed: int = 42,
) -> pd.DataFrame:
    """Load family-labelled DGA rows and optionally augment benign rows from Tranco."""
    source = pd.read_csv(dga_path, dtype=str)
    columns = {str(column).strip().lower(): column for column in source.columns}
    if "domain" not in columns or "class" not in columns:
        raise ValueError("DGA CSV must contain 'domain' and 'class' columns")

    source = source.rename(columns={columns["domain"]: "domain", columns["class"]: "class"})
    source = source[["domain", "class"]].dropna()
    source["family"] = source["class"].astype(str).str.strip().str.lower()
    if source["family"].eq("").any():
        raise ValueError("DGA CSV contains rows with an empty class label")
    source["label"] = (~source["family"].isin(_BENIGN_LABELS)).astype("int8")
    source.loc[source["label"] == 0, "family"] = "benign"
    frame = source[["domain", "label", "family"]]

    if tranco_path is not None:
        tranco = pd.read_csv(
            tranco_path, header=None, names=["rank", "domain"], usecols=[0, 1], dtype=str,
        )
        header_row = (
            tranco["rank"].astype(str).str.strip().str.lower().isin({"rank", ""})
            & tranco["domain"].astype(str).str.strip().str.lower().eq("domain")
        )
        tranco = tranco.loc[~header_row, ["domain"]].dropna()
        tranco["label"] = 0
        tranco["family"] = "benign"
        frame = pd.concat([frame, tranco], ignore_index=True)

    frame["domain"] = frame["domain"].astype(str).map(normalize_domain)
    frame = frame[frame["domain"].str.match(_DOMAIN_PATTERN, na=False)]
    if frame.empty:
        raise ValueError("No valid domain rows were found in the supplied datasets")

    frame["sld"] = frame["domain"].map(lambda value: split_domain(value)[0])
    frame["tld"] = frame["domain"].map(lambda value: split_domain(value)[1])
    identity_counts = frame.groupby("sld").agg(
        labels=("label", "nunique"), families=("family", "nunique"),
    )
    conflicting_slds = identity_counts.index[
        identity_counts["labels"] > 1
    ]
    frame = frame[~frame["sld"].isin(conflicting_slds)]
    ambiguous_slds = identity_counts.index[
        (identity_counts["labels"] == 1) & (identity_counts["families"] > 1)
    ]
    frame.loc[frame["sld"].isin(ambiguous_slds) & (frame["label"] == 1), "family"] = "ambiguous"
    frame = frame.drop_duplicates("sld")
    if frame["label"].nunique() != 2:
        raise ValueError("Training data must contain both benign and DGA domains")

    if max_per_class < 0:
        raise ValueError("max_per_class must be zero (unlimited) or a positive integer")
    if max_per_class:
        sampled = []
        benign = frame[frame["label"] == 0]
        sampled.append(benign.sample(min(len(benign), max_per_class), random_state=seed))
        dga = frame[frame["label"] == 1]
        families = sorted(dga["family"].unique())
        if not families:
            raise ValueError("Training data must contain at least one DGA family")
        per_family, remainder = divmod(max_per_class, len(families))
        for index, family in enumerate(families):
            family_rows = dga[dga["family"] == family]
            quota = per_family + (index < remainder)
            if quota:
                sampled.append(family_rows.sample(
                    min(len(family_rows), quota), random_state=seed,
                ))
        frame = pd.concat(sampled, ignore_index=True)

    return frame.sample(frac=1, random_state=seed).reset_index(drop=True)
