import socket, ssl, base64, os, struct, urllib.parse, select, sys

URL = "https://kebab-shell.123058.workers.dev"

def create_frame(data):
    """Encodes a WebSocket text frame with mandatory masking."""
    payload = data.encode()
    mask = os.urandom(4)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    # 0x81 = Text Frame, len | 0x80 = Mask Bit
    return struct.pack('!BB', 0x81, len(payload) | 0x80) + mask + masked

def decode_frame(data):
    """Decodes unmasked WebSocket frames sent from the server."""
    if len(data) < 2: return ""
    second_byte = data[1]
    length = second_byte & 127
    
    # Handle different length fields (basic implementation)
    if length == 126: offset = 4
    elif length == 127: offset = 10
    else: offset = 2
    
    try:
        return data[offset:offset+length].decode(errors='ignore')
    except:
        return ""

def connect():
    parsed = urllib.parse.urlparse(URL)
    host, path = parsed.hostname, (parsed.path if parsed.path else "/shell")
    
    context = ssl.create_default_context()
    
    print(f"Connecting to {host}...")
    
    with socket.create_connection((host, 443)) as sock:
        with context.wrap_socket(sock, server_hostname=host) as ssock:
            # --- WebSocket Handshake ---
            key = base64.b64encode(os.urandom(16)).decode()
            handshake = (f"GET {path} HTTP/1.1\r\n"
                         f"Host: {host}\r\n"
                         "Upgrade: websocket\r\n"
                         "Connection: Upgrade\r\n"
                         f"Sec-WebSocket-Key: {key}\r\n"
                         "Sec-WebSocket-Version: 13\r\n\r\n")
            ssock.sendall(handshake.encode())
            
            # Clear the HTTP 101 Switching Protocols response
            ssock.recv(4096)
            
            print("--- ToolShell Connected (Ctrl+C to exit) ---")

            while True:
                # Watch both the Secure Socket and Standard Input (Keyboard)
                r, _, _ = select.select([ssock, sys.stdin], [], [])
                
                for source in r:
                    if source == ssock:
                        # Server sent data (Result or Prompt)
                        data = ssock.recv(4096)
                        if not data:
                            print("\nConnection closed by server.")
                            return
                        print(decode_frame(data), end="", flush=True)
                    
                    elif source == sys.stdin:
                        # User typed a command
                        line = sys.stdin.readline()
                        if line:
                            # Send the command as a masked WebSocket frame
                            ssock.sendall(create_frame(line.strip()))

if __name__ == "__main__":
    try:
        connect()
    except KeyboardInterrupt:
        print("\n\nExiting...")
    except Exception as e:
        print(f"\nError: {e}")
