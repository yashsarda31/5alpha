import requests
import unittest

BASE_URL = "http://localhost:8000/api"

class TestOptionChain(unittest.TestCase):
    def test_expiries_nifty(self):
        r = requests.get(f"{BASE_URL}/option-chain/expiries/NIFTY", timeout=20)
        self.assertEqual(r.status_code, 200, f"Failed to fetch expiries: {r.text}")
        data = r.json()
        self.assertIn("expiries", data)
        self.assertIsInstance(data["expiries"], list)
        self.assertGreater(len(data["expiries"]), 0, "No expiries returned")
        
    def test_option_chain_data_nifty(self):
        r_exp = requests.get(f"{BASE_URL}/option-chain/expiries/NIFTY", timeout=20)
        expiries = r_exp.json().get("expiries", [])
        if not expiries:
            self.fail("No expiries found, cannot test option chain data")
            
        expiry = expiries[0]
        r = requests.get(f"{BASE_URL}/option-chain/data/NIFTY", params={"expiryDate": expiry}, timeout=20)
        self.assertEqual(r.status_code, 200, f"Failed to fetch option chain data: {r.text}")
        data = r.json()
        
        self.assertIn("optionChain", data)
        self.assertIn("spotData", data)
        
        opDatas = data["optionChain"].get("opDatas", [])
        self.assertIsInstance(opDatas, list)
        self.assertGreater(len(opDatas), 0, "No option chain records returned")
        
        # Test first row for correct data types and existence of mapped keys
        first_row = opDatas[0]
        expected_keys = [
            "strike_price", "calls_oi", "calls_change_oi", "calls_volume", "calls_iv", 
            "calls_ltp", "calls_ltp_per", "calls_net_change",
            "puts_oi", "puts_change_oi", "puts_volume", "puts_iv", 
            "puts_ltp", "puts_ltp_per", "puts_net_change"
        ]
        
        for key in expected_keys:
            self.assertIn(key, first_row, f"Key '{key}' missing from option chain row")
            # If calls_change_oi is None (for yfinance fallback), that's acceptable
            val = first_row[key]
            self.assertTrue(val is None or isinstance(val, (int, float)), f"Key '{key}' has invalid type {type(val)}")

if __name__ == '__main__':
    unittest.main()
