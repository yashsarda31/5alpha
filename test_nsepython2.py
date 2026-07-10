import logging
logging.basicConfig(level=logging.DEBUG)

try:
    from nsepython import nse_fiidii
    print(nse_fiidii())
except Exception as e:
    print(e)
