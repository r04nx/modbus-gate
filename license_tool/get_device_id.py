import argparse
from utils import generate_fingerprint

def main():
    parser = argparse.ArgumentParser(description='Generate Device Fingerprint')
    parser.add_argument('--salt', type=str, required=True, help='Company secret salt')
    args = parser.parse_args()

    try:
        fingerprint = generate_fingerprint(args.salt)
        print(f"Device Fingerprint: {fingerprint}")
    except Exception as e:
        print(f"Error generating fingerprint: {e}")

if __name__ == "__main__":
    main()
