"""
Advanced Calculation Engine for evaluating mathematical formulas with variable substitution.
Supports scientific operations and provides verbose error messages.
"""
import ast
import operator
import math
from typing import Dict, Any, Tuple

class FormulaEvaluator:
    """Safe calculation engine using AST parsing"""
    
    # Allowed operators
    OPERATORS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.Mod: operator.mod,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }
    
    # Allowed functions
    FUNCTIONS = {
        # Basic
        'abs': abs,
        'round': round,
        'min': min,
        'max': max,
        
        # Trigonometric
        'sin': math.sin,
        'cos': math.cos,
        'tan': math.tan,
        'asin': math.asin,
        'acos': math.acos,
        'atan': math.atan,
        'atan2': math.atan2,
        'sinh': math.sinh,
        'cosh': math.cosh,
        'tanh': math.tanh,
        
        # Logarithmic
        'log': math.log,
        'log10': math.log10,
        'log2': math.log2,
        'ln': math.log,
        'exp': math.exp,
        
        # Roots & Powers
        'sqrt': math.sqrt,
        'pow': pow,
        
        # Rounding
        'floor': math.floor,
        'ceil': math.ceil,
        'trunc': math.trunc,
    }
    
    # Constants
    CONSTANTS = {
        'pi': math.pi,
        'e': math.e,
    }
    
    def evaluate(self, formula: str, variables: Dict[str, float]) -> Tuple[Any, str]:
        """
        Evaluate a formula with given variables.
        
        Args:
            formula: Mathematical formula using variables (A, B, C, etc.)
            variables: Dictionary mapping variable names to values
            
        Returns:
            Tuple of (result, error_message). error_message is empty string if successful.
        """
        try:
            # Parse the formula
            tree = ast.parse(formula, mode='eval')
            
            # Evaluate
            result = self._eval_node(tree.body, variables)
            return result, ""
            
        except SyntaxError as e:
            return None, f"Syntax error at position {e.offset}: {e.msg}"
        except ZeroDivisionError:
            return None, "Division by zero error in formula"
        except ValueError as e:
            return None, f"Value error: {str(e)}"
        except KeyError as e:
            return None, f"Undefined variable: {str(e)}"
        except Exception as e:
            return None, f"Evaluation error: {str(e)}"
    
    def _eval_node(self, node, variables: Dict[str, float]):
        """Recursively evaluate AST node"""
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.Name):
            # Variable lookup
            if node.id in variables:
                return variables[node.id]
            elif node.id in self.CONSTANTS:
                return self.CONSTANTS[node.id]
            else:
                raise KeyError(node.id)
        elif isinstance(node, ast.BinOp):
            # Binary operation
            left = self._eval_node(node.left, variables)
            right = self._eval_node(node.right, variables)
            op_type = type(node.op)
            if op_type in self.OPERATORS:
                return self.OPERATORS[op_type](left, right)
            else:
                raise ValueError(f"Unsupported operator: {op_type.__name__}")
        elif isinstance(node, ast.UnaryOp):
            # Unary operation
            operand = self._eval_node(node.operand, variables)
            op_type = type(node.op)
            if op_type in self.OPERATORS:
                return self.OPERATORS[op_type](operand)
            else:
                raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
        elif isinstance(node, ast.Call):
            # Function call
            func_name = node.func.id if isinstance(node.func, ast.Name) else None
            if func_name in self.FUNCTIONS:
                args = [self._eval_node(arg, variables) for arg in node.args]
                return self.FUNCTIONS[func_name](*args)
            else:
                raise ValueError(f"Undefined function: {func_name}")
        elif isinstance(node, ast.Compare):
            # Comparison
            left = self._eval_node(node.left, variables)
            for op, comparator in zip(node.ops, node.comparators):
                right = self._eval_node(comparator, variables)
                if isinstance(op, ast.Lt):
                    if not (left < right):
                        return False
                elif isinstance(op, ast.LtE):
                    if not (left <= right):
                        return False
                elif isinstance(op, ast.Gt):
                    if not (left > right):
                        return False
                elif isinstance(op, ast.GtE):
                    if not (left >= right):
                        return False
                elif isinstance(op, ast.Eq):
                    if not (left == right):
                        return False
                elif isinstance(op, ast.NotEq):
                    if not (left != right):
                        return False
                left = right
            return True
        elif isinstance(node, ast.IfExp):
            # Ternary operator: value_if_true if condition else value_if_false
            test = self._eval_node(node.test, variables)
            if test:
                return self._eval_node(node.body, variables)
            else:
                return self._eval_node(node.orelse, variables)
        else:
            raise ValueError(f"Unsupported expression type: {type(node).__name__}")
    
    def validate_formula(self, formula: str, available_variables: list) -> Tuple[bool, str]:
        """
        Validate a formula without evaluating it.
        
        Args:
            formula: Formula to validate
            available_variables: List of available variable names
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            tree = ast.parse(formula, mode='eval')
            used_vars = self._extract_variables(tree.body)
            
            # Check for undefined variables
            undefined = set(used_vars) - set(available_variables) - set(self.CONSTANTS.keys())
            if undefined:
                return False, f"Undefined variables: {', '.join(undefined)}"
            
            return True, ""
        except SyntaxError as e:
            return False, f"Syntax error at position {e.offset}: {e.msg}"
        except Exception as e:
            return False, f"Validation error: {str(e)}"
    
    def _extract_variables(self, node):
        """Extract all variable names from AST"""
        variables = []
        if isinstance(node, ast.Name):
            variables.append(node.id)
        elif hasattr(node, '_fields'):
            for field in node._fields:
                value = getattr(node, field)
                if isinstance(value, list):
                    for item in value:
                        if isinstance(item, ast.AST):
                            variables.extend(self._extract_variables(item))
                elif isinstance(value, ast.AST):
                    variables.extend(self._extract_variables(value))
        return variables
