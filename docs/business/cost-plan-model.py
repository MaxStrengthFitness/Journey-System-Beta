"""The cost plan's arithmetic (Sep 26 2026).

Extends running-costs-model.py (Sep 25) with the plan in cost-plan.md: AJ's
freshness answers turned into Mindbody calls and Firestore reads. The Sep 25
model is loaded as-is, so "today" here is exactly its numbers; only the plan's
knobs are new. Run: python docs/business/cost-plan-model.py

Every constant below is an assumption, named in cost-plan.md.
"""

import importlib.util
import os
import sys

sys.dont_write_bytecode = True  # loading the Sep 25 model must not leave a __pycache__ in docs/

_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("rc", os.path.join(_here, "running-costs-model.py"))
rc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rc)

OPEN_DAYS, NIGHTS = rc.OPEN_DAYS, rc.NIGHTS
MB_PRICE, MB_FREE = rc.MB_PRICE, rc.MB_FREE


def pages_month(C):
    return -(-int(2 * C * 4.4 * 1.1) // 500)


def plan_mindbody(N, C, webhook_on=True):
    """Calls a month for N studios of C active clients, under the plan."""
    near = 28                                   # today + tomorrow every 30 min in pull hours
    month = 1 * pages_month(C)                  # the whole month once, before open
    lookups = 1 if webhook_on else -(-C // 20)  # client.updated keeps names; else look everyone up each morning
    handoffs = 0 if webhook_on else (3 if C <= 100 else 5)   # a lost booking checked by its own id: 1 call
    tokens = 1                                  # a token kept for its real life (days), not 55 minutes
    refresh = 10 * (1.5 if C <= 100 else 2.0)   # unchanged: ~10 presses a day
    staff = 1                                   # the staff list kept for the day
    master = 6                                  # Master Sync presses + new clients synced on booking
    per_day = near + month + lookups + handoffs + tokens + refresh + staff + master
    floor = per_day * OPEN_DAYS + rc.TRAINERS_PER_STUDIO * 4.33
    # Packages: pulled when a sale / contract / membership event says so, a
    # monthly sweep of ACTIVE clients only, and a fresh pull the morning of a
    # session for anyone Journey counts as near the end of a package.
    sales = C / 90 + 0.5                        # a renewal every ~3 months + new clients
    sweep = C / 30
    near_end = 0.02 * C
    renew = 2 * (sales + sweep + near_end) * NIGHTS + NIGHTS / 3   # + a token per site per night (3 studios a site)
    calls = (floor + renew) * N
    return dict(per_day=per_day, renew_per_night=renew / NIGHTS, calls=calls,
                cost=max(0, calls - MB_FREE) * MB_PRICE)


def onboarding(C_active, visits_per_week=2, months_back=6, share_site_with=1):
    """One studio's pre-launch sync: find who counts, then Master Sync each."""
    appts = C_active * visits_per_week * (months_back * 4.33 + 4.4) * 1.1 * share_site_with
    find = -(-int(appts) // 500)
    per_client = 5
    calls = find + per_client * C_active + 2   # + tokens
    return dict(find=find, calls=calls, dollars=calls * MB_PRICE)


def table():
    print("== Mindbody calls per studio per open day (webhook on)")
    for C in (80, 150, 210):
        today = rc.mindbody(10, C, webhook_on=True)["per_day"]
        off = rc.mindbody(10, C)["per_day"]
        p = plan_mindbody(10, C)
        print(f"  C={C:3d}  today {today:5.1f} (webhook off {off:5.1f})  plan {p['per_day']:5.1f}"
              f"  renewals/night today {2*4*C/30:5.1f}  plan {p['renew_per_night']:5.1f}")

    print()
    print("== Monthly bill: today (webhook off, as built) -> today (webhook on) -> plan")
    for C in (80, 210):
        for N in (4, 10, 25, 40, 100):
            a = rc.row(N, C)
            b = rc.row(N, C, webhook_on=True)
            fixed = rc.row(N, C, webhook_on=True, analytics=False, fixed=True)
            p = plan_mindbody(N, C)
            plan_total = p["cost"] + fixed["reads"] + fixed["writes"] + fixed["storage"] + fixed["render"]
            var_now = b["total"] - b["render"]
            var_plan = plan_total - fixed["render"]
            print(f"  C={C:3d} N={N:3d}  off ${a['total']:6.0f} | on ${b['total']:6.0f}"
                  f" (MB {b['mb']:4.0f} reads {b['reads']:4.0f}) | plan ${plan_total:6.0f}"
                  f" (MB {p['cost']:4.0f} reads {fixed['reads']:4.0f})"
                  f"  per studio: on ${b['total']/N:5.2f} -> plan ${plan_total/N:5.2f}"
                  f"  | without Render: ${var_now/N:5.2f} -> ${var_plan/N:5.2f}")

    print()
    print("== Pre-launch sync, one studio")
    for C in (150, 210, 300):
        o = onboarding(C)
        s = onboarding(C, share_site_with=3)
        print(f"  {C} clients: find {o['find']} calls (shared site {s['find']}), total {o['calls']} calls = ${o['dollars']:.2f}"
              f" (shared site ${s['dollars']:.2f})")
    print(f"  40 studios x 150: ${40 * onboarding(150)['dollars']:.0f}")


if __name__ == "__main__":
    table()
