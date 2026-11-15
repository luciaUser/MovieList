#!/usr/bin/env python3
"""Turn the film list into films.js. Directors are only set when confirmed."""

import json
import re
from pathlib import Path

SRC = Path("/Users/lucianobernasconi/Desktop/film_und_serienliste.txt")
OUT = Path(__file__).resolve().parents[1] / "films.js"

# Confirmed directors only. Co-directors stay one label so they never
# merge with a different film by accident.
DIRECTORS = {
    1: "Frank Darabont",
    2: "Johan Renck",
    3: "Christopher Nolan",
    4: "Peter Jackson",
    6: "Christopher Nolan",
    7: "David Fincher",
    8: "Christopher Nolan",
    9: "Martin Scorsese",
    11: "Bong Joon-ho",
    12: "Christopher Nolan",
    13: "Quentin Tarantino",
    14: "Olivier Nakache & Éric Toledano",
    15: "Denis Villeneuve",
    16: "Quentin Tarantino",
    17: "Park Chan-wook",
    18: "Francis Ford Coppola",
    19: "Tony Gilroy",
    20: "Christopher Nolan",
    21: "Stanley Kubrick",
    22: "Brian De Palma",
    23: "Michael Mann",
    26: "Martin Scorsese",
    27: "Martin Scorsese",
    28: "Chloé Zhao",
    30: "Steven Spielberg",
    31: "George Miller",
    32: "Tom McCarthy",
    33: "Gore Verbinski",
    34: "Lasse Hallström",
    35: "Richard Kelly",
    36: "Ridley Scott",
    41: "Rian Johnson",
    42: "Jon Favreau",
    43: "Ang Lee",
    46: "Jiaozi",
    47: "Guy Ritchie",
    48: "Quentin Tarantino",
    49: "Martin Scorsese",
    50: "Duncan Jones",
    51: "Peter Jackson",
    52: "George P. Cosmatos",
    53: "Kim Jee-woon",
    54: "Tomas Alfredson",
    55: "Alejandro G. Iñárritu",
    56: "James L. Brooks",
    57: "Justine Triet",
    58: "Taylor Sheridan",
    59: "Nia DaCosta",
    61: "Paul Haggis",
    62: "Quentin Tarantino",
    63: "Guy Ritchie",
    64: "David Mackenzie",
    65: "George Miller",
    66: "David Ayer",
    67: "Christopher McQuarrie",
    68: "Ryan Coogler",
    69: "Alejandro Amenábar",
    71: "Michael & Peter Spierig",
    72: "Rodrigo Sorogoyen",
    73: "Taylor Hackford",
    74: "Josh Safdie",
    76: "Neil Burger",
    77: "Rian Johnson",
    78: "Guillermo del Toro",
    79: "James Vanderbilt",
    80: "Zach Cregger",
    82: "Lee Isaac Chung",
    83: "Christopher Nolan",
    84: "Robert Rodriguez",
    88: "Baz Luhrmann",
    89: "Emerald Fennell",
    90: "Kleber Mendonça Filho",
    91: "James Cameron",
    92: "Jake Schreier",
    93: "Noah Hawley",
    94: "Philip Barantini",
    99: "Dan Trachtenberg",
    100: "Alex Garland & Ray Mendoza",
    101: "Danny & Michael Philippou",
    104: "Jeremy Saulnier",
    105: "Matt Reeves",
    106: "Joseph Kosinski",
    107: "Denis Villeneuve",
    108: "Scott Derrickson",
    112: "Paul Greengrass",
    113: "Michael Keaton",
    114: "B. J. Novak",
    115: "Adam Randall",
    116: "Sam Raimi",
    119: "Paul Feig",
    120: "Jalmari Helander",
    121: "M. Night Shyamalan",
    126: "Wes Anderson",
    127: "Chris Columbus",
    128: "Thomas M. Wright",
    132: None,
    133: "Zach Lipovsky & Adam Stein",
    134: "Steven Spielberg",
    138: "Yeon Sang-ho",
    139: "J. C. Chandor",
    140: "Edgar Wright",
    141: "Benny Safdie",
    145: "Luc Besson",
    147: "Gareth Evans",
    149: "Emilie Blichfeldt",
    152: "David Yarovesky",
    153: "Jaume Collet-Serra",
    154: "Gerard Johnstone",
    160: "Mark Fischbach",
}

FRANCHISE = {
    3: "Batman",
    4: "Mittelerde",
    20: "Batman",
    31: "Mad Max",
    33: "Fluch der Karibik",
    40: "Batman",
    42: "MCU",
    51: "Mittelerde",
    65: "Mad Max",
    87: "Predator",
    91: "Avatar",
    92: "MCU",
    99: "Predator",
}

GENRE_ALIAS = {
    "Historisches Drama": "Historie",
    "Kriegsdrama": "Kriegsfilm",
    "Historien-Action": "Historie",
    "Gangsterdrama": "Krimi",
    "Politthriller": "Thriller",
    "Psychothriller": "Thriller",
    "Sportdrama": "Drama",
    "Romanze": "Romantik",
}


def parse_imdb(raw: str):
    raw = raw.strip()
    label = raw.replace(" / 10", "").strip()
    if label.lower().startswith("k"):
        return None, "k. A."
    nums = re.findall(r"\d+,\d+|\d+", label)
    vals = [float(n.replace(",", ".")) for n in nums]
    score = sum(vals) / len(vals) if vals else None
    return score, label


def parse_year(token: str):
    token = token.strip()
    if "/" in token and "–" not in token and "-" not in token:
        # "2022 / 2005" is two films, not a span. "2025/26" is a season.
        if re.fullmatch(r"\d{4}\s*/\s*\d{4}", token):
            return token, None
        m = re.fullmatch(r"(\d{4})/(\d{2})", token)
        if m:
            return token, int(m.group(1)[:2] + m.group(2))
    parts = re.findall(r"\d{4}", token)
    if len(parts) >= 2:
        return token, int(round((int(parts[0]) + int(parts[-1])) / 2))
    if len(parts) == 1:
        return token, int(parts[0])
    return token, None


def split_title(head: str):
    head = head.strip()
    m = re.search(r"\(([^)]+)\)\s*$", head)
    year_token = m.group(1) if m else ""
    body = head[: m.start()].strip() if m else head
    kind = "film"
    if re.search(r"\[(?:Mini)?[Ss]erie\]", body):
        kind = "serie"
    meta = re.findall(r"\[([^\]]+)\]", body)
    body_clean = re.sub(r"\s*\[[^\]]+\]", "", body).strip()
    original = None
    short = body_clean
    paren = re.search(r"^(.*?)\s*\(([^)]+)\)\s*$", body_clean)
    if paren and paren.group(1).strip():
        short = paren.group(1).strip()
        original = paren.group(2).strip()
    year_label, year_num = parse_year(year_token) if year_token else ("", None)
    return short, original, kind, meta, year_label, year_num


def main():
    text = SRC.read_text(encoding="utf-8")
    blocks = re.split(r"\n(?=\d+\. )", text)
    films = []
    for block in blocks:
        m = re.match(r"(\d+)\.\s+(.+)", block)
        if not m:
            continue
        num = int(m.group(1))
        first = m.group(2).strip()
        genre_m = re.search(r"Hauptgenre:\s*(.+)", block)
        tags_m = re.search(r"Tags:\s*(.+)", block)
        imdb_m = re.search(r"IMDb:\s*(.+)", block)
        genres = [g.strip() for g in genre_m.group(1).split(",")] if genre_m else []
        tags = re.findall(r"#([^\s#]+)", tags_m.group(1) if tags_m else "")
        score, label = parse_imdb(imdb_m.group(1) if imdb_m else "k. A.")
        short, original, kind, meta, year_label, year_num = split_title(first)
        cluster = GENRE_ALIAS.get(genres[0], genres[0] if genres else "Ohne Genre")
        films.append(
            {
                "id": f"f{num:03d}",
                "n": num,
                "title": short,
                "original": original,
                "meta": meta,
                "kind": kind,
                "year": year_label,
                "yearNum": year_num,
                "genres": genres,
                "cluster": cluster,
                "tags": tags,
                "imdb": score,
                "imdbLabel": label,
                "director": DIRECTORS.get(num),
                "franchise": FRANCHISE.get(num),
            }
        )
    films.sort(key=lambda f: f["n"])
    if len(films) != 160:
        raise SystemExit(f"expected 160 films, got {len(films)}")
    missing_director = sum(1 for f in films if not f["director"])
    payload = json.dumps(films, ensure_ascii=False, indent=2)
    OUT.write_text("window.FILMS = " + payload + ";\n", encoding="utf-8")
    print(f"wrote {len(films)} films, {missing_director} without director -> {OUT}")


if __name__ == "__main__":
    main()
