from utils import generate_keys, sign_license, verify_license, generate_fingerprint, encrypt_payload, decrypt_payload
import json

def test_flow():
    print("1. Generating Keys...")
    priv, pub = generate_keys()
    print("Keys generated.")

    print("2. Generating Fingerprint...")
    fp = generate_fingerprint("my_secret_salt")
    print(f"Fingerprint: {fp}")

    print("3. Creating License Data...")
    license_data = {
        "customer_name": "Test Customer",
        "customer_org": "Test Org",
        "device_fingerprint": fp,
        "valid_till": "2025-12-31",
        "plan": "full",
        "software_version": "1.0.0"
    }
    
    secret = "my_company_secret"

    print("4. Encrypting and Signing License...")
    encrypted_payload = encrypt_payload(license_data, secret)
    data_to_sign = {"data": encrypted_payload}
    signed = sign_license(data_to_sign, priv)
    print("License signed.")
    print(json.dumps(signed, indent=2))

    print("5. Verifying Valid License...")
    is_valid = verify_license(signed, pub)
    if is_valid:
        print("Signature Verified.")
        decrypted = decrypt_payload(signed['data'], secret)
        print("Decrypted Data:", json.dumps(decrypted, indent=2))
        if decrypted['customer_name'] == "Test Customer":
             print("SUCCESS: Data matches.")
        else:
             print("FAILURE: Data mismatch.")
    else:
        print("FAILURE: License failed verification.")

    print("6. Verifying Wrong Secret...")
    try:
        decrypt_payload(signed['data'], "wrong_secret")
        print("FAILURE: Decryption succeeded with wrong secret!")
    except:
        print("SUCCESS: Decryption failed with wrong secret as expected.")

if __name__ == "__main__":
    test_flow()
