"""Generate or check deterministic fixtures consumed unchanged by Rust/circuits."""
import argparse
import json
import random
from pathlib import Path
from payoff import MAX_U128, PRICE_SCALE, Q, settlement

DESTINATION = Path(__file__).resolve().parents[2] / "fixtures/payoff-vectors.json"
SEED = 20261107


def generate():
    cases = [(f"example-{x}-usd", Q, 2*PRICE_SCALE, x*PRICE_SCALE, False)
             for x in (8, 4, 2, 1)]
    cases += [("explicit-zero", Q, 1, 0, True)]
    for amount in (0, 1, Q-1, Q, Q+1, MAX_U128):
        for strike, observed in ((1, 1), (1, 2), (2, 3), (1, MAX_U128),
                                 (MAX_U128, MAX_U128), (MAX_U128-1, MAX_U128),
                                 (PRICE_SCALE, PRICE_SCALE-1),
                                 (PRICE_SCALE, PRICE_SCALE+1)):
            cases.append((f"boundary-{len(cases)}", amount, strike, observed, False))
    rng = random.Random(SEED)
    for i in range(512):
        cases.append((f"seeded-{i}", rng.randrange(MAX_U128+1),
                      rng.randrange(1, MAX_U128+1), rng.randrange(1, MAX_U128+1), False))
    vectors = []
    for name, amount, strike, observed, allow in cases:
        values = settlement(amount, strike, observed, allow)
        vectors.append(dict(id=name, amount=str(amount), strike=str(strike),
                            observed=str(observed), allow_zero=allow,
                            **{k: str(v) for k, v in values.items()}))
    return json.dumps(dict(schema_version=1, seed=SEED, vectors=vectors), indent=2) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = generate()
    if args.check:
        if not DESTINATION.exists() or DESTINATION.read_text() != data:
            raise SystemExit("payoff vectors differ; regenerate and review the change")
        print("Payoff vectors are reproducible (565 cases).")
    else:
        DESTINATION.parent.mkdir(parents=True, exist_ok=True)
        DESTINATION.write_text(data)

