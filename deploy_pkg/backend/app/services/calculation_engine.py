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
        while self.running:
            try:
                db: Session = SessionLocal()
                calc_tags = db.query(models.Tag).filter(
                    models.Tag.type == "CALCULATION", 
                    models.Tag.enabled == True
                ).all()
                
                for tag in calc_tags:
                    if tag.calculation_formula and tag.variable_mappings:
                        try:
                            # Get values for mapped variables
                            variables = {}
                            all_tags = await self.store.get_all_tags()
                            
                            for var_name, tag_id in tag.variable_mappings.items():
                                if tag_id in all_tags and all_tags[tag_id]:
                                    value = all_tags[tag_id].value
                                    # Convert to float if possible
                                    try:
                                        variables[var_name] = float(value) if value is not None else 0.0
                                    except (ValueError, TypeError):
                                        variables[var_name] = 0.0
                                else:
                                    # Tag not found or no value
                                    variables[var_name] = 0.0
                            
                            # Evaluate formula with variables
                            result, error = self.evaluator.evaluate(tag.calculation_formula, variables)
                            
                            if error:
                                logging.error(f"Error evaluating tag {tag.tag_id}: {error}")
                                await self.store.update_tag(tag.tag_id, None, quality="BAD")
                            else:
                                await self.store.update_tag(tag.tag_id, result)
                        except Exception as e:
                            logging.error(f"Error processing calculation tag {tag.tag_id}: {e}")
                            await self.store.update_tag(tag.tag_id, None, quality="BAD")
                
                db.close()
            except Exception as e:
                logging.error(f"Error in calculation loop: {e}")
            
            await asyncio.sleep(1)
