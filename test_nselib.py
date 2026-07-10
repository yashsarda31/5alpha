from nselib import capital_market
import pandas as pd
from datetime import datetime, timedelta

end_date = datetime.now()
start_date = end_date - timedelta(days=60)

end_str = end_date.strftime("%d-%m-%Y")
start_str = start_date.strftime("%d-%m-%Y")

try:
    df = capital_market.fii_dii_trading_activity()
    print("Default:")
    print(df.head())
except Exception as e:
    print("Error default:", e)

try:
    # Trying to see if there's an archive or date range function
    print(dir(capital_market))
except Exception as e:
    pass
