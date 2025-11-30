from fastapi import FastAPI, Request, Form, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import json
import uvicorn
from utils import sign_license, verify_license, generate_keys, encrypt_payload, decrypt_payload
import os

app = FastAPI()

# Setup templates
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("base.html", {"request": request})

@app.get("/generator", response_class=HTMLResponse)
async def generator_form(request: Request):
    return templates.TemplateResponse("generator.html", {"request": request})

@app.post("/generate", response_class=HTMLResponse)
async def generate_license(
    request: Request,
    customer_name: str = Form(...),
    customer_org: str = Form(...),
    device_fingerprint: str = Form(...),
    valid_till: str = Form(...),
    plan: str = Form(...),
    software_version: str = Form(...),
    private_key: str = Form(...),
    company_secret: str = Form(...)
):
    license_data = {
        "customer_name": customer_name,
        "customer_org": customer_org,
        "device_fingerprint": device_fingerprint,
        "valid_till": valid_till,
        "plan": plan,
        "software_version": software_version
    }
    
    try:
        # Encrypt the payload first
        encrypted_payload = encrypt_payload(license_data, company_secret)
        
        # Sign the encrypted payload
        # The structure to be signed is now just the data string
        data_to_sign = {"data": encrypted_payload}
        
        private_key_bytes = private_key.encode()
        signed_license = sign_license(data_to_sign, private_key_bytes)
        
        license_json = json.dumps(signed_license, indent=4)
        return templates.TemplateResponse("generator.html", {
            "request": request,
            "license_json": license_json
        })
    except Exception as e:
        return templates.TemplateResponse("generator.html", {
            "request": request,
            "error": str(e)
        })

@app.get("/verifier", response_class=HTMLResponse)
async def verifier_form(request: Request):
    return templates.TemplateResponse("verifier.html", {"request": request})

@app.post("/verify", response_class=HTMLResponse)
async def verify_license_endpoint(
    request: Request,
    license_file: UploadFile = File(...),
    public_key: str = Form(...),
    company_secret: str = Form(...)
):
    try:
        content = await license_file.read()
        license_data = json.loads(content)
        public_key_bytes = public_key.encode()
        
        # Verify signature of the encrypted container
        is_valid = verify_license(license_data, public_key_bytes)
        
        decrypted_data = None
        message = "Signature verification failed"
        
        if is_valid:
            try:
                # Decrypt the payload
                decrypted_data = decrypt_payload(license_data['data'], company_secret)
                message = "Valid"
            except Exception as e:
                is_valid = False
                message = f"Signature valid, but decryption failed: {str(e)}"
        
        result = {
            "valid": is_valid,
            "data": decrypted_data,
            "message": message
        }
        
        return templates.TemplateResponse("verifier.html", {
            "request": request,
            "verification_result": result
        })
    except Exception as e:
        return templates.TemplateResponse("verifier.html", {
            "request": request,
            "verification_result": {"valid": False, "message": str(e)}
        })

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
