from nselib import capital_market
try:
    df = capital_market.category_turnover_cash()
    print(df.head())
except Exception as e:
    print(e)
