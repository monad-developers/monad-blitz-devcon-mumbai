from trace_verifier.checks import verify_annotation

PHYSICS = {
    "primary_event": {"type": "contact_lost", "t": 3.214},
    "grasp": {"frame_t": 1.0, "valid_zone": [[0.40, 0.28], [0.47, 0.28], [0.47, 0.36], [0.40, 0.36]]},
}
RULES = {"failure_moment": {"tolerance_s": 0.15, "require_type": True}, "grasp_point": {"enabled": False}, "min_dwell_ms": 3000}


def annotation(t=3.25, kind="contact_lost", dwell=9400, grasp=None):
    return {"failure_moment": {"t": t, "type": kind}, "grasp_point": grasp, "dwell_ms": dwell}


def test_correct_mark_passes_with_score():
    v = verify_annotation(annotation(3.25), PHYSICS, RULES)
    assert v.passed
    assert v.score == round(10000 * (1 - 0.036 / 0.15))


def test_exact_mark_scores_full():
    assert verify_annotation(annotation(3.214), PHYSICS, RULES).score == 10000


def test_off_by_point_four_fails_with_teaching_reason():
    v = verify_annotation(annotation(3.614), PHYSICS, RULES)
    assert not v.passed
    assert v.score == 0
    assert "3.61 s" in v.reason and "3.21 s" in v.reason and "contact-force" in v.reason


def test_wrong_type_fails():
    v = verify_annotation(annotation(3.214, "collision"), PHYSICS, RULES)
    assert not v.passed
    assert "collision" in v.reason


def test_too_fast_fails():
    assert not verify_annotation(annotation(dwell=1200), PHYSICS, RULES).passed


def test_grasp_point_inside_and_outside():
    rules = {**RULES, "grasp_point": {"enabled": True}}
    assert verify_annotation(annotation(grasp={"x": 0.435, "y": 0.32}), PHYSICS, rules).passed
    assert not verify_annotation(annotation(grasp={"x": 0.2, "y": 0.2}), PHYSICS, rules).passed
