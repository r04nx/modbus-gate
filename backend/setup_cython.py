from setuptools import setup
from Cython.Build import cythonize
from setuptools.extension import Extension
import os
import glob

def find_pyx_files(path):
    pyx_files = []
    for root, dirs, files in os.walk(path):
        for file in files:
            if file.endswith(".py") and not file.startswith("__") and file != "main.py" and file != "setup_cython.py":
                 pyx_files.append(os.path.join(root, file))
    return pyx_files

app_files = find_pyx_files("app")

extensions = [
    Extension(
        name=file.replace(os.path.sep, ".")[:-3],
        sources=[file],
    )
    for file in app_files
]

setup(
    ext_modules=cythonize(
        extensions,
        compiler_directives={'language_level': "3"}
    )
)
