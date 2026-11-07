"""Performance reporting and an explicitly separate debt benchmark."""
import math
import statistics
from engine import Q, PRICE_SCALE, BPS, usd


def performance(values, initial):
    levels = [initial]+values
    peak, drawdown = initial, 0.0
    for value in levels:
        peak = max(peak, value)
        drawdown = max(drawdown, 1-value/peak)
    # Fixed target denominator remains meaningful even after near-total loss.
    # Day-zero acquisition is included in wealth/friction; 84 subsequent daily changes.
    changes = [(b-a)/initial for a, b in zip(values, values[1:])]
    return {'terminal_return': values[-1]/initial-1,
            'tracking_volatility': statistics.pstdev(changes)*math.sqrt(365) if changes else 0.0,
            'max_drawdown': drawdown,
            'terminal_shortfall': max(0.0, 1-values[-1]/initial),
            'worst_target_shortfall': max(0.0, 1-min(levels)/initial)}


def debt_benchmark(config, path, wealth):
    """Borrower equity + stable cash, not gross assets; integer USD at 1e12."""
    cfg = config['debt']
    initial_spot = int(path['rows'][0]['spot'])
    collateral = wealth*PRICE_SCALE*Q//initial_spot
    debt = wealth*PRICE_SCALE*cfg['initial_ltv_bps']//BPS
    stable = debt
    initial_debt = debt
    values = []
    fees = interest = bad_debt = 0
    liquidated = None
    for row in path['rows']:
        day, spot = row['day'], int(row['spot'])
        if debt and day:
            charge = (debt*cfg['interest_bps']+BPS*365-1)//(BPS*365)
            debt += charge
            interest += charge
        actual = collateral*spot//Q
        lagged = int(path['rows'][max(0, day-cfg['oracle_lag_days'])]['spot'])
        observed = collateral*lagged//Q
        if collateral and debt*BPS >= observed*cfg['liquidation_ltv_bps']:
            # Lender repaid before liquidation penalty; remaining collateral to borrower.
            bad_debt += max(0, debt-actual)
            surplus = max(0, actual-debt)
            penalty = min(surplus, actual*cfg['penalty_bps']//BPS)
            fees += penalty
            stable += surplus-penalty
            debt = collateral = 0
            actual = 0
            liquidated = day
        values.append((stable+max(0, actual-debt))/PRICE_SCALE)
    return {'name': 'collateralized_debt', **performance(values, wealth),
            'values': values, 'liquidation_day': liquidated,
            'liquidation_fee_usd': fees/PRICE_SCALE,
            'interest_usd': interest/PRICE_SCALE, 'lender_bad_debt_usd': bad_debt/PRICE_SCALE,
            'external_stable_funding_usd': initial_debt/PRICE_SCALE}


def summarize(result, config, wealth):
    costs = result['costs_usd']
    friction = sum(costs.get(k, 0) for k in ('fee', 'spread', 'gas', 'oracle'))
    available = [x for x in result['exits'] if x is not None]
    count = result['roll_windows']
    fills = result['maker_fill_counts']
    return {**performance(result['values'], wealth),
            'acquired': result['acquired'], 'attempts': result['attempts'],
            'roll_windows': count, 'roll_completed': result['roll_completed'],
            'roll_completion': result['roll_completed']/count if count else None,
            'mean_time_to_fill_days': statistics.mean(result['time_to_fill_days']) if result['time_to_fill_days'] else None,
            'annual_friction': friction/wealth*365/config['days'],
            'costs_usd': costs, 'initial_acquisition_cost_usd': result['initial_acquisition_cost_usd'],
            'roll_changes': result['roll_changes'],
            'cash_exit_unavailable_fraction': sum(x is None for x in result['exits'])/len(result['exits']),
            'worst_available_cash_exit_usd': min(available) if available else None,
            'worst_in_kind_model_usd': min(result['values']),
            'max_unresolved_model_usd': max(result['unresolved']),
            'unresolved_days': sum(x>0 for x in result['unresolved']),
            'rejections': result['rejections'],
            'maker_max_fill_share': max(fills)/sum(fills) if sum(fills) else None,
            'maker_pl_after_opportunity_cost_usd': sum(result['maker_pl_vs_near_usd'])-result['maker_opportunity_cost_usd'],
            'unfunded_maker_return_hurdle_gap_usd': max(0, result['maker_opportunity_cost_usd']-sum(result['maker_pl_vs_near_usd'])),
            **{k: v for k, v in result.items() if k.startswith('maker_') or k == 'operating_subsidy_usd'}}


def aggregate(rows):
    losses = sorted((r['terminal_shortfall'] for r in rows), reverse=True)
    tail = losses[:max(1, math.ceil(len(losses)*0.05))]
    return {'runs': len(rows), 'mean_return': statistics.mean(r['terminal_return'] for r in rows),
            'worst_return': min(r['terminal_return'] for r in rows),
            'terminal_shortfall_frequency': sum(x>0 for x in losses)/len(losses),
            'mean_shortfall': statistics.mean(losses), 'tail_expected_shortfall_5pct': statistics.mean(tail),
            'worst_drawdown': max(r['max_drawdown'] for r in rows),
            'mean_tracking_volatility': statistics.mean(r['tracking_volatility'] for r in rows)}
