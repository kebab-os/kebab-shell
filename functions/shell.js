export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/shell' && request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();

      // Session data stored in memory (lost on worker restart)
      const sessionContext = {
        variables: {},
        history: []
      };

      server.send('JavaScript Shell\n');
      server.send('Type "help" for commands\n');
      server.send('> ');

      server.onmessage = async (event) => {
        const input = event.data.trim();

        if (input === '') {
          server.send('> ');
          return;
        }

        handleCommand(input, sessionContext, server);
      };

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Use WebSocket to /shell', { status: 400 });
  }
};

function handleCommand(input, context, server) {
  if (input === 'help') {
    server.send(
      '\n📚 Commands:\n' +
      '  help     - Show this help\n' +
      '  clear    - Clear screen\n' +
      '  vars     - List variables\n' +
      '  history  - Show history\n' +
      '  exit()   - Exit shell\n\n' +
      '> '
    );
    return;
  }

  if (input === 'clear') {
    server.send('\x1Bc> ');
    return;
  }

  if (input === 'exit' || input === 'exit()') {
    server.send('\n👋 Goodbye!\n');
    server.close();
    return;
  }

  if (input === 'vars') {
    const vars = Object.entries(context.variables)
      .map(([k, v]) => `  ${k} = ${formatValue(v)}`)
      .join('\n');
    server.send('\n' + (vars || '  (none)') + '\n> ');
    return;
  }

  if (input === 'history') {
    const hist = context.history
      .map((cmd, i) => `  ${i + 1}. ${cmd}`)
      .join('\n');
    server.send('\n' + (hist || '  (empty)') + '\n> ');
    return;
  }

  try {
    const result = executeCode(input, context);
    context.history.push(input);

    if (result.value !== undefined) {
      server.send(formatValue(result.value) + '\n> ');
    } else {
      server.send('> ');
    }
  } catch (error) {
    server.send(`❌ ${error.message}\n> `);
  }
}

function executeCode(code, context) {
  // Variable assignment: x = 5
  const assignMatch = code.match(/^\s*(\w+)\s*=\s*(.+)$/);
  if (assignMatch) {
    const [, varName, expr] = assignMatch;
    const value = evalExpr(expr, context);
    context.variables[varName] = value;
    return { value };
  }

  // Function declaration
  if (code.match(/^\s*(function|const|let)\s+\w+/)) {
    evalExpr(code, context);
    return { value: undefined };
  }

  // Regular expression
  const value = evalExpr(code, context);
  return { value };
}

function evalExpr(code, context) {
  const vars = Object.keys(context.variables);
  const vals = Object.values(context.variables);

  try {
    const fn = new Function(...vars, `return (${code})`);
    return fn(...vals);
  } catch (e) {
    try {
      const fn = new Function(...vars, code);
      return fn(...vals);
    } catch {
      throw e;
    }
  }
}

function formatValue(val) {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'string') return `'${val}'`;
  if (typeof val === 'function') return `[Function]`;
  if (typeof val === 'object') {
    try {
      const s = JSON.stringify(val);
      return s.length > 80 ? s.slice(0, 77) + '...' : s;
    } catch {
      return '[Object]';
    }
  }
  return String(val);
}
