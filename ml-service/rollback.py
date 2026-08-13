"""
Model versioning / rollback CLI.

The same operations are also exposed over HTTP by app.py
(GET /model/versions, POST /model/rollback) for the common case of
rolling back through the running service. This script exists for the
case that matters more in practice: the deployed model is misbehaving
badly enough that you don't want to trust the API layer, or the service
is down entirely. It edits registry.json and copies files directly, so
it works independently of the Flask process (a subsequent restart / the
next /model/reload call will pick up the change).

Usage:
  python rollback.py list
  python rollback.py rollback <version>
"""
import sys

import registry


def cmd_list():
    current = registry.load_registry().get("current")
    for v in registry.list_versions():
        marker = " <- current" if v["version"] == current else ""
        m = v["metrics"]
        print(
            f"{v['version']:>20}  status={v['status']:<16} "
            f"f1={m.get('condition_f1', float('nan')):.4f} "
            f"r2={m.get('amount_r2', float('nan')):.4f}  "
            f"trained_at={v['trained_at']}{marker}"
        )


def cmd_rollback(version):
    result = registry.rollback_to(version)
    print(f"Rolled back: {result['previous']} -> {result['promoted']}")
    print("Restart ml-service (or POST /model/reload) for the change to take effect if it's already running.")


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("list", "rollback"):
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == "list":
        cmd_list()
    elif sys.argv[1] == "rollback":
        if len(sys.argv) != 3:
            print("Usage: python rollback.py rollback <version>")
            sys.exit(1)
        cmd_rollback(sys.argv[2])


if __name__ == "__main__":
    main()
