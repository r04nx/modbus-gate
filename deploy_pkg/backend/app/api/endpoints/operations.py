from fastapi import APIRouter
from typing import List, Dict

router = APIRouter()

# Mathematical operations library
OPERATIONS = [
    # Basic Operations
    {"name": "+", "symbol": "+", "description": "Addition", "category": "Basic", "example": "A + B"},
    {"name": "-", "symbol": "-", "description": "Subtraction", "category": "Basic", "example": "A - B"},
    {"name": "*", "symbol": "*", "description": "Multiplication", "category": "Basic", "example": "A * B"},
    {"name": "/", "symbol": "/", "description": "Division", "category": "Basic", "example": "A / B"},
    {"name": "**", "symbol": "**", "description": "Power/Exponentiation", "category": "Basic", "example": "A ** 2"},
    {"name": "%", "symbol": "%", "description": "Modulo (Remainder)", "category": "Basic", "example": "A % B"},
    {"name": "()", "symbol": "()", "description": "Parentheses for grouping", "category": "Basic", "example": "(A + B) * C"},
    
    # Trigonometric
    {"name": "sin", "symbol": "sin(x)", "description": "Sine (radians)", "category": "Trigonometric", "example": "sin(A)"},
    {"name": "cos", "symbol": "cos(x)", "description": "Cosine (radians)", "category": "Trigonometric", "example": "cos(A)"},
    {"name": "tan", "symbol": "tan(x)", "description": "Tangent (radians)", "category": "Trigonometric", "example": "tan(A)"},
    {"name": "asin", "symbol": "asin(x)", "description": "Arc sine", "category": "Trigonometric", "example": "asin(A)"},
    {"name": "acos", "symbol": "acos(x)", "description": "Arc cosine", "category": "Trigonometric", "example": "acos(A)"},
    {"name": "atan", "symbol": "atan(x)", "description": "Arc tangent", "category": "Trigonometric", "example": "atan(A)"},
    {"name": "atan2", "symbol": "atan2(y, x)", "description": "Arc tangent of y/x", "category": "Trigonometric", "example": "atan2(A, B)"},
    {"name": "sinh", "symbol": "sinh(x)", "description": "Hyperbolic sine", "category": "Trigonometric", "example": "sinh(A)"},
    {"name": "cosh", "symbol": "cosh(x)", "description": "Hyperbolic cosine", "category": "Trigonometric", "example": "cosh(A)"},
    {"name": "tanh", "symbol": "tanh(x)", "description": "Hyperbolic tangent", "category": "Trigonometric", "example": "tanh(A)"},
    
    # Logarithmic
    {"name": "log", "symbol": "log(x, base)", "description": "Logarithm (default base e)", "category": "Logarithmic", "example": "log(A)"},
    {"name": "log10", "symbol": "log10(x)", "description": "Base-10 logarithm", "category": "Logarithmic", "example": "log10(A)"},
    {"name": "log2", "symbol": "log2(x)", "description": "Base-2 logarithm", "category": "Logarithmic", "example": "log2(A)"},
    {"name": "ln", "symbol": "ln(x)", "description": "Natural logarithm (base e)", "category": "Logarithmic", "example": "ln(A)"},
    {"name": "exp", "symbol": "exp(x)", "description": "Exponential (e^x)", "category": "Logarithmic", "example": "exp(A)"},
    
    # Roots & Powers
    {"name": "sqrt", "symbol": "sqrt(x)", "description": "Square root", "category": "Roots & Powers", "example": "sqrt(A)"},
    {"name": "pow", "symbol": "pow(x, y)", "description": "Power function", "category": "Roots & Powers", "example": "pow(A, 2)"},
    {"name": "abs", "symbol": "abs(x)", "description": "Absolute value", "category": "Roots & Powers", "example": "abs(A)"},
    
    # Rounding
    {"name": "round", "symbol": "round(x, n)", "description": "Round to n decimals", "category": "Rounding", "example": "round(A, 2)"},
    {"name": "floor", "symbol": "floor(x)", "description": "Round down to integer", "category": "Rounding", "example": "floor(A)"},
    {"name": "ceil", "symbol": "ceil(x)", "description": "Round up to integer", "category": "Rounding", "example": "ceil(A)"},
    {"name": "trunc", "symbol": "trunc(x)", "description": "Truncate to integer", "category": "Rounding", "example": "trunc(A)"},
    
    # Statistical
    {"name": "min", "symbol": "min(x, y, ...)", "description": "Minimum value", "category": "Statistical", "example": "min(A, B, C)"},
    {"name": "max", "symbol": "max(x, y, ...)", "description": "Maximum value", "category": "Statistical", "example": "max(A, B, C)"},
    
    # Comparison
    {"name": "<", "symbol": "<", "description": "Less than", "category": "Comparison", "example": "A < B"},
    {"name": "<=", "symbol": "<=", "description": "Less than or equal", "category": "Comparison", "example": "A <= B"},
    {"name": ">", "symbol": ">", "description": "Greater than", "category": "Comparison", "example": "A > B"},
    {"name": ">=", "symbol": ">=", "description": "Greater than or equal", "category": "Comparison", "example": "A >= B"},
    {"name": "==", "symbol": "==", "description": "Equal to", "category": "Comparison", "example": "A == B"},
    {"name": "!=", "symbol": "!=", "description": "Not equal to", "category": "Comparison", "example": "A != B"},
    
    # Constants
    {"name": "pi", "symbol": "pi", "description": "Pi constant (3.14159...)", "category": "Constants", "example": "2 * pi * A"},
    {"name": "e", "symbol": "e", "description": "Euler's number (2.71828...)", "category": "Constants", "example": "e ** A"},
]

@router.get("/")
def get_operations() -> List[Dict]:
    """Get all available mathematical operations"""
    return OPERATIONS
