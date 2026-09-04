"""
WinkPass Enterprise™ — Backend Server (Flask & Cryptographic Vault)
Provides REST API endpoints for enterprise ocular authentication, audit logging,
and serves the Cyber Biometric Web Application.
"""

import os
import hashlib
import time
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder=".")

# In-memory Enterprise Salt & Vault Key
MASTER_SALT = "0xW1NK_S4LT_9901_MIL_SPEC"
# Default master password: LEFT -> RIGHT -> LEFT -> BOTH
DEFAULT_KEY_SEQUENCE = ["LEFT", "RIGHT", "LEFT", "BOTH"]

def hash_sequence(sequence: list[str]) -> str:
    payload = f"{MASTER_SALT}::{'-'.join(sequence)}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

CURRENT_MASTER_HASH = hash_sequence(DEFAULT_KEY_SEQUENCE)
AUDIT_LOGS = [
    {"timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "event": "SERVER_BOOT", "status": "OK", "details": "Cryptographic engine ready."}
]

@app.route("/")
def serve_index():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(".", path)

@app.route("/api/verify", methods=["POST"])
def verify_wink_sequence():
    """Verify an incoming wink gesture sequence against master hash."""
    global AUDIT_LOGS
    data = request.get_json(force=True)
    sequence = data.get("sequence", [])
    
    if not sequence:
        return jsonify({"success": False, "error": "Empty sequence"}), 400

    calc_hash = hash_sequence(sequence)
    is_match = (calc_hash == CURRENT_MASTER_HASH)
    
    event = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "event": "AUTHENTICATION_ATTEMPT",
        "status": "GRANTED" if is_match else "DENIED",
        "token_count": len(sequence),
        "hash_prefix": calc_hash[:16]
    }
    AUDIT_LOGS.append(event)
    
    return jsonify({
        "success": is_match,
        "status": "ACCESS_GRANTED" if is_match else "ACCESS_DENIED",
        "hash_digest": calc_hash,
        "message": "Zero-knowledge ocular token verified." if is_match else "Cryptographic checksum mismatch."
    })

@app.route("/api/enroll", methods=["POST"])
def enroll_master_key():
    """Enroll a new master wink key."""
    global CURRENT_MASTER_HASH, AUDIT_LOGS
    data = request.get_json(force=True)
    sequence = data.get("sequence", [])
    
    if len(sequence) < 3:
        return jsonify({"success": False, "error": "Minimum 3 ocular gestures required"}), 400

    CURRENT_MASTER_HASH = hash_sequence(sequence)
    AUDIT_LOGS.append({
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "event": "KEY_ROTATION",
        "status": "SUCCESS",
        "token_count": len(sequence),
        "new_hash_prefix": CURRENT_MASTER_HASH[:16]
    })
    
    return jsonify({
        "success": True,
        "message": "Master ocular password updated.",
        "new_master_hash": CURRENT_MASTER_HASH
    })

@app.route("/api/audit-logs", methods=["GET"])
def get_audit_logs():
    return jsonify({"logs": AUDIT_LOGS})

if __name__ == "__main__":
    print("=" * 65)
    print("  👁️  WINKPASS DEFENSE EDITION v4.2 SERVER STARTING...")
    print("  Serving Biometric Cyber Terminal at: http://127.0.0.1:5000")
    print("  Default Demo Master Key: LEFT -> RIGHT -> LEFT -> BOTH")
    print("=" * 65)
    app.run(host="127.0.0.1", port=5000, debug=False)
