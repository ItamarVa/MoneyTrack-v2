"""Rebuild graphify-out from repo AST extraction (incremental code graph)."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.detect import detect, save_manifest
from graphify.export import to_canvas, to_html, to_json, to_obsidian
from graphify.extract import collect_files, extract
from graphify.report import generate

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "graphify-out"


def main() -> None:
    detect_result = detect(ROOT)
    code_files: list[Path] = []
    for f in detect_result.get("files", {}).get("code", []):
        p = Path(f)
        code_files.extend(collect_files(p) if p.is_dir() else [p])

    ast = extract(code_files) if code_files else {"nodes": [], "edges": [], "input_tokens": 0, "output_tokens": 0}
    merged = {
        "nodes": ast["nodes"],
        "edges": ast["edges"],
        "input_tokens": 0,
        "output_tokens": 0,
    }

    OUT.mkdir(exist_ok=True)
    G = build_from_json(merged)
    communities = cluster(G)
    cohesion = score_all(G, communities)
    tokens = {"input": 0, "output": 0}
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)
    labels = {cid: f"Community {cid}" for cid in communities}
    questions = suggest_questions(G, communities, labels)

    report = generate(
        G,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detect_result,
        tokens,
        str(ROOT),
        suggested_questions=questions,
    )
    (OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    to_json(G, communities, str(OUT / "graph.json"))

    if G.number_of_nodes() <= 5000:
        to_html(G, communities, str(OUT / "graph.html"), community_labels=labels)
        obsidian_dir = OUT / "obsidian"
        to_obsidian(G, communities, str(obsidian_dir), community_labels=labels, cohesion=cohesion)
        to_canvas(G, communities, str(obsidian_dir / "graph.canvas"), community_labels=labels)

    save_manifest(detect_result["files"])
    print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities")
    print(f"AST from {len(code_files)} code files")


if __name__ == "__main__":
    main()
