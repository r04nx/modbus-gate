from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from typing import List, Dict
from app.core.database import get_db
from app.models import models
from app.schemas import schemas
from app.core.store import GlobalDataStore

router = APIRouter()

@router.get("/", response_model=List[schemas.Tag])
async def read_tags(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    tags = db.query(models.Tag).offset(skip).limit(limit).all()
    
    # Add System Tags from GlobalDataStore
    # Only add them if we are on the first page (skip=0) to avoid duplication across pages
    # or just add them always if the client doesn't paginate properly (which seems to be the case)
    # For now, we'll add them if skip == 0
    if skip == 0:
        store = GlobalDataStore()
        all_values = await store.get_all_tags()
        
        system_tags = []
        idx = -1
        for tag_id in all_values:
            if tag_id.startswith("SYS_"):
                # Smart Classification of Data Types
                data_type = "N/A"
                if any(x in tag_id for x in ["CPU_USAGE", "RAM_USAGE", "DISK_USAGE"]):
                    data_type = "FLOAT32"
                elif any(x in tag_id for x in ["RAM_TOTAL", "RAM_AVAILABLE", "BYTES_SENT", "BYTES_RECV"]):
                    data_type = "UINT64"
                elif "UPTIME" in tag_id:
                    data_type = "UINT32"
                elif any(x in tag_id for x in ["HOSTNAME", "OS", "IP", "INTERFACES"]):
                    data_type = "STRING"
                
                system_tags.append({
                    "id": idx,
                    "tag_id": tag_id,
                    "name": tag_id.replace("SYS_", "").replace("_", " ").title(),
                    "description": "System Tag",
                    "type": "SYSTEM",
                    "enabled": True,
                    "device_id": None,
                    "address": None,
                    "data_type": data_type,
                    "params": None,
                    "initial_value": None,
                    "calculation_formula": None,
                    "variable_mappings": None,
                    "fallback_type": "last_success",
                    "fallback_value": None
                })
                idx -= 1
        
        # Combine DB tags and System tags
        # Note: This returns a mix of ORM objects and dicts, which Pydantic handles
        return list(tags) + system_tags
        
    return tags

@router.post("/", response_model=schemas.Tag)
async def create_tag(tag: schemas.TagCreate, db: Session = Depends(get_db)):
    # Check if tag_id already exists
    existing_tag = db.query(models.Tag).filter(models.Tag.tag_id == tag.tag_id).first()
    if existing_tag:
        raise HTTPException(status_code=400, detail=f"Tag ID '{tag.tag_id}' already exists. Please use a unique tag ID.")
    
    db_tag = models.Tag(**tag.model_dump())
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    
    # Initialize value for USER tags
    if db_tag.type == "USER" and db_tag.initial_value is not None:
        store = GlobalDataStore()
        await store.update_tag(db_tag.tag_id, db_tag.initial_value)
        
    return db_tag

@router.get("/values", response_model=Dict[str, schemas.TagValueResponse])
async def read_tag_values(history_limit: int = 60):
    store = GlobalDataStore()
    return await store.get_all_tags(history_limit=history_limit)

@router.patch("/{tag_id}", response_model=schemas.Tag)
def update_tag(tag_id: int, tag_update: schemas.TagUpdate, db: Session = Depends(get_db)):
    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    update_data = tag_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_tag, key, value)
    
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag

@router.delete("/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(db_tag)
    db.commit()
    return {"ok": True}

@router.post("/{tag_id}/write")
async def write_tag(tag_id: str, write_data: schemas.TagWrite, db: Session = Depends(get_db)):
    """Write a value to a tag (supports Modbus Write and SNMP Set)"""
    from app.services.tag_writer import TagWriterService
    
    db_tag = db.query(models.Tag).filter(models.Tag.tag_id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    # Only IO and USER tags can be written to
    if db_tag.type not in ["IO", "USER"]:
        raise HTTPException(status_code=400, detail="Only IO and USER tags can be written to")
    
    # Get device (only for IO tags)
    device = None
    if db_tag.type == "IO":
        if not db_tag.device_id:
            raise HTTPException(status_code=400, detail="Tag has no associated device")
        device = db.query(models.Device).filter(models.Device.id == db_tag.device_id).first()
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
    
    # Perform write
    try:
        if db_tag.type == "USER":
            # For USER tags, just update the store directly
            store = GlobalDataStore()
            await store.update_tag(db_tag.tag_id, write_data.value)
            return {"success": True, "message": f"Successfully updated USER tag {db_tag.tag_id}"}
        else:
            # For IO tags, use the writer service
            writer = TagWriterService()
            success, message = await writer.write_tag(device, db_tag, write_data.value)
            
            if not success:
                raise HTTPException(status_code=500, detail=message)
            
            return {"success": True, "message": message}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export")
def export_tags(type: str, db: Session = Depends(get_db)):
    """Export tags as CSV filtered by type (IO, CALCULATION, USER)"""
    from fastapi.responses import StreamingResponse
    import io
    import csv
    import json
    
    if type not in ["IO", "CALCULATION", "USER"]:
        raise HTTPException(status_code=400, detail="Invalid type. Must be IO, CALCULATION, or USER")
    
    tags = db.query(models.Tag).filter(models.Tag.type == type).all()
    
    output = io.StringIO()
    
    if type == "IO":
        writer = csv.DictWriter(output, fieldnames=['tag_id', 'name', 'description', 'device_id', 'address', 'data_type', 'params'])
        writer.writeheader()
        for tag in tags:
            writer.writerow({
                'tag_id': tag.tag_id,
                'name': tag.name,
                'description': tag.description or '',
                'device_id': tag.device_id or '',
                'address': tag.address or '',
                'data_type': tag.data_type or '',
                'params': json.dumps(tag.params) if tag.params else ''
            })
    elif type == "CALCULATION":
        writer = csv.DictWriter(output, fieldnames=['tag_id', 'name', 'description', 'calculation_formula'])
        writer.writeheader()
        for tag in tags:
            writer.writerow({
                'tag_id': tag.tag_id,
                'name': tag.name,
                'description': tag.description or '',
                'calculation_formula': tag.calculation_formula or ''
            })
    elif type == "USER":
        writer = csv.DictWriter(output, fieldnames=['tag_id', 'name', 'description', 'initial_value'])
        writer.writeheader()
        for tag in tags:
            writer.writerow({
                'tag_id': tag.tag_id,
                'name': tag.name,
                'description': tag.description or '',
                'initial_value': tag.initial_value or ''
            })
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={type.lower()}_tags.csv"}
    )

@router.post("/import")
async def import_tags(type: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import tags from CSV filtered by type (IO, CALCULATION, USER)"""
    import csv
    import io
    import json
    
    if type not in ["IO", "CALCULATION", "USER"]:
        raise HTTPException(status_code=400, detail="Invalid type. Must be IO, CALCULATION, or USER")
    
    # Read file content
    content = await file.read()
    decoded = content.decode('utf-8')
    csv_reader = csv.DictReader(io.StringIO(decoded))
    
    created_count = 0
    errors = []
    
    for row_num, row in enumerate(csv_reader, start=2):  # Start at 2 (1 is header)
        try:
            # Check if tag_id already exists
            existing = db.query(models.Tag).filter(models.Tag.tag_id == row['tag_id']).first()
            if existing:
                errors.append(f"Row {row_num}: Tag ID '{row['tag_id']}' already exists")
                continue
            
            tag_data = {
                'tag_id': row['tag_id'],
                'name': row['name'],
                'description': row.get('description', ''),
                'type': type,
                'enabled': True
            }
            
            if type == "IO":
                tag_data['device_id'] = int(row['device_id']) if row.get('device_id') else None
                tag_data['address'] = row.get('address', '')
                tag_data['data_type'] = row.get('data_type', '')
                if row.get('params'):
                    try:
                        tag_data['params'] = json.loads(row['params'])
                    except json.JSONDecodeError:
                        tag_data['params'] = {}
            elif type == "CALCULATION":
                tag_data['calculation_formula'] = row.get('calculation_formula', '')
            elif type == "USER":
                tag_data['initial_value'] = row.get('initial_value', '')
            
            db_tag = models.Tag(**tag_data)
            db.add(db_tag)
            created_count += 1
            
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    db.commit()
    
    return {
        "created": created_count,
        "errors": errors,
        "total_rows": row_num - 1 if 'row_num' in locals() else 0
    }
