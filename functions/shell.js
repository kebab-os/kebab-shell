var shell_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if ((url.pathname === "/shell" || url.pathname === "/") && request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();

      // Session state
      const session = { 
        vars: new Map(), 
        history: [], 
        startTime: Date.now() 
      };

      server.send("kebab-shell v0.1.0\nType 'help' for commands\n> ");

      server.onmessage = (event) => {
        const input = event.data.toString().trim();
        if (!input) { server.send("> "); return; }

        session.history.push(input);
        const parts = input.split(" ");
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        let response = "";

        // switch router
        switch (cmd) {
          case "help":
            response = "Available Commands:\n" +
                       "-- Help --\n" +
                       "Usage: [command] [arguments...]"                       
            break;

          case "math":
            if (args.length < 3) {
              response = "Usage: math 5 + 10";
            } else {
              const a = parseFloat(args[0]);
              const op = args[1];
              const b = parseFloat(args[2]);
              switch (op) {
                case "+": response = `Result: ${a + b}`; break;
                case "-": response = `Result: ${a - b}`; break;
                case "*": response = `Result: ${a * b}`; break;
                case "/": response = `Result: ${b !== 0 ? a / b : "Error: Div by Zero"}`; break;
                default: response = "Unknown operator. Use +, -, *, /";
              }
            }
            break;

          case "random":
            const random = Math.random();
            response = String(random);
            break;


          case "set":
            if (args.length >= 2) {
              session.vars.set(args[0], args.slice(1).join(" "));
              response = `Stored: ${args[0]}`;
            } else {
              response = "Usage: set username admin";
            }
            break;

          case "get":
            response = session.vars.get(args[0]) || `Error: '${args[0]}' not found`;
            break;

          case "upper":
            response = args.join(" ").toUpperCase();
            break;

          case "reverse":
            response = args.join(" ").split("").reverse().join("");
            break;

          case "info":
            const uptime = Math.floor((Date.now() - session.startTime) / 1000);
            response = `Uptime: ${uptime}s\n` +
                       `History Depth: ${session.history.length}\n` +
                       `Platform: Cloudflare Edge`;
            break;

          case "history":
            response = session.history.map((c, i) => `${i + 1}: ${c}`).join("\n");
            break;

          case "clear":
            response = "\x1Bc"; // ANSI Escape code to clear screen
            break;

          default:
            response = `Command not found: ${cmd}. Type 'help' for options.`;
        }

        // Send response and prompt together to keep the Python client snappy
        server.send(`${response}\n> `);
      };

      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Upgrade Required", { status: 426 });
  }
};

export { shell_default as default };
