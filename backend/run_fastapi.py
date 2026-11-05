import sys
import os

# Add parent directory (Netsurf root) to sys.path so fastapi_backend can be imported from here
parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

import uvicorn

if __name__ == "__main__":
    uvicorn.run("fastapi_backend.main:app", host="127.0.0.1", port=8000, reload=True)
