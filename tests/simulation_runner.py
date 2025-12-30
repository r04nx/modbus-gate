import asyncio
import math

# --- Configuration ---
REGISTERS = 1000
SIM_DURATION = 60  # seconds
BASE_POLL_INTERVAL = 1.0
CSV_FILE = "Papers/Paper1_Adaptive_Edge_Gateway/data/dynamic_polling.dat"

# --- Mock Context (Replacing pymodbus dependency) ---
class MockDataBlock:
    def __init__(self):
        self.values = [0] * REGISTERS
    
    def setValues(self, _, addr, values):
        for i, v in enumerate(values):
            if 0 <= addr + i < REGISTERS:
                self.values[addr + i] = v

    def getValues(self, _, addr, count):
        return self.values[addr:addr+count]

class MockContext:
    def __init__(self):
        self.store = MockDataBlock()
    
    def __getitem__(self, item):
        return self.store

store = MockContext()

# --- Signal Generator ---
async def signal_generator(ctx):
    """Updates registers with sine waves and noise."""
    t = 0
    while True:
        # Fast changing signal (Sine Wave) on Reg 0-10
        val = int(500 * math.sin(t * 0.5) + 500)
        ctx[0].setValues(3, 0, [val] * 10)
        
        # Slow changing signal (Temperature intent) on Reg 100-110
        slow_val = int(250 + t * 0.1) 
        ctx[0].setValues(3, 100, [slow_val] * 10)
        
        t += 0.1
        await asyncio.sleep(0.1)

# --- Dynamic Polling Logic (The Innovation) ---
class AdaptivePoller:
    def __init__(self):
        self.interval = BASE_POLL_INTERVAL
        self.prev_val = 0
        self.history = []

    async def poll(self, ctx):
        """Simulates polling and adapting interval based on dV/dt."""
        # Read Reg 0 (Fast Signal) effectively
        vals = ctx[0].getValues(3, 0, 1)
        curr_val = vals[0]
        
        # Calculate Rate of Change
        delta = abs(curr_val - self.prev_val)
        self.prev_val = curr_val
        
        # Adaptation Logic
        if delta > 50:  # High change
            self.interval = max(0.2, self.interval * 0.8) # Decrease interval
        elif delta < 5: # Stable
            self.interval = min(2.0, self.interval * 1.1) # Increase interval
            
        return self.interval, delta

# --- Main Runner ---
async def main():
    # Start Generator Task
    asyncio.create_task(signal_generator(store))
    
    poller = AdaptivePoller()
    
    # Data Collection
    print(f"Starting simulation for {SIM_DURATION}s...")
    with open(CSV_FILE, "w") as f:
        f.write("# Time(s) Interval(s) Signal_Delta\n")
        
        start_time = asyncio.get_running_loop().time()
        curr_time = 0
        
        while curr_time < SIM_DURATION:
            interval, delta = await poller.poll(store)
            
            # Log Data
            f.write(f"{curr_time:.2f} {interval:.3f} {delta}\n")
            
            await asyncio.sleep(interval)
            curr_time = asyncio.get_running_loop().time() - start_time

    print("Simulation Complete. Data saved.")

if __name__ == "__main__":
    asyncio.run(main())
