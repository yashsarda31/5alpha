import requests
from datetime import datetime

def test_niftytrader():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.niftytrader.in/nse-option-chain"
    }
    
    symbol = "NIFTY"
    url_exp = f"https://api.niftytrader.in/api/Symbol/symbol-expiry-all?symbol={symbol}&exchange=nse"
    try:
        r = requests.get(url_exp, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            res_data = data.get("resultData", [])
            filtered = [item for item in res_data if item.get("symbol_name", "").upper() == symbol.upper()]
            exp_dates = sorted(list(set(item.get("expiry_date") for item in filtered)))
            
            # Find first future expiry
            today_str = "2026-06-29"
            future_exps = [exp for exp in exp_dates if exp.split("T")[0] >= today_str]
            print("All expiries:", exp_dates)
            print("Future expiries:", future_exps)
            
            if future_exps:
                target_exp = future_exps[0]
                print(f"Fetching option chain for {symbol} on {target_exp}...")
                url_data = f"https://api.niftytrader.in/api/option/option-chain-data?symbol={symbol}&exchange=nse&expiryDate={target_exp}"
                r_data = requests.get(url_data, headers=headers, timeout=10)
                print("Status:", r_data.status_code)
                res_data = r_data.json()
                print("resultData is None?", res_data.get("resultData") is None)
                if res_data.get("resultData"):
                    op_datas = res_data["resultData"].get("opDatas", [])
                    print("Number of option chain rows:", len(op_datas))
                    if op_datas:
                        print("Sample row keys:", op_datas[0].keys())
                        print("Sample row CE:", op_datas[0].get("ce"))
                        print("Sample row PE:", op_datas[0].get("pe"))
                        print("Strike:", op_datas[0].get("strike_price"))
            else:
                print("No future expiries found")
        else:
            print("Failed to fetch expiries:", r.text[:200])
    except Exception as e:
        print("Exception:", e)

if __name__ == "__main__":
    test_niftytrader()
