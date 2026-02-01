from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from enum import Enum
from typing import Set


class IOCType(str, Enum):
    """Supported IOC types."""

    IP = "ip"
    DOMAIN = "domain"
    HASH = "hash"
    URL = "url"


@dataclass(frozen=True)
class IOC:
    """Represents an indicator of compromise."""

    type: IOCType
    value: str


_IP_PATTERN = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_DOMAIN_PATTERN = re.compile(
    r"(?<![a-z0-9-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?![a-z0-9-])", re.IGNORECASE
)
_HASH_PATTERN = re.compile(
    r"\b(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})\b", re.IGNORECASE
)
_URL_PATTERN = re.compile(r"https?://[^\s/$.?#].[^\s]*", re.IGNORECASE)


def _validate_ip(ip: str) -> bool:
    parts = ip.split(".")
    if len(parts) != 4:
        return False
    for part in parts:
        try:
            num = int(part)
        except ValueError:
            return False
        if num < 0 or num > 255:
            return False
    return True


def validate_iocs(text: str) -> Set[IOC]:
    """Extract and validate IOCs from text.

    Args:
        text: Input text potentially containing IOCs.

    Returns:
        A set of unique ``IOC`` objects representing valid indicators.
    """

    results: Set[IOC] = set()
    if not text:
        return results

    # Un-defang common representations like "example[.]com".
    # Replace bracketed dots with literal dots before pattern matching.
    text = text.replace("[.]", ".")

    for match in _IP_PATTERN.finditer(text):
        value = match.group(0)
        if _validate_ip(value):
            results.add(IOC(IOCType.IP, value))

    for match in _DOMAIN_PATTERN.finditer(text):
        value = match.group(0).lower()
        # skip if it's actually an IP
        if _IP_PATTERN.fullmatch(value):
            continue
        results.add(IOC(IOCType.DOMAIN, value))

    for match in _HASH_PATTERN.finditer(text):
        results.add(IOC(IOCType.HASH, match.group(0)))

    for match in _URL_PATTERN.finditer(text):
        results.add(IOC(IOCType.URL, match.group(0)))

    return results


def _main(argv: list[str]) -> int:
    text = argv[1] if len(argv) > 1 else sys.stdin.read()
    iocs = validate_iocs(text)
    print(json.dumps([{"type": i.type.value, "value": i.value} for i in iocs]))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv))
