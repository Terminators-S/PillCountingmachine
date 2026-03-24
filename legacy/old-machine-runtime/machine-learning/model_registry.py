import json
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path(__file__).resolve().parent
DEFAULT_CATALOG_PATH = ROOT / "model_catalog.json"


def load_catalog(catalog_path: str | None = None) -> Dict[str, Any]:
    path = Path(catalog_path).resolve() if catalog_path else DEFAULT_CATALOG_PATH
    with path.open("r", encoding="utf-8") as handle:
        catalog = json.load(handle)
    catalog["_catalog_path"] = str(path)
    return catalog


def list_models(catalog_path: str | None = None) -> List[Dict[str, Any]]:
    catalog = load_catalog(catalog_path)
    return [resolve_model(model.get("key"), catalog["_catalog_path"]) for model in catalog.get("models", [])]


def resolve_model(model_key: str | None = None, catalog_path: str | None = None) -> Dict[str, Any]:
    catalog = load_catalog(catalog_path)
    selected_key = model_key or catalog.get("defaultModelKey")

    for model in catalog.get("models", []):
        if model.get("key") == selected_key:
            resolved = dict(model)
            if resolved.get("provider") == "local" and resolved.get("path"):
                resolved["absolutePath"] = str((Path(catalog["_catalog_path"]).parent / resolved["path"]).resolve())
            if resolved.get("provider") == "ensemble":
                resolved["componentsResolved"] = [resolve_model(component, catalog["_catalog_path"]) for component in resolved.get("components", [])]
            resolved["catalogPath"] = catalog["_catalog_path"]
            resolved["defaultModelKey"] = catalog.get("defaultModelKey")
            return resolved

    raise KeyError(f"Model key not found in catalog: {selected_key}")
