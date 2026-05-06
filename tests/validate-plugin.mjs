import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const pluginRoot = path.join(root, 'plugins', 'creepwave-forge');

async function testPluginManifest() {
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'creepwave-forge');
  assert.equal(manifest.mcpServers, './.mcp.json');
  assert.equal(manifest.skills, './skills/');

  const mcp = JSON.parse(await readFile(path.join(pluginRoot, '.mcp.json'), 'utf8'));
  assert.equal(mcp.mcpServers['creepwave-forge'].command, 'node');
  assert.deepEqual(mcp.mcpServers['creepwave-forge'].args, ['./scripts/forge-mcp-server.mjs']);

  const marketplace = JSON.parse(await readFile(path.join(root, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
  assert.equal(marketplace.name, 'creepwave-forge-local');
  assert.equal(marketplace.plugins[0].name, 'creepwave-forge');
}

async function testMcpServer() {
  const server = spawn('node', ['./scripts/forge-mcp-server.mjs'], {
    cwd: pluginRoot,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const stderr = [];
  server.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

  try {
    const responses = [];
    server.stdout.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line.trim()) {
          responses.push(JSON.parse(line));
        }
      }
    });

    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`);
    await waitForResponses(responses, 1);
    assert.equal(responses[0].result.serverInfo.name, 'creepwave-forge');

    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
    await waitForResponses(responses, 2);
    assert.deepEqual(responses[1].result.tools.map((tool) => tool.name), ['forge_run', 'forge_continue', 'forge_status']);

    server.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'forge_run',
        arguments: {
          prompt: 'Make a weather forecast for the main cities of Russia. Show the current forecast as a visual element on a map. Show 10 days of weather history on the map. Store everything in my own database.',
          projectPath: 'C:\\projects\\tracking-reforged',
          adapterName: 'Tracking-reforged'
        }
      }
    })}\n`);
    await waitForResponses(responses, 3);
    const firstStep = responses[2].result.content[0].text;
    assert.match(firstStep, /# Forge Run Started/);
    assert.match(firstStep, /Run Status: paused/);
    assert.match(firstStep, /## Step 1: context-router/);
    assert.match(firstStep, /"target_role": "business-analyst"/);
    assert.match(firstStep, /Next tool: forge_continue/);
    const runId = firstStep.match(/Run ID: ([^\r\n]+)/)?.[1];
    assert.ok(runId);

    server.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'forge_continue',
        arguments: { runId }
      }
    })}\n`);
    await waitForResponses(responses, 4);
    const secondStep = responses[3].result.content[0].text;
    assert.match(secondStep, /# Forge Step Continued/);
    assert.match(secondStep, /Run Status: needs_clarification/);
    assert.match(secondStep, /## Step 2: business-analyst/);
    assert.match(secondStep, /### Handoff Contract/);
    assert.match(secondStep, /Which cities count as the main cities of Russia/);

    server.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'forge_status',
        arguments: { runId }
      }
    })}\n`);
    await waitForResponses(responses, 5);
    const status = responses[4].result.content[0].text;
    assert.match(status, /# Forge Run Status/);
    assert.match(status, /001-context-router\.json/);
    assert.match(status, /002-business-analyst\.json/);
  } finally {
    server.kill();
  }

  assert.deepEqual(stderr, []);
}

async function waitForResponses(responses, count) {
  const startedAt = Date.now();
  while (responses.length < count) {
    if (Date.now() - startedAt > 10000) {
      throw new Error(`Timed out waiting for MCP response ${count}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

await testPluginManifest();
await testMcpServer();

console.log('Plugin validation passed: manifest, marketplace, visible steps, and MCP forge_continue tool.');
