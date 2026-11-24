import pytest
from pydantic import ValidationError
from app.schemas import EntryIn, normalize_plate
from app.ai import state

def test_plate_normalization():
    assert normalize_plate(" abc-123 ") == "ABC123"
    assert normalize_plate("abc12d") == "ABC12D"
    with pytest.raises(ValueError):
        normalize_plate("A!")

def test_request_validation():
    with pytest.raises(ValidationError):
        EntryIn(plate="!", confidence=0.5)
    with pytest.raises(ValidationError):
        EntryIn(plate="ABC123", confidence=2)

def test_model_state_is_explicit():
    result = state()
    assert isinstance(result["available"], bool)
    assert isinstance(result["yolo_loaded"], bool)
