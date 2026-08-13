"""
Evaluate a challenger model version against the current champion and
promote it only if it's at least as good, within a small tolerance.

This is what makes retraining "continuous learning" instead of "blind
overwrite": every scheduled retrain produces a challenger, but a
challenger only ever goes live if it clears the bar below. If it
doesn't, it stays in the registry (inspectable, and available to
manually promote later) while the champion keeps serving traffic.

Promotion rule (tunable via the thresholds below):
  - condition_f1 must not regress by more than CLASSIFIER_TOLERANCE
  - amount_r2 must not regress by more than REGRESSOR_TOLERANCE
  - both must hold at once

The very first version ever trained has no champion to compare against,
so it is promoted unconditionally.

Usage:
  python evaluate_and_promote.py <challenger_version>
"""
import sys

import registry

CLASSIFIER_TOLERANCE = 0.01  # condition_f1 allowed to drop by at most this much
REGRESSOR_TOLERANCE = 0.02   # amount_r2 allowed to drop by at most this much


def decide(challenger_metrics, champion_metrics):
    if champion_metrics is None:
        return True, "no current champion — promoting the first trained version"

    f1_delta = challenger_metrics["condition_f1"] - champion_metrics["condition_f1"]
    r2_delta = challenger_metrics["amount_r2"] - champion_metrics["amount_r2"]

    if f1_delta < -CLASSIFIER_TOLERANCE:
        return False, f"condition_f1 regressed by {-f1_delta:.4f} (tolerance {CLASSIFIER_TOLERANCE})"
    if r2_delta < -REGRESSOR_TOLERANCE:
        return False, f"amount_r2 regressed by {-r2_delta:.4f} (tolerance {REGRESSOR_TOLERANCE})"
    return True, (
        f"condition_f1 {champion_metrics['condition_f1']:.4f} -> {challenger_metrics['condition_f1']:.4f}, "
        f"amount_r2 {champion_metrics['amount_r2']:.4f} -> {challenger_metrics['amount_r2']:.4f}"
    )


def evaluate_and_promote(challenger_version):
    challenger = registry.get_version(challenger_version)
    if challenger is None:
        raise ValueError(f"Unknown version: {challenger_version}")

    champion = registry.get_current()
    should_promote, reason = decide(
        challenger["metrics"], champion["metrics"] if champion else None
    )

    if should_promote:
        registry.promote_version(challenger_version)
        outcome = "PROMOTED"
    else:
        outcome = "REJECTED"

    print(f"{outcome}: {challenger_version} — {reason}")
    return {"outcome": outcome, "reason": reason, "version": challenger_version}


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    evaluate_and_promote(sys.argv[1])


if __name__ == "__main__":
    main()
