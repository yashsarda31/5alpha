"""
Nifty 50 — 10-day Realized Volatility Forecast
================================================
Two-leg ensemble, desk-style:

  Leg 1: SARIMAX on log(10d Parkinson RV), exog = log(India VIX)
         - implied vol leads realized vol; order selected by AIC
         - future exog path from AR(1) on log VIX (mean-reverting)
  Leg 2: GJR-GARCH(1,1)-t on daily log returns
         - Student-t innovations (fat tails), GJR term (leverage asymmetry)
         - 10-day cumulative conditional variance, annualized

  Combination: inverse-RMSE weights from rolling out-of-sample backtest
  Loss functions: QLIKE (variance space) + RMSE (log-vol space)

Usage:  python research/nifty_rv_forecast.py
Output: printed desk note + research/nifty_rv_forecast.json
"""

import json
import warnings
from itertools import product

import numpy as np
import pandas as pd
import yfinance as yf
from arch import arch_model
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.ar_model import AutoReg

warnings.filterwarnings("ignore")

HORIZON = 10          # forecast horizon in trading days
RV_WINDOW = 10        # realized-vol window (matches horizon)
ANN = 252
PERIOD = "max"        # full Yahoo history (^NSEI starts 2007-09)
BT_ORIGINS = 100      # backtest forecast origins
BT_STEP = 5           # days between origins

OUT_JSON = "research/nifty_rv_forecast.json"


# ----------------------------------------------------------------------
# 1. Data
# ----------------------------------------------------------------------
def fetch_data():
    px = yf.download("^NSEI", period=PERIOD, interval="1d",
                     auto_adjust=True, progress=False)
    if isinstance(px.columns, pd.MultiIndex):
        px.columns = px.columns.get_level_values(0)
    px = px.dropna(subset=["High", "Low", "Close"])
    # early NSEI rows sometimes carry placeholder OHLC (High == Low):
    # zero range breaks the Parkinson estimator (log RV -> -inf)
    px = px[px["High"] > px["Low"]]

    vix = yf.download("^INDIAVIX", period=PERIOD, interval="1d",
                      auto_adjust=False, progress=False)
    if isinstance(vix.columns, pd.MultiIndex):
        vix.columns = vix.columns.get_level_values(0)
    vix = vix["Close"].rename("vix") if "Close" in vix else pd.Series(dtype=float, name="vix")
    return px, vix


def build_frame(px: pd.DataFrame, vix: pd.Series) -> pd.DataFrame:
    df = pd.DataFrame(index=px.index)
    df["ret"] = np.log(px["Close"]).diff()

    # Parkinson estimator: sigma^2 = (1/(4 ln 2)) * ln(H/L)^2  (daily)
    hl2 = np.log(px["High"] / px["Low"]) ** 2
    park_var_daily = hl2 / (4.0 * np.log(2.0))
    df["rv"] = np.sqrt(park_var_daily.rolling(RV_WINDOW).mean() * ANN) * 100  # ann. %

    # close-to-close cross-check
    df["rv_cc"] = df["ret"].rolling(RV_WINDOW).std() * np.sqrt(ANN) * 100

    df = df.join(vix, how="left")
    df["vix"] = df["vix"].ffill()
    # VIX history starts later than NSEI on Yahoo — trim to the overlap so
    # the SARIMAX exog is full-length (costs only the earliest months)
    if df["vix"].notna().any():
        df = df.loc[df["vix"].first_valid_index():]
    df = df.dropna(subset=["ret", "rv"])
    df = df[df["rv"] > 0]
    df["log_rv"] = np.log(df["rv"])
    df["log_vix"] = np.log(df["vix"]) if df["vix"].notna().all() else np.nan
    return df


# ----------------------------------------------------------------------
# 2. Leg 1 — SARIMAX on log RV with log VIX exog
# ----------------------------------------------------------------------
def select_sarimax_order(y, exog):
    """Small AIC grid: (p,0,q) x seasonal (P,0,Q,5). log RV is stationary."""
    best = (np.inf, None)
    for p, q in product(range(4), range(4)):
        if p == q == 0:
            continue
        for P, Q in [(0, 0), (1, 0), (0, 1)]:
            try:
                m = SARIMAX(y, exog=exog, order=(p, 0, q),
                            seasonal_order=(P, 0, Q, 5) if (P or Q) else (0, 0, 0, 0),
                            trend="c", enforce_stationarity=True)
                r = m.fit(disp=False, maxiter=200)
                if r.aic < best[0]:
                    best = (r.aic, ((p, 0, q), (P, 0, Q, 5) if (P or Q) else (0, 0, 0, 0)))
            except Exception:
                continue
    return best[1]


def vix_future_path(log_vix: pd.Series, h: int) -> np.ndarray:
    """AR(1) mean-reverting path for log VIX over the forecast horizon."""
    ar = AutoReg(log_vix.dropna(), lags=1, trend="c").fit()
    c, phi = ar.params.iloc[0], ar.params.iloc[1]
    path, x = [], log_vix.dropna().iloc[-1]
    for _ in range(h):
        x = c + phi * x
        path.append(x)
    return np.array(path).reshape(-1, 1)


def sarimax_forecast(df: pd.DataFrame, order, sorder, h=HORIZON):
    """Returns (point vol %, lo68, hi68, lo95, hi95) for RV at t+h."""
    y = df["log_rv"]
    exog = df[["log_vix"]] if df["log_vix"].notna().all() else None
    m = SARIMAX(y, exog=exog, order=order, seasonal_order=sorder,
                trend="c", enforce_stationarity=True)
    r = m.fit(disp=False, maxiter=300)
    fx = vix_future_path(df["log_vix"], h) if exog is not None else None
    fc = r.get_forecast(steps=h, exog=fx)
    mu = fc.predicted_mean.iloc[-1]
    se = fc.se_mean.iloc[-1]
    # lognormal mean correction for the point forecast
    point = float(np.exp(mu + 0.5 * se**2))
    return point, float(np.exp(mu - se)), float(np.exp(mu + se)), \
        float(np.exp(mu - 1.96 * se)), float(np.exp(mu + 1.96 * se))


# ----------------------------------------------------------------------
# 3. Leg 2 — GJR-GARCH(1,1)-t
# ----------------------------------------------------------------------
def garch_forecast(ret: pd.Series, h=HORIZON):
    """Returns (10d annualized vol %, fitted result)."""
    r = ret.dropna() * 100  # arch prefers % scale
    am = arch_model(r, mean="Constant", vol="GARCH", p=1, o=1, q=1, dist="t")
    res = am.fit(disp="off")
    var_path = res.forecast(horizon=h, reindex=False).variance.iloc[0].values  # %^2 daily
    vol_ann = float(np.sqrt(var_path.mean() * ANN))  # annualized %
    return vol_ann, res


# ----------------------------------------------------------------------
# 4. Rolling out-of-sample backtest -> ensemble weights
# ----------------------------------------------------------------------
def qlike(rv_true, f):
    a = (rv_true / f) ** 2
    return a - np.log(a) - 1.0


def backtest(df, order, sorder):
    rows = []
    n = len(df)
    origins = [n - HORIZON - 1 - i * BT_STEP for i in range(BT_ORIGINS)]
    origins = [t for t in origins if t > 750][::-1]
    for t in origins:
        train = df.iloc[:t + 1]
        realized = df["rv"].iloc[t + HORIZON]  # 10d Parkinson RV at t+10 = RV over (t, t+10]
        try:
            s_fc = sarimax_forecast(train, order, sorder)[0]
        except Exception:
            continue
        try:
            g_fc = garch_forecast(train["ret"])[0]
        except Exception:
            continue
        rows.append({"date": str(df.index[t].date()), "realized": float(realized),
                     "sarimax": s_fc, "garch": g_fc})
    bt = pd.DataFrame(rows)
    if bt.empty:
        return bt, 0.5, 0.5, {}

    stats = {}
    for leg in ("sarimax", "garch"):
        e_log = np.log(bt["realized"]) - np.log(bt[leg])
        stats[leg] = {
            "rmse_logvol": float(np.sqrt((e_log**2).mean())),
            "mae_vol_pts": float((bt["realized"] - bt[leg]).abs().mean()),
            "qlike": float(qlike(bt["realized"], bt[leg]).mean()),
            "bias_vol_pts": float((bt[leg] - bt["realized"]).mean()),
        }
    inv = {leg: 1.0 / stats[leg]["rmse_logvol"] for leg in stats}
    w_s = inv["sarimax"] / (inv["sarimax"] + inv["garch"])
    w_g = 1.0 - w_s

    ens = np.exp(w_s * np.log(bt["sarimax"]) + w_g * np.log(bt["garch"]))
    e_log = np.log(bt["realized"]) - np.log(ens)
    stats["ensemble"] = {
        "rmse_logvol": float(np.sqrt((e_log**2).mean())),
        "mae_vol_pts": float((bt["realized"] - ens).abs().mean()),
        "qlike": float(qlike(bt["realized"], ens).mean()),
        "bias_vol_pts": float((ens - bt["realized"]).mean()),
    }
    return bt, w_s, w_g, stats


# ----------------------------------------------------------------------
# 5. Main
# ----------------------------------------------------------------------
def main():
    print("Fetching ^NSEI and ^INDIAVIX ...")
    px, vix = fetch_data()
    df = build_frame(px, vix)
    has_vix = df["log_vix"].notna().all()
    print(f"  {len(df)} obs  {df.index[0].date()} -> {df.index[-1].date()}"
          f"  | VIX exog: {has_vix}")

    spot = float(px["Close"].iloc[-1])
    rv_now = float(df["rv"].iloc[-1])
    vix_now = float(df["vix"].iloc[-1]) if has_vix else float("nan")

    print("Selecting SARIMAX order (AIC grid) ...")
    order, sorder = select_sarimax_order(df["log_rv"], df[["log_vix"]] if has_vix else None)
    print(f"  order={order}  seasonal={sorder}")

    print(f"Backtesting {BT_ORIGINS} rolling origins ...")
    bt, w_s, w_g, stats = backtest(df, order, sorder)
    print(f"  weights: SARIMAX {w_s:.2f} / GARCH-t {w_g:.2f}")

    s_pt, s_lo68, s_hi68, s_lo95, s_hi95 = sarimax_forecast(df, order, sorder)
    g_pt, g_res = garch_forecast(df["ret"])
    nu = float(g_res.params.get("nu", np.nan))
    ens = float(np.exp(w_s * np.log(s_pt) + w_g * np.log(g_pt)))

    out = {
        "as_of": str(df.index[-1].date()),
        "spot": spot,
        "horizon_days": HORIZON,
        "current": {"rv_10d_parkinson": rv_now,
                    "rv_10d_close_close": float(df["rv_cc"].iloc[-1]),
                    "india_vix": vix_now},
        "sarimax": {"order": list(order), "seasonal_order": list(sorder),
                    "point": s_pt, "band68": [s_lo68, s_hi68], "band95": [s_lo95, s_hi95]},
        "garch_t": {"point": g_pt, "spec": "GJR-GARCH(1,1)-t", "nu": nu},
        "ensemble": {"point": ens, "w_sarimax": w_s, "w_garch": w_g},
        "backtest": {"n_origins": int(len(bt)), "stats": stats},
    }
    with open(OUT_JSON, "w") as f:
        json.dump(out, f, indent=2)

    vrp = vix_now - ens if has_vix else float("nan")
    print(f"""
================= NIFTY 10D RV FORECAST — {out['as_of']} =================
 Spot                       {spot:,.1f}
 Current 10d RV (Parkinson) {rv_now:5.2f}%   (close-close {out['current']['rv_10d_close_close']:.2f}%)
 India VIX                  {vix_now:5.2f}%

 Leg 1  SARIMAX{order}x{sorder} + logVIX : {s_pt:5.2f}%   68% [{s_lo68:.2f}, {s_hi68:.2f}]  95% [{s_lo95:.2f}, {s_hi95:.2f}]
 Leg 2  GJR-GARCH(1,1)-t  (nu={nu:.1f})     : {g_pt:5.2f}%

 ENSEMBLE ({w_s:.2f}/{w_g:.2f})              : {ens:5.2f}%  annualized
                                     = {ens / np.sqrt(ANN) * np.sqrt(HORIZON):.2f}% expected 10-day move (1-sigma)

 Vol risk premium (VIX - fcst RV)   : {vrp:+5.2f} vol pts
 Backtest ({len(bt)} origins)  QLIKE  sarimax {stats.get('sarimax', {}).get('qlike', float('nan')):.4f} | garch {stats.get('garch', {}).get('qlike', float('nan')):.4f} | ens {stats.get('ensemble', {}).get('qlike', float('nan')):.4f}
               RMSE(log vol)  sarimax {stats.get('sarimax', {}).get('rmse_logvol', float('nan')):.4f} | garch {stats.get('garch', {}).get('rmse_logvol', float('nan')):.4f} | ens {stats.get('ensemble', {}).get('rmse_logvol', float('nan')):.4f}
===========================================================================
Saved -> {OUT_JSON}""")


if __name__ == "__main__":
    main()
