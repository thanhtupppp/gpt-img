"""Standalone worker: python -m app.bridge.worker."""
import base64
import binascii
import concurrent.futures
import json
import logging
import os
import socket
import threading
import time
from datetime import datetime, timezone
from typing import Any

from . import asset_store, worker_store
from ..config import get_settings
from ..providers.gemini import GeminiAdapterError, GeminiImageAdapter

logger = logging.getLogger("piecs.workflow_worker")
TERMINAL = {"succeeded", "failed", "cancelled", "blocked", "interrupted"}
MAX_GRAPH_NODES = 200
MAX_CONCURRENCY = 4


class WorkflowCancelled(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _topological_waves(nodes: list[dict[str, Any]], edges: list[dict[str, str]]) -> list[list[dict[str, Any]]]:
    by_id = {node["id"]: node for node in nodes}
    if len(by_id) != len(nodes) or not nodes or len(nodes) > MAX_GRAPH_NODES:
        raise ValueError("Invalid workflow node collection.")
    incoming = {node_id: 0 for node_id in by_id}
    outgoing = {node_id: [] for node_id in by_id}
    for edge in edges:
        source, target = edge.get("from"), edge.get("to")
        if source not in by_id or target not in by_id or source == target:
            raise ValueError("Workflow contains an invalid dependency edge.")
        incoming[target] += 1
        outgoing[source].append(target)
    waves = []
    completed = set()
    while len(completed) < len(nodes):
        wave = [node for node in nodes if node["id"] not in completed and incoming[node["id"]] == 0]
        if not wave:
            raise ValueError("Workflow graph contains a dependency cycle.")
        waves.append(wave)
        for node in wave:
            completed.add(node["id"])
            for child in outgoing[node["id"]]:
                incoming[child] -= 1
    return waves


def _input_for_node(node: dict[str, Any], parent_outputs: dict[str, dict[str, Any]]) -> tuple[str | None, str | None]:
    parameters = node.get("parameters") or {}
    explicit_asset = parameters.get("input_asset_id")
    if isinstance(explicit_asset, str) and explicit_asset.strip():
        data, mime = asset_store.get_image(explicit_asset.strip())
        return base64.b64encode(data).decode("ascii"), mime
    explicit_parent = parameters.get("input_from")
    if isinstance(explicit_parent, str) and explicit_parent.strip():
        output = parent_outputs.get(explicit_parent.strip())
        if not output or not output.get("assetId"):
            raise ValueError("Configured input_from node has no image output.")
        data, mime = asset_store.get_image(output["assetId"])
        return base64.b64encode(data).decode("ascii"), mime
    for output in parent_outputs.values():
        if output.get("assetId"):
            data, mime = asset_store.get_image(output["assetId"])
            return base64.b64encode(data).decode("ascii"), mime
    return None, None


def _execute_node(
    node: dict[str, Any],
    parent_outputs: dict[str, dict[str, Any]],
    adapter: GeminiImageAdapter,
) -> dict[str, Any]:
    parameters = node.get("parameters") or {}
    prompt = parameters.get("prompt") or parameters.get("instruction") or node["commandId"]
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("Workflow node prompt must be a non-empty string.")
    image_data, mime_type = _input_for_node(node, parent_outputs)
    result = adapter.generate_image(
        prompt=prompt,
        model=parameters.get("model", "gemini-nano-banana-2.1"),
        image_base64=image_data,
        mime_type=mime_type,
        aspect_ratio=parameters.get("aspect_ratio", "1:1"),
        image_size=parameters.get("image_size", "1K"),
    )
    image = result["image"]
    try:
        raw = base64.b64decode(image["data"], validate=True)
    except (binascii.Error, ValueError, TypeError) as exc:
        raise ValueError("Provider returned invalid image data.") from exc
    asset_id = f"{int(time.time() * 1000)}-{os.urandom(12).hex()}"
    asset = asset_store.put_image(asset_id, raw, image["mime_type"])
    return {
        "assetId": asset["id"],
        "mimeType": asset["mimeType"],
        "size": asset["size"],
        "model": result["model"],
        "provider": "gemini",
        "interactionId": result.get("interaction_id"),
    }


def execute_claimed_execution(claim: dict[str, Any], worker_id: str, concurrency: int = 4) -> None:
    execution_id = claim["execution_id"]
    payload = claim["payload"]
    graph = payload["graph"]
    nodes = graph["nodes"]
    edges = graph["edges"]
    if not 1 <= concurrency <= MAX_CONCURRENCY:
        raise ValueError("Worker concurrency must be between 1 and 4.")
    waves = _topological_waves(nodes, edges)
    states = {
        node["id"]: {"status": "pending", "commandId": node["commandId"]}
        for node in nodes
    }
    outputs: dict[str, dict[str, Any]] = {}
    parent_ids = {node["id"]: [] for node in nodes}
    for edge in edges:
        parent_ids[edge["to"]].append(edge["from"])
    adapter = GeminiImageAdapter()
    worker_store.persist_node_states(execution_id, worker_id, states)
    final_status = "succeeded"
    error_summary = None

    try:
        for wave in waves:
            if worker_store.cancellation_requested(execution_id):
                raise WorkflowCancelled("Cancellation requested.")
            ready = []
            for node in wave:
                states[node["id"]].update({"status": "running", "startedAt": _now()})
                parents = {parent: outputs[parent] for parent in parent_ids[node["id"]] if parent in outputs}
                ready.append((node, parents))
            worker_store.persist_node_states(execution_id, worker_id, states)

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(concurrency, len(ready))) as pool:
                futures = {pool.submit(_execute_node, node, parents, adapter): node for node, parents in ready}
                failure = None
                for future in concurrent.futures.as_completed(futures):
                    node = futures[future]
                    node_id = node["id"]
                    try:
                        output = future.result()
                        outputs[node_id] = output
                        states[node_id].update({
                            "status": "succeeded", "finishedAt": _now(),
                            "assetId": output["assetId"], "mimeType": output["mimeType"],
                            "size": output["size"], "model": output["model"],
                        })
                    except Exception as exc:
                        states[node_id].update({
                            "status": "failed", "finishedAt": _now(),
                            "error": _safe_error(exc),
                        })
                        failure = failure or exc
                worker_store.persist_node_states(execution_id, worker_id, states)
                if failure:
                    raise failure

        if worker_store.cancellation_requested(execution_id):
            raise WorkflowCancelled("Cancellation requested.")
    except WorkflowCancelled as exc:
        final_status, error_summary = "cancelled", str(exc)
        for state in states.values():
            if state["status"] == "pending":
                state["status"] = "cancelled"
            elif state["status"] == "running":
                state.update({"status": "cancelled", "finishedAt": _now()})
    except Exception as exc:
        final_status, error_summary = "failed", _safe_error(exc)
        for state in states.values():
            if state["status"] == "pending":
                state["status"] = "blocked"
            elif state["status"] == "running":
                state.update({"status": "failed", "finishedAt": _now(), "error": error_summary})

    if not worker_store.finish_execution(execution_id, worker_id, final_status, states, error_summary):
        logger.warning("Execution %s lost its worker lease before finalization.", execution_id)


def _safe_error(exc: Exception) -> str:
    if isinstance(exc, GeminiAdapterError):
        return f"{exc.code}: {str(exc)[:240]}"
    # Avoid returning arbitrary exception text that may include upstream payloads or credentials.
    if isinstance(exc, (ValueError, TypeError)):
        return str(exc)[:240]
    return f"{type(exc).__name__}: workflow node failed"


def run_worker(poll_seconds: float = 2.0, lease_seconds: int = 90) -> None:
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    worker_store.initialize_worker_schema()
    worker_store.register_worker(worker_id)
    settings = get_settings()
    logger.info("PIECS workflow worker started (%s).", worker_id)
    while True:
        worker_store.heartbeat_worker(worker_id)
        claim = worker_store.claim_next_execution(worker_id, lease_seconds)
        if claim is None:
            time.sleep(poll_seconds)
            continue

        stop = threading.Event()
        def renew_lease() -> None:
            while not stop.wait(max(5, lease_seconds // 3)):
                if not worker_store.heartbeat(claim["execution_id"], worker_id, lease_seconds):
                    logger.error("Lost lease for execution %s.", claim["execution_id"])
                    return
        heartbeat_thread = threading.Thread(target=renew_lease, daemon=True)
        heartbeat_thread.start()
        try:
            execute_claimed_execution(claim, worker_id, settings.worker_max_concurrency)
        except Exception:
            logger.exception("Worker failed to process execution %s.", claim["execution_id"])
            worker_store.finish_execution(
                claim["execution_id"], worker_id, "failed", {},
                "Worker failed before workflow execution could complete.",
            )
        finally:
            stop.set()
            heartbeat_thread.join(timeout=2)


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    run_worker()
