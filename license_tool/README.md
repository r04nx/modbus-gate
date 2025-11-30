# Standalone License Tool Walkthrough

This tool allows you to generate and verify software licenses for your IOT board.

## Directory Structure
The tool is located in `license_tool/`.
- `main.py`: The web application.
- `utils.py`: Crypto and fingerprint logic.
- `get_device_id.py`: Script to run on the target device.
- `generate_keys.py`: Helper to generate RSA keys.
- `templates/`: HTML templates.

## Prerequisites
Install dependencies:
```bash
pip install -r license_tool/requirements.txt
```

## Usage

### 1. Get Device Fingerprint
Run this script on the target IOT device:
```bash
python3 license_tool/get_device_id.py --salt "YOUR_COMPANY_SECRET_SALT"
```
Copy the output fingerprint.

### 2. Generate Keys (First Time Only)
Run this helper script to generate your Private/Public key pair:
```bash
python3 license_tool/generate_keys.py
```
This will create `private_key.pem` and `public_key.pem`.

### 3. Start the Web Tool
Run the web application:
```bash
cd license_tool
python3 main.py
```
Access the tool at `http://localhost:8001`.

### 4. Generate License
1. Go to `http://localhost:8001/generator`.
2. Fill in the customer details and the **Device Fingerprint**.
3. Enter a **Company Secret**. This will be used to encrypt the license details so they are not readable in plain text.
4. Paste your **Private Key** (PEM format).
5. Click **Generate License**.
6. Download the `license.json` file.

### 5. Verify License
1. Go to `http://localhost:8001/verifier`.
2. Upload the `license.json` file.
3. Enter the same **Company Secret** used during generation.
4. Paste your **Public Key** (PEM format).
5. Click **Verify License**.
6. The tool will verify the signature and decrypt the details if the secret is correct.

## Encryption Details
- The license payload is encrypted using **AES-GCM**.
- The encryption key is derived from the **Company Secret** using **PBKDF2HMAC**.
- The final license file contains the encrypted data and a digital signature to ensure integrity.
