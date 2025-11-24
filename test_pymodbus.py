import asyncio
from pymodbus.client import AsyncModbusTcpClient
import inspect

async def main():
    client = AsyncModbusTcpClient('localhost')
    print(inspect.signature(client.read_holding_registers))

if __name__ == "__main__":
    asyncio.run(main())
