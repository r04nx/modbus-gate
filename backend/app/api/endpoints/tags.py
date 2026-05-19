from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from typing import List, Dict
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models import models
from app.models.user import User
from app.schemas import schemas
from app.core.store import GlobalDataStore

router = APIRouter()

@router.get("/", response_model=List[schemas.Tag])
async def read_tags(skip: int = 0, limit: int = 100000, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
                    "name": tag_id.replace("SYS_", "").replace("_", "-").title(),
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
async def create_tag(tag: schemas.TagCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
async def read_tag_values(history_limit: int = 60, current_user: User = Depends(get_current_user)):
    store = GlobalDataStore()
    return await store.get_all_tags(history_limit=history_limit)

@router.patch("/{tag_id}", response_model=schemas.Tag)
def update_tag(tag_id: int, tag_update: schemas.TagUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
def delete_tag(tag_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    # 1. Check for usage in Calculation Tags
    calc_tags = db.query(models.Tag).filter(models.Tag.type == "CALCULATION").all()
    dependent_calcs = []
    for ct in calc_tags:
        if ct.calculation_formula and db_tag.tag_id in ct.calculation_formula:
            dependent_calcs.append(f"{ct.name} ({ct.tag_id})")
        elif ct.variable_mappings:
            # Check if tag is used as a variable mapping
            for var, mapped_tag_id in ct.variable_mappings.items():
                if mapped_tag_id == db_tag.tag_id:
                    dependent_calcs.append(f"{ct.name} ({ct.tag_id}) - mapped to {var}")
                    break
    
    if dependent_calcs:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete tag '{db_tag.tag_id}' because it is used in the following Calculation Tags: {', '.join(dependent_calcs)}. Please update or delete these calculations first."
        )

    # 2. Check for usage in Server Configs (Modbus, OPC UA, IEC104)
    server_configs = db.query(models.ServerConfig).all()
    dependent_servers = []
    
    for sc in server_configs:
        if not sc.config:
            continue
            
        # Check Mappings
        mappings = sc.config.get('mappings', [])
        for m in mappings:
            if m.get('tag_id') == db_tag.tag_id:
                dependent_servers.append(f"{sc.type} (Mapping)")
                break
        
        # Check MQTT Publications
        if sc.type == "MQTT_PUBLISHER":
            pubs = sc.config.get('publications', [])
            for p in pubs:
                if db_tag.tag_id in p.get('tags', []):
                    dependent_servers.append(f"MQTT Publication '{p.get('topic')}'")
                    break
                # Also check payload template if possible, but simple tag list check is primary
    
    if dependent_servers:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete tag '{db_tag.tag_id}' because it is mapped in the following Server Configurations: {', '.join(dependent_servers)}. Please remove these mappings first."
        )

    db.delete(db_tag)
    db.commit()
    return {"ok": True}

@router.post("/{tag_id}/write")
async def write_tag(tag_id: str, write_data: schemas.TagWrite, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
async def export_tags(type: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Export tags as CSV filtered by type (IO, CALCULATION, USER)"""
    from fastapi.responses import StreamingResponse
    import io
    import csv
    import json
    
    if type not in ["IO", "CALCULATION", "USER"]:
        raise HTTPException(status_code=400, detail="Invalid type. Must be IO, CALCULATION, or USER")
    
    tags = db.query(models.Tag).filter(models.Tag.type == type).all()
    
    # Pre-fetch devices for IO tags
    devices_map = {}
    if type == "IO":
        devices = db.query(models.Device).all()
        devices_map = {d.id: d.name for d in devices}
    
    # Pre-fetch current values for USER tags
    current_values = {}
    if type == "USER":
        store = GlobalDataStore()
        all_data = await store.get_all_tags(history_limit=0)
        for tag_id, val in all_data.items():
            current_values[tag_id] = val.value

    output = io.StringIO()
    
    if type == "IO":
        # Enhanced CSV structure for Modbus IO tags
        fieldnames = [
            'tag_id', 'description', 'address', 'data_type',
            'register_type', 'byte_order', 'start_bit', 'bit_length', 
            'span_low', 'span_high', 'soe',
            'fallback_type', 'fallback_value'
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for tag in tags:
            params = tag.params or {}
            writer.writerow({
                'tag_id': tag.tag_id,
                'description': tag.description or '',
                'address': tag.address or '',
                'data_type': tag.data_type or '',
                'register_type': params.get('register_type', ''),
                'byte_order': params.get('byte_order', ''),
                'start_bit': params.get('start_bit', ''),
                'bit_length': params.get('length', ''),
                'span_low': params.get('span_low', ''),
                'span_high': params.get('span_high', ''),
                'soe': str(params.get('soe', '')).lower(),
                'fallback_type': tag.fallback_type or 'none',
                'fallback_value': tag.fallback_value or ''
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
        writer = csv.DictWriter(output, fieldnames=['tag_id', 'name', 'description', 'data_type', 'initial_value', 'current_value', 'fallback_type', 'fallback_value'])
        writer.writeheader()
        for tag in tags:
            writer.writerow({
                'tag_id': tag.tag_id,
                'name': tag.name,
                'description': tag.description or '',
                'data_type': tag.data_type or 'STRING',
                'initial_value': tag.initial_value or '',
                'current_value': current_values.get(tag.tag_id, ''),
                'fallback_type': tag.fallback_type or 'last_success',
                'fallback_value': tag.fallback_value or ''
            })
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={type.lower()}_tags.csv"}
    )

@router.post("/import")
async def import_tags(type: str, replace: bool = False, dry_run: bool = False, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Import tags from CSV filtered by type (IO, CALCULATION, USER).
    
    Args:
        type: Filter type
        replace: If True, delete missing tags
        dry_run: If True, return comparison analysis WITHOUT applying changes
        file: CSV file
        
    Returns:
        JSON with stats or (if dry_run) detailed analysis
    """
    import csv
    import io
    import json
    import re
    
    if type not in ["IO", "CALCULATION", "USER"]:
        raise HTTPException(status_code=400, detail="Invalid type. Must be IO, CALCULATION, or USER")
    
    from sqlalchemy.exc import IntegrityError
    
    # Read file content
    content = await file.read()
    try:
        decoded = content.decode('utf-8-sig') # also handles BOM
    except UnicodeDecodeError:
        try:
            decoded = content.decode('latin-1')
        except Exception as e:
            if dry_run:
                return {
                    "analysis": {"summary": {"new":0, "modified":0, "deleted":0, "unchanged":0}, "changes": []}, 
                    "errors": [f"File decoding error: {str(e)} Please ensure it is saved as UTF-8."]
                }
            return {
                "created": 0, "updated": 0, "deleted": 0, "skipped_deletes": 0, 
                "errors": [f"File decoding error: {str(e)} Please ensure it is saved as UTF-8."], "total_rows": 0
            }

    csv_reader = csv.DictReader(io.StringIO(decoded))
    
    # Store rows in list to process multiple times (for validation and processing)
    rows = list(csv_reader)
    
    created_count = 0
    updated_count = 0
    deleted_count = 0
    skipped_delete_count = 0 
    errors = []
    seen_tag_ids = set()
    csv_tag_ids = set()
    
    # Analysis Result Structure
    analysis = {
        "summary": {"new": 0, "modified": 0, "deleted": 0, "unchanged": 0},
        "changes": []
    }
    
    # Pre-fetch devices for IO tags lookup
    devices_map = {}
    if type == "IO":
        devices = db.query(models.Device).all()
        devices_map = {d.name: d.id for d in devices}
        # In dry_run, we also need reverse map for friendly display
        id_to_device_name = {d.id: d.name for d in devices}
    
    def generate_tag_id(name):
        # Simple slugify: lowercase, replace spaces/specials with underscore
        clean = re.sub(r'[^a-zA-Z0-9]', '_', name.lower())
        return f"tag_{clean}"

    # Helpers for comparison
    def compare_values(actual, incoming, field_name):
        # Normalize for comparison
        a = actual if actual is not None else ""
        i = incoming if incoming is not None else ""
        
        # Determine if different
        is_diff = str(a) != str(i)
        
        # Special handling for floats to avoid precision mismatch drift
        if is_diff and isinstance(a, float):
             try:
                 if abs(a - float(i)) < 0.000001:
                     is_diff = False
             except:
                 pass
        
        return is_diff, a, i

    # 1. Parse CSV and Identify Tag IDs
    processed_rows = []
    
    for row_num, row in enumerate(rows, start=2):
        try:
            tag_id = row.get('tag_id')
            name = row.get('name')
            
            # Smart Extraction from Tag ID for IO tags
            extracted_device_name = None
            if tag_id and ':' in tag_id:
                parts = tag_id.split(':', 1)
                extracted_device_name = parts[0]
                if not name:
                    name = parts[1]
            
            if not name:
                if tag_id:
                     name = tag_id
                else:
                    errors.append(f"Row {row_num}: Name or Tag ID is required")
                    continue

            if not tag_id or str(tag_id).strip() == '':
                tag_id = generate_tag_id(name)
            
            if tag_id in seen_tag_ids:
                errors.append(f"Row {row_num}: Duplicate tag_id '{tag_id}' found in CSV file.")
                continue
            seen_tag_ids.add(tag_id)
            csv_tag_ids.add(tag_id)
            
            processed_rows.append({
                'row_num': row_num,
                'tag_id': tag_id,
                'name': name,
                'extracted_device_name': extracted_device_name,
                'row_data': row
            })
            
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")

    if errors:
         return {
            "created": 0,
            "updated": 0,
            "deleted": 0,
            "errors": errors,
            "total_rows": len(rows),
            "analysis": analysis if dry_run else None
        }

    # 2. Identify Missing Tags (Delete Candidates)
    existing_tags = db.query(models.Tag).filter(models.Tag.type == type).all()
    # Map for fast lookup
    existing_tags_map = {t.tag_id: t for t in existing_tags}
    
    tags_to_delete = [t for t in existing_tags if t.tag_id not in csv_tag_ids]
    
    if dry_run:
        # Analyze Deletions
        for t in tags_to_delete:
            analysis["summary"]["deleted"] += 1
            analysis["changes"].append({
                "tag_id": t.tag_id,
                "status": "DELETED",
                "data": {
                    "name": t.name,
                    "description": t.description
                }
            })
    elif replace:
        # Perform Deletions (Logic copied from previous step)
        if tags_to_delete:
            calc_tags = db.query(models.Tag).filter(models.Tag.type == "CALCULATION").all()
            server_configs = db.query(models.ServerConfig).all()
            
            for db_tag in tags_to_delete:
                can_delete = True
                failure_reason = ""
                
                # Check Calculations
                for ct in calc_tags:
                    if ct.tag_id not in csv_tag_ids and ct.type == type: continue 
                    if (ct.calculation_formula and db_tag.tag_id in ct.calculation_formula) or \
                       (ct.variable_mappings and db_tag.tag_id in ct.variable_mappings.values()):
                        can_delete = False
                        failure_reason = f"Used in Calculation '{ct.name}'"
                        break
                
                # Check Server Configs
                if can_delete:
                    for sc in server_configs:
                        if not sc.config: continue
                        mappings = sc.config.get('mappings', [])
                        for m in mappings:
                            if m.get('tag_id') == db_tag.tag_id:
                                can_delete = False
                                failure_reason = f"Mapped in {sc.type}"
                                break
                        if not can_delete: break
                        if sc.type == "MQTT_PUBLISHER":
                            pubs = sc.config.get('publications', [])
                            for p in pubs:
                                if db_tag.tag_id in p.get('tags', []):
                                    can_delete = False
                                    failure_reason = f"Used in MQTT Topic '{p.get('topic')}'"
                                    break
                
                if can_delete:
                    try:
                        db.delete(db_tag)
                        deleted_count += 1
                    except Exception as e:
                        errors.append(f"Failed to delete old tag {db_tag.tag_id}: {str(e)}")
                        skipped_delete_count += 1
                else:
                    errors.append(f"Cannot replace/delete old tag '{db_tag.tag_id}': {failure_reason}")
                    skipped_delete_count += 1

    # 3. Process Rows (Upserts or Modification Analysis)
    for item in processed_rows:
        try:
            row_num = item['row_num']
            tag_id = item['tag_id']
            name = item['name']
            extracted_device_name = item['extracted_device_name']
            row = item['row_data']
            
            existing_tag = existing_tags_map.get(tag_id)
            
            tag_data = {
                'name': name,
                'description': row.get('description', ''),
                'type': type,
                'enabled': True,
                'fallback_type': row.get('fallback_type', 'none'),
                'fallback_value': row.get('fallback_value', '')
            }
            
            validation_error = None

            if type == "IO":
                device_name = row.get('device_name')
                if not device_name and extracted_device_name:
                    device_name = extracted_device_name
                
                if not device_name:
                    validation_error = f"Row {row_num}: Device Name is required"
                else:
                    device_id = devices_map.get(device_name)
                    if not device_id:
                        validation_error = f"Row {row_num}: Device '{device_name}' not found"
                    else:
                        tag_data['device_id'] = device_id
                        tag_data['address'] = row.get('address', '')
                        tag_data['data_type'] = row.get('data_type', '')
                        
                        params = {}
                        if row.get('register_type'): params['register_type'] = row.get('register_type')
                        if row.get('byte_order'): params['byte_order'] = row.get('byte_order')
                        if row.get('start_bit'): params['start_bit'] = int(row.get('start_bit'))
                        if row.get('bit_length'): params['length'] = int(row.get('bit_length'))
                        if row.get('span_low'): params['span_low'] = float(row.get('span_low'))
                        if row.get('span_high'): params['span_high'] = float(row.get('span_high'))
                        if row.get('soe') is not None and str(row.get('soe')).strip() != '': params['soe'] = str(row.get('soe')).lower() == 'true'
                        
                        tag_data['params'] = params

            elif type == "CALCULATION":
                tag_data['calculation_formula'] = row.get('calculation_formula', '')
            elif type == "USER":
                tag_data['initial_value'] = row.get('initial_value', '')
                tag_data['data_type'] = row.get('data_type', 'STRING')
                
            if validation_error:
                errors.append(validation_error)
                continue

            if dry_run:
                if existing_tag:
                    # Check modifications
                    modifications = {}
                    
                    # Check standard fields
                    fields_to_check = ['name', 'description', 'fallback_type', 'fallback_value']
                    if type == 'IO':
                        fields_to_check.extend(['device_id', 'address', 'data_type'])
                    elif type == 'CALCULATION':
                        fields_to_check.append('calculation_formula')
                    elif type == 'USER':
                        fields_to_check.extend(['initial_value', 'data_type'])
                        
                    for field in fields_to_check:
                        val = getattr(existing_tag, field)
                        new_val = tag_data.get(field)
                        is_diff, old, new = compare_values(val, new_val, field)
                        
                        # Friendly display for device_id
                        if is_diff and field == 'device_id' and type == 'IO':
                            old = id_to_device_name.get(old, str(old))
                            new = id_to_device_name.get(new, str(new))
                            
                        if is_diff:
                            modifications[field] = {"old": str(old), "new": str(new)}
                            
                    # Check Params for IO
                    if type == 'IO':
                        existing_params = existing_tag.params or {}
                        new_params = tag_data.get('params', {})
                        
                        # Merge keys to check all
                        all_keys = set(existing_params.keys()) | set(new_params.keys())
                        for key in all_keys:
                            is_diff, old, new = compare_values(existing_params.get(key), new_params.get(key), key)
                            if is_diff:
                                modifications[f"params.{key}"] = {"old": str(old), "new": str(new)}

                    if modifications:
                        analysis["summary"]["modified"] += 1
                        analysis["changes"].append({
                            "tag_id": tag_id,
                            "status": "MODIFIED",
                            "changes": modifications
                        })
                    else:
                        analysis["summary"]["unchanged"] += 1
                        
                else:
                    # New Tag
                    analysis["summary"]["new"] += 1
                    analysis["changes"].append({
                        "tag_id": tag_id,
                        "status": "NEW",
                        "data": tag_data 
                    })
            else:
                # Actual DB Operations
                if existing_tag:
                    for key, value in tag_data.items():
                        setattr(existing_tag, key, value)
                    updated_count += 1
                else:
                    tag_data['tag_id'] = tag_id
                    db_tag = models.Tag(**tag_data)
                    db.add(db_tag)
                    created_count += 1
                
                # Update current value for USER tags
                if type == "USER":
                    current_val = row.get('current_value')
                    if current_val is not None and current_val != '':
                         store = GlobalDataStore()
                         await store.update_tag(tag_id, current_val)

        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
            
    if dry_run:
         return {"analysis": analysis, "errors": errors}
    
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        errors.append(f"Database Integrity Error: {str(e.orig)}")
    except Exception as e:
        db.rollback()
        errors.append(f"Database Error: {str(e)}")
    
    return {
        "created": created_count,
        "updated": updated_count,
        "deleted": deleted_count,
        "skipped_deletes": skipped_delete_count,
        "errors": errors,
        "total_rows": len(rows)
    }
