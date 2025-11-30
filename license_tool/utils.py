import json
import base64
import hashlib
import uuid
import platform
import subprocess
from datetime import datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives import serialization
from cryptography.exceptions import InvalidSignature
import os

def derive_key(secret: str, salt: bytes) -> bytes:
    """Derives a 32-byte key from the secret using PBKDF2."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
        backend=default_backend()
    )
    return kdf.derive(secret.encode())

def encrypt_payload(data: dict, secret: str) -> str:
    """
    Encrypts the dictionary payload using AES-GCM.
    Returns a base64 encoded string containing salt, nonce, and ciphertext.
    Format: base64(salt + nonce + ciphertext)
    """
    data_json = json.dumps(data, sort_keys=True, separators=(',', ':')).encode()
    salt = os.urandom(16)
    key = derive_key(secret, salt)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, data_json, None)
    
    # Combine salt + nonce + ciphertext
    combined = salt + nonce + ciphertext
    return base64.b64encode(combined).decode('utf-8')

def decrypt_payload(encrypted_data: str, secret: str) -> dict:
    """
    Decrypts the payload using the secret.
    """
    try:
        combined = base64.b64decode(encrypted_data)
        salt = combined[:16]
        nonce = combined[16:28]
        ciphertext = combined[28:]
        
        key = derive_key(secret, salt)
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return json.loads(plaintext.decode())
    except Exception as e:
        raise ValueError(f"Decryption failed: {e}")


def get_mac_address():
    """
    Retrieves the MAC address of the device.
    """
    mac_num = uuid.getnode()
    mac = ':'.join(('%012X' % mac_num)[i:i+2] for i in range(0, 12, 2))
    return mac

def get_cpu_serial():
    """
    Attempts to get CPU serial number (Linux specific, often used for SOC ID).
    Returns a placeholder if not found.
    """
    cpuserial = "0000000000000000"
    try:
        with open('/proc/cpuinfo', 'r') as f:
            for line in f:
                if line[0:6] == 'Serial':
                    cpuserial = line[10:26]
    except:
        cpuserial = "ERROR000000000"
    return cpuserial

def get_cid():
    """
    Placeholder for CID (Card ID) retrieval.
    In a real scenario, this might read from /sys/block/mmcblk0/device/cid
    """
    # Example: Reading from a file if it existed, or returning a mock
    # try:
    #     with open('/sys/block/mmcblk0/device/cid', 'r') as f:
    #         return f.read().strip()
    # except:
    return "MOCK_CID_12345"

def generate_fingerprint(salt: str) -> str:
    """
    Generates a unique device fingerprint based on MAC, CPU Serial, CID, and a secret salt.
    """
    mac = get_mac_address()
    soc_id = get_cpu_serial()
    cid = get_cid()
    
    raw_data = f"{mac}|{soc_id}|{cid}|{salt}"
    fingerprint = hashlib.sha256(raw_data.encode()).hexdigest()
    return fingerprint

def generate_keys():
    """
    Generates a new RSA private/public key pair.
    """
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    public_key = private_key.public_key()
    
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    pem_public = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    
    return pem_private, pem_public

def sign_license(license_data: dict, private_key_pem: bytes) -> dict:
    """
    Signs the license data with the private key.
    Returns the license data with an added 'signature' field.
    """
    # Canonicalize JSON to ensure consistent signing
    data_str = json.dumps(license_data, sort_keys=True, separators=(',', ':'))
    
    private_key = serialization.load_pem_private_key(
        private_key_pem,
        password=None
    )
    
    signature = private_key.sign(
        data_str.encode(),
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH
        ),
        hashes.SHA256()
    )
    
    signed_license = license_data.copy()
    signed_license['signature'] = base64.b64encode(signature).decode('utf-8')
    return signed_license

def verify_license(signed_license: dict, public_key_pem: bytes) -> bool:
    """
    Verifies the signature of the license data.
    """
    try:
        signature = base64.b64decode(signed_license['signature'])
        
        # Reconstruct the data string that was signed (excluding the signature itself)
        verification_data = signed_license.copy()
        del verification_data['signature']
        data_str = json.dumps(verification_data, sort_keys=True, separators=(',', ':'))
        
        public_key = serialization.load_pem_public_key(public_key_pem)
        
        public_key.verify(
            signature,
            data_str.encode(),
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        return True
    except (InvalidSignature, KeyError, Exception) as e:
        print(f"Verification failed: {e}")
        return False
