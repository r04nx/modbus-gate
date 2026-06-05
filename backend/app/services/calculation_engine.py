import asyncio
import logging
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import models
from app.core.store import GlobalDataStore
from app.services.formula_evaluator import FormulaEvaluator

class CalculationEngine:
    def __init__(self):
        self.running = False
        self.store = GlobalDataStore()
        self.evaluator = FormulaEvaluator()

    async def start(self):
        self.running = True
        asyncio.create_task(self._loop())

    async def stop(self):
        self.running = False

    async def _loop(self):
        import time
        last_config_load = 0.0
        calc_tags = []
        
        while self.running:
            try:
                now = time.time()
                if now - last_config_load > 5.0 or not calc_tags:
                    db = SessionLocal()
                    calc_tags_db = db.query(models.Tag).filter(
                        models.Tag.type == "CALCULATION", 
                        models.Tag.enabled == True
                    ).all()
                    
                    # Store as lightweight dictionaries to avoid using database model objects outside the session context
                    calc_tags = []
                    for tag in calc_tags_db:
                        calc_tags.append({
                            'tag_id': tag.tag_id,
                            'calculation_formula': tag.calculation_formula,
                            'variable_mappings': tag.variable_mappings
                        })
                    db.close()
                    last_config_load = now
                
                for tag in calc_tags:
                    formula = tag.get('calculation_formula')
                    var_mappings = tag.get('variable_mappings')
                    tag_id = tag.get('tag_id')
                    
                    if formula and var_mappings:
                        try:
                            # Get values for mapped variables
                            variables = {}
                            all_tags = await self.store.get_all_tags()
                            
                            for var_name, mapped_tag_id in var_mappings.items():
                                if mapped_tag_id in all_tags and all_tags[mapped_tag_id]:
                                    value = all_tags[mapped_tag_id].value
                                    # Convert to float if possible
                                    try:
                                        variables[var_name] = float(value) if value is not None else 0.0
                                    except (ValueError, TypeError):
                                        variables[var_name] = 0.0
                                else:
                                    # Tag not found or no value
                                    variables[var_name] = 0.0
                            
                            # Evaluate formula with variables
                            result, error = self.evaluator.evaluate(formula, variables)
                            
                            if error:
                                logging.error(f"Error evaluating tag {tag_id}: {error}")
                                await self.store.update_tag(tag_id, None, quality="BAD")
                            else:
                                await self.store.update_tag(tag_id, result)
                        except Exception as e:
                            logging.error(f"Error processing calculation tag {tag_id}: {e}")
                            await self.store.update_tag(tag_id, None, quality="BAD")
            except Exception as e:
                logging.error(f"Error in calculation loop: {e}")
            
            await asyncio.sleep(1)
