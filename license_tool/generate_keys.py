from utils import generate_keys

def main():
    print("Generating RSA key pair...")
    private_key, public_key = generate_keys()
    
    with open("private_key.pem", "wb") as f:
        f.write(private_key)
    
    with open("public_key.pem", "wb") as f:
        f.write(public_key)
        
    print("Keys generated successfully!")
    print(" - private_key.pem")
    print(" - public_key.pem")
    print("\nCopy the content of 'private_key.pem' into the Generator form.")
    print("Copy the content of 'public_key.pem' into the Verifier form.")

if __name__ == "__main__":
    main()
