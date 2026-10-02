"""Zip the CONTENT of a folder with forward-slash paths (what the Chrome Web Store expects).

    python scripts/zip-dir.py dist out.zip

Windows PowerShell's Compress-Archive writes backslashes in the entry names, which the store can
reject or fail to resolve; Python's zipfile writes proper "/" separators.
"""
import os
import sys
import zipfile

src, out = sys.argv[1], sys.argv[2]
if os.path.exists(out):
    os.remove(out)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for folder, _dirs, files in os.walk(src):
        for name in sorted(files):
            full = os.path.join(folder, name)
            z.write(full, os.path.relpath(full, src).replace(os.sep, "/"))
print("wrote", out)
