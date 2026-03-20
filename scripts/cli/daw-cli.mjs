import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

function printUsage() {
  console.error([
    'Usage:',
    '  npm run daw:cli -- list [--url http://127.0.0.1:5173]',
    '  npm run daw:cli -- describe <commandId> [--url ...]',
    '  npm run daw:cli -- exec <commandId> [--arg key=value] [--args-json \'{"foo":1}\'] [--url ...]',
    '  npm run daw:cli -- batch <workflow.json> [--url ...]',
    '  npm run daw:cli -- copilot-open [repair|extend|polish] [--url ...]',
    '  npm run daw:cli -- copilot-repair [--arg clipId=...] [--arg startTime=...] [--arg endTime=...] [--url ...]',
    '  npm run daw:cli -- copilot-extend [--arg trackIds=[...] ] [--arg startTime=...] [--arg endTime=...] [--url ...]',
    '  npm run daw:cli -- copilot-polish [--arg preset=balanced] [--arg loudnessTarget=-14] [--url ...]',
    '  npm run daw:cli -- cover-open --arg clipId=clip-123 [--url ...]',
  ].join('\n'));
}

function parseValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw !== '' && Number.isFinite(Number(raw))) return Number(raw);
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function parseArgPairs(values) {
  const result = {};
  for (const item of values) {
    const eqIndex = item.indexOf('=');
    if (eqIndex <= 0) {
      throw new Error(`Invalid --arg '${item}'. Expected key=value.`);
    }
    const key = item.slice(0, eqIndex);
    const value = item.slice(eqIndex + 1);
    result[key] = parseValue(value);
  }
  return result;
}

function parseCli(argv) {
  const args = [...argv];
  let url = process.env.ACE_STEP_DAW_URL ?? 'http://127.0.0.1:5173';
  let format = 'json';
  const kvArgs = [];
  let argsJson = null;
  let command = null;
  const positional = [];

  while (args.length > 0) {
    const token = args.shift();
    if (!token) continue;
    if (token === '--url') {
      url = args.shift();
      continue;
    }
    if (token === '--format') {
      format = args.shift() ?? format;
      continue;
    }
    if (token === '--arg') {
      kvArgs.push(args.shift() ?? '');
      continue;
    }
    if (token === '--args-json') {
      argsJson = JSON.parse(args.shift() ?? '{}');
      continue;
    }
    if (!command) {
      command = token;
      continue;
    }
    positional.push(token);
  }

  return {
    url,
    format,
    command,
    positional,
    args: {
      ...parseArgPairs(kvArgs),
      ...(argsJson ?? {}),
    },
  };
}

function formatText(result) {
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

async function withRuntime(url, fn) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__agentCli !== 'undefined');
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function main() {
  const cli = parseCli(process.argv.slice(2));

  if (!cli.command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  let output;

  if (cli.command === 'list') {
    output = await withRuntime(cli.url, (page) => page.evaluate(() => window.__agentCli.listCommands()));
  } else if (cli.command === 'describe') {
    const [commandId] = cli.positional;
    if (!commandId) {
      throw new Error('describe requires a command id.');
    }
    output = await withRuntime(cli.url, (page) => page.evaluate((id) => window.__agentCli.describeCommand(id), commandId));
  } else if (cli.command === 'exec') {
    const [commandId] = cli.positional;
    if (!commandId) {
      throw new Error('exec requires a command id.');
    }
    output = await withRuntime(
      cli.url,
      (page) => page.evaluate(
        ({ id, args }) => window.__agentCli.execute(id, args),
        { id: commandId, args: cli.args },
      ),
    );
  } else if (cli.command === 'batch') {
    const [workflowPath] = cli.positional;
    if (!workflowPath) {
      throw new Error('batch requires a path to a workflow JSON file.');
    }
    const content = await fs.readFile(workflowPath, 'utf8');
    const workflow = JSON.parse(content);
    output = await withRuntime(
      cli.url,
      (page) => page.evaluate((requests) => window.__agentCli.batch(requests), workflow),
    );
  } else if (cli.command === 'copilot-open') {
    const [taskType] = cli.positional;
    output = await withRuntime(
      cli.url,
      (page) => page.evaluate(
        ({ args }) => window.__agentCli.execute('postProduction.open', args),
        { args: taskType ? { taskType } : {} },
      ),
    );
  } else if (cli.command === 'copilot-repair') {
    output = await withRuntime(
      cli.url,
      (page) => page.evaluate(
        ({ args }) => window.__agentCli.execute('postProduction.startRepair', args),
        { args: cli.args },
      ),
    );
  } else if (cli.command === 'copilot-extend') {
    output = await withRuntime(
      cli.url,
      (page) => page.evaluate(
        ({ args }) => window.__agentCli.execute('postProduction.startExtend', args),
        { args: cli.args },
      ),
    );
  } else if (cli.command === 'copilot-polish') {
    output = await withRuntime(
      cli.url,
      (page) => page.evaluate(
        ({ args }) => window.__agentCli.execute('postProduction.startPolish', args),
        { args: cli.args },
      ),
    );
  } else if (cli.command === 'cover-open') {
    output = await withRuntime(
      cli.url,
      (page) => page.evaluate(
        ({ args }) => window.__agentCli.execute('clip.cover.open', args),
        { args: cli.args },
      ),
    );
  } else {
    printUsage();
    throw new Error(`Unknown command '${cli.command}'.`);
  }

  if (cli.format === 'text') {
    process.stdout.write(`${formatText(output)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
