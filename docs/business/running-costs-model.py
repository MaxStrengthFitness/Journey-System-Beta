"""Journey running-cost model. Every constant is an assumption named in cost-model.md."""

OPEN_DAYS = 26          # Mon-Sat, closed Sunday
NIGHTS = 30
IPADS = 6
VISIBLE_HOURS = 10      # hours a day each iPad is on screen
RECONNECTS = 3          # full re-reads per iPad per day (gaps > 30 min)
CONNECTED = 0.65        # share of the studio's iPads connected at a given open-hours moment
TRAINERS_PER_STUDIO = 8
MACHINE_DOCS = 40
ANNOUNCEMENTS = 100

MB_PRICE = 0.002
MB_FREE = 5000
READ = 0.06 / 100_000
WRITE = 0.18 / 100_000
GIB = 0.18

def per_day_sessions(C):
    return 2 * C / 6

def mindbody(N, C, webhook_on=False, uncapped=False, interval30=False):
    # --- the lean pull (one iPad per studio does it) ---
    near = 28 if interval30 else 56
    appts_month = 2 * C * 4.4 * 1.1              # 31 days incl. cancelled
    pages_month = -(-int(appts_month) // 500)
    lookups_first = -(-C // 20)
    month = 4 * pages_month + lookups_first
    handoffs = 0 if webhook_on else (3 if C <= 100 else 5)
    handoff_calls = handoffs * pages_month
    tokens = 17                                  # usertoken/issue, cached 55 min per site
    refresh = 10 * (1.5 if C <= 100 else 2.0)    # ~10 presses a day
    staff = 3                                    # staff list on Team / Staff & Roles
    master = 6                                   # Master Sync presses (5 calls each), per open day
    per_day = near + month + handoff_calls + tokens + refresh + staff + master
    floor_month = per_day * OPEN_DAYS + TRAINERS_PER_STUDIO * 4.33   # + weekly staff photos
    # --- nightly renewals: demand vs the company-wide cap of 300 clients (600 calls) ---
    pulls_per_month = 4 * C                      # 60% near renewal weekly, the rest + past clients monthly
    demand = 2 * pulls_per_month * N
    cap = 600 * NIGHTS
    renew = (demand if uncapped else min(demand, cap)) + NIGHTS * N   # + a token per site per night
    calls = floor_month * N + renew
    cost = max(0, calls - MB_FREE) * MB_PRICE
    return dict(per_day=per_day, calls=calls, renew=renew, floor=floor_month * N, cost=cost,
                capped=demand > cap, demand=demand)

def firestore_reads(N, C, analytics=True, webhook_on=True, fixed=False):
    s_day = per_day_sessions(C)
    # A: Hub week-ahead re-read every ~15 min per visible iPad (useLiveSchedule)
    A = IPADS * VISIBLE_HOURS * (1 if fixed else 4) * (2.2 * C)
    # B: the lean pull's own reads (window query + month pulls + handoffs)
    handoffs = 0 if webhook_on else (3 if C <= 100 else 5)
    B = 41 * C + 4 * 9.7 * C + handoffs * 9.7 * C + 180
    # C: reconnect reloads, studio-scoped
    Cs = IPADS * RECONNECTS * (3.4 * C + 200)
    # D: pushes of session / client doc changes to the studio's iPads
    D = 50 * C
    # E: profile + active session + post-session per session
    E = s_day * (450 if fixed else 900)
    # F: Operations / My Studio
    F = 20 * C + 2500
    studio_day = A + B + Cs + D + E + F
    studio_month = studio_day * OPEN_DAYS + (4 * C * NIGHTS if webhook_on else 0)
    # company-wide listeners: reconnect reloads
    scope = 1 if fixed else N
    company_reload = IPADS * RECONNECTS * (scope + TRAINERS_PER_STUDIO * scope + N / 10 + 2 * MACHINE_DOCS + ANNOUNCEMENTS) * OPEN_DAYS
    # company-wide pushes: every studio-doc / trainer-doc / system-health write, to every connected iPad
    w = 124 + s_day + (0.5 * C if webhook_on else 0)
    push = CONNECTED * IPADS * scope * w * OPEN_DAYS
    # jobs
    renewals = 65 * C * N * NIGHTS
    trainer_windows = (26 * C * N + TRAINERS_PER_STUDIO * N) * NIGHTS
    trends = 740 * C * N
    webhook_cache = (min(900, 0.5 * C * N) * N * NIGHTS) if webhook_on else 0
    facility = 752 * C * N * NIGHTS if analytics else 0     # month 12 of history
    total = (studio_month + company_reload + push) * N + renewals + trainer_windows + trends + webhook_cache + facility
    return dict(total=total, studio=studio_month * N, company_reload=company_reload * N,
                push=push * N, renewals=renewals, trainer_windows=trainer_windows, trends=trends,
                webhook_cache=webhook_cache, facility=facility, A=A * OPEN_DAYS * N, E=E * OPEN_DAYS * N)

def firestore_writes(N, C):
    per_studio = 576 * C + 4000
    return per_studio * N

def storage_gib(N, C, months=12):
    per_client_year_mb = 5.5
    return N * C * per_client_year_mb * months / 12 / 1024

def render(N):
    if N <= 25:
        return 25 + 25 + 2
    if N <= 50:
        return 25 + 25 + 7     # crons moved to bigger instances
    return 25 + 25 + 12

def row(N, C, **kw):
    mb = mindbody(N, C, **{k: v for k, v in kw.items() if k in ("webhook_on", "uncapped", "interval30")})
    r = firestore_reads(N, C, analytics=kw.get("analytics", True), webhook_on=kw.get("webhook_on", False), fixed=kw.get("fixed", False))
    wr = firestore_writes(N, C)
    st = storage_gib(N, C)
    out = dict(
        mb=mb["cost"], mb_calls=mb["calls"],
        reads=r["total"] * READ, reads_n=r["total"],
        writes=wr * WRITE, writes_n=wr,
        storage=max(0, st - 1) * GIB, storage_gib=st,
        render=render(N),
        r=r, mbd=mb,
    )
    out["old_mb"] = max(0, mb["calls"] - 1000 * 30) * 0.0033
    out["total"] = out["mb"] + out["reads"] + out["writes"] + out["storage"] + out["render"]
    return out

if __name__ == "__main__":
    scen = [("A. AS BUILT on lean-sync, webhook still off", {}),
            ("B. lean sync shipped WITH webhook on (the plan)", {"webhook_on": True}),
            ("C. B + five fixes", {"webhook_on": True, "analytics": False, "fixed": True, "interval30": True})]
    for label, kw in scen:
        print()
        print("==", label)
        for C in (80, 210):
            for N in (5, 10, 25, 50, 100):
                o = row(N, C, **kw)
                print(f"C={C:3d} N={N:3d}  MB ${o['mb']:5.0f} [{o['mb_calls']/1000:4.0f}k; old-model ${o['old_mb']:5.0f}]  reads ${o['reads']:4.0f} ({o['reads_n']/1e6:6.1f}M)  writes ${o['writes']:3.0f} ({o['writes_n']/1e6:5.2f}M)  storage ${o['storage']:3.0f} ({o['storage_gib']:5.1f}GiB)  render ${o['render']:3.0f}  TOTAL ${o['total']:5.0f}")
    print()
    print("== read breakdown, B ($)")
    for C in (80, 210):
        for N in (5, 10, 25, 50, 100):
            r = firestore_reads(N, C, webhook_on=True)
            print(f"C={C} N={N}: " + ", ".join(f"{k} {v*READ:.0f}" for k, v in r.items()))
    print()
    print("== mindbody per studio/open day: off, on, on+30min")
    for C in (80, 210):
        print(C, mindbody(10, C)["per_day"], mindbody(10, C, webhook_on=True)["per_day"], mindbody(10, C, webhook_on=True, interval30=True)["per_day"])
    for C in (80, 210):
        for N in (5, 10, 25, 50, 100):
            m = mindbody(N, C, webhook_on=True); u = mindbody(N, C, webhook_on=True, uncapped=True)
            print(f"C={C} N={N}: renew calls {m['renew']:.0f} (demand {m['demand']:.0f}, capped {m['capped']}), uncapped cost +${u['cost']-m['cost']:.0f}")
    print()
    print("== push split per studio-day w: studio-doc 124, trainer s_day, health 0.5C")
    for C in (80, 210):
        print(C, 124, per_day_sessions(C), 0.5*C)
    print("== storage GiB at 36 months")
    for C in (80, 210):
        print(C, [round(storage_gib(N, C, 36),1) for N in (5,10,25,50,100)], [round((storage_gib(N, C, 36)-1)*GIB) for N in (5,10,25,50,100)])
