import requests
import json

BASE_URL = "http://10.42.0.22:8000/api/v1"
AUTH = ("admin", "admin")

def test_dependency_check():
    # 1. Create a User Tag
    user_tag = {
        "tag_id": "USER_TEST_TAG",
        "name": "User_Test_Tag",
        "type": "USER",
        "data_type": "INT16",
        "initial_value": "0"
    }
    print("Creating User Tag...")
    res = requests.post(f"{BASE_URL}/tags/", json=user_tag, auth=AUTH)
    if res.status_code not in [200, 201]:
        print(f"Failed to create user tag: {res.text}")
        return
    user_tag_data = res.json()
    user_tag_db_id = user_tag_data['id']
    print(f"User Tag created with ID: {user_tag_db_id}")

    # 2. Create a Calculation Tag using the User Tag in variable_mappings
    calc_tag = {
        "tag_id": "CALC_TEST_TAG",
        "name": "Calc_Test_Tag",
        "type": "CALCULATION",
        "calculation_formula": "var1 * 2",
        "variable_mappings": {"var1": "USER_TEST_TAG"}
    }
    print("Creating Calculation Tag...")
    res = requests.post(f"{BASE_URL}/tags/", json=calc_tag, auth=AUTH)
    if res.status_code not in [200, 201]:
        print(f"Failed to create calc tag: {res.text}")
        # Cleanup user tag
        requests.delete(f"{BASE_URL}/tags/{user_tag_db_id}", auth=AUTH)
        return
    
    calc_tag_data = res.json()
    calc_tag_db_id = calc_tag_data['id']
    print(f"Calculation Tag created with ID: {calc_tag_db_id}")

    # 3. Try to delete the User Tag
    print(f"Attempting to delete User Tag ID {user_tag_db_id} (should fail)...")
    res = requests.delete(f"{BASE_URL}/tags/{user_tag_db_id}", auth=AUTH)
    
    if res.status_code == 400:
        print("SUCCESS: Deletion blocked as expected.")
        print(f"Error message: {res.json()['detail']}")
    else:
        print(f"FAILURE: Unexpected status code {res.status_code}")
        print(res.text)

    # Cleanup
    print("Cleaning up...")
    requests.delete(f"{BASE_URL}/tags/{calc_tag_db_id}", auth=AUTH)
    requests.delete(f"{BASE_URL}/tags/{user_tag_db_id}", auth=AUTH)

if __name__ == "__main__":
    test_dependency_check()
