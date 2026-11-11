"""Independent Decimal/Fraction replay of accepted trade evidence; no networking."""
import datetime
import decimal
import fractions
import json
import sys

evidence = json.load(open(sys.argv[1]))
end = int(evidence['request']['expiry_seconds']) * 1000000
start = end - 1800000000
trades = []
for page in evidence['pages']:
    for r in json.loads(page['body']):
        d = datetime.datetime.fromisoformat(r['time'].replace('Z', '+00:00'))
        epoch = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)
        delta = d - epoch
        t = (delta.days * 86400 + delta.seconds) * 1000000 + delta.microseconds
        trades.append((int(r['trade_id']), t, fractions.Fraction(decimal.Decimal(r['price']))))
trades.sort()
assert all(b[0] == a[0]+1 and b[1] >= a[1] for a, b in zip(trades, trades[1:]))
assert trades[0][1] <= start and trades[-1][1] >= end
area = fractions.Fraction(0)
for (_, t, p), (_, nt, _) in zip(trades, trades[1:]):
    left, right = max(t, start), min(nt, end)
    if right > left:
        assert right-t <= 60000000
        area += p * (right-left)
scaled = area * 10**12 / (end-start)
print(json.dumps({'price': str(scaled.numerator // scaled.denominator), 'exact_price': str(scaled), 'reference_only': True}))
