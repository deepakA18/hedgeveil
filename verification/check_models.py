#!/usr/bin/env python3
"""Finite, explicit-state safety checks. No runtime refinement or liveness proof."""
import argparse
from collections import Counter, deque
from dataclasses import dataclass, replace
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if not __debug__:
    raise RuntimeError("verification requires assertions; do not use python -O")


class Counterexample(Exception):
    def __init__(self, invariant, trace):
        self.invariant, self.trace = invariant, trace


def explore(initial, edges, invariant):
    """Explore to a fixed point, retaining shortest counterexample predecessors."""
    try:
        invariant(initial, initial)
    except AssertionError as error:
        raise Counterexample(str(error), []) from error
    parents = {initial: None}
    queue = deque([initial])
    counts = Counter()
    while queue:
        state = queue.popleft()
        for label, successor in edges(state):
            counts[label.split(':')[0]] += 1
            try:
                invariant(state, successor)
            except AssertionError as error:
                trace = [label]
                cursor = state
                while parents[cursor] is not None:
                    cursor, previous = parents[cursor]
                    trace.append(previous)
                raise Counterexample(str(error), list(reversed(trace))) from error
            if successor not in parents:
                parents[successor] = (state, label)
                queue.append(successor)
    return {"states": len(parents), "edges": sum(counts.values()),
            "actions": dict(sorted(counts.items())), "fixed_point": True}


@dataclass(frozen=True)
class Ticket:
    owner: int
    state: str = "PENDING"
    result: str = "WAIT"
    callback_used: bool = False
    overdue: bool = False
    paid: int = 0
    restored: int = 0


@dataclass(frozen=True)
class Withdrawals:
    free: tuple = (1, 1)
    tickets: tuple = ()


def withdrawal_edges(s, mutant=None):
    # Two owners, two lifetime IDs, one unit per request. Closed IDs never reused.
    for owner in range(2):
        if s.free[owner] and len(s.tickets) < 2:
            free = list(s.free)
            free[owner] -= 1
            yield f"request:{owner}", Withdrawals(tuple(free), s.tickets + (Ticket(owner),))
    for i, t in enumerate(s.tickets):
        def update(new, refund=0):
            free = list(s.free)
            free[t.owner] += refund
            return Withdrawals(tuple(free), s.tickets[:i] + (new,) + s.tickets[i+1:])

        if t.result == "WAIT":
            for result in ("SUCCESS", "FAILURE"):
                yield f"transfer:{i}:{result}", update(replace(t, result=result, paid=int(result == "SUCCESS")))
        if not t.overdue and t.state in ("PENDING", "UNKNOWN"):
            yield f"age:{i}", update(replace(t, overdue=True))
        if t.state == "PENDING" and t.overdue:
            refund = int(mutant == "timeout_refund")
            yield f"timeout:{i}", update(replace(t, state="UNKNOWN", restored=t.restored + refund), refund)
        if t.state in ("PENDING", "UNKNOWN") and t.result != "WAIT" and not t.callback_used:
            terminal = "SUCCEEDED" if t.result == "SUCCESS" else "FAILED_CONFIRMED"
            refund = int(t.result == "FAILURE")
            yield f"callback:{i}:{t.result}", update(replace(t, state=terminal, callback_used=True, restored=refund), refund)
            yield f"callback_panic:{i}", update(replace(t, callback_used=True))
            yield f"malformed_result:{i}", update(replace(t, state="UNKNOWN", callback_used=True))
        if t.state in ("SUCCEEDED", "FAILED_CONFIRMED"):
            yield f"close_owner:{i}", update(replace(t, state="CLOSED"))
            refund = int(mutant == "duplicate_refund" and t.state == "FAILED_CONFIRMED")
            yield f"duplicate_callback:{i}", update(replace(t, restored=t.restored + refund), refund)
        else:
            yield f"close_unsettled_or_closed:{i}", s
        yield f"close_other_owner:{i}", s
        if mutant == "forged_callback" and t.state in ("PENDING", "UNKNOWN"):
            yield f"unauthorized_callback:{i}", update(replace(t, state="FAILED_CONFIRMED", restored=1), 1)
        else:
            yield f"unauthorized_callback:{i}", s
        if mutant == "resend_unknown" and t.state == "UNKNOWN" and t.paid:
            yield f"resend:{i}", update(replace(t, paid=t.paid + 1))
        else:
            yield f"retry_absent:{i}", s


def withdrawal_invariant(before, s):
    for owner in range(2):
        tickets = [t for t in s.tickets if t.owner == owner]
        outstanding = sum(t.state in ("PENDING", "UNKNOWN") for t in tickets)
        acknowledged = sum(t.paid for t in tickets if t.state in ("SUCCEEDED", "CLOSED"))
        assert s.free[owner] + outstanding + acknowledged == 1, "owner obligation conservation"
        # A paid-but-unacknowledged transfer is a quarantined obligation, not cash.
        unresolved_paid = sum(t.paid for t in tickets if t.state in ("PENDING", "UNKNOWN"))
        assert s.free[owner] + outstanding - unresolved_paid == 1 - sum(t.paid for t in tickets), "physical custody with in-flight subtraction"
    for t in s.tickets:
        assert t.paid <= 1 and t.restored <= 1, "single transfer and restoration"
        assert not t.restored or t.result == "FAILURE", "only authenticated failure restores"
        assert t.state not in ("PENDING", "UNKNOWN") or t.restored == 0, "unresolved funds quarantined"
    for old, new in zip(before.tickets, s.tickets):
        if old.state == "CLOSED":
            assert new == old, "closed ticket cannot resurrect"


@dataclass(frozen=True)
class Oracle:
    time: int = 0
    evidence: tuple = (False, False)
    proposal: tuple = ()  # route, price, challenge_end; evidence root is route
    challenge: tuple = ()  # price, root (0/1 committed route, 2 conflicting root)
    state: str = "OPEN"
    final: tuple = ()  # price, evidence root
    credits: tuple = (0, 0, 0)  # proposer, challenger, treasury
    imported: tuple = ()


def valid_proposal(s):
    return bool(s.proposal and s.proposal[1] == s.proposal[0] + 1)


def oracle_edges(s, mutant=None):
    if s.time < 6:
        yield "tick", replace(s, time=s.time + 1)
    live = s.state not in ("FINALIZED", "RESOLUTION_DELAYED")
    if live:
        for route in range(2):
            if 1 <= s.time < 6 and not s.evidence[route]:
                evidence = list(s.evidence)
                evidence[route] = True
                yield f"publish:{route}", replace(s, evidence=tuple(evidence))
        # maturity=1, primary_end=2, fallback_end=3, arbitration_end=6.
        if 1 <= s.time < 3 and not s.proposal:
            route = int(s.time >= 2)
            if s.evidence[route]:
                for price in (1, 2):
                    yield f"propose:{route}:{price}", replace(s, proposal=(route, price, s.time + 2), state="PROPOSED")
        if s.proposal and s.time < s.proposal[2] and not s.challenge:
            for price in (1, 2):
                for root in range(3):
                    if (price, root) != (s.proposal[1], s.proposal[0]):
                        yield f"challenge:{price}:{root}", replace(s, challenge=(price, root), state="DISPUTED")

    def complete(route):
        result = (route + 1, route)
        winner = 0 if s.proposal and (s.proposal[1], s.proposal[0]) == result else 1 if s.challenge == result else 2
        credits = list(s.credits)
        if s.state != "FINALIZED":
            credits[winner] += 2 * bool(s.proposal) + bool(s.challenge)
        return replace(s, state="FINALIZED", final=result, credits=tuple(credits))

    if live and s.proposal and not s.challenge and s.time >= s.proposal[2] and valid_proposal(s):
        yield "finalize", complete(s.proposal[0])
    if (live or mutant == "rewrite_final") and 1 <= s.time < 6 and (s.challenge or (s.time >= 3 and not valid_proposal(s))):
        for route in range(2):
            if s.evidence[route]:
                yield f"adjudicate:{route}", complete(route)
    if (live or (mutant == "release_twice" and s.state == "RESOLUTION_DELAYED")) and s.time >= 6 and (s.challenge or not valid_proposal(s)):
        credits = (s.credits[0] + 2 * bool(s.proposal), s.credits[1] + bool(s.challenge), s.credits[2])
        yield "mark_delayed", replace(s, state="RESOLUTION_DELAYED", credits=credits)
    if s.state == "FINALIZED" and not s.imported:
        yield "import_final", replace(s, imported=s.final)
    else:
        yield "import_nonfinal_or_repeat", s
    yield "unauthorized_adjudicate", s
    yield "unauthorized_import_callback", s
    if mutant == "invent_delayed_price" and s.state == "RESOLUTION_DELAYED":
        yield "invent_price", replace(s, imported=(1, 0))


def oracle_invariant(before, s):
    received = 2 * bool(s.proposal) + bool(s.challenge)
    locked = received if s.state not in ("FINALIZED", "RESOLUTION_DELAYED") else 0
    assert sum(s.credits) + locked == received, "bond conservation and single release"
    if before.state in ("FINALIZED", "RESOLUTION_DELAYED"):
        assert (s.state, s.final, s.credits) == (before.state, before.final, before.credits), "terminal outcome immutable"
    if s.final:
        assert s.state == "FINALIZED" and s.evidence[s.final[1]], "final uses committed evidence"
        assert s.final[0] == s.final[1] + 1, "final equals historical observation"
    assert not s.imported or s.imported == s.final, "core imports only final evidence"
    assert not before.imported or before.imported == s.imported, "core final price immutable"
    if s.state == "RESOLUTION_DELAYED":
        assert not s.final and not s.imported, "delay invents neither price nor liveness"


@dataclass(frozen=True)
class Reserve:
    p: int
    n: int
    reserve: int
    paid: int = 0


@dataclass(frozen=True)
class Resolution:
    replies: tuple = ()  # -2 pending; -1 malformed; 0 nonfinal; 1/2 valid; 3 wrong series
    delivered: tuple = ()
    pending: int = -1
    overdue: bool = False
    final: int = 0
    accepted: int = -1


def resolution_edges(s, mutant=None):
    if len(s.replies) < 2 and (s.pending == -1 or s.overdue):
        yield "request", replace(s, pending=len(s.replies), replies=s.replies + (-2,), delivered=s.delivered + (False,), overdue=False)
    if s.pending != -1 and not s.overdue:
        yield "timeout", replace(s, overdue=True)
    for i, reply in enumerate(s.replies):
        if reply == -2:
            for value in (-1, 0, 1, 2, 3):
                yield f"oracle_response:{i}:{value}", replace(s, replies=s.replies[:i] + (value,) + s.replies[i+1:])
        elif not s.delivered[i]:
            updated = replace(s, delivered=s.delivered[:i] + (True,) + s.delivered[i+1:])
            if i == s.pending or mutant == "accept_stale_request":
                updated = replace(updated, pending=-1)
                if reply in (1, 2) and (not s.final or mutant == "overwrite_import"):
                    updated = replace(updated, final=reply, accepted=i)
            yield f"callback:{i}", updated
        yield f"unauthorized_callback:{i}", s


def resolution_invariant(before, s):
    assert not before.final or s.final == before.final, "imported price immutable"
    if before.pending != -1 and s.pending == -1:
        assert not before.delivered[before.pending] and s.delivered[before.pending], "stale reply cannot consume current request"
    if s.accepted != before.accepted:
        assert s.accepted == before.pending, "only matching outstanding request accepted"
        assert s.replies[s.accepted] in (1, 2), "only valid final same-series reply accepted"
    assert s.final in (0, 1, 2), "no fabricated price from malformed/nonfinal/wrong-series reply"


def reserve_check(mutant=False):
    """Every redemption amount/order; coefficients include both endpoints."""
    results = []
    for scale in (2, 3, 7):
        for coefficient in range(scale + 1):
            for backing in range(1, 9):
                def edges(s):
                    for leg in ("p", "n"):
                        c = coefficient if leg == "p" else scale - coefficient
                        for amount in range(1, getattr(s, leg) + 1):
                            payout = (amount * c + (scale - 1 if mutant else 0)) // scale
                            yield f"redeem:{leg}:{amount}:Q={scale}:p={coefficient}:backing={backing}", replace(s, **{leg: getattr(s, leg) - amount}, reserve=s.reserve-payout, paid=s.paid+payout)

                def invariant(_, s):
                    obligation = s.p * coefficient // scale + s.n * (scale - coefficient) // scale
                    assert s.reserve >= obligation >= 0, "remaining obligation covered"
                    assert s.paid + s.reserve == backing and s.paid <= backing, "cumulative payouts bounded by original backing"
                results.append(explore(Reserve(backing, backing, backing), edges, invariant))
    return {"instances": len(results), "states": sum(r["states"] for r in results),
            "edges": sum(r["edges"] for r in results), "fixed_point": True,
            "bounds": {"scales": [2, 3, 7], "backing": [1, 8], "coefficients": "all integers 0..scale"}}


def run():
    results = {
        "scope": "Finite explicit-state models; not symbolic verification, Rust refinement, cryptographic proof or independent review",
        "withdrawals": explore(Withdrawals(), withdrawal_edges, withdrawal_invariant),
        "oracle": explore(Oracle(), oracle_edges, oracle_invariant),
        "resolution": explore(Resolution(), resolution_edges, resolution_invariant),
        "reserve": reserve_check(),
        "mutation_counterexamples": {},
    }
    for name in ("timeout_refund", "duplicate_refund", "forged_callback", "resend_unknown", "rewrite_final", "release_twice", "invent_delayed_price", "round_up_payout", "accept_stale_request", "overwrite_import"):
        try:
            if name == "round_up_payout":
                reserve_check(mutant=True)
            elif name in ("accept_stale_request", "overwrite_import"):
                explore(Resolution(), lambda s: resolution_edges(s, name), resolution_invariant)
            elif name in ("rewrite_final", "release_twice", "invent_delayed_price"):
                explore(Oracle(), lambda s: oracle_edges(s, name), oracle_invariant)
            else:
                explore(Withdrawals(), lambda s: withdrawal_edges(s, name), withdrawal_invariant)
        except Counterexample as error:
            results["mutation_counterexamples"][name] = {"invariant": error.invariant, "shortest_trace": error.trace}
        else:
            raise AssertionError(f"undetected model mutation: {name}")
    files = ["verification/check_models.py", "contracts/clearinghouse/src/withdrawals.rs", "contracts/clearinghouse/src/claims.rs", "contracts/clearinghouse/src/series.rs", "contracts/settlement-oracle/src/lib.rs", "contracts/settlement-oracle/src/lifecycle.rs", "contracts/settlement-oracle/src/types.rs", "contracts/settlement-oracle/src/withdrawals.rs"]
    results["sources"] = {f: hashlib.sha256((ROOT / f).read_bytes()).hexdigest() for f in files}
    results["passed"] = True
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare deterministic evidence without rewriting")
    args = parser.parse_args()
    report = json.dumps(run(), indent=2, sort_keys=True) + "\n"
    destination = ROOT / "research/reports/g8-models.json"
    if args.check:
        if destination.read_text() != report:
            raise SystemExit("model evidence differs; regenerate and review")
    else:
        destination.write_text(report)
    print("PASS finite model fixed points and all ten negative controls")
