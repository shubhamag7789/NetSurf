import os
import zipfile
import shutil

project_root = os.path.dirname(os.path.abspath(__file__))
zip_filename = os.path.join(project_root, "NetSurf_Complete_Project.zip")

exclude_dirs = {'.pytest_cache', '__pycache__', '.git', 'venv', '.venv', '.idea', '.vscode', 'node_modules'}
exclude_exts = {'.pyc', '.pyo'}

print("Starting NetSurf project compression...")
with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(project_root):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if file in ('NetSurf_Complete_Project.zip', 'create_zip.py') or file.endswith(tuple(exclude_exts)):
                continue
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, project_root)
            zipf.write(full_path, rel_path)

size_mb = os.path.getsize(zip_filename) / (1024 * 1024)
print(f"SUCCESS: Created clean zip ({size_mb:.2f} MB)")
print(f"Zip path: {zip_filename}")
