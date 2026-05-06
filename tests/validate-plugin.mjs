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
    assert.deepEqual(responses[1].result.tools.map((tool) => tool.name), ['forge_run', 'forge_status']);

    server.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'forge_run',
        arguments: {
          prompt: 'Сделай прогноз погоды для основных городов России. На карте покажи текущий прогноз. Хочу видеть историю погоды за 10 дней. Хочу хранить всё у себя в БД.',
          projectPath: 'C:\\projects\\tracking-reforged',
          adapterName: 'Tracking-reforged',
          maxSteps: 4
        }
      }
    })}\n`);
    await waitForResponses(responses, 3);
    const payload = JSON.parse(responses[2].result.content[0].text);
    assert.equal(payload.status, 'needs_clarification');
    assert.deepEqual(payload.invokedRoles, ['context-router', 'business-analyst']);
    assert.ok(payload.handoff.open_questions.length >= 5);
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

console.log('Plugin validation passed: manifest, marketplace, and MCP forge_run tool.');
