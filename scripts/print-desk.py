import json, sys

d = json.load(sys.stdin)
print("source", d.get("source"))
t = d.get("ticket") or {}
print("ticket", t.get("action"), t.get("headline"))
print("detail", t.get("detail"))
print("fair", d.get("fairValueUsd"))
print("endpoints", d.get("endpointsUsed"))
print("warnings:")
for w in d.get("warnings") or []:
    print(" -", w[:220])
print("wrappers:")
for w in d.get("wrappers") or []:
    print(
        f"  {w.get('symbol'):8} px={w.get('normalizedUsd')} vol={w.get('volume24h')} "
        f"bps={w.get('basisBps')} trad={w.get('tradability')} issuer={w.get('issuerName')}"
    )
