#!/usr/bin/env python3
"""
IEC 60870-5-104 Test Client
Tests connection to IEC 104 server and reads all configured data points.

Usage:
    python3 test_iec104_client.py --host 192.168.50.22 --port 2404 --ca 1
    python3 test_iec104_client.py --host localhost --port 2404 --monitor
"""

import argparse
import time
import sys
from datetime import datetime

try:
    import c104
except ImportError:
    print("ERROR: c104 library not installed")
    print("Install with: pip install c104")
    sys.exit(1)

# ANSI color codes for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_header(text):
    """Print a formatted header"""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'=' * 80}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text.center(80)}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'=' * 80}{Colors.ENDC}\n")

def print_success(text):
    """Print success message"""
    print(f"{Colors.OKGREEN}✓ {text}{Colors.ENDC}")

def print_error(text):
    """Print error message"""
    print(f"{Colors.FAIL}✗ {text}{Colors.ENDC}")

def print_info(text):
    """Print info message"""
    print(f"{Colors.OKCYAN}ℹ {text}{Colors.ENDC}")

def print_warning(text):
    """Print warning message"""
    print(f"{Colors.WARNING}⚠ {text}{Colors.ENDC}")

def get_type_name(type_id):
    """Get human-readable name for IEC 104 type"""
    type_names = {
        c104.Type.M_SP_NA_1: "M_SP_NA_1 (Single Point)",
        c104.Type.M_DP_NA_1: "M_DP_NA_1 (Double Point)",
        c104.Type.M_ST_NA_1: "M_ST_NA_1 (Step Position)",
        c104.Type.M_BO_NA_1: "M_BO_NA_1 (Bitstring 32)",
        c104.Type.M_ME_NA_1: "M_ME_NA_1 (Normalized)",
        c104.Type.M_ME_NB_1: "M_ME_NB_1 (Scaled)",
        c104.Type.M_ME_NC_1: "M_ME_NC_1 (Float)",
        c104.Type.M_ME_ND_1: "M_ME_ND_1 (Normalized No Quality)",
    }
    return type_names.get(type_id, f"Unknown ({type_id})")

def format_value(point):
    """Format point value based on type"""
    try:
        type_id = point.type
        value = point.value
        
        if type_id == c104.Type.M_SP_NA_1:
            return f"{Colors.OKGREEN if value else Colors.FAIL}{'ON' if value else 'OFF'}{Colors.ENDC}"
        elif type_id == c104.Type.M_DP_NA_1:
            states = ["INTERMEDIATE", "OFF", "ON", "INDETERMINATE"]
            state = states[value] if 0 <= value <= 3 else "INVALID"
            color = Colors.OKGREEN if value == 2 else Colors.FAIL if value == 1 else Colors.WARNING
            return f"{color}{state}{Colors.ENDC}"
        elif type_id == c104.Type.M_ME_NC_1:
            return f"{Colors.OKCYAN}{float(value):.4f}{Colors.ENDC}"
        elif type_id == c104.Type.M_ME_NA_1:
            # Convert normalized value to float
            return f"{Colors.OKCYAN}{float(value):.6f}{Colors.ENDC} (normalized)"
        elif type_id == c104.Type.M_ME_NB_1:
            return f"{Colors.OKCYAN}{int(value)}{Colors.ENDC}"
        elif type_id == c104.Type.M_ST_NA_1:
            return f"{Colors.OKCYAN}{int(value)}{Colors.ENDC}"
        elif type_id == c104.Type.M_BO_NA_1:
            val_int = int(value)
            return f"{Colors.OKCYAN}0x{val_int:08X}{Colors.ENDC} (bin: {bin(val_int)})"
        else:
            return f"{Colors.OKCYAN}{value}{Colors.ENDC}"
    except Exception as e:
        return f"{Colors.FAIL}Error: {e}{Colors.ENDC}"

def test_connection(host, port, common_address, monitor=False, interval=1.0):
    """Test IEC 104 connection and read data points"""
    
    print_header(f"IEC 60870-5-104 Client Test")
    print_info(f"Target: {host}:{port}")
    print_info(f"Common Address: {common_address}")
    print_info(f"Mode: {'Continuous Monitoring' if monitor else 'Single Read'}")
    print()
    
    try:
        # Create client
        print_info("Creating IEC 104 client...")
        client = c104.Client()
        
        # Add connection
        print_info(f"Connecting to {host}:{port}...")
        connection = client.add_connection(ip=host, port=port)
        
        # Add station
        print_info(f"Adding station with CA={common_address}...")
        station = connection.add_station(common_address=common_address)
        
        # Start client
        print_info("Starting client...")
        client.start()
        
        # Wait for connection
        print_info("Waiting for connection...")
        timeout = 10
        start_time = time.time()
        
        while not connection.is_connected:
            if time.time() - start_time > timeout:
                print_error(f"Connection timeout after {timeout} seconds")
                return False
            time.sleep(0.1)
        
        print_success(f"Connected to {host}:{port}")
        print()
        
        # Send interrogation command to get all data
        print_info("Requesting all data points...")
        try:
            # Try different interrogation methods based on c104 version
            if hasattr(connection, 'interrogation'):
                connection.interrogation(cause=c104.Coi.ACTIVATION, common_address=common_address)
            elif hasattr(station, 'interrogate'):
                station.interrogate()
            else:
                print_warning("Interrogation not supported, reading points directly")
        except Exception as e:
            print_warning(f"Interrogation failed: {e}, reading points directly")
        
        time.sleep(1)  # Wait for response
        
        # Get all points
        points = station.points
        
        if not points:
            print_warning("No data points found on server")
            print_info("Make sure you have configured mappings in the IEC 104 Server settings")
            return True
        
        print_success(f"Found {len(points)} data points")
        print()
        
        # Monitor mode or single read
        iteration = 0
        try:
            while True:
                iteration += 1
                
                if monitor:
                    # Clear screen for monitoring mode
                    print("\033[2J\033[H")  # Clear screen and move cursor to top
                    print_header(f"IEC 104 Monitor - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                    print_info(f"Server: {host}:{port} | CA: {common_address} | Points: {len(points)}")
                    print()
                
                # Print table header
                print(f"{Colors.BOLD}{'IOA':<8} {'Type':<35} {'Value':<30} {'Quality':<15} {'Timestamp'}{Colors.ENDC}")
                print(f"{Colors.BOLD}{'-' * 120}{Colors.ENDC}")
                
                # Read and display all points
                for point in points:
                    ioa = point.io_address
                    type_name = get_type_name(point.type)
                    value_str = format_value(point)
                    
                    # Get quality (if available)
                    try:
                        quality = "GOOD" if point.quality.is_good else "BAD"
                        quality_color = Colors.OKGREEN if point.quality.is_good else Colors.FAIL
                        quality_str = f"{quality_color}{quality}{Colors.ENDC}"
                    except:
                        quality_str = f"{Colors.WARNING}N/A{Colors.ENDC}"
                    
                    # Get timestamp (if available)
                    try:
                        timestamp = datetime.fromtimestamp(point.timestamp).strftime('%H:%M:%S.%f')[:-3]
                    except:
                        timestamp = "N/A"
                    
                    print(f"{ioa:<8} {type_name:<35} {value_str:<40} {quality_str:<25} {timestamp}")
                
                if not monitor:
                    break
                
                # Wait before next update
                time.sleep(interval)
                
        except KeyboardInterrupt:
            print()
            print_info("Monitoring stopped by user")
        
        print()
        print_success("Test completed successfully")
        return True
        
    except Exception as e:
        print_error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        try:
            client.stop()
        except:
            pass

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='IEC 60870-5-104 Test Client',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Single read from local server
  python3 test_iec104_client.py
  
  # Single read from remote server
  python3 test_iec104_client.py --host 192.168.50.22 --port 2404
  
  # Continuous monitoring (1 second interval)
  python3 test_iec104_client.py --host 192.168.50.22 --monitor
  
  # Continuous monitoring with custom interval
  python3 test_iec104_client.py --host 192.168.50.22 --monitor --interval 0.5
        """
    )
    
    parser.add_argument('--host', default='localhost',
                        help='IEC 104 server hostname or IP (default: localhost)')
    parser.add_argument('--port', type=int, default=2404,
                        help='IEC 104 server port (default: 2404)')
    parser.add_argument('--ca', '--common-address', type=int, default=1, dest='common_address',
                        help='Common Address of ASDU (default: 1)')
    parser.add_argument('--monitor', action='store_true',
                        help='Enable continuous monitoring mode')
    parser.add_argument('--interval', type=float, default=1.0,
                        help='Update interval in seconds for monitor mode (default: 1.0)')
    
    args = parser.parse_args()
    
    # Run test
    success = test_connection(
        host=args.host,
        port=args.port,
        common_address=args.common_address,
        monitor=args.monitor,
        interval=args.interval
    )
    
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
