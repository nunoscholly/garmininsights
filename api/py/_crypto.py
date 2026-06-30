# api/py/_crypto.py
import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def _key() -> bytes:
    return bytes.fromhex(os.environ["GARMIN_TOKEN_KEY"])

def encrypt(plaintext: str) -> str:
    aes = AESGCM(_key())
    nonce = os.urandom(12)
    ct = aes.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()

def decrypt(ciphertext: str) -> str:
    raw = base64.b64decode(ciphertext)
    nonce, ct = raw[:12], raw[12:]
    aes = AESGCM(_key())
    return aes.decrypt(nonce, ct, None).decode()
