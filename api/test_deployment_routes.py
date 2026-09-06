import json
from pathlib import Path


def test_sitemap_is_served_as_generated_xml():
    config = json.loads((Path(__file__).resolve().parents[1] / "vercel.json").read_text())
    route = next(item for item in config["routes"] if item.get("src") == "/sitemap.xml")

    assert route["dest"] == "/web/sitemap.xml"
    assert route["headers"]["content-type"].startswith("application/xml")
