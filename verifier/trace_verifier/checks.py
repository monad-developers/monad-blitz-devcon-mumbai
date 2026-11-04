from dataclasses import dataclass


@dataclass(frozen=True)
class Verdict:
    passed: bool
    score: int
    reason: str


def _fail(reason: str) -> Verdict:
    return Verdict(False, 0, reason)


def check_failure_moment(mark: dict, physics: dict, rule: dict) -> Verdict:
    primary = physics["primary_event"]
    truth_t = float(primary["t"])
    tolerance = float(rule["tolerance_s"])
    t = float(mark["t"])
    dt = abs(t - truth_t)
    if rule.get("require_type", True) and mark.get("type") != primary["type"]:
        return _fail(f"you marked {mark.get('type')}; this clip's failure is {primary['type']} at {truth_t:.2f} s")
    if dt > tolerance:
        cue = "watch the contact-force line drop" if primary["type"] == "contact_lost" else "watch the torque spike"
        return _fail(f"you marked {t:.2f} s; the {primary['type'].replace('_', ' ')} happened at {truth_t:.2f} s ({cue})")
    score = round(10000 * (1 - dt / tolerance))
    return Verdict(True, max(0, min(10000, score)), f"within {dt:.2f} s of {truth_t:.2f} s")


def _inside(point: tuple[float, float], polygon: list[list[float]]) -> bool:
    x, y = point
    inside = False
    n = len(polygon)
    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def check_grasp_point(point: dict, physics: dict) -> Verdict:
    zone = physics["grasp"]["valid_zone"]
    p = (float(point["x"]), float(point["y"]))
    cx = sum(v[0] for v in zone) / len(zone)
    cy = sum(v[1] for v in zone) / len(zone)
    if not _inside(p, zone):
        return _fail(f"({p[0]:.2f}, {p[1]:.2f}) is outside the stable grasp zone centred at ({cx:.2f}, {cy:.2f})")
    radius = max(((v[0] - cx) ** 2 + (v[1] - cy) ** 2) ** 0.5 for v in zone)
    dist = ((p[0] - cx) ** 2 + (p[1] - cy) ** 2) ** 0.5
    return Verdict(True, round(10000 * (1 - min(1.0, dist / radius))), "inside the stable grasp zone")


def verify_annotation(annotation: dict, physics: dict, rules: dict) -> Verdict:
    if int(annotation.get("dwell_ms", 0)) < int(rules.get("min_dwell_ms", 0)):
        return _fail(f"answered after {annotation.get('dwell_ms', 0)} ms; watch the clip for at least {rules['min_dwell_ms']} ms")
    verdicts: list[Verdict] = []
    if rules.get("failure_moment") is not None:
        mark = annotation.get("failure_moment")
        if not mark:
            return _fail("this task needs a failure moment")
        verdicts.append(check_failure_moment(mark, physics, rules["failure_moment"]))
    if rules.get("grasp_point", {}).get("enabled"):
        point = annotation.get("grasp_point")
        if not point:
            return _fail("this task needs a grasp point")
        verdicts.append(check_grasp_point(point, physics))
    if not verdicts:
        return _fail("task has no annotation rules")
    failed = [v for v in verdicts if not v.passed]
    if failed:
        return failed[0]
    return Verdict(True, min(v.score for v in verdicts), "; ".join(v.reason for v in verdicts))
